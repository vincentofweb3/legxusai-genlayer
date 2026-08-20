import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { GENLAYER_CONFIG } from './genlayer/config.ts'
import {
  WalletStateError,
  getPublicClient,
  readInjectedAccounts,
  readInjectedChainId,
  type BrowserProvider,
} from './genlayer/client.ts'
import {
  GenLayerConfigurationError,
  clearCanonicalDisputeCache,
  clearLegacyCanonicalCaches,
  configuredCanonicalIdentity,
  configuredTransactionReturnRoute,
  acceptDisputeOnChain,
  declineDisputeOnChain,
  evaluateDisputeOnChain,
  fileDisputeOnChain,
  hydrateCanonicalDisputes,
  loadCanonicalDisputeCache,
  saveCanonicalDisputeCache,
} from './genlayer/disputes.ts'
import {
  GenLayerTransactionError,
  clearKnownTransactionHashes,
  hydrateKnownTransactions,
  isWalletRejection,
  loadKnownTransactionRecords,
  saveKnownTransactionRecords,
  type KnownTransactionRecord,
  type DisputeTransaction,
  type TransactionOperation,
} from './genlayer/transactions.ts'
import { GenLayerDecodeError, type CanonicalDispute } from './genlayer/types.ts'
import type { EvidenceReference } from './evidence/upload.ts'
import { assertEvidenceCompatibleWithExisting, describeEvidenceVerificationError, EvidenceVerificationError } from './evidence/upload.ts'
import { writeWithConfirmedEvidence } from './evidence/filing.ts'

export type TxStatus = 'PENDING' | 'ACCEPTED' | 'FINALIZED'
export type ActionStatus = TxStatus | 'ERROR'

export type LastActionState = {
  operation: TransactionOperation | null
  disputeId: string | null
  status: ActionStatus | null
  hash: string | null
  message: string | null
}

export type CanonicalLoadState = {
  phase: 'loading' | 'ready' | 'empty' | 'configuration-error' | 'network-error' | 'decode-error' | 'cached'
  source: 'canonical' | 'cache' | null
  message: string
}

export type TransactionLoadState = {
  phase: 'loading' | 'ready' | 'partial' | 'unavailable'
  message: string
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
}

export interface WalletState {
  address: `0x${string}` | null
  isConnecting: boolean
  chainId: number | null
}

export type DisputeDraft = {
  title: string
  description: string
  respondent: string
  amount: bigint
  currency: string
  evidence: EvidenceReference[]
  confirmNoEvidence: boolean
}

interface AppStore {
  wallet: WalletState
  hasInjectedWallet: boolean
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  disputes: CanonicalDispute[]
  disputeLoad: CanonicalLoadState
  refreshCanonicalState: () => Promise<void>
  addDispute: (draft: DisputeDraft) => Promise<string>
  acceptDispute: (dispute: CanonicalDispute, evidence: EvidenceReference[], confirmNoEvidence: boolean) => Promise<boolean>
  declineDispute: (dispute: CanonicalDispute) => Promise<boolean>
  evaluateDispute: (dispute: CanonicalDispute) => Promise<boolean>
  transactions: DisputeTransaction[]
  transactionLoad: TransactionLoadState
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  dismissNotification: (id: string) => void
  isProcessing: boolean
  processingHash: string | null
  processingStatus: TxStatus | null
  lastAction: LastActionState
}

const AppContext = createContext<AppStore | null>(null)

export function getStatusColor(status: string): string {
  switch (status) {
    case 'FINALIZED':
    case 'READY_FOR_EVALUATION':
      return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
    case 'AWAITING_RESPONDENT':
    case 'ACCEPTED':
      return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30'
    case 'DECLINED':
      return 'text-red-400 bg-red-400/10 border-red-400/30'
    case 'PENDING':
      return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
    default:
      return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
  }
}

export function shortenAddr(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function provider(): BrowserProvider | undefined {
  return typeof window === 'undefined' ? undefined : window.ethereum
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

async function readWallet(providerValue: BrowserProvider): Promise<Pick<WalletState, 'address' | 'chainId'>> {
  const [accounts, chainId] = await Promise.all([
    readInjectedAccounts(providerValue),
    readInjectedChainId(providerValue),
  ])
  return { address: accounts[0] ?? null, chainId }
}

function loadFailure(error: unknown): CanonicalLoadState {
  if (error instanceof GenLayerConfigurationError) {
    return { phase: 'configuration-error', source: null, message: error.message }
  }
  if (error instanceof GenLayerDecodeError) {
    return { phase: 'decode-error', source: null, message: `Canonical contract data was rejected: ${error.message}` }
  }
  const message = error instanceof Error ? error.message : 'Unknown network error'
  return { phase: 'network-error', source: null, message: `Canonical contract state could not be loaded: ${message}` }
}

function filingErrorMessage(error: unknown): { title: string; message: string; type: Notification['type'] } {
  if (error instanceof WalletStateError) {
    if (error.kind === 'account') return { title: 'Wallet Account Required', message: error.message, type: 'error' }
    if (error.kind === 'chain') return { title: 'Wrong Wallet Network', message: error.message, type: 'error' }
    return { title: 'Injected Wallet Required', message: error.message, type: 'error' }
  }
  if (error instanceof GenLayerTransactionError) {
    if (error.kind === 'wallet-rejected') return { title: 'Wallet Request Rejected', message: error.message, type: 'warning' }
    if (error.kind === 'polling') return { title: 'Receipt Polling Failed', message: error.message, type: 'error' }
    if (error.kind === 'status') return { title: 'Transaction Not Accepted', message: error.message, type: 'error' }
    if (error.kind === 'execution' || error.kind === 'consensus') return { title: 'Contract Execution Failed', message: error.message, type: 'error' }
    return { title: 'Receipt Validation Failed', message: error.message, type: 'error' }
  }
  if (isWalletRejection(error)) return { title: 'Wallet Request Rejected', message: 'The wallet rejected the transaction request.', type: 'warning' }
  return {
    title: 'GenLayer Lifecycle Transaction Failed',
    message: error instanceof Error ? error.message : 'The transaction could not be completed.',
    type: 'error',
  }
}

function lifecycleErrorMessage(error: unknown): { title: string; message: string; type: Notification['type'] } {
  if (error instanceof EvidenceVerificationError) {
    return { title: 'Evidence Verification Failed', message: describeEvidenceVerificationError(error), type: 'error' }
  }
  if (error instanceof GenLayerTransactionError && error.kind === 'authorization') {
    return { title: 'Lifecycle Action Not Allowed', message: error.message, type: 'error' }
  }
  return filingErrorMessage(error)
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({ address: null, isConnecting: false, chainId: null })
  const [disputes, setDisputes] = useState<CanonicalDispute[]>([])
  const [disputeLoad, setDisputeLoad] = useState<CanonicalLoadState>({
    phase: 'loading',
    source: null,
    message: 'Loading canonical dispute state.',
  })
  const [transactions, setTransactions] = useState<DisputeTransaction[]>([])
  const [transactionLoad, setTransactionLoad] = useState<TransactionLoadState>({
    phase: 'loading',
    message: 'Validating locally known transaction hashes against GenLayer.',
  })
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingHash, setProcessingHash] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<TxStatus | null>(null)
  const [lastAction, setLastAction] = useState<LastActionState>({ operation: null, disputeId: null, status: null, hash: null, message: null })

  const hasInjectedWallet = !!provider()

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setNotifications(current => [...current, { ...notification, id }])
    setTimeout(() => setNotifications(current => current.filter(item => item.id !== id)), 5_500)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(current => current.filter(notification => notification.id !== id))
  }, [])

  const refreshCanonicalState = useCallback(async () => {
    if (GENLAYER_CONFIG.configurationIssue) {
      setDisputes([])
      setTransactions([])
      setDisputeLoad({ phase: 'configuration-error', source: null, message: GENLAYER_CONFIG.configurationIssue })
      setTransactionLoad({ phase: 'unavailable', message: 'Transaction validation requires a configured network and contract.' })
      return
    }

    let identity
    try {
      identity = configuredCanonicalIdentity()
    } catch (error) {
      setDisputes([])
      setDisputeLoad(loadFailure(error))
      return
    }

    const localStorage = storage()
    if (localStorage) clearLegacyCanonicalCaches(localStorage)
    setDisputeLoad({ phase: 'loading', source: null, message: 'Loading canonical dispute state.' })
    setTransactionLoad({ phase: 'loading', message: 'Validating locally known transaction hashes against GenLayer.' })

    try {
      const hydration = await hydrateCanonicalDisputes()
      setDisputes(hydration.disputes)
      setDisputeLoad({
        phase: hydration.disputes.length === 0 ? 'empty' : 'ready',
        source: 'canonical',
        message: hydration.disputes.length === 0
          ? 'The configured contract currently contains no disputes.'
          : 'Disputes were decoded from the configured Intelligent Contract.',
      })
      if (localStorage) saveCanonicalDisputeCache(localStorage, hydration)
    } catch (error) {
      const canonicalDataRejected = error instanceof GenLayerDecodeError
      if (localStorage && canonicalDataRejected) {
        clearCanonicalDisputeCache(localStorage, identity)
        clearKnownTransactionHashes(localStorage, identity)
      }
      const cached = localStorage && !canonicalDataRejected ? loadCanonicalDisputeCache(localStorage, identity) : null
      if (cached !== null) {
        setDisputes(cached)
        setDisputeLoad({
          phase: 'cached',
          source: 'cache',
          message: `Canonical refresh failed; showing a validated cache for this exact network, contract, and state version. ${error instanceof Error ? error.message : ''}`.trim(),
        })
      } else {
        setDisputes([])
        setDisputeLoad(loadFailure(error))
      }
    }

    if (!localStorage) {
      setTransactions([])
      setTransactionLoad({ phase: 'unavailable', message: 'No browser storage is available for retaining known transaction hashes.' })
      return
    }

    const knownRecords = loadKnownTransactionRecords(localStorage, identity)
    if (knownRecords.length === 0) {
      setTransactions([])
      setTransactionLoad({
        phase: 'unavailable',
        message: 'No network-validated transaction hashes are known in this browser. The contract does not expose a complete transaction index.',
      })
      return
    }

    try {
      const client = getPublicClient()
      const hydrated = await hydrateKnownTransactions(client, knownRecords, configuredTransactionReturnRoute())
      setTransactions(hydrated.transactions)
      saveKnownTransactionRecords(localStorage, identity, hydrated.transactions.map(transaction => ({
        hash: transaction.hash,
        disputeId: transaction.disputeId,
        operation: transaction.operation,
      })))
      setTransactionLoad({
        phase: hydrated.failures > 0 ? 'partial' : 'ready',
        message: hydrated.failures > 0
          ? `${hydrated.transactions.length} known transaction(s) were network-validated; ${hydrated.failures} cached hash(es) were rejected or unavailable.`
          : `${hydrated.transactions.length} locally known transaction hash(es) were validated against GenLayer. This is not a complete network history.`,
      })
    } catch (error) {
      setTransactions([])
      setTransactionLoad({
        phase: 'unavailable',
        message: `Known transaction hashes could not be validated: ${error instanceof Error ? error.message : 'unknown error'}`,
      })
    }
  }, [])

  useEffect(() => {
    void refreshCanonicalState()
  }, [refreshCanonicalState])

  useEffect(() => {
    const injected = provider()
    if (!injected) return
    void readWallet(injected)
      .then(snapshot => setWallet({ ...snapshot, isConnecting: false }))
      .catch(() => setWallet({ address: null, chainId: null, isConnecting: false }))
  }, [])

  useEffect(() => {
    const injected = provider()
    if (!injected?.on || !injected.removeListener) return
    const refreshWallet = () => {
      void readWallet(injected)
        .then(snapshot => setWallet(current => ({ ...current, ...snapshot, isConnecting: false })))
        .catch(() => setWallet({ address: null, chainId: null, isConnecting: false }))
    }
    injected.on('accountsChanged', refreshWallet)
    injected.on('chainChanged', refreshWallet)
    return () => {
      injected.removeListener?.('accountsChanged', refreshWallet)
      injected.removeListener?.('chainChanged', refreshWallet)
    }
  }, [])

  const connectWallet = useCallback(async () => {
    const injected = provider()
    if (!injected) {
      addNotification({ type: 'error', title: 'Injected Wallet Required', message: 'Install an EIP-1193 compatible wallet before connecting.' })
      return
    }
    setWallet(current => ({ ...current, isConnecting: true }))
    try {
      await injected.request({ method: 'eth_requestAccounts' })
      const snapshot = await readWallet(injected)
      setWallet({ ...snapshot, isConnecting: false })
      const target = GENLAYER_CONFIG.network
      addNotification({
        type: target && snapshot.chainId === target.chainId ? 'success' : 'warning',
        title: 'Wallet Account Detected',
        message: target && snapshot.chainId === target.chainId
          ? `${shortenAddr(snapshot.address ?? '')} is connected on the configured chain.`
          : `The wallet is on chain ${snapshot.chainId}; switch to ${target?.chainId ?? 'the configured target'} before writing.`,
      })
    } catch (error) {
      setWallet(current => ({ ...current, isConnecting: false }))
      addNotification({
        type: isWalletRejection(error) ? 'warning' : 'error',
        title: isWalletRejection(error) ? 'Wallet Request Rejected' : 'Wallet Connection Failed',
        message: isWalletRejection(error) ? 'The wallet rejected the account request.' : error instanceof Error ? error.message : 'Unable to read wallet state.',
      })
    }
  }, [addNotification])

  const disconnectWallet = useCallback(() => {
    setWallet({ address: null, chainId: null, isConnecting: false })
    addNotification({ type: 'info', title: 'Session Cleared', message: 'Remove this site in the wallet to revoke its account permission.' })
  }, [addNotification])

  const addDispute = useCallback(async (draft: DisputeDraft): Promise<string> => {
    if (GENLAYER_CONFIG.configurationIssue) {
      addNotification({ type: 'error', title: 'GenLayer Target Not Configured', message: GENLAYER_CONFIG.configurationIssue })
      return ''
    }
    const injected = provider()
    if (!injected) {
      addNotification({ type: 'error', title: 'Injected Wallet Required', message: 'Connect an injected wallet before filing.' })
      return ''
    }

    setIsProcessing(true)
    setProcessingHash(null)
    setProcessingStatus('PENDING')
    setLastAction({ operation: 'FILE_DISPUTE', disputeId: null, status: 'PENDING', hash: null, message: null })
    try {
      const filing = await writeWithConfirmedEvidence({
        references: draft.evidence,
        confirmNoEvidence: draft.confirmNoEvidence,
        write: evidenceReferences => fileDisputeOnChain(injected, {
          title: draft.title,
          description: draft.description,
          respondent: draft.respondent,
          amount: draft.amount,
          currency: draft.currency,
          evidenceReferences,
        }, hash => setProcessingHash(hash)),
      })

      const { id, transaction, account } = filing.value
      setWallet(current => ({ ...current, address: account, chainId: GENLAYER_CONFIG.network?.chainId ?? current.chainId }))
      setTransactions(current => [transaction, ...current.filter(item => item.hash.toLowerCase() !== transaction.hash.toLowerCase())])
      setProcessingHash(transaction.hash)
      setProcessingStatus(transaction.status)
      setLastAction({ operation: 'FILE_DISPUTE', disputeId: id, status: transaction.status, hash: transaction.hash, message: 'Filing receipt validated; canonical refresh requested.' })

      const localStorage = storage()
      if (localStorage) {
        const identity = configuredCanonicalIdentity()
        const currentRecords = loadKnownTransactionRecords(localStorage, identity)
        const record: KnownTransactionRecord = {
          hash: transaction.hash,
          disputeId: id,
          operation: transaction.operation,
        }
        saveKnownTransactionRecords(localStorage, identity, [record, ...currentRecords])
      }

      await refreshCanonicalState()
      setIsProcessing(false)
      addNotification({
        type: 'success',
        title: 'Dispute Filed On GenLayer',
        message: `${id} was decoded from the verified transaction return and the canonical state refresh was requested.`,
      })
      return id
    } catch (error) {
      setIsProcessing(false)
      setProcessingStatus(null)
      setLastAction(current => ({ ...current, status: 'ERROR', message: error instanceof Error ? error.message : 'The filing transaction failed.' }))
      if (error instanceof EvidenceVerificationError) {
        const message = describeEvidenceVerificationError(error)
        addNotification({ type: 'error', title: 'Evidence Verification Failed', message })
        throw error
      }
      const notification = filingErrorMessage(error)
      addNotification(notification)
      return ''
    }
  }, [addNotification, refreshCanonicalState])

  const runLifecycleAction = useCallback(async (
    action: 'accept' | 'decline' | 'evaluate',
    dispute: CanonicalDispute,
    evidence: EvidenceReference[] = [],
    confirmNoEvidence = false,
  ): Promise<boolean> => {
    if (GENLAYER_CONFIG.configurationIssue) {
      addNotification({ type: 'error', title: 'GenLayer Target Not Configured', message: GENLAYER_CONFIG.configurationIssue })
      return false
    }
    const injected = provider()
    if (!injected) {
      addNotification({ type: 'error', title: 'Injected Wallet Required', message: 'Connect an injected wallet before performing this lifecycle action.' })
      return false
    }
    if (action === 'accept' && evidence.length === 0 && !confirmNoEvidence) {
      addNotification({ type: 'error', title: 'Evidence Confirmation Required', message: 'Confirm that respondent acceptance intentionally contains no evidence before signing.' })
      return false
    }
    if (action === 'accept') {
      try {
        assertEvidenceCompatibleWithExisting([...dispute.claimantEvidence, ...dispute.respondentEvidence], evidence)
      } catch (error) {
        addNotification(lifecycleErrorMessage(error))
        return false
      }
    }

    setIsProcessing(true)
    setProcessingHash(null)
    setProcessingStatus('PENDING')
    const operation: TransactionOperation = action === 'accept' ? 'ACCEPT_DISPUTE' : action === 'decline' ? 'DECLINE_DISPUTE' : 'EVALUATE'
    setLastAction({ operation, disputeId: dispute.id, status: 'PENDING', hash: null, message: null })
    try {
      const run = async (verifiedEvidence: EvidenceReference[]) => {
        if (action === 'accept') {
          return acceptDisputeOnChain(injected, dispute.id, verifiedEvidence, hash => setProcessingHash(hash))
        }
        if (action === 'decline') return declineDisputeOnChain(injected, dispute.id, hash => setProcessingHash(hash))
        return evaluateDisputeOnChain(injected, dispute.id, hash => setProcessingHash(hash))
      }
      const result = action === 'accept'
        ? await writeWithConfirmedEvidence({ references: evidence, confirmNoEvidence, write: run })
        : { value: await run([]), references: [] }
      const lifecycle = result.value
      setWallet(current => ({ ...current, address: lifecycle.account, chainId: GENLAYER_CONFIG.network?.chainId ?? current.chainId }))
      setProcessingHash(lifecycle.transaction.hash)
      setProcessingStatus(lifecycle.transaction.status)
      setLastAction({ operation, disputeId: dispute.id, status: lifecycle.transaction.status, hash: lifecycle.transaction.hash, message: 'Lifecycle receipt validated; canonical refresh requested.' })

      const localStorage = storage()
      if (localStorage) {
        const identity = configuredCanonicalIdentity()
        const currentRecords = loadKnownTransactionRecords(localStorage, identity)
        const record: KnownTransactionRecord = {
          hash: lifecycle.transaction.hash,
          disputeId: dispute.id,
          operation: lifecycle.transaction.operation,
        }
        saveKnownTransactionRecords(localStorage, identity, [record, ...currentRecords])
      }
      await refreshCanonicalState()
      setIsProcessing(false)
      addNotification({
        type: 'success',
        title: action === 'accept' ? 'Respondent Acceptance Confirmed' : action === 'decline' ? 'Dispute Declined' : 'Evaluation Confirmed',
        message: `The ${action} transaction passed GenLayer receipt validation and canonical state refresh was requested.`,
      })
      return true
    } catch (error) {
      setIsProcessing(false)
      setProcessingStatus(null)
      setLastAction(current => ({ ...current, status: 'ERROR', message: error instanceof Error ? error.message : 'The lifecycle transaction failed.' }))
      addNotification(lifecycleErrorMessage(error))
      return false
    }
  }, [addNotification, refreshCanonicalState])

  const acceptDispute = useCallback((dispute: CanonicalDispute, evidence: EvidenceReference[], confirmNoEvidence: boolean) => runLifecycleAction('accept', dispute, evidence, confirmNoEvidence), [runLifecycleAction])
  const declineDispute = useCallback((dispute: CanonicalDispute) => runLifecycleAction('decline', dispute), [runLifecycleAction])
  const evaluateDispute = useCallback((dispute: CanonicalDispute) => runLifecycleAction('evaluate', dispute), [runLifecycleAction])

  return (
    <AppContext.Provider value={{
      wallet,
      hasInjectedWallet,
      connectWallet,
      disconnectWallet,
      disputes,
      disputeLoad,
      refreshCanonicalState,
      addDispute,
      acceptDispute,
      declineDispute,
      evaluateDispute,
      transactions,
      transactionLoad,
      notifications,
      addNotification,
      dismissNotification,
      isProcessing,
      processingHash,
      processingStatus,
      lastAction,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppStore {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}

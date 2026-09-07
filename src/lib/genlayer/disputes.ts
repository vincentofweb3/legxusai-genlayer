import type { EvidenceReference } from '../evidence/upload.ts'
import type { CalldataEncodable } from 'genlayer-js/types'
import { GENLAYER_CONFIG, requireConfiguredNetwork } from './config.ts'
import { getPublicClient, getWalletClient, type InjectedProvider } from './client.ts'
import {
  CONTRACT_STATE_VERSION,
  GenLayerDecodeError,
  decodeAddress,
  decodeCanonicalDisputes,
  type CanonicalDispute,
  type CanonicalIdentity,
} from './types.ts'
import {
  GenLayerTransactionError,
  decodeCanonicalDisputeId,
  decodeEvaluationOutcome,
  decodeSuccessfulBooleanReturn,
  decodeTransactionHash,
  isWalletRejection,
  waitForValidatedTransaction,
  type TransactionReturnRoute,
  type DisputeTransaction,
  type EvaluationOutcome,
  type FilingTransaction,
  type TransactionHash,
  type ReceiptClient,
} from './transactions.ts'

const DISPUTE_CACHE_PREFIX = 'legxus:canonical-disputes:v1:'
const LEGACY_CACHE_KEYS = ['legxus_disputes', 'legxus_transactions']

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>

type ContractReadClient = {
  readContract: (args: {
    address: `0x${string}`
    functionName: string
    args?: CalldataEncodable[]
    jsonSafeReturn: false
  }) => Promise<unknown>
}

type LifecycleWalletClient = ReceiptClient & {
  writeContract: (args: {
    address: `0x${string}`
    functionName: string
    args: CalldataEncodable[]
    value: bigint
  }) => Promise<unknown>
}

export type LifecycleDependencies = {
  readDispute?: (disputeId: string) => Promise<CanonicalDispute>
  getWalletClient?: LifecycleWalletFactory
  network?: ReturnType<typeof requireConfiguredNetwork>
  contractAddress?: `0x${string}`
}

type LifecycleWalletFactory = (
  provider: InjectedProvider | undefined,
  network: ReturnType<typeof requireConfiguredNetwork>,
) => Promise<{ client: LifecycleWalletClient; account: `0x${string}` }>

export type FilingArguments = {
  title: string
  description: string
  respondent: string
  amount: bigint
  currency: string
  evidenceReferences: EvidenceReference[]
}

export type CanonicalHydration = {
  identity: CanonicalIdentity
  disputes: CanonicalDispute[]
}

export type LifecycleTransactionResult = {
  transaction: DisputeTransaction
  account: `0x${string}`
  value: true | EvaluationOutcome
}

export function transactionReturnRouteForNetwork(
  network: ReturnType<typeof requireConfiguredNetwork>,
): TransactionReturnRoute {
  return network.environment === 'studio' ? 'studio-receipt' : 'public-trace'
}

export function configuredTransactionReturnRoute(): TransactionReturnRoute {
  return transactionReturnRouteForNetwork(requireConfiguredNetwork())
}

export class GenLayerConfigurationError extends Error {
  constructor(message = 'Set VITE_GENLAYER_ENV and VITE_DISPUTE_CONTRACT_ADDRESS before using the dispute contract.') {
    super(message)
    this.name = 'GenLayerConfigurationError'
  }
}

function requireContractAddress(): `0x${string}` {
  if (!GENLAYER_CONFIG.contractAddress) throw new GenLayerConfigurationError(GENLAYER_CONFIG.configurationIssue ?? undefined)
  return decodeAddress(GENLAYER_CONFIG.contractAddress, 'configured contract address')
}

export function configuredCanonicalIdentity(): CanonicalIdentity {
  const network = requireConfiguredNetwork()
  return {
    chainId: network.chainId,
    contractAddress: requireContractAddress(),
    stateVersion: CONTRACT_STATE_VERSION,
  }
}

export async function hydrateCanonicalDisputes(
  client: ContractReadClient = getPublicClient(),
  identity: CanonicalIdentity = configuredCanonicalIdentity(),
): Promise<CanonicalHydration> {
  const stateVersion = await client.readContract({
    address: identity.contractAddress,
    functionName: 'get_state_version',
    args: [],
    jsonSafeReturn: false,
  })
  if (stateVersion !== identity.stateVersion) {
    throw new GenLayerDecodeError('get_state_version', `expected ${identity.stateVersion}`)
  }
  const rawDisputes = await client.readContract({
    address: identity.contractAddress,
    functionName: 'get_all_disputes',
    args: [],
    jsonSafeReturn: false,
  })
  return { identity, disputes: decodeCanonicalDisputes(rawDisputes) }
}

export async function readCanonicalDispute(
  disputeId: string,
  client: ContractReadClient = getPublicClient(),
  identity: CanonicalIdentity = configuredCanonicalIdentity(),
): Promise<CanonicalDispute> {
  const raw = await client.readContract({
    address: identity.contractAddress,
    functionName: 'get_dispute',
    args: [disputeId],
    jsonSafeReturn: false,
  })
  const dispute = decodeCanonicalDisputes(new Map([[disputeId, raw]]))[0]
  if (!dispute) throw new GenLayerDecodeError(`get_dispute.${disputeId}`, 'returned no dispute')
  return dispute
}

export async function fileDisputeOnChain(
  provider: InjectedProvider | undefined,
  args: FilingArguments,
  onSubmitted?: (hash: TransactionHash) => void,
): Promise<{ id: string; transaction: FilingTransaction; account: `0x${string}` }> {
  const network = requireConfiguredNetwork()
  const address = requireContractAddress()
  const { client, account } = await getWalletClient(provider, network)
  let rawHash: unknown
  try {
    rawHash = await client.writeContract({
      address,
      functionName: 'file_dispute',
      args: [args.title, args.description, args.respondent, args.amount, args.currency, args.evidenceReferences],
      value: 0n,
    })
  } catch (error) {
    if (isWalletRejection(error)) throw new GenLayerTransactionError('wallet-rejected', 'The wallet rejected the transaction request.')
    throw error
  }
  const hash = decodeTransactionHash(rawHash)
  onSubmitted?.(hash)
  const validated = await waitForValidatedTransaction(client, hash, {
    allowTriggeredTransactions: false,
    returnRoute: configuredTransactionReturnRoute(),
  })
  const id = decodeCanonicalDisputeId(validated.returnValues)
  return {
    id,
    transaction: {
      ...validated,
      disputeId: id,
      operation: 'FILE_DISPUTE',
      returnValue: id,
    },
    account,
  }
}

function assertLifecycleAuthorization(
  dispute: CanonicalDispute,
  operation: 'ACCEPT_DISPUTE' | 'DECLINE_DISPUTE' | 'EVALUATE',
  account: `0x${string}`,
): void {
  const normalized = account.toLowerCase()
  const respondent = dispute.respondent.toLowerCase()
  const claimant = dispute.claimant.toLowerCase()
  if (operation === 'EVALUATE') {
    if (dispute.status !== 'READY_FOR_EVALUATION') {
      throw new GenLayerTransactionError('authorization', 'Evaluation is available only after respondent acceptance.')
    }
    if (normalized !== claimant && normalized !== respondent) {
      throw new GenLayerTransactionError('authorization', 'Only the named claimant or respondent may request evaluation.')
    }
    return
  }
  if (dispute.status !== 'AWAITING_RESPONDENT') {
    throw new GenLayerTransactionError('authorization', 'This dispute is no longer awaiting respondent response.')
  }
  if (normalized !== respondent) {
    throw new GenLayerTransactionError('authorization', 'Only the canonical respondent may perform this action.')
  }
}

async function submitLifecycleWrite(
  provider: InjectedProvider | undefined,
  disputeId: string,
  operation: 'ACCEPT_DISPUTE' | 'DECLINE_DISPUTE' | 'EVALUATE',
  evidenceReferences: EvidenceReference[],
  decodeReturn: (values: unknown[]) => true | EvaluationOutcome,
  onSubmitted?: (hash: TransactionHash) => void,
  dependencies: LifecycleDependencies = {},
): Promise<LifecycleTransactionResult> {
  const network = dependencies.network ?? requireConfiguredNetwork()
  const address = dependencies.contractAddress ?? requireContractAddress()
  const readDispute = dependencies.readDispute ?? ((id: string) => readCanonicalDispute(id))
  const dispute = await readDispute(disputeId)

  // Read the injected account and chain only after canonical authorization data
  // is available, immediately before constructing the client that can sign.
  // This keeps a changed account or chain from being authorized against stale
  // wallet state between the canonical read and the write request.
  const walletFactory: LifecycleWalletFactory = dependencies.getWalletClient
    ?? ((walletProvider, targetNetwork) => getWalletClient(walletProvider, targetNetwork))
  const { client, account } = await walletFactory(provider, network)
  assertLifecycleAuthorization(dispute, operation, account)

  const call = lifecycleCall(operation, disputeId, evidenceReferences)

  let rawHash: unknown
  try {
    rawHash = await client.writeContract({ address, ...call })
  } catch (error) {
    if (isWalletRejection(error)) throw new GenLayerTransactionError('wallet-rejected', 'The wallet rejected the transaction request.')
    throw error
  }
  const hash = decodeTransactionHash(rawHash)
  onSubmitted?.(hash)
  const validated = await waitForValidatedTransaction(client, hash, {
    allowTriggeredTransactions: false,
    returnRoute: transactionReturnRouteForNetwork(network),
  })
  const value = decodeReturn(validated.returnValues)
  return {
    account,
    value,
    transaction: {
      ...validated,
      disputeId,
      operation,
      returnValue: value,
    },
  }
}

export function lifecycleCall(
  operation: 'ACCEPT_DISPUTE' | 'DECLINE_DISPUTE' | 'EVALUATE',
  disputeId: string,
  evidenceReferences: EvidenceReference[] = [],
): { functionName: string; args: CalldataEncodable[]; value: 0n } {
  if (operation === 'ACCEPT_DISPUTE') {
    return { functionName: 'accept_dispute', args: [disputeId, evidenceReferences], value: 0n }
  }
  if (operation === 'DECLINE_DISPUTE') {
    return { functionName: 'decline_dispute', args: [disputeId], value: 0n }
  }
  return { functionName: 'evaluate', args: [disputeId], value: 0n }
}

export async function acceptDisputeOnChain(
  provider: InjectedProvider | undefined,
  disputeId: string,
  evidenceReferences: EvidenceReference[],
  onSubmitted?: (hash: TransactionHash) => void,
  dependencies?: LifecycleDependencies,
): Promise<LifecycleTransactionResult> {
  return submitLifecycleWrite(provider, disputeId, 'ACCEPT_DISPUTE', evidenceReferences, values => decodeSuccessfulBooleanReturn(values, 'accept_dispute'), onSubmitted, dependencies)
}

export async function declineDisputeOnChain(
  provider: InjectedProvider | undefined,
  disputeId: string,
  onSubmitted?: (hash: TransactionHash) => void,
  dependencies?: LifecycleDependencies,
): Promise<LifecycleTransactionResult> {
  return submitLifecycleWrite(provider, disputeId, 'DECLINE_DISPUTE', [], values => decodeSuccessfulBooleanReturn(values, 'decline_dispute'), onSubmitted, dependencies)
}

export async function evaluateDisputeOnChain(
  provider: InjectedProvider | undefined,
  disputeId: string,
  onSubmitted?: (hash: TransactionHash) => void,
  dependencies?: LifecycleDependencies,
): Promise<LifecycleTransactionResult> {
  return submitLifecycleWrite(provider, disputeId, 'EVALUATE', [], decodeEvaluationOutcome, onSubmitted, dependencies)
}

function disputeCacheKey(identity: CanonicalIdentity): string {
  return `${DISPUTE_CACHE_PREFIX}${identity.chainId}:${identity.contractAddress.toLowerCase()}:${identity.stateVersion}`
}

function removeForeignDisputeCaches(storage: StorageLike, currentKey: string): void {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return
  const stale: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(DISPUTE_CACHE_PREFIX) && key !== currentKey) stale.push(key)
  }
  stale.forEach(key => storage.removeItem(key))
}

function cachedEvidence(reference: EvidenceReference): Record<string, unknown> {
  return {
    ...reference,
    byte_size: BigInt(reference.byte_size),
  }
}

function cachedDispute(record: CanonicalDispute): Record<string, unknown> {
  return {
    state_version: record.stateVersion,
    id: record.id,
    title: record.title,
    description: record.description,
    criteria_version: record.criteriaVersion,
    claimant: record.claimant,
    respondent: record.respondent,
    reference_amount: record.referenceAmount,
    reference_currency: record.referenceCurrency,
    evidence_references: record.claimantEvidence.map(cachedEvidence),
    respondent_evidence_references: record.respondentEvidence.map(cachedEvidence),
    evidence_policy: record.evidencePolicy,
    evidence_status: record.evidenceStatus,
    criteria_status: record.criteriaStatus,
    verdict: record.verdict,
    confidence_bucket: BigInt(record.confidenceBucket),
    evidence_sufficiency: record.evidenceSufficiency,
    reason_code: record.reasonCode,
    source_error_code: record.sourceErrorCode,
    evidence_available: BigInt(record.evidenceAvailable),
    evidence_failed: BigInt(record.evidenceFailed),
    status: record.status,
    filed_at: record.filedAt,
    accepted_at: record.acceptedAt ?? '',
    evaluated_at: record.evaluatedAt ?? '',
  }
}

function jsonCacheValue(disputes: CanonicalDispute[]): string {
  const records = Object.fromEntries(disputes.map(dispute => [dispute.id, cachedDispute(dispute)]))
  return JSON.stringify(records, (_key, value) => typeof value === 'bigint' ? { $bigint: value.toString() } : value)
}

function parseCacheValue(raw: string): unknown {
  return JSON.parse(raw, (_key, value: unknown) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 && '$bigint' in value) {
      const bigintValue = value.$bigint
      if (typeof bigintValue !== 'string' || !/^(0|[1-9][0-9]*)$/.test(bigintValue)) throw new Error('Invalid cached bigint')
      return BigInt(bigintValue)
    }
    return value
  })
}

export function clearLegacyCanonicalCaches(storage: StorageLike): void {
  LEGACY_CACHE_KEYS.forEach(key => storage.removeItem(key))
}

export function saveCanonicalDisputeCache(storage: StorageLike, hydration: CanonicalHydration): void {
  const key = disputeCacheKey(hydration.identity)
  removeForeignDisputeCaches(storage, key)
  storage.setItem(key, jsonCacheValue(hydration.disputes))
}

export function clearCanonicalDisputeCache(storage: StorageLike, identity: CanonicalIdentity): void {
  storage.removeItem(disputeCacheKey(identity))
}

export function loadCanonicalDisputeCache(storage: StorageLike, identity: CanonicalIdentity): CanonicalDispute[] | null {
  const key = disputeCacheKey(identity)
  removeForeignDisputeCaches(storage, key)
  const raw = storage.getItem(key)
  if (!raw) return null
  try {
    const parsed = parseCacheValue(raw)
    return decodeCanonicalDisputes(parsed)
  } catch {
    storage.removeItem(key)
    return null
  }
}

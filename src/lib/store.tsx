import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    ethereum?: {
      request: (a: { method: string; params?: unknown[] }) => Promise<unknown>
      on: (e: string, h: (...a: unknown[]) => void) => void
      removeListener: (e: string, h: (...a: unknown[]) => void) => void
      selectedAddress?: string | null
    }
  }
}

export type TxStatus = 'PENDING' | 'PROPOSING' | 'COMMITTING' | 'REVEALING' | 'ACCEPTED' | 'FINALIZED' | 'CANCELED'

export interface Dispute {
  id: string
  title: string
  description: string
  claimant: string
  respondent: string
  amount: number
  currency: string
  category: string
  evidence: string[]
  status: TxStatus
  verdict: string | null
  confidence: number | null
  validatorsCount: number
  filedAt: string
  resolvedAt: string | null
  txHash: string
}

export interface Prediction {
  id: string
  question: string
  description: string
  category: string
  oracleSource: string
  endDate: string
  yesPrice: number
  noPrice: number
  yesStake: number
  noStake: number
  totalVolume: number
  participants: number
  status: 'OPEN' | 'RESOLVED'
  verdict: string | null
  createdAt: string
}

export interface TxRecord {
  hash: string
  type: string
  status: TxStatus
  time: string
  timestamp: number
  detail?: string
}

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message: string
}

// ─── Seed data ───────────────────────────────────────────────────────────────

const SEED_DISPUTES: Dispute[] = [
  { id: 'DSP-0047', title: 'SaaS Subscription Non-Delivery', description: 'Vendor failed to deliver promised AI analytics module after 90-day payment period. Invoice #INV-2024-0892.', claimant: '0xA3f2...8B91', respondent: '0xF71c...2D4e', amount: 4800, currency: 'USDC', category: 'Service Delivery', evidence: ['invoice_892.pdf', 'email_thread.eml', 'contract_v2.pdf'], status: 'FINALIZED', verdict: 'CLAIMANT_WINS', confidence: 94, validatorsCount: 7, filedAt: '2025-12-01T09:30:00Z', resolvedAt: '2025-12-03T14:22:00Z', txHash: '0x3a7f9e2b1c4d8a5f0e3b6c9d2a4f7e1b' },
  { id: 'DSP-0046', title: 'Freelance Design Dispute', description: "Client claims delivered designs don't match the brief specifications.", claimant: '0xB9e1...3C72', respondent: '0xD45a...7F1b', amount: 2200, currency: 'USDC', category: 'Service Delivery', evidence: ['design_brief.pdf', 'deliverables.zip'], status: 'PROPOSING', verdict: null, confidence: null, validatorsCount: 5, filedAt: '2025-12-04T11:15:00Z', resolvedAt: null, txHash: '0x8b4c3f2a9e1d6b7f0a3c5e8d2b4f7a1c' },
  { id: 'DSP-0045', title: 'Smart Contract Bug Bounty', description: 'Claimed critical vulnerability was already known and patched.', claimant: '0xC82d...9A14', respondent: '0xE36f...5B8c', amount: 15000, currency: 'GEN', category: 'Smart Contract Bug', evidence: ['vuln_report.pdf', 'timeline.json'], status: 'FINALIZED', verdict: 'RESPONDENT_WINS', confidence: 88, validatorsCount: 11, filedAt: '2025-11-28T08:00:00Z', resolvedAt: '2025-11-30T19:45:00Z', txHash: '0x1c9e4a7b2d5f8c3a6e9b2d5c8f1a4e7b' },
  { id: 'DSP-0044', title: 'NFT Royalty Dispute', description: 'Secondary sale royalties not transferred per contract terms.', claimant: '0xF14b...6E23', respondent: '0xA78c...1D9f', amount: 890, currency: 'ETH', category: 'NFT/Token', evidence: ['nft_contract.json', 'sale_txs.csv'], status: 'COMMITTING', verdict: null, confidence: null, validatorsCount: 5, filedAt: '2025-12-05T16:00:00Z', resolvedAt: null, txHash: '0x5e2b8f4c1a7d3e9b6c4f2a8d5b1e7c3f' },
]

const SEED_PREDICTIONS: Prediction[] = [
  { id: 'PRED-0089', question: 'Will GenLayer mainnet launch before Q3 2026?', description: "Resolves YES if GenLayer's mainnet goes live before July 1, 2026.", category: 'Technology', oracleSource: 'Official GenLayer blog + social verification', endDate: '2026-06-30T23:59:59Z', yesPrice: 0.72, noPrice: 0.28, yesStake: 205000, noStake: 79500, totalVolume: 284500, participants: 1847, status: 'OPEN', verdict: null, createdAt: '2025-11-01T00:00:00Z' },
  { id: 'PRED-0088', question: 'Will Bitcoin close above $120K on Dec 31, 2025?', description: 'AI fetches closing price from CoinGecko, Binance, and Coinbase.', category: 'Crypto', oracleSource: 'CoinGecko + Binance + Coinbase price feeds', endDate: '2025-12-31T23:59:59Z', yesPrice: 0.58, noPrice: 0.42, yesStake: 696000, noStake: 504000, totalVolume: 1200000, participants: 5621, status: 'RESOLVED', verdict: 'YES', createdAt: '2025-10-15T00:00:00Z' },
  { id: 'PRED-0087', question: 'Will the next US Fed meeting result in a rate cut?', description: 'GenLayer oracle scrapes Fed official press releases.', category: 'Finance', oracleSource: 'Fed.gov + Reuters + Bloomberg consensus', endDate: '2026-01-29T20:00:00Z', yesPrice: 0.31, noPrice: 0.69, yesStake: 167400, noStake: 372600, totalVolume: 540000, participants: 3218, status: 'OPEN', verdict: null, createdAt: '2025-11-20T00:00:00Z' },
  { id: 'PRED-0086', question: 'Will any AI model score >90% on ARC-AGI-2 by mid-2026?', description: 'AI oracle monitors official ARC-AGI leaderboard.', category: 'AI Research', oracleSource: 'ARC-AGI leaderboard + ArXiv papers', endDate: '2026-06-30T23:59:59Z', yesPrice: 0.45, noPrice: 0.55, yesStake: 44010, noStake: 53790, totalVolume: 97800, participants: 892, status: 'OPEN', verdict: null, createdAt: '2025-12-01T00:00:00Z' },
]

const SEED_TXS: TxRecord[] = [
  { hash: '0x3a7f...9f', type: 'DISPUTE FILED', status: 'PROPOSING', time: '2m ago', timestamp: Date.now() - 120000 },
  { hash: '0x8b4c...9f', type: 'VERDICT RENDERED', status: 'FINALIZED', time: '5m ago', timestamp: Date.now() - 300000 },
  { hash: '0x1c9e...1a', type: 'PREDICTION STAKED', status: 'ACCEPTED', time: '8m ago', timestamp: Date.now() - 480000 },
  { hash: '0xa4f2...d9', type: 'MARKET RESOLVED', status: 'FINALIZED', time: '12m ago', timestamp: Date.now() - 720000 },
  { hash: '0x7c1e...1a', type: 'ORACLE UPDATED', status: 'FINALIZED', time: '18m ago', timestamp: Date.now() - 1080000 },
  { hash: '0x5e2b...2a', type: 'APPEAL SUBMITTED', status: 'COMMITTING', time: '24m ago', timestamp: Date.now() - 1440000 },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getStatusColor(s: string) {
  switch (s) {
    case 'FINALIZED': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
    case 'ACCEPTED': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30'
    case 'PROPOSING': case 'COMMITTING': case 'REVEALING': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
    case 'PENDING': return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
    case 'CANCELED': return 'text-red-400 bg-red-400/10 border-red-400/30'
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30'
  }
}

export function shortenAddr(a: string) {
  if (a.includes('...')) return a
  return `${a.slice(0, 6)}...${a.slice(-4)}`
}

export function randHash() {
  return '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppStore {
  // Wallet
  wallet: { address: string | null; ethBalance: number; genBalance: number; isConnecting: boolean }
  hasInjectedWallet: boolean
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  // Disputes
  disputes: Dispute[]
  addDispute: (d: Omit<Dispute, 'id' | 'filedAt' | 'txHash' | 'status' | 'verdict' | 'confidence' | 'validatorsCount' | 'resolvedAt'>) => Promise<string>
  // Predictions
  predictions: Prediction[]
  addPrediction: (p: Omit<Prediction, 'id' | 'createdAt' | 'yesStake' | 'noStake' | 'totalVolume' | 'participants' | 'status' | 'verdict'>) => Promise<string>
  stakeOnPrediction: (id: string, side: 'YES' | 'NO', amount: number) => Promise<void>
  // Transactions
  transactions: TxRecord[]
  // Notifications
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id'>) => void
  dismissNotification: (id: string) => void
  // TX processing
  isProcessing: boolean
  processingHash: string | null
  processingStatus: TxStatus | null
}

const AppContext = createContext<AppStore | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState({ address: null as string | null, ethBalance: 0, genBalance: 0, isConnecting: false })
  const [disputes, setDisputes] = useState<Dispute[]>(() => { try { const r = localStorage.getItem('legxus_disputes'); return r ? JSON.parse(r) : SEED_DISPUTES } catch { return SEED_DISPUTES } })
  const [predictions, setPredictions] = useState<Prediction[]>(() => { try { const r = localStorage.getItem('legxus_predictions'); return r ? JSON.parse(r) : SEED_PREDICTIONS } catch { return SEED_PREDICTIONS } })
  const [transactions, setTransactions] = useState<TxRecord[]>(() => { try { const r = localStorage.getItem('legxus_transactions'); return r ? JSON.parse(r) : SEED_TXS } catch { return SEED_TXS } })
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingHash, setProcessingHash] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<TxStatus | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasInjectedWallet = typeof window !== 'undefined' && !!window.ethereum


  useEffect(() => { try { localStorage.setItem('legxus_disputes', JSON.stringify(disputes)) } catch {} }, [disputes])
  useEffect(() => { try { localStorage.setItem('legxus_predictions', JSON.stringify(predictions)) } catch {} }, [predictions])
  useEffect(() => { try { localStorage.setItem('legxus_transactions', JSON.stringify(transactions)) } catch {} }, [transactions])



  // Update "X ago" timestamps every 30s
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTransactions(prev => prev.map(t => ({ ...t, time: timeAgo(t.timestamp) })))
    }, 30000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  // Restore wallet session on reload
  useEffect(() => {
    const restore = async () => {
      if (!window.ethereum?.selectedAddress) return
      const addr = window.ethereum.selectedAddress
      const eth = await fetchEth(addr)
      setWallet({ address: addr, ethBalance: eth, genBalance: 0, isConnecting: false })
    }
    restore()
  }, [])

  // Listen for MetaMask account/chain changes
  useEffect(() => {
    if (!window.ethereum) return
    const onAccounts = async (accs: unknown) => {
      const a = accs as string[]
      if (!a.length) { setWallet({ address: null, ethBalance: 0, genBalance: 0, isConnecting: false }); return }
      const eth = await fetchEth(a[0])
      setWallet(p => ({ ...p, address: a[0], ethBalance: eth }))
    }
    const onChain = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChain)
    return () => { window.ethereum?.removeListener('accountsChanged', onAccounts); window.ethereum?.removeListener('chainChanged', onChain) }
  }, [])

  const addNotification = useCallback((n: Omit<Notification, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setNotifications(p => [...p, { ...n, id }])
    setTimeout(() => setNotifications(p => p.filter(x => x.id !== id)), 5500)
  }, [])

  const dismissNotification = useCallback((id: string) => {
    setNotifications(p => p.filter(n => n.id !== id))
  }, [])

  async function fetchEth(addr: string) {
    if (!window.ethereum) return 0
    try {
      const hex = await window.ethereum.request({ method: 'eth_getBalance', params: [addr, 'latest'] }) as string
      return parseFloat((parseInt(hex, 16) / 1e18).toFixed(4))
    } catch { return 0 }
  }

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      addNotification({ type: 'error', title: 'No Wallet Found', message: 'MetaMask not detected. Opening download page...' })
      setTimeout(() => window.open('https://metamask.io/download/', '_blank'), 1200)
      return
    }
    setWallet(p => ({ ...p, isConnecting: true }))
    try {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      if (!accs?.length) throw new Error('No accounts returned')
      const addr = accs[0]
      const eth = await fetchEth(addr)
      setWallet({ address: addr, ethBalance: eth, genBalance: 0, isConnecting: false })
      addNotification({ type: 'success', title: 'Wallet Connected', message: `${shortenAddr(addr)} connected to GenLayer Testnet` })
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code
      const rejected = code === 4001
      setWallet(p => ({ ...p, isConnecting: false }))
      addNotification({ type: rejected ? 'warning' : 'error', title: rejected ? 'Cancelled' : 'Connection Failed', message: rejected ? 'You rejected the wallet popup.' : String(err) })
    }
  }, [addNotification])

  const disconnectWallet = useCallback(() => {
    setWallet({ address: null, ethBalance: 0, genBalance: 0, isConnecting: false })
    addNotification({ type: 'info', title: 'Session Cleared', message: 'To fully disconnect, remove the site in MetaMask.' })
  }, [addNotification])

  // Simulate GenLayer TX lifecycle, returns final hash
  const runTxLifecycle = useCallback((type: string, detail?: string): Promise<string> => {
    return new Promise(resolve => {
      const hash = randHash()
      const now = Date.now()
      setIsProcessing(true)
      setProcessingHash(hash)
      setProcessingStatus('PENDING')

      const steps: [TxStatus, number][] = [
        ['PENDING', 0], ['PROPOSING', 1500], ['COMMITTING', 3200],
        ['REVEALING', 5000], ['ACCEPTED', 6800], ['FINALIZED', 8500],
      ]

      steps.forEach(([status, delay]) => {
        setTimeout(() => {
          setProcessingStatus(status)
          if (status === 'FINALIZED') {
            setIsProcessing(false)
            const shortHash = `${hash.slice(0, 6)}...${hash.slice(-2)}`
            const tx: TxRecord = { hash: shortHash, type, status: 'FINALIZED', time: 'just now', timestamp: now, detail }
            setTransactions(p => [tx, ...p].slice(0, 50))
            addNotification({ type: 'success', title: 'Transaction Finalized', message: `${type} confirmed by GenLayer validators` })
            resolve(hash)
          }
        }, delay)
      })
    })
  }, [addNotification])

  const addDispute = useCallback(async (data: Omit<Dispute, 'id' | 'filedAt' | 'txHash' | 'status' | 'verdict' | 'confidence' | 'validatorsCount' | 'resolvedAt'>) => {
    const id = `DSP-${String(disputes.length + 1).padStart(4, '0')}`
    const txHash = await runTxLifecycle('DISPUTE FILED', data.title)
    const newDispute: Dispute = {
      ...data, id, txHash,
      status: 'PROPOSING', verdict: null, confidence: null,
      validatorsCount: 7, filedAt: new Date().toISOString(), resolvedAt: null,
    }
    setDisputes(p => [newDispute, ...p])

    // Simulate AI verdict after 12s
    setTimeout(() => {
      const verdict = Math.random() > 0.45 ? 'CLAIMANT_WINS' : 'RESPONDENT_WINS'
      const confidence = Math.floor(Math.random() * 20 + 78)
      setDisputes(p => p.map(d => d.id === id
        ? { ...d, status: 'FINALIZED', verdict, confidence, resolvedAt: new Date().toISOString() }
        : d))
      setTransactions(p => [{
      hash: `${txHash.slice(0, 6)}...vr`,
      type: 'VERDICT RENDERED', status: 'FINALIZED' as TxStatus,
      time: 'just now', timestamp: Date.now(), detail: `${id}: ${verdict}`,
    }, ...p].slice(0, 50))
      addNotification({ type: 'success', title: 'Verdict Reached', message: `${id} — ${verdict.replace('_', ' ')} (${confidence}% confidence)` })
    }, 12000)

    return id
  }, [disputes.length, runTxLifecycle, addNotification])

  const addPrediction = useCallback(async (data: Omit<Prediction, 'id' | 'createdAt' | 'yesStake' | 'noStake' | 'totalVolume' | 'participants' | 'status' | 'verdict'>) => {
    const id = `PRED-${String(predictions.length + 1).padStart(4, '0')}`
    await runTxLifecycle('MARKET CREATED', data.question)
    const newPred: Prediction = {
      ...data, id, createdAt: new Date().toISOString(),
      yesStake: 0, noStake: 0, totalVolume: 0, participants: 0,
      status: 'OPEN', verdict: null,
    }
    setPredictions(p => [newPred, ...p])
    return id
  }, [predictions.length, runTxLifecycle])

  const stakeOnPrediction = useCallback(async (id: string, side: 'YES' | 'NO', amount: number) => {
    await runTxLifecycle('PREDICTION STAKED', `${side} on ${id}`)
    setPredictions(p => p.map(pred => {
      if (pred.id !== id) return pred
      const yesStake = side === 'YES' ? pred.yesStake + amount : pred.yesStake
      const noStake = side === 'NO' ? pred.noStake + amount : pred.noStake
      const totalVolume = yesStake + noStake
      const yesPrice = totalVolume > 0 ? parseFloat((yesStake / totalVolume).toFixed(2)) : pred.yesPrice
      const noPrice = totalVolume > 0 ? parseFloat((noStake / totalVolume).toFixed(2)) : pred.noPrice
      return { ...pred, yesStake, noStake, totalVolume, yesPrice, noPrice, participants: pred.participants + 1 }
    }))
  }, [runTxLifecycle])

  return (
    <AppContext.Provider value={{
      wallet, hasInjectedWallet, connectWallet, disconnectWallet,
      disputes, addDispute,
      predictions, addPrediction, stakeOnPrediction,
      transactions,
      notifications, addNotification, dismissNotification,
      isProcessing, processingHash, processingStatus,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

import { useState } from 'react'
import { TrendingUp, Search, Plus, Users, Clock, ExternalLink, CheckCircle, Loader2, X, ChevronDown } from 'lucide-react'
import { useApp } from '../lib/store'

const CATEGORIES = ['ALL', 'Technology', 'Crypto', 'Finance', 'AI Research', 'Sports']

function ConfidenceBar({ yes, no }: { yes: number; no: number }) {
  const yp = Math.round(yes * 100), np = Math.round(no * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'rgba(28,42,74,0.6)' }}>
        <div className="transition-all duration-700 rounded-l-full" style={{ width: `${yp}%`, background: 'linear-gradient(90deg,#00de6a,#00f5ff)' }} />
        <div className="transition-all duration-700 rounded-r-full" style={{ width: `${np}%`, background: 'linear-gradient(90deg,#ff2d78,#b44eff)' }} />
      </div>
      <div className="flex justify-between font-mono text-[10px]">
        <span className="text-emerald-400">YES {yp}%</span>
        <span className="text-neon-pink">NO {np}%</span>
      </div>
    </div>
  )
}

// ─── Stake Modal ─────────────────────────────────────────────────────────────
function StakeModal({ market, onClose }: { market: ReturnType<typeof useApp>['predictions'][0]; onClose: () => void }) {
  const { stakeOnPrediction, isProcessing, wallet } = useApp()
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState(false)

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    await stakeOnPrediction(market.id, side, parseFloat(amount))
    setDone(true)
  }

  const payout = amount ? (parseFloat(amount) / (side === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2) : '0.00'

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="glass-bright rounded-3xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white text-sm">Place Prediction</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={15} /></button>
        </div>
        <p className="font-body text-xs text-slate-400 mb-5 leading-relaxed">{market.question}</p>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
            <div className="font-display font-bold text-white text-lg mb-1">Position Opened!</div>
            <p className="font-body text-xs text-slate-400 mb-1">Your stake has been confirmed on GenLayer</p>
            <p className="font-mono text-[10px] text-slate-600 mb-4">
              {side} · {amount} USDC · Payout if correct: {payout} USDC
            </p>
            <button onClick={onClose} className="btn-glass w-full justify-center text-sm py-3">Done</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {(['YES', 'NO'] as const).map(s => (
                <button key={s} onClick={() => setSide(s)}
                  className={`py-3 rounded-xl font-display font-bold text-sm transition-all duration-200 ${
                    side === s
                      ? s === 'YES' ? 'bg-emerald-400/20 border border-emerald-400/50 text-emerald-400' : 'bg-neon-pink/20 border border-neon-pink/50 text-neon-pink'
                      : 'bg-surface border border-border text-slate-500'
                  }`}>
                  {s}
                  <div className="font-mono text-[10px] mt-0.5">{s === 'YES' ? `${Math.round(market.yesPrice * 100)}¢` : `${Math.round(market.noPrice * 100)}¢`}</div>
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Amount (USDC)</label>
              <input type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="input-field font-mono" />
            </div>

            <div className="rounded-xl p-3 mb-4 space-y-1.5" style={{ background: 'rgba(28,42,74,0.4)' }}>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-slate-500">Potential Payout</span>
                <span className="text-neon-cyan">{payout} USDC</span>
              </div>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-slate-500">Oracle Source</span>
                <span className="text-slate-300 text-[10px] truncate ml-4">{market.oracleSource.slice(0, 28)}...</span>
              </div>
            </div>

            <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)' }}>
              <p className="font-body text-[11px] text-slate-400 leading-relaxed">
                Resolution is handled by GenLayer's <span className="text-neon-cyan">Intelligent Oracle</span> — AI validators fetch live web data to determine the outcome trustlessly.
              </p>
            </div>

            <button onClick={handleStake}
              disabled={isProcessing || !amount || !wallet.address}
              className="btn-solid w-full justify-center py-3 text-sm disabled:opacity-50">
              {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Processing...</> : 'Confirm Stake'}
            </button>
            {!wallet.address && <p className="font-mono text-[10px] text-yellow-500 text-center mt-2">Connect wallet to stake</p>}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Create Market Modal ─────────────────────────────────────────────────────
function CreateMarketModal({ onClose }: { onClose: () => void }) {
  const { addPrediction, isProcessing, wallet } = useApp()
  const [form, setForm] = useState({ question: '', description: '', category: 'Technology', oracleSource: '', endDate: '' })
  const [done, setDone] = useState(false)
  const [newId, setNewId] = useState('')

  const handleCreate = async () => {
    if (!form.question || !form.description || !form.endDate) return
    const id = await addPrediction({
      question: form.question,
      description: form.description,
      category: form.category,
      oracleSource: form.oracleSource || 'AI validators + web data',
      endDate: new Date(form.endDate).toISOString(),
      yesPrice: 0.5,
      noPrice: 0.5,
    })
    setNewId(id)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="glass-bright rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white">Create Prediction Market</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={15} /></button>
        </div>

        {done ? (
          <div className="text-center py-6">
            <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
            <div className="font-display font-bold text-white text-xl mb-1">{newId} Created!</div>
            <p className="font-body text-xs text-slate-400 mb-4">Your prediction market is live on GenLayer</p>
            <button onClick={onClose} className="btn-glass w-full justify-center py-3 text-sm">View Markets</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Question * (YES/NO format)</label>
              <input type="text" placeholder="Will X happen before Y date?" value={form.question}
                onChange={e => setForm(p => ({ ...p, question: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Description & Resolution Criteria *</label>
              <textarea rows={3} placeholder="Describe how this market resolves..."
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="input-field resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Category</label>
                <div className="relative">
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="select-field pr-8">
                    {['Technology', 'Crypto', 'Finance', 'AI Research', 'Sports', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">End Date *</label>
                <input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  className="input-field" min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>
            <div>
              <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Oracle Source URLs</label>
              <input type="text" placeholder="e.g. CoinGecko + Binance price feeds"
                value={form.oracleSource} onChange={e => setForm(p => ({ ...p, oracleSource: e.target.value }))}
                className="input-field text-xs" />
              <p className="font-mono text-[10px] text-slate-600 mt-1">AI validators will fetch these sources to resolve the market</p>
            </div>

            <div className="rounded-xl p-3" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)' }}>
              <p className="font-body text-[11px] text-slate-400 leading-relaxed">
                Your market will be deployed as an Intelligent Contract. GenLayer's AI Oracle automatically fetches resolution data and settles the market trustlessly.
              </p>
            </div>

            <button onClick={handleCreate}
              disabled={isProcessing || !form.question || !form.description || !form.endDate || !wallet.address}
              className="btn-solid w-full justify-center py-3 text-sm disabled:opacity-50">
              {isProcessing ? <><Loader2 size={14} className="animate-spin" /> Deploying...</> : 'Deploy Market On-Chain'}
            </button>
            {!wallet.address && <p className="font-mono text-[10px] text-yellow-500 text-center">Connect wallet to create a market</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PredictionsPage() {
  const { predictions } = useApp()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [staking, setStaking] = useState<typeof predictions[0] | null>(null)
  const [creating, setCreating] = useState(false)

  const filtered = predictions.filter(p => {
    const matchSearch = p.question.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'ALL' || p.category === category
    return matchSearch && matchCat
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header flex items-center gap-2"><TrendingUp size={20} className="text-neon-purple" /> Prediction Markets</h1>
          <p className="page-sub">Self-resolving markets powered by GenLayer Intelligent Oracles</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-glass flex items-center gap-2 text-sm">
          <Plus size={14} /> Create Market
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 relative min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" placeholder="Search markets..." value={search}
            onChange={e => setSearch(e.target.value)} className="input-field pl-9 h-10 text-xs" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-2 rounded-xl text-xs font-mono transition-all ${
                category === c ? 'text-neon-purple bg-neon-purple/10 border border-neon-purple/30' : 'text-slate-400 bg-surface border border-border hover:border-slate-600'
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <TrendingUp size={40} className="text-slate-700 mx-auto mb-3" />
          <p className="font-body text-slate-500 mb-4">No markets found</p>
          <button onClick={() => setCreating(true)} className="btn-glass text-sm">Create your first market</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {filtered.map(p => (
            <div key={p.id} className="glass rounded-2xl p-5 card-hover flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-mono text-[10px] text-neon-purple bg-neon-purple/10 px-2 py-0.5 rounded-lg">{p.category}</span>
                    <span className={`status-pill ${p.status === 'RESOLVED' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'}`}>
                      {p.status === 'RESOLVED' && p.verdict ? `✓ ${p.verdict}` : 'OPEN'}
                    </span>
                  </div>
                  <h3 className="font-display font-semibold text-white text-sm leading-snug">{p.question}</h3>
                </div>
              </div>
              <p className="font-body text-xs text-slate-500 leading-relaxed mb-4 flex-1">{p.description}</p>
              <ConfidenceBar yes={p.yesPrice} no={p.noPrice} />
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400"><Users size={10} />{p.participants.toLocaleString()}</div>
                  <div className="font-mono text-xs text-neon-cyan font-bold">${(p.totalVolume / 1000).toFixed(0)}k vol</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
                    <Clock size={9} />{new Date(p.endDate).toLocaleDateString()}
                  </div>
                  {p.status === 'OPEN' && (
                    <button onClick={() => setStaking(p)} className="btn-glass text-xs px-3 py-1.5">Stake</button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
                <span className="font-mono text-[10px] text-slate-600 truncate">Oracle: {p.oracleSource}</span>
                <ExternalLink size={9} className="text-slate-700 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {staking && <StakeModal market={staking} onClose={() => setStaking(null)} />}
      {creating && <CreateMarketModal onClose={() => setCreating(false)} />}
    </div>
  )
}

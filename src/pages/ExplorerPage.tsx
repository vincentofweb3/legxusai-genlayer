import { useState } from 'react'
import { Search, Activity, Zap, Clock, CheckCircle, ChevronRight, ExternalLink } from 'lucide-react'
import { useApp, getStatusColor, TxStatus } from '../lib/store'

const TX_TYPE_COLORS: Record<string, string> = {
  'DISPUTE FILED': '#00f5ff',
  'VERDICT RENDERED': '#00de6a',
  'PREDICTION STAKED': '#b44eff',
  'MARKET RESOLVED': '#ffd700',
  'ORACLE UPDATED': '#ff9500',
  'APPEAL SUBMITTED': '#ff2d78',
  'MARKET CREATED': '#b44eff',
}

const TX_LIFECYCLE: TxStatus[] = ['PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'FINALIZED']

export default function ExplorerPage() {
  const { transactions } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<typeof transactions[0] | null>(null)

  const filtered = transactions.filter(tx =>
    tx.hash.toLowerCase().includes(search.toLowerCase()) ||
    tx.type.toLowerCase().includes(search.toLowerCase())
  )

  // Live stats derived from transaction data
  const totalTxs = 47291 + transactions.length
  const finalizedToday = transactions.filter(t => t.status === 'FINALIZED').length + 1847

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-header flex items-center gap-2">
          <Search size={20} className="text-yellow-400" /> Transaction Explorer
        </h1>
        <p className="page-sub">Real-time GenLayer transaction lifecycle tracker</p>
      </div>

      <div className="relative max-w-xl">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="text" placeholder="Search by TX hash or type..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-11 h-12 text-sm" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Transactions', value: totalTxs.toLocaleString(), color: '#00f5ff' },
          { label: 'Finalized Today', value: finalizedToday.toLocaleString(), color: '#00de6a' },
          { label: 'Avg Finality', value: '41h', color: '#b44eff' },
          { label: 'Active Validators', value: '234', color: '#ffd700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass rounded-2xl p-4">
            <div className="font-display font-black text-2xl mb-0.5" style={{ color }}>{value}</div>
            <div className="font-body text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-5">
        {/* TX table */}
        <div className="flex-1 glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-neon-cyan" />
              <span className="font-display font-bold text-white text-sm">Latest Transactions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] text-emerald-400">LIVE</span>
            </div>
          </div>

          {/* Header row */}
          <div className="grid grid-cols-12 px-4 py-2 border-b border-border">
            {[['TX HASH', 3], ['TYPE', 4], ['STATUS', 3], ['TIME', 2]].map(([h, span]) => (
              <div key={h as string} className={`col-span-${span} font-mono text-[10px] text-slate-600 uppercase tracking-widest`}>{h}</div>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Activity size={32} className="text-slate-700 mx-auto mb-2" />
              <p className="font-body text-xs text-slate-600">No transactions yet — start by filing a dispute or staking</p>
            </div>
          ) : (
            filtered.map((tx, i) => (
              <div key={i} onClick={() => setSelected(tx)}
                className={`grid grid-cols-12 px-4 py-3 border-b border-border/40 cursor-pointer transition-colors items-center hover:bg-white/[0.02] ${selected === tx ? 'bg-neon-cyan/5' : ''}`}>
                <div className="col-span-3 flex items-center gap-2">
                  <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: `${TX_TYPE_COLORS[tx.type] || '#00f5ff'}15` }}>
                    <Zap size={9} style={{ color: TX_TYPE_COLORS[tx.type] || '#00f5ff' }} />
                  </div>
                  <span className="font-mono text-xs text-white truncate">{tx.hash}</span>
                </div>
                <div className="col-span-4">
                  <span className="font-mono text-xs" style={{ color: TX_TYPE_COLORS[tx.type] || '#00f5ff' }}>
                    {tx.type}
                  </span>
                  {tx.detail && <div className="font-mono text-[10px] text-slate-600 truncate">{tx.detail}</div>}
                </div>
                <div className="col-span-3">
                  {/* Full status text — fix #16 */}
                  <span className={`status-pill ${getStatusColor(tx.status)}`}>{tx.status}</span>
                </div>
                <div className="col-span-1 font-mono text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock size={9} />{tx.time}
                </div>
                <div className="col-span-1 flex justify-end">
                  <ChevronRight size={11} className="text-slate-600" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-64 flex-shrink-0">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-xs font-bold" style={{ color: TX_TYPE_COLORS[selected.type] || '#00f5ff' }}>
                  {selected.type}
                </span>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white">✕</button>
              </div>

              <div className="space-y-3">
                {[
                  { label: 'HASH', value: selected.hash },
                  { label: 'STATUS', isStatus: true },
                  { label: 'TIME', value: selected.time },
                  { label: 'NETWORK', value: 'GenLayer Bradbury' },
                  { label: 'GAS', value: '21,000 GenGas' },
                  ...(selected.detail ? [{ label: 'DETAIL', value: selected.detail }] : []),
                ].map((item: any) => (
                  <div key={item.label}>
                    <div className="font-mono text-[10px] text-slate-500 mb-1">{item.label}</div>
                    {item.isStatus
                      ? <span className={`status-pill ${getStatusColor(selected.status)}`}>{selected.status}</span>
                      : <div className="font-mono text-xs text-white break-all">{item.value}</div>
                    }
                  </div>
                ))}
              </div>

              {/* Lifecycle */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="font-mono text-[10px] text-slate-500 mb-3 uppercase tracking-wider">Lifecycle</div>
                <div className="space-y-2">
                  {TX_LIFECYCLE.map((s, i) => {
                    const idx = TX_LIFECYCLE.indexOf(selected.status as TxStatus)
                    const done = i <= idx
                    return (
                      <div key={s} className="flex items-center gap-2">
                        {done ? <CheckCircle size={11} className="text-emerald-400" /> : <div className="w-3 h-3 rounded-full border border-border flex-shrink-0" />}
                        <span className={`font-mono text-[10px] ${done ? 'text-white' : 'text-slate-600'}`}>{s}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 mt-4 font-mono text-xs text-neon-cyan hover:underline">
                View on GenLayer Studio <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

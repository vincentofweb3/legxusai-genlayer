import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, Plus, Search, Filter, CheckCircle2, Clock, ChevronDown, ExternalLink, User, FileText, AlertCircle } from 'lucide-react'
import { useApp, getStatusColor, shortenAddr } from '../lib/store'

const STATUS_FILTERS = ['ALL', 'PENDING', 'PROPOSING', 'COMMITTING', 'FINALIZED']

export default function DisputesPage() {
  const navigate = useNavigate()
  const { disputes } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected, setSelected] = useState<typeof disputes[0] | null>(null)

  const filtered = disputes.filter(d => {
    const matchSearch = d.title.toLowerCase().includes(search.toLowerCase()) || d.id.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 flex gap-5 h-full min-h-0">
      {/* List */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-header flex items-center gap-2"><Scale size={20} className="text-neon-cyan" /> Disputes</h1>
            <p className="page-sub">AI-resolved via GenLayer's Optimistic Democracy</p>
          </div>
          <button onClick={() => navigate('/disputes/new')} className="btn-glass flex items-center gap-2 text-sm">
            <Plus size={14} /> File New
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 relative min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search disputes..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-field pl-9 h-10 text-xs" />
          </div>
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-field pl-9 pr-8 h-10 text-xs">
              {STATUS_FILTERS.map(s => <option key={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Scale size={40} className="text-slate-700 mx-auto mb-3" />
            <p className="font-body text-slate-500 mb-4">No disputes found</p>
            <button onClick={() => navigate('/disputes/new')} className="btn-glass text-sm">File your first dispute</button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(d => (
              <div key={d.id} onClick={() => setSelected(d)}
                className={`glass rounded-2xl p-5 cursor-pointer transition-all duration-200 card-hover ${selected?.id === d.id ? '!border-neon-cyan/30' : ''}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-mono text-xs text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 rounded-lg">{d.id}</span>
                      <span className={`status-pill ${getStatusColor(d.status)}`}>{d.status}</span>
                      {d.verdict && (
                        <span className={`status-pill border ${d.verdict === 'CLAIMANT_WINS' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-neon-purple bg-neon-purple/10 border-neon-purple/20'}`}>
                          {d.verdict === 'CLAIMANT_WINS' ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
                          {d.verdict.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-semibold text-white text-sm mb-1">{d.title}</h3>
                    <p className="font-body text-xs text-slate-400 line-clamp-2 mb-3">{d.description}</p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <User size={10} className="text-slate-500" />
                        <span className="font-mono text-[10px] text-slate-400">{shortenAddr(d.claimant)}</span>
                        <span className="text-slate-600 text-[10px]">vs</span>
                        <span className="font-mono text-[10px] text-slate-400">{shortenAddr(d.respondent)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-slate-500" />
                        <span className="font-mono text-[10px] text-slate-400">{new Date(d.filedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-display font-bold text-lg text-white">{d.amount.toLocaleString()} {d.currency}</div>
                    <div className="font-mono text-[10px] text-slate-500 mb-2">at stake</div>
                    <div className="flex gap-0.5 justify-end">
                      {Array.from({ length: Math.min(d.validatorsCount, 9) }).map((_, i) => (
                        <div key={i} className="w-2 h-2 rounded-full"
                          style={{ background: i < Math.ceil(d.validatorsCount * 0.7) ? '#00f5ff' : 'rgba(28,42,74,0.8)' }} />
                      ))}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 mt-1">{d.validatorsCount} validators</div>
                  </div>
                </div>
                {d.evidence.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <FileText size={10} className="text-slate-500" />
                    <div className="flex gap-1.5 flex-wrap">
                      {d.evidence.map(e => (
                        <span key={e} className="font-mono text-[10px] text-slate-500 bg-surface px-2 py-0.5 rounded-lg">{e}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-72 flex-shrink-0 space-y-4 overflow-y-auto">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-xs text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded-lg">{selected.id}</span>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white transition-colors font-mono text-xs">✕</button>
            </div>
            <h3 className="font-display font-bold text-white text-sm mb-2">{selected.title}</h3>
            <p className="font-body text-xs text-slate-400 leading-relaxed mb-4">{selected.description}</p>

            {selected.verdict && (
              <div className={`rounded-xl p-3 mb-4 ${selected.verdict === 'CLAIMANT_WINS' ? 'bg-emerald-400/10 border border-emerald-400/20' : 'bg-neon-purple/10 border border-neon-purple/20'}`}>
                <div className="font-mono text-xs font-bold mb-1" style={{ color: selected.verdict === 'CLAIMANT_WINS' ? '#29f588' : '#b44eff' }}>
                  {selected.verdict.replace(/_/g, ' ')}
                </div>
                {selected.confidence && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-void rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-neon-cyan" style={{ width: `${selected.confidence}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-white">{selected.confidence}% confidence</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              {[
                { label: 'Claimant', value: shortenAddr(selected.claimant) },
                { label: 'Respondent', value: shortenAddr(selected.respondent) },
                { label: 'Amount', value: `${selected.amount.toLocaleString()} ${selected.currency}` },
                { label: 'Category', value: selected.category },
                { label: 'Validators', value: `${selected.validatorsCount} nodes` },
                { label: 'Filed', value: new Date(selected.filedAt).toLocaleDateString() },
                { label: 'Resolved', value: selected.resolvedAt ? new Date(selected.resolvedAt).toLocaleDateString() : 'Pending' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
                  <span className="font-mono text-xs text-white">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <div className="font-mono text-[10px] text-slate-500 mb-1">TX HASH</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-neon-cyan truncate">{selected.txHash.slice(0, 24)}...</span>
                <ExternalLink size={9} className="text-slate-600 flex-shrink-0" />
              </div>
            </div>
          </div>

          {/* Validator consensus */}
          <div className="glass rounded-2xl p-5">
            <h4 className="font-display font-bold text-white text-xs mb-3">AI Validator Consensus</h4>
            <div className="space-y-2">
              {Array.from({ length: selected.validatorsCount }).map((_, i) => {
                const agrees = i < Math.ceil(selected.validatorsCount * 0.7)
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-mono flex-shrink-0"
                      style={{ background: agrees ? 'rgba(0,245,255,0.1)' : 'rgba(180,78,255,0.1)', color: agrees ? '#00f5ff' : '#b44eff' }}>
                      V{i + 1}
                    </div>
                    <div className="flex-1 bg-surface rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${55 + Math.sin(i * 1.3) * 30 + 15}%`, background: agrees ? '#00f5ff' : '#b44eff' }} />
                    </div>
                    <span className="font-mono text-[9px] flex-shrink-0" style={{ color: agrees ? '#00f5ff' : '#b44eff' }}>
                      {agrees ? 'AGREE' : 'DISSENT'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

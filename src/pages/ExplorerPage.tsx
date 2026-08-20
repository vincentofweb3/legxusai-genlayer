import { useState } from 'react'
import { Activity, Network, Search, Zap } from 'lucide-react'
import { getStatusColor, useApp } from '../lib/store'
import { GENLAYER_CONFIG, getNetworkLabel } from '../lib/genlayer/config'
import { transactionOperationLabel, type DisputeTransaction } from '../lib/genlayer/transactions'

export default function ExplorerPage() {
  const { transactions, transactionLoad } = useApp()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<DisputeTransaction | null>(null)
  const query = search.toLowerCase()
  const filtered = transactions.filter(transaction => transaction.hash.toLowerCase().includes(query) || transaction.disputeId.toLowerCase().includes(query))

  return (
    <div className="p-6 space-y-5">
      <div><h1 className="page-header flex items-center gap-2"><Search size={20} className="text-yellow-400" /> Dispute Transactions</h1><p className="page-sub">Full hashes retained locally, then revalidated against the configured GenLayer network</p></div>
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-yellow-400/20 bg-yellow-400/5"><Network size={14} className="text-yellow-400 mt-0.5" /><p className="font-body text-xs text-slate-400">{transactionLoad.message}</p></div>
      <div className="relative max-w-xl"><Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input type="text" placeholder="Search by full hash or dispute ID..." value={search} onChange={event => setSearch(event.target.value)} className="input-field pl-11 h-12 text-sm" /></div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[
        ['Validated hashes', transactions.length.toLocaleString(), '#00f5ff'],
        ['Finalized', transactions.filter(transaction => transaction.status === 'FINALIZED').length.toLocaleString(), '#29f588'],
        ['Network', getNetworkLabel(), '#b44eff'],
      ].map(([label, value, color]) => <div key={label} className="glass rounded-2xl p-4"><div className="font-display font-black text-xl mb-0.5 truncate" style={{ color }}>{value}</div><div className="font-body text-xs text-slate-500">{label}</div></div>)}</div>

      <div className="flex gap-5">
        <div className="flex-1 glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border"><div className="flex items-center gap-2"><Activity size={14} className="text-neon-cyan" /><span className="font-display font-bold text-white text-sm">Network-validated known transactions</span></div><span className="font-mono text-[10px] text-slate-500">{GENLAYER_CONFIG.network?.alias ?? 'unknown network'}</span></div>
          <div className="grid grid-cols-12 px-4 py-2 border-b border-border"><div className="col-span-4 font-mono text-[10px] text-slate-600 uppercase tracking-widest">TX HASH</div><div className="col-span-2 font-mono text-[10px] text-slate-600 uppercase tracking-widest">DISPUTE</div><div className="col-span-2 font-mono text-[10px] text-slate-600 uppercase tracking-widest">OPERATION</div><div className="col-span-2 font-mono text-[10px] text-slate-600 uppercase tracking-widest">RESULT</div><div className="col-span-2 font-mono text-[10px] text-slate-600 uppercase tracking-widest">STATUS</div></div>
          {filtered.length === 0 ? (
            <div className="text-center py-12"><Activity size={32} className="text-slate-700 mx-auto mb-2" /><p className="font-body text-xs text-slate-600">No validated transaction hashes are available</p></div>
          ) : filtered.map(transaction => (
            <button key={transaction.hash} onClick={() => setSelected(transaction)} className={`w-full grid grid-cols-12 px-4 py-3 border-b border-border/40 text-left items-center hover:bg-white/[0.02] ${selected?.hash === transaction.hash ? 'bg-neon-cyan/5' : ''}`}>
              <div className="col-span-4 flex items-center gap-2 min-w-0"><div className="w-5 h-5 rounded flex items-center justify-center bg-neon-cyan/10"><Zap size={9} className="text-neon-cyan" /></div><span className="font-mono text-xs text-white truncate">{transaction.hash}</span></div>
              <div className="col-span-2 font-mono text-xs text-neon-cyan">{transaction.disputeId}</div>
              <div className="col-span-2 font-mono text-[10px] text-slate-400">{transactionOperationLabel(transaction.operation)}</div>
              <div className="col-span-2 font-mono text-[10px] text-slate-400">{transaction.result}</div>
              <div className="col-span-2"><span className={`status-pill ${getStatusColor(transaction.status)}`}>{transaction.status}</span></div>
            </button>
          ))}
        </div>

        {selected && <div className="w-72 flex-shrink-0"><div className="glass rounded-2xl p-5"><div className="flex items-center justify-between mb-4"><span className="font-mono text-xs font-bold text-neon-cyan">{transactionOperationLabel(selected.operation).toUpperCase()}</span><button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white" aria-label="Close transaction details">x</button></div><div className="space-y-3">{[
          ['HASH', selected.hash],
          ['DISPUTE', selected.disputeId],
          ['RETURN VALUE', String(selected.returnValue)],
          ['NETWORK', getNetworkLabel()],
          ['CONSENSUS RESULT', selected.result],
          ['EXECUTION', selected.executionResult],
          ['TRIGGERED TXS', selected.triggeredTransactionIds.length.toString()],
        ].map(([label, value]) => <div key={label}><div className="font-mono text-[10px] text-slate-500 mb-1">{label}</div><div className="font-mono text-xs text-white break-all">{value}</div></div>)}<div><div className="font-mono text-[10px] text-slate-500 mb-1">STATUS</div><span className={`status-pill ${getStatusColor(selected.status)}`}>{selected.status}</span></div></div><div className="flex items-start gap-2 mt-5 pt-4 border-t border-border"><Network size={13} className="text-slate-500 mt-0.5" /><p className="font-body text-[11px] text-slate-500 leading-relaxed">The contract does not expose a complete transaction index. Only hashes learned from this browser and successfully revalidated are shown.</p></div></div></div>}
      </div>
    </div>
  )
}

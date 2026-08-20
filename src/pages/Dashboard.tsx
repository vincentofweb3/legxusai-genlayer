import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Network, Plus, RefreshCw, Scale, ShieldCheck } from 'lucide-react'
import { getStatusColor, useApp } from '../lib/store'
import { GENLAYER_CONFIG, getNetworkLabel } from '../lib/genlayer/config'
import { transactionOperationLabel } from '../lib/genlayer/transactions'

function shortValue(value: string | null | undefined): string {
  if (!value) return 'Not configured'
  return `${value.slice(0, 10)}...${value.slice(-8)}`
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { wallet, disputes, disputeLoad, transactions, transactionLoad, refreshCanonicalState } = useApp()
  const targetNetwork = GENLAYER_CONFIG.network
  const walletChainVerified = !!wallet.address && !!targetNetwork && wallet.chainId === targetNetwork.chainId

  const open = disputes.filter(dispute => dispute.status !== 'FINALIZED' && dispute.status !== 'DECLINED').length
  const finalized = disputes.filter(dispute => dispute.status === 'FINALIZED').length
  const claimantWins = disputes.filter(dispute => dispute.verdict === 'CLAIMANT_UPHELD').length
  const respondentWins = disputes.filter(dispute => dispute.verdict === 'RESPONDENT_UPHELD').length
  const undetermined = disputes.filter(dispute => dispute.verdict === 'UNDETERMINED').length
  const recentDisputes = disputes.slice(0, 4)
  const recentTransactions = transactions.slice(0, 6)

  const metrics = [
    { label: 'Canonical disputes', value: disputes.length, detail: disputeLoad.source === 'cache' ? 'Validated scoped cache' : 'Contract state', color: '#00f5ff' },
    { label: 'Open lifecycle', value: open, detail: 'Awaiting response or evaluation', color: '#ffd166' },
    { label: 'Finalized outcomes', value: finalized, detail: 'Decoded contract records', color: '#29f588' },
    { label: 'Known transactions', value: transactions.length, detail: 'Network-validated hashes', color: '#b44eff' },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-header">Dispute Dashboard</h1>
          <p className="page-sub">Target: {getNetworkLabel()} · {wallet.address ? `Wallet ${shortValue(wallet.address)}` : 'No wallet account detected'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void refreshCanonicalState()} className="btn-glass p-2.5" title="Refresh canonical state"><RefreshCw size={14} /></button>
          <button onClick={() => navigate('/disputes/new')} className="btn-glass flex items-center gap-2 text-sm"><Plus size={14} /> File Dispute</button>
        </div>
      </div>

      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${disputeLoad.phase === 'cached' ? 'border-yellow-400/25 bg-yellow-400/5' : disputeLoad.phase === 'ready' || disputeLoad.phase === 'empty' ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-red-400/20 bg-red-400/5'}`}>
        {disputeLoad.phase === 'ready' || disputeLoad.phase === 'empty' ? <CheckCircle2 size={14} className="text-emerald-400 mt-0.5" /> : <AlertTriangle size={14} className={disputeLoad.phase === 'cached' ? 'text-yellow-400 mt-0.5' : 'text-red-400 mt-0.5'} />}
        <div><div className="font-display font-semibold text-xs text-white">Canonical state: {disputeLoad.phase.replace('-', ' ')}</div><p className="font-body text-[11px] text-slate-400 mt-0.5">{disputeLoad.message}</p></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(({ label, value, detail, color }) => (
          <div key={label} className="glass rounded-2xl p-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}15`, border: `1px solid ${color}25` }}><Scale size={17} style={{ color }} /></div>
            <div className="font-display font-black text-3xl text-white mb-0.5">{value}</div>
            <div className="font-body text-xs text-slate-400">{label}</div>
            <div className="font-mono text-[10px] mt-1" style={{ color }}>{detail}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5"><div><h3 className="font-display font-bold text-white text-sm">Canonical outcomes</h3><p className="font-body text-xs text-slate-500 mt-0.5">Decoded from the configured contract state</p></div><CheckCircle2 size={16} className="text-neon-cyan" /></div>
          <div className="space-y-3">
            {[
              ['Claimant upheld', claimantWins, '#00f5ff'],
              ['Respondent upheld', respondentWins, '#b44eff'],
              ['Undetermined', undetermined, '#ffd166'],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div className="flex items-center justify-between mb-1"><span className="font-body text-xs text-slate-400">{label}</span><span className="font-mono text-xs text-white">{value}</span></div>
                <div className="h-1.5 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full" style={{ width: disputes.length ? `${((value as number) / disputes.length) * 100}%` : '0%', background: color as string }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-display font-bold text-white text-sm flex items-center gap-2"><Network size={14} className="text-neon-cyan" /> Environment</h3><span className={`status-pill ${targetNetwork ? 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30' : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'}`}>{targetNetwork ? 'TARGET SET' : 'UNKNOWN'}</span></div>
          <div className="space-y-3">
            {[
              ['Network', getNetworkLabel()],
              ['Alias', targetNetwork?.alias ?? '—'],
              ['Chain ID', targetNetwork?.chainId ?? '—'],
              ['Contract', shortValue(GENLAYER_CONFIG.contractAddress)],
              ['Wallet chain', wallet.chainId ?? 'Not detected'],
              ['Wallet readiness', walletChainVerified ? 'Selected chain verified' : 'Not ready for target'],
              ['State source', disputeLoad.source ?? 'Unavailable'],
              ['Settlement', 'Advisory only'],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{label}</span><span className="font-mono text-xs text-white text-right">{value}</span></div>)}
          </div>
          <div className="flex items-start gap-2 mt-4 pt-4 border-t border-border"><ShieldCheck size={13} className="text-yellow-400 mt-0.5" /><p className="font-body text-[11px] text-slate-500 leading-relaxed">No GEN is held, transferred, or released by this release scope.</p></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-2"><h3 className="font-display font-bold text-white text-sm flex items-center gap-2"><Activity size={14} className="text-neon-cyan" /> Known dispute transactions</h3><button onClick={() => navigate('/explorer')} className="font-mono text-[10px] text-neon-cyan hover:underline flex items-center gap-1">View all <ArrowUpRight size={10} /></button></div>
          <p className="font-body text-[10px] text-slate-500 mb-4">{transactionLoad.message}</p>
          {recentTransactions.length === 0 ? (
            <div className="text-center py-8"><Activity size={28} className="text-slate-700 mx-auto mb-2" /><p className="font-body text-xs text-slate-600">No network-validated transaction hashes are known</p></div>
          ) : (
            <div className="space-y-2">{recentTransactions.map(transaction => <div key={transaction.hash} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-surface/40"><div className="min-w-0"><div className="font-mono text-xs text-white">{transaction.disputeId}</div><div className="font-mono text-[10px] text-neon-cyan">{transactionOperationLabel(transaction.operation)}</div><div className="font-mono text-[10px] text-slate-500 truncate">{transaction.hash}</div></div><span className={`status-pill ml-2 ${getStatusColor(transaction.status)}`}>{transaction.status}</span></div>)}</div>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4"><h3 className="font-display font-bold text-white text-sm flex items-center gap-2"><Scale size={14} className="text-neon-purple" /> Recent disputes</h3><button onClick={() => navigate('/disputes')} className="font-mono text-[10px] text-neon-cyan hover:underline flex items-center gap-1">View all <ArrowUpRight size={10} /></button></div>
          {recentDisputes.length === 0 ? (
            <div className="text-center py-8"><Scale size={28} className="text-slate-700 mx-auto mb-2" /><p className="font-body text-xs text-slate-600">No canonical disputes available</p></div>
          ) : (
            <div className="space-y-2">{recentDisputes.map(dispute => <button key={dispute.id} onClick={() => navigate('/disputes')} className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl text-left hover:bg-white/5 bg-surface/40"><div className="min-w-0"><span className="font-mono text-[10px] text-neon-cyan">{dispute.id}</span><div className="font-body text-xs text-white truncate">{dispute.title}</div></div><span className={`status-pill ml-2 ${getStatusColor(dispute.status)}`}>{dispute.status}</span></button>)}</div>
          )}
        </div>
      </div>
    </div>
  )
}

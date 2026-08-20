import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ChevronDown, Clock, FileText, Filter, Link2, Loader2, Plus, RefreshCw, Scale, Search, ShieldCheck, Trash2, User } from 'lucide-react'
import { getStatusColor, shortenAddr, useApp } from '../lib/store'
import type { CanonicalDispute } from '../lib/genlayer/types'
import { GENLAYER_CONFIG, getNetworkLabel } from '../lib/genlayer/config'
import { evidenceOrEmpty, type EvidenceReference } from '../lib/evidence/upload'
import { transactionOperationLabel } from '../lib/genlayer/transactions'

const STATUS_FILTERS = ['ALL', 'AWAITING_RESPONDENT', 'READY_FOR_EVALUATION', 'DECLINED', 'FINALIZED']

function formatAmount(value: bigint): string {
  return value.toLocaleString('en-US')
}

export default function DisputesPage() {
  const navigate = useNavigate()
  const {
    disputes,
    disputeLoad,
    transactions,
    refreshCanonicalState,
    wallet,
    acceptDispute,
    declineDispute,
    evaluateDispute,
    isProcessing,
    lastAction,
  } = useApp()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selected, setSelected] = useState<CanonicalDispute | null>(null)
  const [respondentEvidence, setRespondentEvidence] = useState<EvidenceReference[]>([])
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [isVerifyingEvidence, setIsVerifyingEvidence] = useState(false)
  const [confirmNoEvidence, setConfirmNoEvidence] = useState(false)

  useEffect(() => {
    if (selected) setSelected(disputes.find(dispute => dispute.id === selected.id) ?? null)
  }, [disputes, selected?.id])

  useEffect(() => {
    setRespondentEvidence([])
    setEvidenceUrl('')
    setEvidenceError(null)
    setConfirmNoEvidence(false)
  }, [selected?.id])

  const filtered = disputes.filter(dispute => {
    const matchSearch = dispute.title.toLowerCase().includes(search.toLowerCase()) || dispute.id.toLowerCase().includes(search.toLowerCase())
    return matchSearch && (statusFilter === 'ALL' || dispute.status === statusFilter)
  })
  const selectedTransactions = selected ? transactions.filter(transaction => transaction.disputeId === selected.id) : []
  const loadFailed = disputeLoad.phase === 'configuration-error' || disputeLoad.phase === 'network-error' || disputeLoad.phase === 'decode-error'
  const targetChain = GENLAYER_CONFIG.network?.chainId ?? null
  const walletOnTarget = !!wallet.address && wallet.chainId === targetChain
  const account = wallet.address?.toLowerCase() ?? null
  const isRespondent = !!selected && account === selected.respondent.toLowerCase()
  const isNamedParty = !!selected && (account === selected.claimant.toLowerCase() || account === selected.respondent.toLowerCase())
  const acceptanceState = selected?.status === 'AWAITING_RESPONDENT'
  const evaluationState = selected?.status === 'READY_FOR_EVALUATION'

  const actionBlocker = (role: 'respondent' | 'party', state: boolean): string | null => {
    if (GENLAYER_CONFIG.configurationIssue) return GENLAYER_CONFIG.configurationIssue
    if (!wallet.address) return 'Connect an injected wallet before signing.'
    if (wallet.chainId === null) return 'Wallet chain is not verified; reconnect the wallet.'
    if (!walletOnTarget) return `Switch the wallet to ${getNetworkLabel()} (chain ${targetChain ?? 'unknown'}) before signing.`
    if (role === 'respondent' && !isRespondent) return 'Only the canonical respondent account may perform this action.'
    if (role === 'party' && !isNamedParty) return 'Only the named claimant or respondent account may request evaluation.'
    if (!state) return 'The canonical dispute status does not permit this action.'
    return null
  }

  const acceptBlocker = selected && acceptanceState ? actionBlocker('respondent', true) : null
  const declineBlocker = selected && acceptanceState ? actionBlocker('respondent', true) : null
  const evaluateBlocker = selected && evaluationState ? actionBlocker('party', true) : null

  const addRespondentEvidence = async () => {
    if (!evidenceUrl.trim() || isVerifyingEvidence || respondentEvidence.length >= 3) return
    setEvidenceError(null)
    setIsVerifyingEvidence(true)
    const result = await evidenceOrEmpty([...respondentEvidence.map(reference => reference.url), evidenceUrl])
    setIsVerifyingEvidence(false)
    if (result.error) {
      setEvidenceError(`${result.error.code}: ${result.error.message}`)
      return
    }
    setRespondentEvidence(result.references)
    setEvidenceUrl('')
    setConfirmNoEvidence(false)
  }

  const runAccept = async () => {
    if (!selected || acceptBlocker || isVerifyingEvidence) return
    const succeeded = await acceptDispute(selected, respondentEvidence, confirmNoEvidence)
    if (succeeded) {
      setRespondentEvidence([])
      setConfirmNoEvidence(false)
    }
  }

  return (
    <div className="p-6 flex gap-5 h-full min-h-0">
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="page-header flex items-center gap-2"><Scale size={20} className="text-neon-cyan" /> Disputes</h1><p className="page-sub">Runtime-decoded records from the configured GenLayer Intelligent Contract</p></div>
          <div className="flex items-center gap-2"><button onClick={() => void refreshCanonicalState()} className="btn-glass p-2.5" title="Refresh canonical state"><RefreshCw size={14} /></button><button onClick={() => navigate('/disputes/new')} className="btn-glass flex items-center gap-2 text-sm"><Plus size={14} /> File New</button></div>
        </div>

        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${disputeLoad.phase === 'cached' ? 'border-yellow-400/25 bg-yellow-400/5' : loadFailed ? 'border-red-400/20 bg-red-400/5' : 'border-emerald-400/20 bg-emerald-400/5'}`}>
          {loadFailed || disputeLoad.phase === 'cached' ? <AlertCircle size={14} className={loadFailed ? 'text-red-400 mt-0.5' : 'text-yellow-400 mt-0.5'} /> : <CheckCircle2 size={14} className="text-emerald-400 mt-0.5" />}
          <p className="font-body text-xs text-slate-400">{disputeLoad.message}</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 relative min-w-48"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input type="text" placeholder="Search canonical disputes..." value={search} onChange={event => setSearch(event.target.value)} className="input-field pl-9 h-10 text-xs" /></div>
          <div className="relative"><Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="select-field pl-9 pr-8 h-10 text-xs">{STATUS_FILTERS.map(status => <option key={status}>{status}</option>)}</select><ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" /></div>
        </div>

        {disputeLoad.phase === 'loading' ? (
          <div className="text-center py-20"><RefreshCw size={34} className="text-neon-cyan mx-auto mb-3 animate-spin" /><p className="font-body text-slate-500">Loading contract state</p></div>
        ) : loadFailed ? (
          <div className="text-center py-20"><AlertCircle size={40} className="text-red-400/70 mx-auto mb-3" /><p className="font-body text-slate-400">Canonical disputes are unavailable</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20"><Scale size={40} className="text-slate-700 mx-auto mb-3" /><p className="font-body text-slate-500">{disputeLoad.phase === 'empty' ? 'The configured contract has no disputes' : 'No disputes match this filter'}</p></div>
        ) : (
          <div className="space-y-3">
            {filtered.map(dispute => {
              const evidenceCount = dispute.claimantEvidence.length + dispute.respondentEvidence.length
              return (
                <button key={dispute.id} onClick={() => setSelected(dispute)} className={`w-full glass rounded-2xl p-5 text-left transition-all duration-200 card-hover ${selected?.id === dispute.id ? '!border-neon-cyan/30' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="font-mono text-xs text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 rounded-lg">{dispute.id}</span><span className={`status-pill ${getStatusColor(dispute.status)}`}>{dispute.status}</span>{dispute.verdict !== 'PENDING' && <span className={`status-pill border ${dispute.verdict === 'CLAIMANT_UPHELD' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-neon-purple bg-neon-purple/10 border-neon-purple/20'}`}>{dispute.verdict === 'CLAIMANT_UPHELD' ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}{dispute.verdict.replace(/_/g, ' ')}</span>}</div>
                      <h3 className="font-display font-semibold text-white text-sm mb-1">{dispute.title}</h3>
                      <p className="font-body text-xs text-slate-400 line-clamp-2 mb-3">{dispute.description}</p>
                      <div className="flex items-center gap-4 flex-wrap"><div className="flex items-center gap-1.5"><User size={10} className="text-slate-500" /><span className="font-mono text-[10px] text-slate-400">{shortenAddr(dispute.claimant)}</span><span className="text-slate-600 text-[10px]">vs</span><span className="font-mono text-[10px] text-slate-400">{shortenAddr(dispute.respondent)}</span></div><div className="flex items-center gap-1.5"><Clock size={10} className="text-slate-500" /><span className="font-mono text-[10px] text-slate-400">{new Date(dispute.filedAt).toLocaleDateString()}</span></div></div>
                    </div>
                    <div className="text-right flex-shrink-0"><div className="font-display font-bold text-lg text-white">{formatAmount(dispute.referenceAmount)} {dispute.referenceCurrency}</div><div className="font-mono text-[10px] text-slate-500">reference only</div></div>
                  </div>
                  {evidenceCount > 0 && <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border"><FileText size={10} className="text-slate-500" /><span className="font-mono text-[10px] text-slate-500">{evidenceCount} canonical evidence reference{evidenceCount === 1 ? '' : 's'}</span></div>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-80 flex-shrink-0 space-y-4 overflow-y-auto">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><span className="font-mono text-xs text-neon-cyan bg-neon-cyan/10 px-2 py-1 rounded-lg">{selected.id}</span><button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white font-mono text-xs" aria-label="Close dispute details">x</button></div>
            <h3 className="font-display font-bold text-white text-sm mb-2">{selected.title}</h3><p className="font-body text-xs text-slate-400 leading-relaxed mb-4">{selected.description}</p>
            {selected.verdict !== 'PENDING' && <div className={`rounded-xl p-3 mb-4 ${selected.verdict === 'CLAIMANT_UPHELD' ? 'bg-emerald-400/10 border border-emerald-400/20' : 'bg-neon-purple/10 border border-neon-purple/20'}`}><div className="font-mono text-xs font-bold mb-1">{selected.verdict.replace(/_/g, ' ')}</div><div className="font-mono text-[10px] text-slate-400">Confidence bucket: {selected.confidenceBucket}/10</div></div>}
            <div className="space-y-2.5">{[
              ['Claimant', shortenAddr(selected.claimant)],
              ['Respondent', shortenAddr(selected.respondent)],
              ['Reference amount', `${formatAmount(selected.referenceAmount)} ${selected.referenceCurrency}`],
              ['Criteria', selected.criteriaStatus],
              ['Evidence', selected.evidenceStatus],
              ['Filed', new Date(selected.filedAt).toLocaleDateString()],
              ['Evaluated', selected.evaluatedAt ? new Date(selected.evaluatedAt).toLocaleDateString() : 'Pending'],
            ].map(([label, value]) => <div key={label} className="flex justify-between items-center gap-4"><span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{label}</span><span className="font-mono text-xs text-white text-right break-all">{value}</span></div>)}</div>
            <div className="mt-4 pt-4 border-t border-border"><div className="font-mono text-[10px] text-slate-500 mb-1">KNOWN VALIDATED TRANSACTIONS</div>{selectedTransactions.length === 0 ? <div className="font-mono text-[10px] text-slate-500">Not indexed by contract state</div> : <div className="space-y-2">{selectedTransactions.map(transaction => <div key={transaction.hash}><div className="font-mono text-[9px] text-slate-500">{transactionOperationLabel(transaction.operation).toUpperCase()}</div><div className="font-mono text-[10px] text-neon-cyan break-all">{transaction.hash}</div></div>)}</div>}</div>
          </div>
          <div className="glass rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-bold text-white text-xs">GenLayer lifecycle</h4>
                <p className="font-body text-[11px] text-slate-500 mt-1">Actions submit contract transactions and refresh canonical state after validated receipts.</p>
              </div>
              {lastAction.disputeId === selected.id && lastAction.status && <span className={`status-pill ${getStatusColor(lastAction.status)}`}>{lastAction.status}</span>}
            </div>

            {acceptanceState && (
              <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-300">Respondent response</div>
                <p className="font-body text-[11px] text-slate-400">The named respondent can accept the criteria with optional verified public evidence or decline it. No funds are transferred.</p>
                {isRespondent && (
                  <>
                    <div className="flex gap-2">
                      <input value={evidenceUrl} onChange={event => { setEvidenceUrl(event.target.value); setEvidenceError(null) }} placeholder="Pinned GitHub raw evidence URL" className="input-field font-mono text-[10px] min-w-0" />
                      <button type="button" onClick={() => void addRespondentEvidence()} disabled={!evidenceUrl.trim() || isVerifyingEvidence || respondentEvidence.length >= 3} className="btn-glass px-3 disabled:opacity-50" title="Verify respondent evidence">
                        {isVerifyingEvidence ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      </button>
                    </div>
                    {evidenceError && <p className="font-mono text-[10px] text-red-400">{evidenceError}</p>}
                    {respondentEvidence.map(reference => <div key={reference.url} className="flex items-start gap-2 rounded-lg bg-surface/50 p-2"><FileText size={11} className="text-emerald-400 mt-0.5" /><span className="font-mono text-[10px] text-slate-300 break-all flex-1">{reference.source_id}</span><button type="button" onClick={() => setRespondentEvidence(current => current.filter(item => item.url !== reference.url))} className="text-slate-500 hover:text-red-400" aria-label="Remove respondent evidence"><Trash2 size={12} /></button></div>)}
                    {respondentEvidence.length === 0 && <label className="flex items-start gap-2 font-body text-[10px] text-slate-400"><input type="checkbox" checked={confirmNoEvidence} onChange={event => setConfirmNoEvidence(event.target.checked)} className="mt-0.5" /> <span>I confirm acceptance intentionally contains no respondent evidence.</span></label>}
                  </>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => void runAccept()} disabled={!!acceptBlocker || isProcessing || isVerifyingEvidence || (respondentEvidence.length === 0 && !confirmNoEvidence)} className="btn-solid flex-1 justify-center py-2 text-xs disabled:opacity-50">Accept criteria</button>
                  <button type="button" onClick={() => { if (selected && !declineBlocker) void declineDispute(selected) }} disabled={!!declineBlocker || isProcessing} className="btn-glass flex-1 justify-center py-2 text-xs disabled:opacity-50">Decline</button>
                </div>
                <p className="font-mono text-[10px] text-yellow-300/80">{acceptBlocker ?? (respondentEvidence.length === 0 && !confirmNoEvidence ? 'Explicitly confirm evidence-free acceptance before signing.' : 'Ready for respondent action.')}</p>
              </div>
            )}

            {evaluationState && (
              <div className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-3 space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-purple-300">Request advisory evaluation</div>
                <p className="font-body text-[11px] text-slate-400">Only the named claimant or respondent may request GenVM evaluation. The returned outcome is advisory and comes from canonical contract state after refresh.</p>
                <button type="button" onClick={() => { if (selected && !evaluateBlocker) void evaluateDispute(selected) }} disabled={!!evaluateBlocker || isProcessing} className="btn-solid w-full justify-center py-2 text-xs disabled:opacity-50">Request evaluation</button>
                <p className="font-mono text-[10px] text-yellow-300/80">{evaluateBlocker ?? 'Ready for a named party to request evaluation.'}</p>
              </div>
            )}

            {!acceptanceState && !evaluationState && <p className="font-mono text-[10px] text-slate-500">No browser action is available for the current canonical status: {selected.status}.</p>}
            {lastAction.disputeId === selected.id && lastAction.message && <div className={`flex items-start gap-2 rounded-lg p-2 ${lastAction.status === 'ERROR' ? 'bg-red-400/5 text-red-300' : 'bg-emerald-400/5 text-emerald-300'}`}><CheckCircle2 size={12} className="mt-0.5" /><p className="font-body text-[10px]">{lastAction.message}{lastAction.hash ? ` Hash: ${lastAction.hash}` : ''}</p></div>}
          </div>
          <div className="glass rounded-2xl p-5"><div className="flex items-start gap-3"><ShieldCheck size={14} className="text-yellow-400 mt-0.5" /><div><h4 className="font-display font-bold text-white text-xs mb-1">Advisory result</h4><p className="font-body text-[11px] text-slate-500 leading-relaxed">These fields come from contract state. The outcome does not transfer, escrow, release, or refund funds, and validator facts are not inferred.</p></div></div></div>
        </div>
      )}
    </div>
  )
}

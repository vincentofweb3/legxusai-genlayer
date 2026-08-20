import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ArrowLeft, CheckCircle, Loader2, AlertCircle, Zap, Link2, Trash2 } from 'lucide-react'
import { useApp, TxStatus } from '../lib/store'
import { GENLAYER_CONFIG, getNetworkLabel } from '../lib/genlayer/config'
import {
  describeEvidenceVerificationError,
  evidenceOrEmpty,
  EvidenceVerificationError,
  type EvidenceReference,
} from '../lib/evidence/upload'

const TX_STEPS: { status: TxStatus; label: string; desc: string }[] = [
  { status: 'PENDING', label: 'Submitting', desc: 'Sending the dispute transaction' },
  { status: 'ACCEPTED', label: 'Accepted', desc: 'The filing transaction was accepted; the case awaits respondent acceptance' },
  { status: 'FINALIZED', label: 'Finalized', desc: 'The filing transaction reached GenLayer finalization' },
]

export default function FileDisputePage() {
  const navigate = useNavigate()
  const { addDispute, isProcessing, processingStatus, processingHash, wallet } = useApp()

  const [form, setForm] = useState({ title: '', description: '', respondent: '', amount: '', currency: 'USDC' })
  const [submitted, setSubmitted] = useState(false)
  const [disputeId, setDisputeId] = useState('')
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [evidence, setEvidence] = useState<EvidenceReference[]>([])
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [isVerifyingEvidence, setIsVerifyingEvidence] = useState(false)
  const [confirmNoEvidence, setConfirmNoEvidence] = useState(false)

  const currentStepIdx = processingStatus ? TX_STEPS.findIndex(s => s.status === processingStatus) : -1
  const submissionStopped = submitted && !isProcessing
  const targetNetwork = GENLAYER_CONFIG.network
  const filingBlocker = GENLAYER_CONFIG.configurationIssue
    ?? (!wallet.address
      ? 'Connect a wallet before filing a dispute.'
      : wallet.chainId === null
        ? 'The wallet chain could not be verified. Reconnect the wallet and try again.'
        : wallet.chainId !== targetNetwork?.chainId
          ? `Switch the wallet to ${getNetworkLabel()} (chain ${targetNetwork?.chainId}) before filing.`
          : null)

  const handleSubmit = async () => {
    if (!form.title || !form.description || !form.respondent || !form.amount) return
    setSubmissionError(null)
    if (filingBlocker) {
      setSubmissionError(filingBlocker)
      return
    }
    if (!wallet.address) {
      setSubmissionError('Connect a wallet before filing a dispute.')
      return
    }

    if (evidence.length === 0 && !confirmNoEvidence) {
      setEvidenceError('Confirm that this filing intentionally contains no evidence before signing.')
      return
    }

    let amount: bigint
    try {
      amount = BigInt(form.amount)
      if (amount < 0n) throw new Error('negative')
    } catch {
      setSubmissionError('Reference amount must be a non-negative whole number.')
      return
    }

    let id = ''
    try {
      id = await addDispute({
        title: form.title,
        description: form.description,
        respondent: form.respondent,
        amount,
        currency: form.currency,
        evidence,
        confirmNoEvidence,
      })
    } catch (error) {
      if (error instanceof EvidenceVerificationError) {
        const message = describeEvidenceVerificationError(error)
        setEvidenceError(message)
        setSubmissionError(message)
        return
      }
      setSubmissionError('The dispute transaction did not start. Check the target, contract address, wallet, and wallet chain, then try again.')
      return
    }
    if (!id) {
      setSubmissionError('The dispute transaction did not start. Check the target, contract address, wallet, and wallet chain, then try again.')
      return
    }
    setDisputeId(id)
    setSubmitted(true)
    setConfirmNoEvidence(false)
  }

  const handleAddEvidence = async () => {
    if (!evidenceUrl.trim()) return
    setEvidenceError(null)
    setIsVerifyingEvidence(true)
    const result = await evidenceOrEmpty([...evidence.map(reference => reference.url), evidenceUrl])
    setIsVerifyingEvidence(false)
    if (result.error) {
      setEvidenceError(`${result.error.code}: ${result.error.message}`)
      return
    }
    setEvidence(result.references)
    setEvidenceUrl('')
  }

  const removeEvidence = (url: string) => {
    setEvidence(references => references.filter(reference => reference.url !== url))
    setEvidenceError(null)
    setConfirmNoEvidence(false)
  }

  // Processing / success screen
  if (submitted) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => navigate('/disputes')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 font-body text-sm">
          <ArrowLeft size={14} /> Back to Disputes
        </button>

        <div className="glass rounded-3xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(180,78,255,0.15))', border: '1px solid rgba(0,245,255,0.3)' }}>
              {submissionStopped ? <CheckCircle size={28} className="text-emerald-400" /> : <Zap size={28} className="text-neon-cyan" />}
            </div>
            <h2 className="font-display font-black text-2xl text-white mb-2">
              {submissionStopped ? `${disputeId} Filed` : 'Processing...'}
            </h2>
            <p className="font-body text-slate-400 text-sm">
              {submissionStopped
                ? 'The filing receipt passed status, consensus, execution, and return-value validation. The case now awaits respondent acceptance.'
                : 'Submitting your dispute transaction'}
            </p>
          </div>

          {processingHash && (
            <div className="mb-5 px-4 py-3 rounded-xl" style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.1)' }}>
              <div className="font-mono text-[10px] text-slate-500 mb-1">TRANSACTION HASH</div>
              <div className="font-mono text-xs text-neon-cyan break-all">{processingHash}</div>
            </div>
          )}

          <div className="space-y-2.5">
            {TX_STEPS.map((step, i) => {
              const isDone = i < currentStepIdx || (submissionStopped && i === currentStepIdx)
              const isActive = !submissionStopped && i === currentStepIdx
              return (
                <div key={step.status} className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-500 ${isActive ? 'border' : ''}`}
                  style={isActive ? { background: 'rgba(0,245,255,0.05)', borderColor: 'rgba(0,245,255,0.2)' } : {}}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                    ${isDone ? 'bg-emerald-500' : isActive ? 'border-2 border-neon-cyan' : 'border border-border'}`}>
                    {isDone ? <CheckCircle size={14} className="text-void" />
                      : isActive ? <Loader2 size={14} className="text-neon-cyan animate-spin" />
                      : <div className="w-2 h-2 rounded-full bg-border" />}
                  </div>
                  <div className="flex-1">
                    <div className={`font-display font-semibold text-xs ${isDone ? 'text-emerald-400' : isActive ? 'text-neon-cyan' : 'text-slate-600'}`}>
                      {step.label}
                    </div>
                    <div className="font-body text-[10px] text-slate-500">{step.desc}</div>
                  </div>
                  {isDone && <span className="font-mono text-[10px] text-emerald-400">✓ done</span>}
                  {isActive && (
                    <div className="flex gap-0.5">
                      {[0, 1, 2].map(j => (
                        <div key={j} className="w-1 h-1 rounded-full bg-neon-cyan animate-pulse" style={{ animationDelay: `${j * 0.2}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {submissionStopped && (
            <button onClick={() => navigate('/disputes')} className="btn-glass w-full justify-center mt-6 py-3 text-sm">
              View My Disputes
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => navigate('/disputes')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 font-body text-sm">
        <ArrowLeft size={14} /> Back to Disputes
      </button>

      <div className="mb-6">
        <h1 className="page-header flex items-center gap-2"><Scale size={20} className="text-neon-cyan" /> File a Dispute</h1>
        <p className="page-sub">Submit a dispute through the injected wallet, validate its GenLayer receipt, and refresh the canonical contract state. Respondent response and advisory evaluation continue from the Disputes view.</p>
      </div>

      {(submissionError ?? filingBlocker) && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)' }}>
          <AlertCircle size={15} className="text-yellow-400 flex-shrink-0" />
          <p className="font-body text-xs text-yellow-400">{submissionError ?? filingBlocker}</p>
        </div>
      )}

      <div className="glass rounded-3xl p-6 space-y-5">
        {/* Title */}
        <div>
          <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Dispute Title *</label>
          <input type="text" placeholder="e.g. SaaS Non-Delivery — Invoice #1234"
            value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="input-field" />
        </div>

        {/* Description */}
        <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Description *</label>
            <textarea rows={4} placeholder="Describe the dispute and the decision criteria..."
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="input-field resize-none" />
        </div>

        {/* Respondent */}
        <div>
          <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Respondent Address *</label>
            <input type="text" placeholder="0x..." value={form.respondent}
              onChange={e => setForm(p => ({ ...p, respondent: e.target.value }))}
              className="input-field font-mono text-xs" />
          </div>
        </div>

        {/* Amount + Currency */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Reference Amount *</label>
            <input type="number" min="0" step="1" placeholder="0" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Reference Currency</label>
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="select-field">
              {['USDC', 'USDT', 'GEN', 'ETH'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: 'rgba(255,165,0,0.05)', border: '1px solid rgba(255,165,0,0.15)' }}>
          <div className="flex items-start gap-3">
            <AlertCircle size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-semibold text-xs text-yellow-400 mb-1">Public evidence only</div>
              <p className="font-body text-[11px] text-slate-400 leading-relaxed">
                Evidence URLs and their hash, MIME type, size, and source identifier become public contract data. Use only non-sensitive material already published in a public GitHub repository. Repository deletion or provider failure can make content unavailable even when its commit and hash are immutable.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Immutable Evidence Reference</label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://raw.githubusercontent.com/owner/repo/40-character-commit/path"
              value={evidenceUrl}
              onChange={event => {
                setEvidenceUrl(event.target.value)
                setEvidenceError(null)
              }}
              className="input-field font-mono text-xs min-w-0"
            />
            <button
              type="button"
              onClick={handleAddEvidence}
              disabled={!evidenceUrl.trim() || isVerifyingEvidence || evidence.length >= 3}
              className="btn-glass px-3 flex-shrink-0 disabled:opacity-50"
              title="Verify evidence reference"
            >
              {isVerifyingEvidence ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
              <span className="hidden sm:inline">Verify</span>
            </button>
          </div>
          <p className="font-body text-[10px] text-slate-500 mt-2 leading-relaxed">
            Accepted policy: up to 3 text, JSON, or XML resources from raw.githubusercontent.com, pinned to a lowercase 40-character commit SHA and no larger than 2,000 UTF-8 bytes. Browser redirects are rejected before signing.
          </p>
          {evidenceError && (
            <p className="font-mono text-[10px] text-red-400 mt-2">{evidenceError}</p>
          )}
          {evidence.length > 0 && (
            <div className="space-y-2 mt-3">
              {evidence.map(reference => (
                <div key={reference.url} className="rounded-lg p-3 flex items-start gap-3" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)' }}>
                  <CheckCircle size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-white break-all">{reference.source_id}</div>
                    <div className="font-mono text-[9px] text-slate-500 mt-1 break-all">
                      SHA-256 {reference.content_hash} · {reference.mime_type} · {reference.byte_size} bytes
                    </div>
                  </div>
                  <button type="button" onClick={() => removeEvidence(reference.url)} className="text-slate-500 hover:text-red-400 p-1" title="Remove evidence reference">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GenLayer info */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.1)' }}>
          <div className="flex items-start gap-3">
            <Zap size={13} className="text-neon-cyan flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-semibold text-xs text-neon-cyan mb-1">How GenLayer resolves this</div>
              <p className="font-body text-[11px] text-slate-400 leading-relaxed">
                The dispute record is submitted through the configured GenLayer environment. After filing, the named respondent can accept or decline and either named party can request the advisory GenVM evaluation from the Disputes view. No funds are transferred, escrowed, released, or refunded.
              </p>
            </div>
          </div>
        </div>

        {evidence.length === 0 && (
          <label className="flex items-start gap-2 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={confirmNoEvidence}
              onChange={event => setConfirmNoEvidence(event.target.checked)}
              disabled={isProcessing || isVerifyingEvidence || !!filingBlocker}
              className="mt-0.5"
            />
            <span>I understand this filing will contain no evidence references.</span>
          </label>
        )}
        <button onClick={handleSubmit}
          disabled={isProcessing || isVerifyingEvidence || !!filingBlocker || !form.title || !form.description || !form.respondent || !form.amount || (evidence.length === 0 && !confirmNoEvidence)}
          className="btn-solid w-full justify-center py-4 text-base disabled:opacity-50">
          {isProcessing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Scale size={16} /> Submit Dispute Transaction</>}
        </button>
      </div>
    </div>
  )
}

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, Upload, ArrowLeft, CheckCircle, Loader2, AlertCircle, Zap, X, File } from 'lucide-react'
import { useApp, TxStatus } from '../lib/store'

const TX_STEPS: { status: TxStatus; label: string; desc: string }[] = [
  { status: 'PENDING', label: 'Broadcasting', desc: 'Sending to GenLayer network' },
  { status: 'PROPOSING', label: 'AI Proposing', desc: 'Lead validator analyzing evidence' },
  { status: 'COMMITTING', label: 'Validators Committing', desc: 'Multiple LLMs processing dispute' },
  { status: 'REVEALING', label: 'Revealing Votes', desc: 'Validators revealing their verdicts' },
  { status: 'ACCEPTED', label: 'Consensus Reached', desc: 'Majority agreement achieved' },
  { status: 'FINALIZED', label: 'Finalized On-Chain', desc: 'Dispute locked in Intelligent Contract' },
]

const CATEGORIES = ['Service Delivery', 'Payment Dispute', 'Contract Breach', 'IP/Copyright', 'NFT/Token', 'Smart Contract Bug', 'Other']

export default function FileDisputePage() {
  const navigate = useNavigate()
  const { addDispute, isProcessing, processingStatus, processingHash, wallet } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ title: '', description: '', respondent: '', amount: '', currency: 'USDC', category: 'Service Delivery', evidenceLinks: '' })
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [disputeId, setDisputeId] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const currentStepIdx = processingStatus ? TX_STEPS.findIndex(s => s.status === processingStatus) : -1
  const isFinalized = processingStatus === 'FINALIZED'

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const arr = Array.from(files).slice(0, 5)
    setUploadedFiles(prev => [...prev, ...arr].slice(0, 5))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.description || !form.respondent || !form.amount) return
    setSubmitted(true)

    const evidenceList = [
      ...uploadedFiles.map(f => f.name),
      ...form.evidenceLinks.split('\n').map(s => s.trim()).filter(Boolean),
    ]

    const id = await addDispute({
      title: form.title,
      description: form.description,
      claimant: wallet.address || '0xAnonymous',
      respondent: form.respondent,
      amount: parseFloat(form.amount),
      currency: form.currency,
      category: form.category,
      evidence: evidenceList.length > 0 ? evidenceList : ['No evidence attached'],
    })
    setDisputeId(id)
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
              {isFinalized ? <CheckCircle size={28} className="text-emerald-400" /> : <Zap size={28} className="text-neon-cyan" />}
            </div>
            <h2 className="font-display font-black text-2xl text-white mb-2">
              {isFinalized ? `${disputeId} Filed!` : 'Processing...'}
            </h2>
            <p className="font-body text-slate-400 text-sm">
              {isFinalized ? 'Your dispute is on-chain. AI validators will reach a verdict within 12–48 hours.' : 'GenLayer validators are processing your dispute'}
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
              const isDone = i < currentStepIdx
              const isActive = i === currentStepIdx
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

          {isFinalized && (
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
        <p className="page-sub">Your case will be analyzed by GenLayer AI validators using Optimistic Democracy</p>
      </div>

      {!wallet.address && (
        <div className="flex items-center gap-3 p-4 rounded-xl mb-5" style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)' }}>
          <AlertCircle size={15} className="text-yellow-400 flex-shrink-0" />
          <p className="font-body text-xs text-yellow-400">Connect your wallet to sign and submit this dispute on-chain.</p>
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
          <textarea rows={4} placeholder="Describe the dispute in detail. AI validators will analyze this along with your evidence..."
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="input-field resize-none" />
        </div>

        {/* Respondent + Category */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Respondent Address *</label>
            <input type="text" placeholder="0x..." value={form.respondent}
              onChange={e => setForm(p => ({ ...p, respondent: e.target.value }))}
              className="input-field font-mono text-xs" />
          </div>
          <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Category</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="select-field">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Amount + Currency */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Disputed Amount *</label>
            <input type="number" placeholder="0.00" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Currency</label>
            <select value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} className="select-field">
              {['USDC', 'USDT', 'GEN', 'ETH'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Evidence links */}
        <div>
          <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Evidence Links / IPFS CIDs</label>
          <textarea rows={2} placeholder="https://ipfs.io/ipfs/Qm... (one per line)"
            value={form.evidenceLinks} onChange={e => setForm(p => ({ ...p, evidenceLinks: e.target.value }))}
            className="input-field resize-none text-xs font-mono" />
        </div>

        {/* File upload — fully functional */}
        <div>
          <label className="font-mono text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Upload Evidence Files</label>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.json,.csv,.zip,.eml"
            className="hidden" onChange={e => handleFiles(e.target.files)} />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className="border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-200 cursor-pointer"
            style={{ borderColor: dragOver ? 'rgba(0,245,255,0.5)' : 'rgba(28,42,74,0.8)', background: dragOver ? 'rgba(0,245,255,0.04)' : 'transparent' }}>
            <Upload size={20} className={`mx-auto mb-2 ${dragOver ? 'text-neon-cyan' : 'text-slate-600'}`} />
            <p className="font-body text-xs text-slate-500">
              {dragOver ? 'Drop files here' : 'Click to browse or drag & drop files'}
            </p>
            <p className="font-mono text-[10px] text-slate-600 mt-1">PDF, images, JSON, CSV, ZIP — max 5 files</p>
          </div>

          {/* Uploaded file list */}
          {uploadedFiles.length > 0 && (
            <div className="mt-3 space-y-2">
              {uploadedFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.1)' }}>
                  <div className="flex items-center gap-2">
                    <File size={12} className="text-neon-cyan" />
                    <span className="font-mono text-xs text-white">{f.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">({(f.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button onClick={() => setUploadedFiles(p => p.filter((_, j) => j !== i))}
                    className="text-slate-500 hover:text-red-400 transition-colors">
                    <X size={12} />
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
                Your dispute is deployed as an Intelligent Contract on GenLayer. Multiple AI validators independently analyze the evidence, fetch live web data for verification, and vote. Optimistic Democracy consensus ensures a majority verdict is reached within hours.
              </p>
            </div>
          </div>
        </div>

        <button onClick={handleSubmit}
          disabled={isProcessing || !form.title || !form.description || !form.respondent || !form.amount}
          className="btn-solid w-full justify-center py-4 text-base disabled:opacity-50">
          {isProcessing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Scale size={16} /> Submit Dispute On-Chain</>}
        </button>
      </div>
    </div>
  )
}

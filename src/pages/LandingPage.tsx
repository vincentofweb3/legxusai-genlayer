import { ArrowRight, ShieldCheck, Network as NetworkIcon, FileText, ExternalLink, Github, Twitter, MessageCircle, Scale } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { GENLAYER_CONFIG, getNetworkLabel } from '../lib/genlayer/config'

const FEATURES = [
  { icon: FileText, title: 'Structured case intake', desc: 'Capture the parties, decision criteria, reference amount, and up to three verified public evidence references.', color: '#00f5ff' },
  { icon: NetworkIcon, title: 'GenLayer lifecycle', desc: 'File, respond, and request evaluation through one explicitly configured GenLayer environment.', color: '#b44eff' },
  { icon: ShieldCheck, title: 'Canonical state path', desc: 'Validate each accepted receipt or trace, strictly decode its return, and refresh records from the configured Intelligent Contract.', color: '#00de6a' },
  { icon: Scale, title: 'Advisory outcome', desc: 'Return a decision record for the parties without pretending to transfer, escrow, or release funds.', color: '#ffd166' },
]

const STEPS = [
  { step: '01', title: 'File the case', desc: 'Submit the supported dispute inputs from a wallet verified on the configured target chain.' },
  { step: '02', title: 'Record the filing', desc: 'The configured Intelligent Contract accepts the dispute transaction.' },
  { step: '03', title: 'Await respondent acceptance', desc: 'The contract keeps the case pending until the named respondent accepts or declines the recorded criteria.' },
  { step: '04', title: 'Evaluate through the contract', desc: 'After acceptance, either named party can request the advisory GenVM evaluation and refresh the canonical result.' },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const { connectWallet, wallet, hasInjectedWallet } = useApp()

  const launch = async () => {
    if (!wallet.address && hasInjectedWallet) await connectWallet()
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen hex-bg">
      <nav className="relative z-10 flex items-center justify-between px-8 py-4" style={{ borderBottom: '1px solid rgba(28,42,74,0.4)', background: 'rgba(5,8,19,0.9)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)', padding: '1px' }}><div className="w-full h-full rounded-[10px] bg-void flex items-center justify-center"><span className="font-display font-black text-sm text-neon-cyan">L:</span></div></div>
          <span className="font-display font-bold text-white text-lg">Legxus<span className="text-neon-cyan">AI</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8"><a href="#workflow" className="font-body text-sm text-slate-400 hover:text-white">Workflow</a><a href="#scope" className="font-body text-sm text-slate-400 hover:text-white">Scope</a><a href="https://docs.genlayer.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 font-body text-sm text-slate-400 hover:text-neon-cyan">Docs <ExternalLink size={12} /></a></div>
        <button onClick={launch} disabled={wallet.isConnecting} className="btn-glass text-sm">{wallet.isConnecting ? 'Connecting...' : 'Open App'} <ArrowRight size={13} /></button>
      </nav>

      <main>
        <section className="relative z-10 min-h-[76vh] flex flex-col items-center justify-center text-center px-6 py-20">
          <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono" style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}><div className="w-1.5 h-1.5 rounded-full bg-neon-cyan" /> GenLayer dispute adjudication</div>
          <h1 className="font-display font-black leading-[0.95] mb-6 max-w-4xl text-5xl md:text-7xl"><span className="text-white block">Resolve the record.</span><span className="block text-neon-cyan">Keep the outcome honest.</span></h1>
          <p className="font-body text-slate-300 text-lg max-w-2xl mb-3">LegxusAI is a focused dispute workflow built around a GenLayer Intelligent Contract.</p>
          <p className="font-body text-slate-500 text-sm max-w-xl mb-10 leading-relaxed">File a case, let the named respondent accept or decline, and request an advisory evaluation from either named party. This release does not move or custody funds.</p>
          <div className="flex flex-wrap items-center justify-center gap-4"><button onClick={launch} disabled={wallet.isConnecting} className="btn-solid px-7 py-3.5 text-base">{wallet.isConnecting ? 'Connecting...' : 'Open dispute app'} <ArrowRight size={16} /></button><a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer" className="btn-glass px-7 py-3.5 text-base">GenLayer Studio <ExternalLink size={14} /></a></div>
          <div className="mt-10 flex items-center gap-2 font-mono text-[10px] text-slate-600"><div className={`w-1.5 h-1.5 rounded-full ${GENLAYER_CONFIG.network ? 'bg-emerald-400' : 'bg-yellow-400'}`} /> {getNetworkLabel()} · {GENLAYER_CONFIG.environment ?? 'environment not selected'}</div>
        </section>

        <section id="scope" className="relative z-10 py-20 px-6 border-y border-border/50"><div className="max-w-6xl mx-auto"><div className="text-center mb-12"><div className="font-mono text-xs text-neon-cyan mb-3 tracking-widest uppercase">Focused scope</div><h2 className="font-display font-bold text-3xl md:text-4xl text-white mb-4">One product surface.<br /><span className="text-neon-cyan">One decision record.</span></h2><p className="font-body text-slate-400 text-base max-w-xl mx-auto">The reviewed contribution contains dispute adjudication only. Prediction markets, general oracle routes, escrow, payouts, and protocol appeals are not presented as working features.</p></div><div className="grid md:grid-cols-2 gap-5">{FEATURES.map(({ icon: Icon, title, desc, color }) => <div key={title} className="glass rounded-2xl p-6" style={{ border: '1px solid rgba(28,42,74,0.8)' }}><div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}12`, border: `1px solid ${color}30` }}><Icon size={21} style={{ color }} /></div><h3 className="font-display font-bold text-white text-lg mb-2">{title}</h3><p className="font-body text-slate-400 text-sm leading-relaxed">{desc}</p></div>)}</div></div></section>

        <section id="workflow" className="relative z-10 py-20 px-6"><div className="max-w-4xl mx-auto"><div className="text-center mb-12"><div className="font-mono text-xs text-neon-purple mb-3 tracking-widest uppercase">Contract lifecycle</div><h2 className="font-display font-bold text-3xl md:text-4xl text-white">From filing to advisory evaluation</h2></div><div className="space-y-0">{STEPS.map(({ step, title, desc }, i) => <div key={step} className="flex gap-5"><div className="flex flex-col items-center"><div className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-black text-sm flex-shrink-0" style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)', color: '#00f5ff' }}>{step}</div>{i < STEPS.length - 1 && <div className="w-px flex-1 my-2" style={{ background: 'rgba(0,245,255,0.2)' }} />}</div><div className="pb-8"><h3 className="font-display font-bold text-white text-lg mb-1">{title}</h3><p className="font-body text-slate-400 text-sm leading-relaxed">{desc}</p></div></div>)}</div></div></section>

        <section className="relative z-10 py-20 px-6"><div className="max-w-3xl mx-auto text-center glass rounded-3xl p-10"><div className="font-mono text-xs text-neon-cyan mb-4 tracking-widest uppercase">Ready to inspect the flow?</div><h2 className="font-display font-black text-4xl text-white mb-4">Start with a dispute.</h2><p className="font-body text-slate-400 text-base mb-8 max-w-lg mx-auto">Connect a wallet and open the focused dispute application. Network and contract state remain explicit when they are not configured.</p><button onClick={launch} className="btn-solid px-7 py-3.5">Open Dashboard <ArrowRight size={15} /></button></div></section>
      </main>

      <footer className="relative z-10 border-t border-border" style={{ background: 'rgba(5,8,19,0.9)' }}><div className="max-w-6xl mx-auto px-8 py-10"><div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6"><div><div className="font-display font-bold text-white mb-2">Legxus<span className="text-neon-cyan">AI</span></div><p className="font-body text-xs text-slate-500 max-w-sm">Focused dispute adjudication on GenLayer. Advisory outcomes only in this release scope.</p></div><div className="flex items-center gap-4"><button onClick={() => navigate('/disputes')} className="font-mono text-[10px] text-slate-500 hover:text-white">Disputes</button><button onClick={() => navigate('/explorer')} className="font-mono text-[10px] text-slate-500 hover:text-white">Transactions</button><button onClick={() => navigate('/contracts')} className="font-mono text-[10px] text-slate-500 hover:text-white">Contract</button><a href="https://github.com/genlayerlabs" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white"><Github size={14} /></a><a href="https://twitter.com/genlayerlabs" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white"><Twitter size={14} /></a><a href="https://discord.gg/genlayer" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-white"><MessageCircle size={14} /></a></div></div><div className="pt-6 mt-6 border-t border-border font-body text-xs text-slate-600">© 2026 LegxusAI · Built on GenLayer · {getNetworkLabel()}</div></div></footer>
    </div>
  )
}

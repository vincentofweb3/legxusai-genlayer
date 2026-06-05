import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Shield, Brain, Zap, Globe, ChevronDown, ExternalLink, Github, Twitter, Scale, TrendingUp, Search, Code2, MessageCircle } from 'lucide-react'
import { useApp } from '../lib/store'

const FEATURES = [
  { icon: Brain, title: 'AI-Powered Verdicts', desc: "Multiple LLM validators reach consensus on disputes using GenLayer's Optimistic Democracy — no human bias, no delays.", color: '#00f5ff' },
  { icon: Globe, title: 'Live Web Oracle', desc: 'Intelligent Contracts fetch real-time data directly from the web. No oracles, no intermediaries, no manipulation.', color: '#b44eff' },
  { icon: Shield, title: 'Trustless Resolution', desc: 'Every verdict is cryptographically verifiable on-chain. Greyboxing security prevents validator collusion.', color: '#00de6a' },
  { icon: Zap, title: 'Sub-Hour Finality', desc: 'From dispute filing to final verdict in under 60 minutes. AI consensus moves at machine speed.', color: '#ffd700' },
]

const STATS = [
  { value: '1,247', label: 'Disputes Resolved', suffix: '' },
  { value: '$12.4', label: 'Volume Settled', suffix: 'M' },
  { value: '97.3', label: 'Accuracy Rate', suffix: '%' },
  { value: '41', label: 'Avg Resolution', suffix: 'h' },
]

const HOW_IT_WORKS = [
  { step: '01', title: 'File Your Dispute', desc: 'Submit your claim with evidence on-chain. LegxusAI stores it in our Intelligent Contract.' },
  { step: '02', title: 'AI Validators Activate', desc: "GenLayer's diverse LLM validators independently analyze the evidence and context." },
  { step: '03', title: 'Web Data Fetched', desc: 'Smart contracts pull live web data to verify claims — invoices, transactions, news, code.' },
  { step: '04', title: 'Consensus Reached', desc: 'Validators vote. Optimistic Democracy ensures the majority AI consensus is the verdict.' },
  { step: '05', title: 'Verdict Enforced', desc: 'Funds release automatically. No appeals needed unless contested with staked GEN tokens.' },
]

const FOOTER_LINKS = {
  Product: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'File a Dispute', href: '/disputes/new' },
    { label: 'Prediction Markets', href: '/predictions' },
    { label: 'TX Explorer', href: '/explorer' },
    { label: 'Contracts', href: '/contracts' },
  ],
  Resources: [
    { label: 'GenLayer Docs', href: 'https://docs.genlayer.com', external: true },
    { label: 'GenLayer Studio', href: 'https://studio.genlayer.com', external: true },
    { label: 'genlayer-js SDK', href: 'https://github.com/genlayerlabs/genlayer-js', external: true },
    { label: 'Intelligent Contracts', href: 'https://docs.genlayer.com/developers/intelligent-contracts/introduction', external: true },
  ],
  Network: [
    { label: 'Bradbury Testnet', href: '#', note: 'Active' },
    { label: 'Optimistic Democracy', href: '#', note: 'Consensus' },
    { label: 'GenVM (WASM+Python)', href: '#', note: 'Runtime' },
    { label: 'Greyboxing Security', href: '#', note: 'Protection' },
  ],
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { connectWallet, wallet, hasInjectedWallet } = useApp()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [typedText, setTypedText] = useState('')
  const fullText = 'AI-Powered Dispute Resolution & Prediction Markets'

  useEffect(() => {
    let i = 0
    const iv = setInterval(() => {
      if (i < fullText.length) { setTypedText(fullText.slice(0, ++i)) } else clearInterval(iv)
    }, 38)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = window.innerWidth; canvas.height = window.innerHeight
    const pts = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.4 + 0.1,
    }))
    let animId: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,245,255,${p.a})`; ctx.fill()
      })
      pts.forEach((p1, i) => pts.slice(i + 1).forEach(p2 => {
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y)
        if (d < 120) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.strokeStyle = `rgba(0,245,255,${0.07 * (1 - d / 120)})`; ctx.lineWidth = 0.5; ctx.stroke() }
      }))
      animId = requestAnimationFrame(draw)
    }
    draw()
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <div className="min-h-screen hex-bg" onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0 opacity-50" />
      <div className="fixed pointer-events-none z-0" style={{ width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,rgba(0,245,255,0.04) 0%,transparent 70%)', left: mousePos.x - 300, top: mousePos.y - 300 }} />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-4" style={{ borderBottom: '1px solid rgba(28,42,74,0.4)', background: 'rgba(5,8,19,0.7)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)', padding: '1px' }}>
            <div className="w-full h-full rounded-[10px] bg-void flex items-center justify-center">
              <span className="font-display font-black text-sm" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>L:</span>
            </div>
          </div>
          <span className="font-display font-bold text-white text-lg">Legxus<span className="text-neon-cyan">AI</span></span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {['Features', 'How It Works', 'Markets', 'Docs'].map(item => (
            <a key={item} href={`#${item.toLowerCase().replace(/ /g, '-')}`} className="font-body text-sm text-slate-400 hover:text-white transition-colors">{item}</a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a href="https://docs.genlayer.com" target="_blank" rel="noopener noreferrer" className="hidden md:flex items-center gap-1.5 font-body text-sm text-slate-400 hover:text-neon-cyan transition-colors">
            <ExternalLink size={13} /> GenLayer Docs
          </a>
          {wallet.address ? (
            <button onClick={() => navigate('/dashboard')} className="btn-glass text-sm">Launch App <ArrowRight size={13} /></button>
          ) : (
            <button onClick={hasInjectedWallet ? () => { connectWallet(); setTimeout(() => navigate('/dashboard'), 2000) } : () => window.open('https://metamask.io/download/', '_blank')}
              disabled={wallet.isConnecting} className="btn-glass text-sm">
              {wallet.isConnecting ? 'Connecting...' : hasInjectedWallet ? 'Connect & Launch' : 'Install MetaMask'}
            </button>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 min-h-[92vh] flex flex-col items-center justify-center text-center px-6 pt-8 pb-16">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse,rgba(0,245,255,0.07) 0%,rgba(180,78,255,0.05) 40%,transparent 70%)' }} />

        <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono"
          style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.25)', color: '#00f5ff' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
          Built on GenLayer Intelligent Contracts
          <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" />
        </div>

        <h1 className="font-display font-black leading-[0.93] mb-7 max-w-4xl" style={{ fontSize: 'clamp(3.5rem,10vw,7.5rem)' }}>
          <span className="text-white block">Justice at</span>
          <span className="block" style={{ backgroundImage: 'linear-gradient(135deg,#00f5ff 0%,#7b6eff 50%,#b44eff 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Machine Speed
          </span>
        </h1>

        <div className="font-body text-slate-300 text-lg md:text-xl max-w-2xl mb-3 min-h-[2rem]">
          {typedText}<span className="inline-block w-0.5 h-5 bg-neon-cyan ml-0.5 animate-pulse" />
        </div>
        <p className="font-body text-slate-500 text-sm max-w-md mb-10 leading-relaxed">
          Powered by GenLayer's Optimistic Democracy — AI validators reach consensus in real-time, pulling live web data to resolve disputes trustlessly.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <button onClick={hasInjectedWallet ? () => { connectWallet(); setTimeout(() => navigate('/dashboard'), 2000) } : () => window.open('https://metamask.io/download/', '_blank')}
            disabled={wallet.isConnecting}
            className="group flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-bold text-base transition-all duration-300 disabled:opacity-70"
            style={{ background: 'linear-gradient(135deg,#00f5ff,#7b6eff,#b44eff)', boxShadow: '0 0 40px rgba(0,245,255,0.25),0 0 80px rgba(180,78,255,0.1)', color: '#050813' }}>
            {wallet.isConnecting ? 'Connecting...' : hasInjectedWallet ? 'Launch App' : 'Install MetaMask'}
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl font-display font-semibold text-base text-slate-300 hover:text-white transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
            GenLayer Studio <ExternalLink size={15} />
          </a>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-slate-700 animate-bounce">
          <span className="font-mono text-[10px] tracking-widest uppercase">scroll</span>
          <ChevronDown size={14} />
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 py-14 px-6" style={{ borderTop: '1px solid rgba(28,42,74,0.5)', borderBottom: '1px solid rgba(28,42,74,0.5)', background: 'rgba(0,245,255,0.012)' }}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-0">
          {STATS.map(({ value, label, suffix }, i) => (
            <div key={label} className="text-center py-2 relative">
              {i < STATS.length - 1 && <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 w-px h-10" style={{ background: 'linear-gradient(to bottom,transparent,rgba(28,42,74,0.8),transparent)' }} />}
              <div className="font-display font-black text-4xl md:text-5xl mb-1" style={{ backgroundImage: 'linear-gradient(135deg,#00f5ff,#7b6eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {value}<span className="text-2xl">{suffix}</span>
              </div>
              <div className="font-body text-sm text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="font-mono text-xs text-neon-cyan mb-3 tracking-widest uppercase">Core Features</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-white mb-4">Intelligence Built Into<br /><span style={{ backgroundImage: 'linear-gradient(135deg,#00f5ff,#b44eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Every Contract</span></h2>
            <p className="font-body text-slate-400 text-base max-w-xl mx-auto">LegxusAI leverages GenLayer's groundbreaking Intelligent Contracts to bring AI reasoning directly on-chain.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="card-hover glass rounded-2xl p-6 relative overflow-hidden group" style={{ border: '1px solid rgba(28,42,74,0.8)' }}>
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl transition-all duration-500 opacity-10 group-hover:opacity-25" style={{ background: color }} />
                <div className="absolute bottom-0 left-0 w-full h-px opacity-0 group-hover:opacity-100 transition-all duration-500" style={{ background: `linear-gradient(90deg,transparent,${color}40,transparent)` }} />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 relative z-10" style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <h3 className="font-display font-bold text-white text-lg mb-2 relative z-10">{title}</h3>
                <p className="font-body text-slate-400 text-sm leading-relaxed relative z-10">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative z-10 py-24 px-6" style={{ background: 'linear-gradient(180deg,transparent,rgba(0,245,255,0.02),transparent)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <div className="font-mono text-xs text-neon-purple mb-3 tracking-widest uppercase">Process</div>
            <h2 className="font-display font-bold text-3xl md:text-4xl text-white mb-4">From Dispute to Verdict<br /><span style={{ backgroundImage: 'linear-gradient(135deg,#00f5ff,#b44eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>in 5 Steps</span></h2>
          </div>
          <div className="space-y-0">
            {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
              <div key={step} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-black text-sm flex-shrink-0" style={{ background: 'rgba(0,245,255,0.1)', border: '1px solid rgba(0,245,255,0.3)', color: '#00f5ff' }}>{step}</div>
                  {i < HOW_IT_WORKS.length - 1 && <div className="w-px flex-1 my-2" style={{ background: 'linear-gradient(to bottom,rgba(0,245,255,0.3),rgba(0,245,255,0.05))' }} />}
                </div>
                <div className="pb-8">
                  <h3 className="font-display font-bold text-white text-lg mb-1">{title}</h3>
                  <p className="font-body text-slate-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="rounded-3xl p-12 relative overflow-hidden" style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.07),rgba(180,78,255,0.07))', border: '1px solid rgba(0,245,255,0.18)' }}>
            <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(ellipse at 50% 0%,rgba(0,245,255,0.6),transparent 60%)' }} />
            <div className="relative z-10">
              <div className="font-mono text-xs text-neon-cyan mb-4 tracking-widest uppercase">Get Started</div>
              <h2 className="font-display font-black text-4xl md:text-5xl text-white mb-4">
                Ready to Use<br />
                <span style={{ backgroundImage: 'linear-gradient(135deg,#00f5ff,#7b6eff,#b44eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>LegxusAI?</span>
              </h2>
              <p className="font-body text-slate-400 text-base mb-8 max-w-lg mx-auto">Connect your wallet and start filing disputes, staking on prediction markets, or exploring on-chain AI contracts.</p>
              <div className="flex flex-wrap justify-center gap-4">
                <button onClick={() => navigate('/dashboard')} className="font-display font-bold text-base px-8 py-4 rounded-2xl transition-all duration-300"
                  style={{ background: 'linear-gradient(135deg,#00f5ff,#7b6eff,#b44eff)', color: '#050813', boxShadow: '0 0 30px rgba(0,245,255,0.2)' }}>
                  Open Dashboard
                </button>
                <a href="https://docs.genlayer.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 font-display font-semibold text-base px-8 py-4 rounded-2xl text-slate-300 hover:text-white transition-all duration-200"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  Read the Docs <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── improved from minimal 1-liner to full 4-column footer */}
      <footer className="relative z-10 border-t border-border" style={{ background: 'rgba(5,8,19,0.8)' }}>
        <div className="max-w-6xl mx-auto px-8 py-14">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-10 mb-12">
            {/* Brand column */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)', padding: '1px' }}>
                  <div className="w-full h-full rounded-[7px] bg-void flex items-center justify-center">
                    <span className="font-display font-black text-xs" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>L:</span>
                  </div>
                </div>
                <span className="font-display font-bold text-white">Legxus<span className="text-neon-cyan">AI</span></span>
              </div>
              <p className="font-body text-sm text-slate-500 leading-relaxed mb-5 max-w-xs">
                AI-powered dispute resolution and prediction markets built on GenLayer's Intelligent Contracts. Justice at machine speed.
              </p>
              <div className="flex items-center gap-3">
                <a href="https://github.com/genlayerlabs" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-colors" style={{ background: 'rgba(28,42,74,0.5)', border: '1px solid #1c2a4a' }}>
                  <Github size={14} />
                </a>
                <a href="https://twitter.com/genlayerlabs" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-colors" style={{ background: 'rgba(28,42,74,0.5)', border: '1px solid #1c2a4a' }}>
                  <Twitter size={14} />
                </a>
                <a href="https://discord.gg/genlayer" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white transition-colors" style={{ background: 'rgba(28,42,74,0.5)', border: '1px solid #1c2a4a' }}>
                  <MessageCircle size={14} />
                </a>
              </div>
            </div>

            {/* Link columns */}
            {Object.entries(FOOTER_LINKS).map(([title, links]) => (
              <div key={title}>
                <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mb-4">{title}</div>
                <div className="space-y-3">
                  {links.map((link: any) => (
                    <div key={link.label}>
                      {'external' in link ? (
                        <a href={link.href} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-body text-sm text-slate-400 hover:text-white transition-colors">
                          {link.label} <ExternalLink size={10} className="text-slate-600" />
                        </a>
                      ) : 'note' in link ? (
                        <div className="flex items-center justify-between">
                          <span className="font-body text-sm text-slate-400">{link.label}</span>
                          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded text-emerald-400 bg-emerald-400/10">{link.note}</span>
                        </div>
                      ) : (
                        <a href={link.href} onClick={e => { e.preventDefault(); navigate(link.href) }}
                          className="font-body text-sm text-slate-400 hover:text-white transition-colors block">
                          {link.label}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-border">
            <p className="font-body text-xs text-slate-600">
              © 2025 LegxusAI · Built on <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-neon-cyan hover:underline">GenLayer</a> · Testnet (Bradbury) · For demonstration purposes
            </p>
            <div className="flex items-center gap-4">
              {[
                { icon: Scale, label: 'Disputes', href: '/disputes' },
                { icon: TrendingUp, label: 'Predictions', href: '/predictions' },
                { icon: Search, label: 'Explorer', href: '/explorer' },
                { icon: Code2, label: 'Contracts', href: '/contracts' },
              ].map(({ icon: Icon, label, href }) => (
                <button key={label} onClick={() => navigate(href)}
                  className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 hover:text-white transition-colors">
                  <Icon size={11} />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

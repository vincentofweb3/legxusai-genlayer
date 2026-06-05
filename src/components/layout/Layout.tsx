import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Scale, TrendingUp, Search, Code2, ChevronLeft, ChevronRight, Wallet, LogOut, Hexagon, Zap, X, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { useApp } from '../../lib/store'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/disputes', icon: Scale, label: 'Disputes' },
  { to: '/predictions', icon: TrendingUp, label: 'Predictions' },
  { to: '/explorer', icon: Search, label: 'TX Explorer' },
  { to: '/contracts', icon: Code2, label: 'Contracts' },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const { wallet, connectWallet, disconnectWallet, notifications, dismissNotification, hasInjectedWallet } = useApp()
  const navigate = useNavigate()

  return (
    <div className="flex h-screen bg-void overflow-hidden">
      {/* Sidebar */}
      <aside className={`flex flex-col flex-shrink-0 relative z-20 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}
        style={{ background: 'linear-gradient(180deg,#080d1c,#060b17)', borderRight: '1px solid #1c2a4a' }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
          <div className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center relative"
            style={{ background: 'linear-gradient(135deg,#00f5ff22,#b44eff22)', border: '1px solid rgba(0,245,255,0.35)' }}>
            <Hexagon size={15} className="text-neon-cyan" />
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-display font-bold text-white text-sm leading-none">
                Legxus<span className="text-neon-cyan">AI</span>
              </div>
              <div className="font-mono text-[10px] text-neon-cyan/50 mt-0.5">on GenLayer</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 relative
              ${isActive ? 'text-neon-cyan' : 'text-slate-400 hover:text-white'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <div className="absolute inset-0 rounded-xl" style={{ background: 'linear-gradient(135deg,rgba(0,245,255,0.1),rgba(180,78,255,0.05))', border: '1px solid rgba(0,245,255,0.18)' }} />}
                  <Icon size={17} className="relative z-10 flex-shrink-0" />
                  {!collapsed && <span className="relative z-10 font-body font-medium text-sm">{label}</span>}
                  {isActive && !collapsed && <div className="ml-auto relative z-10 w-1.5 h-1.5 rounded-full bg-neon-cyan" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Wallet */}
        <div className="px-2 py-3 border-t border-border">
          {wallet.address ? (
            <div className="rounded-xl p-3" style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.1)' }}>
              {!collapsed ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)' }} />
                      <span className="font-mono text-[11px] text-white">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                    </div>
                    <button onClick={disconnectWallet} className="text-slate-500 hover:text-red-400 transition-colors"><LogOut size={13} /></button>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <div className="font-mono text-xs text-neon-cyan font-bold">{wallet.genBalance}</div>
                      <div className="font-mono text-[9px] text-slate-500">GEN</div>
                    </div>
                    <div>
                      <div className="font-mono text-xs text-white font-bold">{wallet.ethBalance}</div>
                      <div className="font-mono text-[9px] text-slate-500">ETH</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex justify-center">
                  <div className="w-6 h-6 rounded-full" style={{ background: 'linear-gradient(135deg,#00f5ff,#b44eff)' }} />
                </div>
              )}
            </div>
          ) : (
            <button onClick={connectWallet} disabled={wallet.isConnecting}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200 font-body font-medium text-sm text-neon-cyan justify-${collapsed ? 'center' : 'start'} disabled:opacity-60`}
              style={{ background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)' }}>
              <Wallet size={15} />
              {!collapsed && (wallet.isConnecting ? 'Connecting...' : hasInjectedWallet ? 'Connect Wallet' : 'Install MetaMask')}
            </button>
          )}
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-neon-cyan transition-colors z-30"
          style={{ background: '#0e1628', border: '1px solid #1c2a4a' }}>
          {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center justify-between px-6 py-3.5 flex-shrink-0"
          style={{ borderBottom: '1px solid #1c2a4a', background: 'rgba(8,13,28,0.95)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.1)' }}>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xs text-emerald-400">GenLayer Testnet · Bradbury</span>
          </div>
          <div className="flex items-center gap-3">
            {!wallet.address && (
              <button onClick={connectWallet} disabled={wallet.isConnecting} className="btn-glass text-xs px-4 py-2">
                <Wallet size={13} />
                {wallet.isConnecting ? 'Connecting...' : hasInjectedWallet ? 'Connect Wallet' : 'Install MetaMask'}
              </button>
            )}
            <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-slate-500 hover:text-white transition-colors text-xs font-body">
              <Zap size={13} /><span>Home</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto"><Outlet /></main>
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl max-w-xs"
            style={{ background: '#0e1628', border: '1px solid #1c2a4a', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            {n.type === 'success' && <CheckCircle size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />}
            {n.type === 'error' && <X size={15} className="text-red-400 flex-shrink-0 mt-0.5" />}
            {n.type === 'warning' && <AlertTriangle size={15} className="text-yellow-400 flex-shrink-0 mt-0.5" />}
            {n.type === 'info' && <Info size={15} className="text-neon-cyan flex-shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-white text-xs">{n.title}</div>
              <div className="font-body text-slate-400 text-xs mt-0.5 leading-relaxed">{n.message}</div>
            </div>
            <button onClick={() => dismissNotification(n.id)} className="text-slate-500 hover:text-white flex-shrink-0"><X size={11} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

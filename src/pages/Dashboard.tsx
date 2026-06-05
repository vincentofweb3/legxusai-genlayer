import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Scale, TrendingUp, Zap, Users, ArrowUpRight, Plus, Activity, Clock, CheckCircle2 } from 'lucide-react'
import { useApp, getStatusColor } from '../lib/store'

const WEEKLY = [
  { day: 'Mon', disputes: 12, predictions: 34 },
  { day: 'Tue', disputes: 19, predictions: 41 },
  { day: 'Wed', disputes: 8, predictions: 28 },
  { day: 'Thu', disputes: 23, predictions: 52 },
  { day: 'Fri', disputes: 31, predictions: 67 },
  { day: 'Sat', disputes: 14, predictions: 38 },
  { day: 'Sun', disputes: 9, predictions: 21 },
]

const PIE_DATA = [
  { name: 'Claimant Wins', color: '#00f5ff' },
  { name: 'Respondent Wins', color: '#b44eff' },
  { name: 'Split Decision', color: '#ffd700' },
  { name: 'Dismissed', color: '#ff2d78' },
]

const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-bright rounded-xl px-3 py-2 text-xs">
      <div className="font-mono text-slate-400 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="font-mono text-white">{p.value} {p.dataKey}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { wallet, disputes, transactions } = useApp()

  // Compute live stats from real data
  const totalDisputes = disputes.length
  const resolvedThisMonth = disputes.filter(d => d.status === 'FINALIZED' && d.resolvedAt && new Date(d.resolvedAt).getMonth() === new Date().getMonth()).length
  const claimantWins = disputes.filter(d => d.verdict === 'CLAIMANT_WINS').length
  const respondentWins = disputes.filter(d => d.verdict === 'RESPONDENT_WINS').length
  const totalFinalized = claimantWins + respondentWins
  const pieData = [
    { name: 'Claimant Wins', value: totalFinalized ? Math.round(claimantWins / totalFinalized * 100) : 48, color: '#00f5ff' },
    { name: 'Respondent Wins', value: totalFinalized ? Math.round(respondentWins / totalFinalized * 100) : 38, color: '#b44eff' },
    { name: 'Split Decision', value: 10, color: '#ffd700' },
    { name: 'Dismissed', value: 4, color: '#ff2d78' },
  ]

  const recentDisputes = disputes.slice(0, 4)
  const recentTxs = transactions.slice(0, 6)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header">Dashboard</h1>
          <p className="page-sub">
            GenLayer Testnet ·{' '}
            {wallet.address ? `Connected: ${wallet.address.slice(0, 10)}...` : 'Wallet not connected'}
          </p>
        </div>
        <button onClick={() => navigate('/disputes/new')}
          className="btn-glass flex items-center gap-2 text-sm">
          <Plus size={14} /> File Dispute
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Scale, label: 'Total Disputes', value: totalDisputes.toLocaleString(), sub: `+${resolvedThisMonth} resolved this month`, color: '#00f5ff' },
          { icon: Zap, label: 'Avg Resolution', value: '41h', sub: 'machine speed consensus', color: '#b44eff' },
          { icon: TrendingUp, label: 'Volume Settled', value: '$12.4M', sub: 'across all disputes', color: '#00de6a' },
          { icon: Users, label: 'Active Validators', value: '234', sub: '97.3% accuracy rate', color: '#ffd700' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="glass rounded-2xl p-5 card-hover relative overflow-hidden group">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-20 transition-all duration-500" style={{ background: color }} />
            <div className="flex items-start justify-between mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                <Icon size={17} style={{ color }} />
              </div>
              <ArrowUpRight size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
            </div>
            <div className="font-display font-black text-3xl text-white mb-0.5">{value}</div>
            <div className="font-body text-xs text-slate-500 mb-1">{label}</div>
            <div className="font-mono text-[10px]" style={{ color }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Area chart */}
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-display font-bold text-white text-sm">Weekly Activity</h3>
              <p className="font-body text-xs text-slate-500 mt-0.5">Disputes & predictions filed</p>
            </div>
            <div className="flex items-center gap-4">
              {[{ color: '#00f5ff', label: 'Disputes' }, { color: '#b44eff', label: 'Predictions' }].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-mono text-[10px] text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={WEEKLY}>
              <defs>
                {[['cyan', '#00f5ff'], ['purple', '#b44eff']].map(([id, color]) => (
                  <linearGradient key={id} id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(28,42,74,0.8)" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="disputes" stroke="#00f5ff" strokeWidth={2} fill="url(#g-cyan)" />
              <Area type="monotone" dataKey="predictions" stroke="#b44eff" strokeWidth={2} fill="url(#g-purple)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="glass rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="font-display font-bold text-white text-sm">Resolution Outcomes</h3>
            <p className="font-body text-xs text-slate-500 mt-0.5">All-time verdict distribution</p>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={3} dataKey="value">
                {pieData.map((e, i) => <Cell key={i} fill={e.color} opacity={0.9} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [`${v}%`, '']} contentStyle={{ background: '#0e1628', border: '1px solid #1c2a4a', borderRadius: 12, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {pieData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-body text-xs text-slate-400">{name}</span>
                </div>
                <span className="font-mono text-xs text-white">{value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live TXs + Recent Disputes */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Live transactions — pulls from global store, updates when actions happen */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-white text-sm flex items-center gap-2">
              <Activity size={14} className="text-neon-cyan" /> Live Transactions
            </h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[10px] text-emerald-400">LIVE</span>
            </div>
          </div>
          {recentTxs.length === 0 ? (
            <div className="text-center py-8">
              <Activity size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="font-body text-xs text-slate-600">No transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTxs.map((tx, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl" style={{ background: 'rgba(28,42,74,0.3)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,245,255,0.1)' }}>
                      <Zap size={11} className="text-neon-cyan" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-white">{tx.type}</div>
                      <div className="font-mono text-[10px] text-slate-500 truncate">{tx.hash}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    <span className={`status-pill ${getStatusColor(tx.status)}`}>{tx.status}</span>
                    <span className="font-mono text-[10px] text-slate-600 flex items-center gap-1">
                      <Clock size={9} />{tx.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent disputes — live from global store */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-white text-sm flex items-center gap-2">
              <Scale size={14} className="text-neon-purple" /> Recent Disputes
            </h3>
            <button onClick={() => navigate('/disputes')} className="font-mono text-[10px] text-neon-cyan hover:underline flex items-center gap-1">
              View all <ArrowUpRight size={10} />
            </button>
          </div>
          {recentDisputes.length === 0 ? (
            <div className="text-center py-8">
              <Scale size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="font-body text-xs text-slate-600">No disputes filed yet</p>
              <button onClick={() => navigate('/disputes/new')} className="mt-3 btn-glass text-xs px-3 py-1.5">
                File your first dispute
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDisputes.map(d => (
                <div key={d.id} onClick={() => navigate('/disputes')}
                  className="flex items-center justify-between py-2.5 px-3 rounded-xl cursor-pointer transition-all duration-150 hover:bg-white/5"
                  style={{ background: 'rgba(28,42,74,0.3)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10px] text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 rounded-lg flex-shrink-0">{d.id}</span>
                    <div className="min-w-0">
                      <div className="font-body text-xs text-white truncate">{d.title}</div>
                      <div className="font-mono text-[10px] text-slate-500">{d.amount.toLocaleString()} {d.currency}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {d.verdict && <CheckCircle2 size={12} className={d.verdict === 'CLAIMANT_WINS' ? 'text-emerald-400' : 'text-neon-purple'} />}
                    <span className={`status-pill ${getStatusColor(d.status)}`}>
                      {d.status === 'FINALIZED' ? 'DONE' : d.status.slice(0, 4)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Network info bar */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Network', value: 'Bradbury Testnet', color: '#00de6a' },
            { label: 'Consensus', value: 'Optimistic Democracy', color: '#00f5ff' },
            { label: 'VM', value: 'GenVM (WASM + Python)', color: '#b44eff' },
            { label: 'Security', value: 'Greyboxing Active', color: '#ffd700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
              <div>
                <div className="font-mono text-[10px] text-slate-500">{label}</div>
                <div className="font-mono text-xs text-white">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

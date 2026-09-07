import { useState } from 'react'
import { Code2, Copy, CheckCircle, Network, FileCode2, ShieldCheck, ExternalLink, AlertTriangle } from 'lucide-react'
import { GENLAYER_CONFIG, NETWORK_CONFIG, getNetworkLabel } from '../lib/genlayer/config'
import { useApp } from '../lib/store'

const MANIFEST_FIELDS = [
  'application',
  'environment',
  'networkAlias',
  'chainId',
  'rpcUrl',
  'explorerUrl',
  'contractAddress',
  'deploymentTxHash',
  'genlayerCliVersion',
  'genlayerJsVersion',
  'genvmRunner',
]

export default function ContractsPage() {
  const [copied, setCopied] = useState(false)
  const address = GENLAYER_CONFIG.contractAddress
  const network = GENLAYER_CONFIG.network
  const { disputeLoad, transactionLoad } = useApp()

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-header flex items-center gap-2"><Code2 size={20} className="text-emerald-400" /> Dispute Contract</h1>
        <p className="page-sub">One focused Intelligent Contract configuration with explicit deployment state</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 glass rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-neon-cyan/10 border border-neon-cyan/20"><FileCode2 size={17} className="text-neon-cyan" /></div>
              <div><div className="font-display font-bold text-white text-sm">LegxusDisputeResolution</div><div className="font-mono text-[10px] text-slate-500">contracts/LegxusDisputeResolution.py</div></div>
            </div>
            <span className={`status-pill ${address ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'}`}>{address ? 'ADDRESS CONFIGURED' : 'NO VERIFIED ADDRESS'}</span>
          </div>

          <p className="font-body text-xs text-slate-400 leading-relaxed mb-5">The application reads canonical disputes from this contract, validates its state version and record schema at runtime, and accepts writes only after GenLayer receipt/result validation.</p>

          <div>
            <div className="font-mono text-[10px] text-slate-500 mb-1.5 uppercase tracking-widest">Contract address</div>
            <div className="flex items-center gap-2 px-3 py-3 rounded-xl" style={{ background: 'rgba(28,42,74,0.4)' }}>
              <span className={`font-mono text-xs flex-1 break-all ${address ? 'text-white' : 'text-slate-500'}`}>{address ?? 'No verified deployment address configured'}</span>
              {address && <button onClick={copyAddress} className="text-slate-500 hover:text-neon-cyan transition-colors" title="Copy contract address">{copied ? <CheckCircle size={13} className="text-emerald-400" /> : <Copy size={13} />}</button>}
            </div>
          </div>

          {network?.explorerUrl && (
            <a href={network.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-4 font-mono text-xs text-neon-cyan hover:underline">Open configured network explorer <ExternalLink size={11} /></a>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-white text-sm flex items-center gap-2 mb-4"><Network size={14} className="text-neon-purple" /> Network target</h3>
          <div className="space-y-3">
            {[
              ['Active network', getNetworkLabel()],
              ['Environment', GENLAYER_CONFIG.environment ?? 'unknown'],
              ['CLI alias', network?.alias ?? '—'],
              ['Chain ID', network?.chainId ?? '—'],
              ['Purpose', network?.purpose ?? '—'],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{label}</span><span className="font-mono text-xs text-white text-right">{value}</span></div>)}
          </div>
          {!network && <div className="flex items-start gap-2 mt-4 pt-4 border-t border-border"><AlertTriangle size={13} className="text-yellow-400 mt-0.5" /><p className="font-body text-[11px] text-slate-500">Set `VITE_GENLAYER_ENV` to `studio` or `bradbury`.</p></div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-white text-sm mb-4">Toolchain evidence</h3>
          <div className="space-y-3">
            {[
              ['Development', `${NETWORK_CONFIG.studio.alias} · ${NETWORK_CONFIG.studio.label}`],
              ['Release validation', `${NETWORK_CONFIG.bradbury.alias} · ${NETWORK_CONFIG.bradbury.label}`],
              ['GenLayer CLI', GENLAYER_CONFIG.toolchain.cli],
              ['genlayer-js', GENLAYER_CONFIG.toolchain.sdk],
              ['GenVM runner', GENLAYER_CONFIG.toolchain.genvmRunner ?? 'Not configured'],
            ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4"><span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">{label}</span><span className="font-mono text-xs text-white text-right">{value}</span></div>)}
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-white text-sm mb-2">Sanitized deployment manifest</h3>
          <p className="font-body text-xs text-slate-500 leading-relaxed mb-4">A manifest may record public network and deployment evidence only. Credential material is never a manifest field.</p>
          <div className="grid grid-cols-2 gap-2">
            {MANIFEST_FIELDS.map(field => <div key={field} className="font-mono text-[10px] text-slate-400 px-2 py-2 rounded-lg bg-surface/60">{field}</div>)}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-white text-sm mb-2">Canonical state hydration</h3>
          <p className="font-body text-xs text-slate-500 leading-relaxed">{disputeLoad.message}</p>
          <div className="font-mono text-[10px] text-neon-cyan mt-3 uppercase">State: {disputeLoad.phase.replace('-', ' ')} · source: {disputeLoad.source ?? 'none'}</div>
        </div>
        <div className="glass rounded-2xl p-5">
          <h3 className="font-display font-bold text-white text-sm mb-2">Transaction coverage</h3>
          <p className="font-body text-xs text-slate-500 leading-relaxed">{transactionLoad.message}</p>
          <div className="font-mono text-[10px] text-yellow-400 mt-3 uppercase">Known-hash validation only; no complete network index claimed</div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 flex items-start gap-3">
        <ShieldCheck size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
        <div><h3 className="font-display font-bold text-white text-sm mb-1">Advisory-only settlement</h3><p className="font-body text-xs text-slate-500 leading-relaxed">This contract surface does not receive, escrow, transfer, release, refund, or pay out GEN or any other asset. Protocol appeal integration and economic settlement remain outside the authorized contract scope.</p></div>
      </div>
    </div>
  )
}

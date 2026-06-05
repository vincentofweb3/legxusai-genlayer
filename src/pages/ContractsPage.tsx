import { useState } from 'react'
import { Code2, Copy, ExternalLink, Shield, Globe, Brain, CheckCircle, ChevronDown, ChevronUp, Zap, FileCode2, Activity, Lock } from 'lucide-react'
import { useApp } from '../lib/store'

const CONTRACTS = [
  {
    name: 'LegxusDisputeResolution', address: '0x742d35Cc6634C0532925a3b8D4C9b5A98e9E0001',
    description: 'Handles dispute filing, AI verdict generation, and appeal logic. AI validators fetch evidence URLs and reach consensus using Optimistic Democracy.',
    deployedBlock: 482801, totalCalls: 1247, color: '#00f5ff',
    abi: [
      { name: 'file_dispute', type: 'write', description: 'File a new dispute on-chain. Triggers AI validator assignment immediately.', inputs: [{ name: 'title', type: 'str', note: 'Short title for the dispute' }, { name: 'description', type: 'str', note: 'Full context of what happened' }, { name: 'respondent', type: 'address', note: 'Wallet address of the other party' }, { name: 'amount', type: 'int', note: 'Amount in dispute (base units)' }, { name: 'currency', type: 'str', note: 'USDC, ETH, or GEN' }, { name: 'evidence_urls', type: 'list[str]', note: 'Up to 3 URLs to evidence' }], returns: 'str — dispute ID e.g. DSP-0047' },
      { name: 'get_dispute', type: 'read', description: 'Read a single dispute record by its ID.', inputs: [{ name: 'dispute_id', type: 'str', note: 'e.g. DSP-0047' }], returns: 'DisputeRecord object' },
      { name: 'get_all_disputes', type: 'read', description: 'Returns all disputes stored in this contract.', inputs: [], returns: 'dict[str, DisputeRecord]' },
      { name: 'appeal_verdict', type: 'write', description: 'Appeal a finalized verdict. Re-triggers analysis with a larger validator set.', inputs: [{ name: 'dispute_id', type: 'str', note: 'ID of the dispute to appeal' }], returns: 'bool' },
      { name: 'get_total', type: 'read', description: 'Returns total disputes ever filed.', inputs: [], returns: 'int' },
    ],
    stateVars: [
      { name: 'disputes', type: 'dict[str, DisputeRecord]', desc: 'All dispute records keyed by ID' },
      { name: 'total_disputes', type: 'int', desc: 'Counter incremented on every new dispute' },
      { name: 'resolution_fee', type: 'int', desc: 'Fee per dispute filing (in GEN)' },
      { name: 'owner', type: 'address', desc: 'Contract deployer — can update fees' },
    ],
  },
  {
    name: 'LegxusPredictionMarket', address: '0x742d35Cc6634C0532925a3b8D4C9b5A98e9E0002',
    description: 'Creates and resolves prediction markets. The Intelligent Oracle fetches live web data from oracle sources to determine YES/NO outcomes automatically.',
    deployedBlock: 482850, totalCalls: 342, color: '#b44eff',
    abi: [
      { name: 'create_market', type: 'write', description: 'Create a new self-resolving prediction market.', inputs: [{ name: 'question', type: 'str', note: 'The YES/NO question' }, { name: 'description', type: 'str', note: 'Context and resolution criteria' }, { name: 'oracle_sources', type: 'list[str]', note: 'URLs the AI will fetch to resolve' }, { name: 'end_date', type: 'str', note: 'ISO 8601 date string' }, { name: 'category', type: 'str', note: 'e.g. Crypto, Finance, Technology' }], returns: 'str — market ID e.g. PRED-0089' },
      { name: 'stake_position', type: 'write', description: 'Place a YES or NO stake on an open market.', inputs: [{ name: 'market_id', type: 'str', note: 'Target market ID' }, { name: 'side', type: 'str', note: '"YES" or "NO"' }, { name: 'amount', type: 'int', note: 'Amount to stake' }], returns: 'bool' },
      { name: 'resolve_market', type: 'write', description: 'Trigger AI resolution. Fetches oracle URLs and determines outcome.', inputs: [{ name: 'market_id', type: 'str', note: 'Market to resolve' }], returns: 'str — "YES" or "NO"' },
      { name: 'claim_winnings', type: 'write', description: 'Claim your winnings after market resolution.', inputs: [{ name: 'market_id', type: 'str', note: 'Resolved market ID' }], returns: 'int — payout amount' },
      { name: 'get_market', type: 'read', description: 'Read a market by ID.', inputs: [{ name: 'market_id', type: 'str', note: 'e.g. PRED-0089' }], returns: 'Market object' },
    ],
    stateVars: [
      { name: 'markets', type: 'dict[str, Market]', desc: 'All markets keyed by ID' },
      { name: 'positions', type: 'dict[str, list[Position]]', desc: 'All stakes per market' },
      { name: 'fee_bps', type: 'int', desc: 'Protocol fee in basis points (50 = 0.5%)' },
      { name: 'market_count', type: 'int', desc: 'Total markets created' },
    ],
  },
  {
    name: 'LegxusIntelligentOracle', address: '0x742d35Cc6634C0532925a3b8D4C9b5A98e9E0003',
    description: 'General-purpose oracle that fetches, parses, and verifies real-world data trustlessly. Powers price feeds, event verification, and compliance checks.',
    deployedBlock: 482900, totalCalls: 891, color: '#ffd700',
    abi: [
      { name: 'fetch_price', type: 'write', description: 'Fetch the USD price of any asset from multiple sources, averaged by AI consensus.', inputs: [{ name: 'asset', type: 'str', note: 'e.g. "BTC", "ETH"' }, { name: 'sources', type: 'list[str]', note: 'Price feed URLs to query' }], returns: 'str — price as string e.g. "67432.15"' },
      { name: 'verify_event', type: 'write', description: 'Verify whether a real-world event has occurred using AI web analysis.', inputs: [{ name: 'event_key', type: 'str', note: 'Cache key for the result' }, { name: 'event_description', type: 'str', note: 'Description of the event' }, { name: 'verification_urls', type: 'list[str]', note: 'Sources to verify against' }], returns: 'bool — True if event confirmed' },
      { name: 'check_compliance', type: 'write', description: 'Check regulatory compliance status of an entity in a jurisdiction.', inputs: [{ name: 'entity', type: 'str', note: 'Entity name or identifier' }, { name: 'jurisdiction', type: 'str', note: 'e.g. "SEC", "EU MiCA"' }, { name: 'check_urls', type: 'list[str]', note: 'Regulatory sources to check' }], returns: 'str — "COMPLIANT", "NON_COMPLIANT", or "UNKNOWN"' },
      { name: 'get_latest_feed', type: 'read', description: 'Read the latest cached oracle value.', inputs: [{ name: 'key', type: 'str', note: 'e.g. "BTC_USD"' }], returns: 'OracleFeed object' },
    ],
    stateVars: [
      { name: 'feeds', type: 'dict[str, OracleFeed]', desc: 'Cached oracle results keyed by asset/event' },
      { name: 'trusted_sources', type: 'list[str]', desc: 'Default price feed URLs' },
      { name: 'update_count', type: 'int', desc: 'Total oracle updates performed' },
    ],
  },
]

function AbiFunction({ fn, color }: { fn: typeof CONTRACTS[0]['abi'][0]; color: string }) {
  const [open, setOpen] = useState(false)
  const typeColor = fn.type === 'write' ? '#ff9500' : '#00f5ff'
  return (
    <div className="rounded-xl overflow-hidden border transition-all duration-200" style={{ borderColor: open ? `${color}25` : 'rgba(28,42,74,0.6)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ background: open ? `${color}06` : 'rgba(14,22,40,0.4)' }}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded border" style={{ color: typeColor, background: `${typeColor}10`, borderColor: `${typeColor}25` }}>
            {fn.type.toUpperCase()}
          </span>
          <span className="font-mono text-sm text-white">{fn.name}<span className="text-slate-500">()</span></span>
        </div>
        {open ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: `${color}03` }}>
          <p className="font-body text-xs text-slate-400">{fn.description}</p>
          {fn.inputs.length > 0 && (
            <div>
              <div className="font-mono text-[10px] text-slate-600 uppercase tracking-wider mb-2">Parameters</div>
              <div className="space-y-1.5">
                {fn.inputs.map(inp => (
                  <div key={inp.name} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(14,22,40,0.6)' }}>
                    <span className="font-mono text-xs text-white flex-shrink-0">{inp.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ color, background: `${color}12` }}>{inp.type}</span>
                    <span className="font-body text-[11px] text-slate-500">{inp.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-600">Returns:</span>
            <span className="font-mono text-[10px] text-emerald-400">{fn.returns}</span>
          </div>
          {fn.type === 'write' && (
            <div className="flex items-center gap-1.5">
              <Lock size={9} className="text-yellow-500" />
              <span className="font-mono text-[10px] text-yellow-600">Requires connected wallet to execute</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ContractsPage() {
  const [selected, setSelected] = useState(CONTRACTS[0])
  const [copied, setCopied] = useState(false)
  const { wallet } = useApp()

  const copyAddress = () => { navigator.clipboard.writeText(selected.address); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="page-header flex items-center gap-2"><Code2 size={20} className="text-emerald-400" /> Intelligent Contracts</h1>
        <p className="page-sub">Deployed on GenLayer Testnet — public interface explorer</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        {CONTRACTS.map(c => (
          <button key={c.address} onClick={() => setSelected(c)}
            className={`px-4 py-2.5 rounded-xl text-sm font-display font-semibold transition-all duration-200 ${selected.address === c.address ? 'text-void' : 'glass text-slate-400 hover:text-white'}`}
            style={selected.address === c.address ? { background: c.color } : {}}>
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${selected.color}15`, border: `1px solid ${selected.color}30` }}>
                <Brain size={16} style={{ color: selected.color }} />
              </div>
              <div>
                <div className="font-display font-bold text-white text-sm">{selected.name}</div>
                <div className="font-mono text-[10px]" style={{ color: selected.color }}>Intelligent Contract</div>
              </div>
            </div>
            <p className="font-body text-xs text-slate-400 leading-relaxed mb-4">{selected.description}</p>
            <div className="mb-3">
              <div className="font-mono text-[10px] text-slate-500 mb-1.5 uppercase tracking-widest">Contract Address</div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(28,42,74,0.4)' }}>
                <span className="font-mono text-xs text-white flex-1">{selected.address.slice(0, 20)}...</span>
                <button onClick={copyAddress} className="text-slate-500 hover:text-neon-cyan transition-colors">
                  {copied ? <CheckCircle size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
                <a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-neon-cyan transition-colors">
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              {[['DEPLOYED', '#29f588'], ['Greyboxed', '#00f5ff'], ['Web Access', '#b44eff']].map(([label, color]) => (
                <span key={label} className="flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded-lg border"
                  style={{ color, background: `${color}10`, borderColor: `${color}20` }}>
                  {label === 'DEPLOYED' && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />}
                  {label === 'Greyboxed' && <Shield size={8} />}
                  {label === 'Web Access' && <Globe size={8} />}
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['Block', `#${selected.deployedBlock.toLocaleString()}`], ['Total Calls', selected.totalCalls.toLocaleString()], ['Language', 'Python']].map(([label, value]) => (
                <div key={label as string} className="text-center px-2 py-2 rounded-xl" style={{ background: 'rgba(28,42,74,0.3)' }}>
                  <div className="font-mono text-xs text-white font-bold">{value}</div>
                  <div className="font-mono text-[9px] text-slate-600 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={12} className="text-slate-500" />
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">State Variables</span>
            </div>
            <div className="space-y-2">
              {selected.stateVars.map(v => (
                <div key={v.name} className="px-3 py-2.5 rounded-xl" style={{ background: 'rgba(14,22,40,0.6)', border: '1px solid rgba(28,42,74,0.5)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-white">{v.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ color: selected.color, background: `${selected.color}12` }}>{v.type}</span>
                  </div>
                  <p className="font-body text-[11px] text-slate-500">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <FileCode2 size={13} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-semibold text-xs text-slate-300 mb-1">Source Code</div>
                <p className="font-body text-[11px] text-slate-500 leading-relaxed">Contract source is private. Only the public ABI and interface are shown here. Deployed bytecode is verifiable via GenLayer Studio.</p>
                <a href="https://studio.genlayer.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 font-mono text-[10px] text-neon-cyan hover:underline">
                  View bytecode on Studio <ExternalLink size={9} />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-bold text-white text-sm">Public ABI</h3>
                <p className="font-body text-xs text-slate-500 mt-0.5">Expand each function to see parameters and return types</p>
              </div>
              <div className="flex items-center gap-3">
                {[['WRITE', '#ff9500'], ['READ', '#00f5ff']].map(([label, color]) => (
                  <div key={label} className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color }}>
                    <div className="w-2 h-2 rounded-sm" style={{ background: `${color}20`, border: `1px solid ${color}50` }} />{label}
                  </div>
                ))}
              </div>
            </div>
            {!wallet.address && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4" style={{ background: 'rgba(255,165,0,0.06)', border: '1px solid rgba(255,165,0,0.15)' }}>
                <Lock size={10} className="text-yellow-600 flex-shrink-0" />
                <span className="font-body text-[11px] text-yellow-600">Connect your wallet to execute WRITE functions</span>
              </div>
            )}
            <div className="space-y-2">
              {selected.abi.map(fn => <AbiFunction key={fn.name} fn={fn} color={selected.color} />)}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h4 className="font-display font-bold text-white text-xs mb-4 flex items-center gap-2">
              <Zap size={13} className="text-neon-cyan" /> How GenLayer Executes These Contracts
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Brain, title: 'LLM Consensus', desc: 'Multiple AI validators independently run the contract. Optimistic Democracy ensures majority wins.', color: '#00f5ff' },
                { icon: Globe, title: 'Live Web Access', desc: 'Contracts call gl.get_webpage() to fetch real URLs during execution — no oracle middlemen needed.', color: '#b44eff' },
                { icon: Shield, title: 'Greyboxing', desc: "Validators can't see each other's outputs until reveal phase — preventing collusion.", color: '#ffd700' },
              ].map(({ icon: Icon, title, desc, color }) => (
                <div key={title} className="text-center px-3 py-4 rounded-xl" style={{ background: `${color}05`, border: `1px solid ${color}12` }}>
                  <div className="w-8 h-8 rounded-xl mx-auto flex items-center justify-center mb-2" style={{ background: `${color}15` }}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <div className="font-display font-semibold text-white text-xs mb-1">{title}</div>
                  <p className="font-body text-[10px] text-slate-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

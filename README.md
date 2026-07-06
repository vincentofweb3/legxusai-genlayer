# LegxusAI - AI Dispute Resolution & Prediction Markets on GenLayer

This project is called LegxusAI - **AI-powered dispute resolution and prediction markets, built on GenLayer.**

LegxusAI is an experiment in replacing slow, expensive, and often biased dispute resolution with something faster and more transparent: AI validators that read evidence, reason about it, and reach a verdict - all recorded on-chain. The same underlying mechanism also powers self-resolving prediction markets, where an AI oracle reads real-world data to settle YES/NO questions without any human in the loop.

This project is built on top of [GenLayer](https://genlayer.com), a blockchain that introduces something called **Intelligent Contracts** - smart contracts that can run LLM reasoning and fetch live data from the web as part of their execution, not just work with data that's already on-chain.

---

## Why this exists

Think about how many disagreements happen every day that have no fast or fair way to get resolved. A freelancer doesn't get paid. A buyer claims a product was never delivered. An NFT sale skips its royalty payment. A bug bounty gets disputed. Right now, the options are limited - expensive legal routes, a platform's opaque support ticket, or just eating the loss.

Prediction markets have a related problem. They need someone trustworthy to decide the outcome, and centralized resolvers introduce a single point of failure.

LegxusAI tackles both of these with the same idea: instead of relying on a person or a centralized authority, let a decentralized network of AI validators independently analyze the evidence and vote. If they agree, that becomes the binding outcome.

---

## How it actually works

1. **A dispute gets filed** - title, description, the other party's wallet address, the amount at stake, and any supporting evidence (invoices, screenshots, links, IPFS files).

2. **AI validators take over** - GenLayer's validator network activates. Each validator independently reads the evidence, fetches any linked web pages, and reasons through the case using an LLM.

3. **Consensus decides the outcome** - this is the important part. No single AI's opinion is treated as final. GenLayer's consensus mechanism, called **Optimistic Democracy**, requires validators to commit their answers, then reveal them, and checks whether a clear majority agrees. If they do, that's the verdict.

4. **The verdict is locked in** - written on-chain with a confidence score. Funds move automatically based on the outcome. If someone disagrees, they can stake GEN tokens to formally appeal, which restarts the process with a larger validator set.

Prediction markets follow the exact same pattern - instead of resolving a dispute, the AI reads the sources you provide (a price feed, a news site, an official announcement) and determines whether the market resolves YES or NO.

---

## What's in this repo

```
legxusai/
├── contracts/                        # GenLayer Intelligent Contracts, written in Python
│   ├── LegxusDisputeResolution.py    # Handles filing, AI verdicts, and appeals
│   ├── LegxusPredictionMarket.py     # Market creation, staking, and resolution
│   └── LegxusIntelligentOracle.py    # General-purpose price/event/compliance oracle
│
├── src/
│   ├── pages/                        # Landing page, dashboard, disputes, predictions, explorer, contracts
│   ├── components/layout/            # Sidebar + topbar shell
│   ├── lib/store.tsx                 # Shared app state (wallet, disputes, predictions, transactions)
│   └── styles/                       # Tailwind config + global styles
│
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

The frontend is a React + TypeScript + Vite application. The contracts are written in Python using GenLayer's SDK, calling things like `gl.get_webpage()` to pull in live data and `gl.exec_prompt()` to run LLM reasoning directly inside contract execution.

---

## Current state of the project

Being upfront about where things stand: the three Intelligent Contracts are fully written and reflect real GenLayer SDK patterns, but they are **not yet deployed** to GenLayer's testnet. The frontend currently runs on a simulated data layer - filing a dispute or staking on a market triggers a realistic transaction lifecycle animation and updates the UI everywhere it should, but no real on-chain calls happen yet.

This was a deliberate choice while the UI and UX were being built out. The next milestone is deploying the contracts to GenLayer's Bradbury testnet and wiring the frontend up to `genlayer-js` for real reads and writes.

---

## Running it locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

### Deploying the contracts (once you're ready to go live)

```bash
npm install -g @genlayer/cli
genlayer init
genlayer up

genlayer deploy --contract contracts/LegxusDisputeResolution.py --args 100
genlayer deploy --contract contracts/LegxusPredictionMarket.py --args 50
genlayer deploy --contract contracts/LegxusIntelligentOracle.py
```

Then update the deployed addresses in `src/lib/store.tsx`.

---

## Tech stack

| Layer | What's used |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Routing | React Router v6 |
| State | React Context (a single shared store) |
| Contracts | Python, GenLayer SDK (GenVM) |
| Wallet | MetaMask / any injected Web3 wallet |

---

## What makes GenLayer different

Most oracles can only relay data that's already structured and predefined - a price feed, a fixed API response. GenLayer's Intelligent Contracts can go further: they can read a webpage written in plain English, a contract in prose, or a description of an event, and reason about what it actually means, then turn that into a deterministic on-chain decision. That's what makes something like AI-resolved disputes possible in the first place - the contract isn't just executing rules, it's interpreting the real world.

---

## Links

- [GenLayer Docs](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [genlayer-js SDK](https://github.com/genlayerlabs/genlayer-js)
- [Live demo](https://legxusai-genlayer.vercel.app)

---

## A note on the name


__________________________

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

---

## What's Fixed in v2.0

- Global app state - disputes, predictions, transactions all connected
- Real MetaMask wallet connection (no more random addresses)
- File upload works - click or drag & drop evidence files
- Submitting a dispute adds it live to the disputes list + dashboard
- Staking on predictions updates YES/NO bars + volume in real time
- Create Market modal fully functional
- TX Explorer updates live when any action happens anywhere
- Status badges show full text (no more "PROPOSIN", "FINALIZE" cutoffs)
- Dashboard Recent Disputes + Live Transactions pull from real store
- AI verdict simulated 12s after dispute is filed
- Footer fully built out with 4 columns of links
- All action buttons use consistent glassy style (no more loud cyan pills)
- Empty states on every page
- Brand: LegxusAI throughout

---

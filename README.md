# LegxusAI — AI Dispute Resolution & Prediction Markets on GenLayer

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**

---

## What's Fixed in v2.0

- ✅ Global app state — disputes, predictions, transactions all connected
- ✅ Real MetaMask wallet connection (no more random addresses)
- ✅ File upload works — click or drag & drop evidence files
- ✅ Submitting a dispute adds it live to the disputes list + dashboard
- ✅ Staking on predictions updates YES/NO bars + volume in real time
- ✅ Create Market modal fully functional
- ✅ TX Explorer updates live when any action happens anywhere
- ✅ Status badges show full text (no more "PROPOSIN", "FINALIZE" cutoffs)
- ✅ Dashboard Recent Disputes + Live Transactions pull from real store
- ✅ AI verdict simulated 12s after dispute is filed
- ✅ Footer fully built out with 4 columns of links
- ✅ All action buttons use consistent glassy style (no more loud cyan pills)
- ✅ Empty states on every page
- ✅ Brand: LegxusAI throughout

---

## Deploy Contracts to GenLayer Testnet

```bash
# Install CLI
npm install -g @genlayer/cli

# Start local testnet
genlayer init
genlayer up

# Deploy
genlayer deploy --contract contracts/LegxusDisputeResolution.py --args 100
genlayer deploy --contract contracts/LegxusPredictionMarket.py --args 50
genlayer deploy --contract contracts/LegxusIntelligentOracle.py
```

Then update addresses in `src/lib/store.tsx`.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Routing | React Router v6 |
| State | React Context (global store) |
| Contracts | Python — GenVM SDK |
| Fonts | Syne + DM Sans + JetBrains Mono |

## Links
- [GenLayer Docs](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [genlayer-js SDK](https://github.com/genlayerlabs/genlayer-js)

# LegxusAI

LegxusAI is a focused dispute-adjudication application built for GenLayer Intelligent Contracts. The browser exposes filing, respondent acceptance or decline, and named-party evaluation requests through an injected wallet. Every accepted write is validated through the configured GenLayer receipt/trace route before the application refreshes canonical dispute state from the contract.

This release scope is advisory only. It does not receive, escrow, transfer, release, refund, or pay out GEN or any other asset. It also does not present prediction markets, a general-purpose oracle, or application-level appeal state as working GenLayer protocol functionality.

## Why GenLayer

Disputes often depend on unstructured descriptions and external evidence that ordinary deterministic contracts cannot interpret directly. GenLayer is relevant because an Intelligent Contract can perform nondeterministic reasoning and reach a consensus-backed result.

The repository is being remediated in controlled phases. The browser verifies public GitHub raw references, records their hashes and metadata, and keeps independent contract-side retrieval inside the GenVM nondeterministic leader/validator boundary. Protocol-appeal work remains explicitly deferred.

## Current Scope

Included:

- Dispute filing UI with verified public evidence references, injected-wallet signing, receipt validation, canonical identifier decoding, and post-write state refresh.
- Role- and status-gated respondent acceptance/decline controls and claimant/respondent evaluation requests.
- Contract-side GenVM leader/validator evaluation; the browser neither retrieves evaluation evidence nor computes an outcome locally.
- Typed `genlayer-js` public reads and injected-provider writes for the dispute contract.
- Shared, non-secret Studio and Bradbury environment configuration for frontend and Python/CLI workflows.
- Transaction and contract views without fabricated network totals or deployment facts.
- Advisory result language throughout the application.

Not included as working functionality:

- Prediction markets or general-purpose oracle contracts.
- GEN escrow, settlement, fees, stakes, or payouts.
- GenLayer protocol appeals.
- Complete network transaction history. The contract exposes canonical dispute state, but not a complete transaction index; the Explorer shows only locally retained hashes that are revalidated against GenLayer.
- Private browser-file upload, arbitrary providers, and claims of permanent storage or availability.
- Complete live lifecycle evidence. The reviewed contract is deployed on Studio, but respondent acceptance, GenVM evaluation, and finalized canonical-result proof remain separate review gates. No Bradbury deployment has been verified.

## Network And Toolchain

The pinned official CLI and SDK expose these selected targets:

| Purpose | Application value | CLI alias | Chain ID |
|---|---|---|---:|
| Development | `studio` | `studionet` | `61999` |
| Release validation | `bradbury` | `testnet-bradbury` | `4221` |

Exact tool versions verified and pinned during Phase 1:

- GenLayer CLI: `0.39.2`
- `genlayer-js`: `1.1.8`
- GenVM runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`

The repository-owned source is `config/genlayer_config.json`. `src/lib/genlayer/config.ts` consumes it and checks the selected chain ID against `genlayer-js`; `config/genlayer_config.py` exposes the same data to Python and CLI-oriented tooling. The active environment must be explicit, and unknown or empty values fail as not configured.

The CLI is an exact local development dependency, so project commands do not depend on a machine-global installation. Install dependencies and inspect the pinned CLI with:

```bash
npm ci
npm ls genlayer genlayer-js --depth=0
npm run genlayer -- --help
npm run genlayer -- network list
npm run genlayer -- network info
```

The machine-global Windows CLI shim observed from WSL during review is not part of this project workflow. Run the repository-local command in the same Node/npm environment that installed `node_modules`. After checking `npm run genlayer -- network --help`, the verified target-selection forms are:

```bash
npm run genlayer -- network set studionet
npm run genlayer -- network set testnet-bradbury
```

Select only the alias matching the active development or release-validation environment. These commands modify CLI configuration and are not run automatically by the application.

## Environment

Create local environment configuration from the names in `.env.example`:

```dotenv
VITE_GENLAYER_ENV=studio
VITE_DISPUTE_CONTRACT_ADDRESS=
```

Accepted browser environment values are `studio` and `bradbury`. The independently verified Studio address is recorded in `deployments/studio.json`; use it only with `VITE_GENLAYER_ENV=studio`. A contract address for any other environment must remain empty until independently verified there. Python/CLI-oriented checks use `GENLAYER_ENV` explicitly in the command and should select the same target as `VITE_GENLAYER_ENV`.

The Python configuration can be checked without invoking a global CLI:

```bash
GENLAYER_ENV=studio python3 -c "from config import get_config; print(get_config()['network']['alias'])"
```

No private key, mnemonic, keystore, or raw-key deployment helper belongs in this repository.

## Run Locally

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`.

Run the deterministic frontend adapter and evidence tests, then build the frontend with:

```bash
npm test
npm run test:sdk
npm run test:filing
npm run typecheck
npm run build
```

`npm test` is the aggregate deterministic gate: it runs the SDK/client/receipt/hydration/lifecycle tests and the evidence tests. `tests/sdk/lifecycle.test.ts` covers typed acceptance, decline, and evaluation writes with mocked SDK/provider clients; it is not labeled as live GenLayer integration. `npm run test:filing` is also available as the focused pre-signing boundary check. The live evidence-policy check uses Node's built-in test runner:

```bash
RUN_EVIDENCE_NETWORK=1 npm run test:evidence
```

This command is an explicitly labeled live-provider check and requires network access. It retrieves only the pinned public fixture and does not print its body. The official direct-mode contract tests use the pinned Python requirements:

```bash
python3 -m pip install -r requirements.txt
PYTHONPATH=. python3 -m pytest tests/direct -v
python3 -m genvm_linter.cli check contracts/LegxusDisputeResolution.py
python3 -m genvm_linter.cli schema contracts/LegxusDisputeResolution.py
python3 -m genvm_linter.cli typecheck contracts/LegxusDisputeResolution.py --strict
```

Direct mode validates contract behavior in memory; it is not a substitute for Studio multi-validator execution. Do not treat the deleted standalone fake runtime as protocol evidence.

## Architecture

```text
React application
  -> shared public project configuration
  -> typed environment and wallet-chain checks
  -> verified public evidence policy
  -> typed file / accept / decline / evaluate operations
  -> configured Studio leader-receipt or Bradbury trace validation
  -> LegxusDisputeResolution Intelligent Contract
  -> GenVM leader/validator evaluation
  -> canonical dispute state refresh and advisory record
```

Current trust boundaries and known gaps:

- Canonical dispute reads are authoritative. Local storage is limited to a versioned, network/contract/state-scoped cache used only when a canonical refresh is unavailable.
- The filing identifier is decoded from a verified `file_dispute` return value; no `get_total()+1` prediction is used.
- Lifecycle operations read the canonical dispute, then immediately re-read the injected provider's selected account and chain ID before constructing the official SDK wallet client. The respondent alone may accept or decline an `AWAITING_RESPONDENT` dispute; only its claimant or respondent may evaluate a `READY_FOR_EVALUATION` dispute. The contract repeats these authorization checks.
- Every lifecycle success requires an `ACCEPTED` or `FINALIZED` full transaction with an agreeing consensus result and `FINISHED_WITH_RETURN`. The adapter separately queries triggered transaction IDs and rejects emitted messages/child transactions. Return decoding is selected only from the configured network: Studio uses `consensus_data.leader_receipt`; Bradbury uses hash-bound `debugTraceTransaction({ hash, round: 0 })`, requiring a matching `transaction_id`, `result_code === 0`, and non-empty hexadecimal `return_data` before GenLayer calldata decoding. The routes never silently substitute for one another.
- Filing strictly decodes the returned canonical dispute identifier. Acceptance and decline strictly require `true`; evaluation strictly allows only `CLAIMANT_UPHELD`, `RESPONDENT_UPHELD`, or `UNDETERMINED`.
- The filing form accepts only verified GitHub raw commit references; failed pre-sign verification aborts the write and keeps the selected references available for retry/removal. Evidence-free filing requires explicit confirmation.
- Respondent acceptance reuses the same evidence policy and immediately reverifies selected references before signing. Evidence-free acceptance requires explicit confirmation and signs exactly `[]`.
- Successful lifecycle writes retain the full transaction hash and trigger a canonical contract-state refresh. The UI does not use a timer, local counter, optimistic verdict, or latest-record match to manufacture state.
- Transaction hashes are retained only as a scoped convenience index. A fresh browser can reconstruct disputes from `get_all_disputes`, but cannot reconstruct a complete historical transaction list because the contract does not expose one.
- Validator participation and protocol appeal information are intentionally omitted from the UI until sourced from canonical protocol data.

## Evidence Policy

Phase 3 uses `GITHUB_RAW_COMMIT_SHA256_V1`. A submitted reference must be an HTTPS URL on `raw.githubusercontent.com`, pinned to a lowercase 40-character Git commit SHA, with no credentials, query, fragment, redirect, or mutable branch path. The browser retrieves the bytes before submission and records the exact URL, SHA-256 hash, normalized MIME type, byte size, schema version, provider, and derived source identifier. The contract validates that metadata and independently retrieves and verifies the same bytes inside `run_nondet_unsafe` for both leader and validator execution.

At most three claimant references and three respondent references are accepted, with six references total. Each reference is a text, JSON, or XML resource no larger than 2,000 UTF-8 bytes; the complete accepted body is passed to the model. Duplicate URLs and duplicate hashes are rejected within and across parties. Browser redirects are rejected before signing; contract-side 3xx behavior is classified as a redirect source failure. HTTP errors, timeouts, unavailable sources, empty or oversized bodies, unsupported media, changed bytes, and metadata mismatches are explicit failures. Evidence-free filing requires an explicit user confirmation; a failed selected-reference verification aborts before signing.

Evidence URLs, hashes, metadata, and dispute context become public contract data. Submit only material already intended for public GitHub visibility. A commit-pinned URL binds the bytes to a repository revision, but it does not guarantee indefinite provider retention: repository deletion, access changes, provider outages, or network failure can still make retrieval unavailable. This release remains advisory-only; evidence storage, protocol appeals, and settlement are separate concerns.

See [docs/evidence-policy.md](docs/evidence-policy.md) for the exact schema, failure taxonomy, verification sequence, and test coverage.

## Deployment Manifest Shape

`deployments/studio.json` records the independently verified Studio deployment tied to source commit `33286c8f57f2bc0b517ccf1a1ec457f040e13ee1`. The template files retain null deployment fields and are not proof of another deployment. A reviewed manifest may contain only public deployment evidence:

- application and environment name;
- CLI network alias, chain ID, RPC, and explorer URL;
- public contract address and deployment transaction hash;
- CLI, SDK, and GenVM runner versions.

Credential material is never a manifest field. The Studio manifest proves deployed source/address/receipt facts only; it does not by itself prove filing, respondent authorization, evaluation, or final advisory state. See `deployments/README.md`.

## Project Structure

```text
contracts/
  LegxusDisputeResolution.py
config/
  genlayer_config.json
  genlayer_config.py
deployments/
  studio.json
  studio.template.json
  bradbury.template.json
src/
  components/layout/Layout.tsx
  lib/evidence/filing.ts
  lib/evidence/upload.ts
  lib/genlayer/config.ts
  lib/genlayer/client.ts
  lib/genlayer/types.ts
  lib/genlayer/disputes.ts
  lib/genlayer/transactions.ts
  lib/genlayer.ts
  lib/store.tsx
  pages/
    Dashboard.tsx
    DisputesPage.tsx
    FileDisputePage.tsx
    ExplorerPage.tsx
    ContractsPage.tsx
tests/
  direct/test_dispute_resolution.py
  sdk/client.test.ts
  sdk/types.test.ts
  sdk/transactions.test.ts
  sdk/hydration.test.ts
  sdk/lifecycle.test.ts
  evidence/filing.test.ts
  evidence/upload.test.ts
docs/
  evidence-policy.md
```

## References

- [GenLayer documentation](https://docs.genlayer.com)
- [GenLayer Studio](https://studio.genlayer.com)
- [GenLayer CLI](https://github.com/genlayerlabs/genlayer-cli)
- [genlayer-js](https://github.com/genlayerlabs/genlayer-js)
- [GenVM](https://github.com/genlayerlabs/genvm)

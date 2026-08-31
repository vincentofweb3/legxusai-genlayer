# GenLayer Validation Record

This document records the independently verified public Studio demonstration. It is an evidence guide, not a deployment script and not a claim that every GenLayer environment is supported.

## Scope and provenance

- Application: LegxusAI advisory dispute adjudication.
- Network: GenLayer Studio, CLI alias `studionet`, chain `61999`.
- Deployment record: [../deployments/studio.json](../deployments/studio.json).
- Reviewed application verifier checkpoint: `ba5cbcad44fc0a35819fde0f5f9cc3b40d94d1a9`.
- Reviewed deployed-source commit recorded by the manifest: `33286c8f57f2bc0b517ccf1a1ec457f040e13ee1`.
- Pinned CLI: `0.39.2`.
- Pinned `genlayer-js`: `1.1.8`.
- Pinned GenVM runner: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

The checkpoint identifies the application adapter and tests used for verification. The manifest identifies deployed source and public deployment facts. Neither contains credentials.

## Public transaction evidence

All three transactions were verified through the Studio receipt route. The adapter requires a full transaction-hash binding, an accepted or finalized status, an agreeing consensus result, a finished return, valid GenLayer calldata, no emitted messages, and no triggered child transactions.

| Operation | Public hash | Receipt invariants | Return decoding |
|---|---|---|---|
| `file_dispute` | `0x0d3c289df8bd3c2f141e9ff2e26858a5a0c766759b767b50f12d7d9574d1ed20` | `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN`, zero side effects | Two agreeing Studio returns decode to `DSP-0001` |
| `accept_dispute` | `0xb81751f7e393bdd2267ce6b2fc64d60263a23f481ef991c7db2154b4e55aa15f` | `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN`, zero side effects | Strict boolean `true`; the observed validator quorum-short-circuit record is accepted only when all five reviewed marker fields match exactly |
| `evaluate` | `0x0935963f09eeb8f83816a54e7526915d2345311e8535914473a8b09ad23e0dea` | `FINALIZED`, `MAJORITY_AGREE`, `FINISHED_WITH_RETURN`, zero side effects | Two agreeing returns decode to the allowed advisory outcome `UNDETERMINED` |

The Studio route reads `consensus_data.leader_receipt`. The exact non-fatal validator marker permitted by the adapter is `mode=validator`, `execution_result=ERROR`, `vote=idle`, `result.status=contract_error`, and `genvm_result.error_code=CONSENSUS_VALIDATOR_QUORUM_REACHED`. Other validator errors remain fatal. Bradbury uses a separate hash-bound public-trace route and is not represented by these Studio facts.

## Final canonical state

After the evaluation transaction, fresh reads of `get_state_version()` and `get_dispute("DSP-0001")` decode to:

| Field | Verified value |
|---|---|
| State version | `DISPUTE_STATE_V3` |
| Dispute ID | `DSP-0001` |
| Status | `FINALIZED` |
| Criteria status | `RESPONDENT_ACCEPTED` |
| Evaluation timestamp | non-empty |
| Verdict | `UNDETERMINED` |
| Evidence status | `AVAILABLE` |
| Evidence available / failed | `1` / `0` |
| Reason code | `INSUFFICIENT_EVIDENCE` |
| Source error code | `NONE` |
| Confidence bucket | `0` |
| Evidence sufficiency | `INSUFFICIENT` |
| Respondent evidence | empty |

The canonical record also preserves the filed title, description, named parties, reference amount/currency, and claimant evidence metadata. The public evidence policy is documented in [evidence-policy.md](evidence-policy.md); URLs, hashes, metadata, and dispute context are public contract data.

## Reproducible local validation

Run these commands from the repository root with Node.js 22.x and Python 3.12.x. They are deterministic/local checks unless explicitly labeled otherwise:

```bash
npm ci
npm run typecheck
npm test
npm run test:filing
npm ls genlayer genlayer-js --depth=0
npm audit --omit=dev
npm audit --audit-level=high
npm run build
```

The production audit must report zero vulnerabilities. The complete-tree audit rejects every high or critical advisory. The reviewed lockfile has two moderate development-only findings at `genlayer@0.39.2 -> dockerode@4.0.12 -> uuid@10.0.0`. They do not enter the browser production tree, and the pinned GenLayer CLI is retained instead of applying an unverified transitive UUID major override. Re-evaluate this exception when a reviewed CLI release updates the Docker dependency path.

Install the pinned Python/GenLayer toolchain before running the direct, integration, and GenVM gates:

```bash
python3 --version
python3 -m pip install --constraint constraints.txt -r requirements.txt
python3 scripts/check_dependency_pins.py --installed
```

The direct contract, read-only Studio integration, and GenVM gates are:

```bash
PYTHONPATH=. python3 -m pytest tests/direct -v
PYTHONPATH=. python3 -m pytest tests/integration -v -m integration -rs
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 python3 -m genvm_linter.cli check contracts/LegxusDisputeResolution.py
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 python3 -m genvm_linter.cli schema contracts/LegxusDisputeResolution.py
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 python3 -m genvm_linter.cli typecheck contracts/LegxusDisputeResolution.py --strict
rm -rf -- artifacts .pytest_cache
find contracts tests config -type d -name __pycache__ -prune -exec rm -rf -- {} +
bash scripts/check_repository_hygiene.sh
```

`requirements.txt` pins the reviewed GenLayer package commits and exact test/tool versions. `constraints.txt` records the resolved public dependency versions used by the validated Python 3.12 installation. Direct contract tests exercise the contract in the official in-memory/direct runner. The integration suite reads the three reviewed public transactions and canonical Studio state without signing, deploying, or changing network state. It skips only for DNS/TLS/socket/timeout or temporary 502/503/504 transport unavailability, and fails for malformed responses, RPC errors, missing or mismatched receipts, invalid calldata, or canonical-state mismatches. The GenVM commands select the reviewed `genlayerlabs/genvm` release bundle explicitly with `GENVM_REPO` and `GENVM_VERSION`; the contract's `py-genlayer` dependency hash remains pinned in its header. Python tests may create ignored `artifacts/`, `__pycache__/`, or `.pytest_cache/` output; remove those directories before the hygiene check. The three hashes above are the separate receipt-backed Studio evidence.

The same checks run in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) with immutable action revisions. CI builds to a temporary directory and removes all validation-generated output before its redacted hygiene and diff checks. No CI job has wallet credentials and no integration job performs a write.

## Sanitized read-only Studio check

The following repository-local SDK check reads public transaction hashes and canonical state. It prints only public hashes, lifecycle labels, decoded outcomes, counts, and booleans; it does not print raw receipts, contract/account addresses, account identifiers, calldata, evidence bodies, or credentials. It performs no write.

```bash
node --experimental-strip-types --input-type=module <<'NODE'
import fs from 'node:fs'
import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import {
  waitForValidatedTransaction,
  decodeCanonicalDisputeId,
  decodeSuccessfulBooleanReturn,
  decodeEvaluationOutcome,
} from './src/lib/genlayer/transactions.ts'
import { decodeCanonicalDispute } from './src/lib/genlayer/types.ts'

const manifest = JSON.parse(fs.readFileSync('deployments/studio.json', 'utf8'))
if (manifest.environment !== 'studio' || manifest.networkAlias !== 'studionet' || manifest.chainId !== 61999) {
  throw new Error('Studio manifest/network mismatch')
}
const client = createClient({ chain: studionet })
const contract = manifest.contractAddress
const checks = [
  {
    operation: 'file_dispute',
    hash: '0x0d3c289df8bd3c2f141e9ff2e26858a5a0c766759b767b50f12d7d9574d1ed20',
    decode: values => decodeCanonicalDisputeId(values),
  },
  {
    operation: 'accept_dispute',
    hash: '0xb81751f7e393bdd2267ce6b2fc64d60263a23f481ef991c7db2154b4e55aa15f',
    decode: values => decodeSuccessfulBooleanReturn(values, 'accept_dispute'),
  },
  {
    operation: 'evaluate',
    hash: '0x0935963f09eeb8f83816a54e7526915d2345311e8535914473a8b09ad23e0dea',
    decode: values => decodeEvaluationOutcome(values),
  },
]

for (const check of checks) {
  const transaction = await waitForValidatedTransaction(client, check.hash, {
    allowTriggeredTransactions: false,
    returnRoute: 'studio-receipt',
  })
  const decoded = check.decode(transaction.returnValues)
  console.log(JSON.stringify({
    operation: check.operation,
    hash: check.hash,
    status: transaction.status,
    consensus: transaction.result,
    execution: transaction.executionResult,
    decoded,
    triggeredTransactionCount: transaction.triggeredTransactionIds.length,
  }))
}

const stateVersion = await client.readContract({
  address: contract,
  functionName: 'get_state_version',
  args: [],
  jsonSafeReturn: false,
})
const rawDispute = await client.readContract({
  address: contract,
  functionName: 'get_dispute',
  args: ['DSP-0001'],
  jsonSafeReturn: false,
})
const dispute = decodeCanonicalDispute(rawDispute, 'get_dispute.DSP-0001')
if (
  stateVersion !== 'DISPUTE_STATE_V3'
  || dispute.status !== 'FINALIZED'
  || dispute.criteriaStatus !== 'RESPONDENT_ACCEPTED'
  || !dispute.evaluatedAt
  || dispute.verdict !== 'UNDETERMINED'
) throw new Error('canonical final-state assertion failed')
console.log(JSON.stringify({
  canonical: {
    stateVersion,
    disputeId: dispute.id,
    status: dispute.status,
    criteriaStatus: dispute.criteriaStatus,
    evaluatedAtPresent: Boolean(dispute.evaluatedAt),
    verdict: dispute.verdict,
    evidenceStatus: dispute.evidenceStatus,
    evidenceAvailable: dispute.evidenceAvailable,
    evidenceFailed: dispute.evidenceFailed,
    reasonCode: dispute.reasonCode,
    sourceErrorCode: dispute.sourceErrorCode,
    confidenceBucket: dispute.confidenceBucket,
    evidenceSufficiency: dispute.evidenceSufficiency,
  },
}))
NODE
```

If a public read encounters a transient RPC timeout or connection failure, repeat only the same read-only hash/state check with a bounded retry. Never retry a write because its submission state may be ambiguous.

## Scope boundaries and non-claims

- The verified lifecycle is Studio-only and advisory-only. A reference amount is context; the contract does not receive, escrow, transfer, release, refund, or pay out assets.
- No Bradbury deployment or Bradbury lifecycle evidence is claimed.
- Protocol appeals are not implemented; there is no application-level appeal substitute.
- Settlement, escrow, fees, bonds, stakes, payouts, transfers, and financial finality are out of scope.
- The contract does not expose a complete network transaction index. Locally retained hashes are a convenience index and are revalidated through the configured adapter.
- Commit-pinned GitHub evidence is public and may become unavailable through repository deletion, access changes, provider outages, or network failures.
- This record proves one reviewed Studio demonstration, not universal protocol availability or a legal judgment.

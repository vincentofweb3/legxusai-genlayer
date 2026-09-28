# LegxusAI Technical Complexity

This document exposes the parts of LegxusAI that are genuinely hard, and points at the exact file, line, and command that proves each claim. It is written for a reviewer who wants to verify the implementation rather than take a description on trust.

Every claim below is reproducible. Where a statement describes network behavior, the command that produced the observed evidence is named, and the evidence itself is public.

The eight sections follow the actual execution order: where nondeterminism enters, how external evidence is retrieved inside that boundary, how evidence is bound to immutable data, how leader and validator results are compared, how the Studio receipt's quorum short-circuit is handled, why the two receipt routes are not interchangeable, why the toolchain is pinned, and how all of it is driven from the browser.

---

## 1. Where GenLayer nondeterminism occurs

GenLayer nondeterminism in this application is confined to a single call site: `evaluate`.

- `contracts/LegxusDisputeResolution.py:861` — `evaluate` is the only entry point that reaches the nondeterministic boundary.
- `contracts/LegxusDisputeResolution.py:885` — `leader_fn` is the leader's execution body.
- `contracts/LegxusDisputeResolution.py:896` — `validator_fn` is the validator's comparison body.
- `contracts/LegxusDisputeResolution.py:924` — `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` is the boundary itself. The runner name is accurate: the leader function is *not* trusted, and the validator independently decides whether to accept its output.

The other three writes — `file_dispute` (`:744`), `accept_dispute` (`:809`), and `decline_dispute` (`:846`) — are fully deterministic. They do no network I/O and no model inference. The only non-deterministic-looking value they touch is `gl.message_raw["datetime"]` (`:801`, `:841`, `:937`), which is supplied by the node's message envelope rather than by contract logic.

Two design details matter more than the call site:

**Storage is copied before the boundary.** `contracts/LegxusDisputeResolution.py:872-883` copies `title`, `description`, `claimant`, `respondent`, `amount`, `currency`, and the evidence snapshots into plain locals *before* `run_nondet_unsafe` is called. The nondeterministic code never reads `self.disputes`. This means the leader and validator cannot observe divergent storage, and the evaluation input is fixed at the moment the transaction was accepted.

**All persistent writes happen after consensus.** `contracts/LegxusDisputeResolution.py:927-938` writes the verdict, confidence, sufficiency, reason, source error, evidence status, evidence counts, final status, and timestamp only *after* `run_nondet_unsafe` returns. There is no path by which a partially-evaluated or speculative verdict is written to storage, and no path by which a rejected leader result is persisted.

### Proving it

```bash
grep -n "run_nondet_unsafe\|gl.nondet\." contracts/LegxusDisputeResolution.py
```

Expected: exactly one `run_nondet_unsafe` call, and every `gl.nondet.*` call nested beneath it.

```bash
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 \
  .venv/bin/python -m genvm_linter.cli check contracts/LegxusDisputeResolution.py
```

The GenVM linter enforces that nondeterministic entry points are not reachable from deterministic code paths. A violation fails this command.

---

## 2. How the leader retrieves external evidence

Retrieval happens inside the nondeterministic block, not before it.

- `contracts/LegxusDisputeResolution.py:412` — `_fetch_evidence` is the retrieval routine.
- `contracts/LegxusDisputeResolution.py:431` — `gl.nondet.web.get(url)` is the actual HTTP call, and it is a `gl.nondet.*` primitive, so it can only execute inside `run_nondet_unsafe`.
- `contracts/LegxusDisputeResolution.py:581` — `_run_advisory_evaluation` calls `_fetch_evidence` first, before any model call.
- `contracts/LegxusDisputeResolution.py:608` — `gl.nondet.exec_prompt(prompt, response_format="json")` is the second nondeterministic primitive: model inference.

This ordering is the substantive point. A conventional deterministic contract *cannot* call `gl.nondet.web.get` at all, and cannot call a language model at all. The reason this project needs GenLayer is precisely that evidence retrieval and interpretation both happen after the transaction is accepted and are executed independently by leader and validators. See [ARCHITECTURE.md](ARCHITECTURE.md#genvm-nondeterministic-boundary).

Retrieval is verified, not trusted. Each response is checked in order and any failure is classified rather than swallowed:

| Check | Line | Failure classification |
|---|---|---|
| HTTP status outside 2xx | `:433` | `REDIRECT` / `HTTP_CLIENT` / `HTTP_SERVER` by class |
| Media type supported and matches the recorded MIME | `:445`, `:450` | `MEDIA` |
| Body within the 2,000-byte policy limit | `:400`, `:456` | `TOO_LARGE` |
| Non-empty body | `:462` | `EMPTY` |
| Byte length equals the recorded size | `:467` | `SIZE_MISMATCH` |
| SHA-256 equals the recorded hash | `:472` | `HASH_MISMATCH` |
| Body decodes as UTF-8 | `:478` | `MEDIA` |
| Any unexpected exception | `:490` | `UNAVAILABLE` |

The first failure classification is retained as `source_error_code` and both counters (`evidence_available`, `evidence_failed`) are carried into the advisory result (`contracts/LegxusDisputeResolution.py:502-508`). A partial retrieval produces `EVIDENCE_PARTIAL` with a non-`NONE` source error rather than being silently treated as success.

Prompt construction at `contracts/LegxusDisputeResolution.py:585-605` marks the evidence body as untrusted data and instructs the model to ignore instructions inside it. The evidence text is delimited under an `EVIDENCE:` header, and the model is required to return JSON only with two fields.

### Proving it

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/direct -q \
  -k "leader_and_validator or partial_evidence or metadata_mismatch or http_redirect or http_empty"
```

These tests drive the retrieval and classification logic in the official direct runner with controlled web responses, and assert the specific classification each failure produces.

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/direct -q \
  -k "maximum_accepted_body or one_byte_over_policy"
```

These confirm the size boundary is enforced on the real body handed to the model, not approximated.

---

## 3. How evidence is bound to hashes and metadata

The binding is enforced twice — once in the browser before signing, and again independently inside the contract. Neither side trusts the other's claim.

### Browser side (pre-signing)

- `src/lib/evidence/upload.ts:10` — policy identity is `GITHUB_RAW_COMMIT_SHA256_V1`, matching the contract's `EVIDENCE_POLICY_VERSION` at `contracts/LegxusDisputeResolution.py:35`.
- `src/lib/evidence/upload.ts:107` — the host must be exactly `raw.githubusercontent.com`.
- `src/lib/evidence/upload.ts:242` — `redirect: 'error'`, so a redirect is rejected before it can be followed; `:248`, `:256`, and `:258` additionally reject a redirect that the fetch layer reports.
- `src/lib/evidence/upload.ts:316` — `reverifyEvidenceReferences` re-fetches every selected reference immediately before a write, then compares the recomputed hash, MIME type, and size against what was originally recorded (`:344`, `:350`).
- `src/lib/evidence/filing.ts:11` — `writeWithConfirmedEvidence` enforces the evidence-free confirmation *and* then routes through reverification, so confirmation alone cannot bypass the re-check.

The browser check is a safeguard, not authority. Its result is discarded by the contract.

### Contract side (authoritative)

- `contracts/LegxusDisputeResolution.py:221` — `_validate_evidence_url` is the URL policy; `:250` pins the host, and `:206` (`_is_public_dns_host`) rejects non-public / private-address hosts so a permitted URL cannot be aimed at internal infrastructure.
- `contracts/LegxusDisputeResolution.py:302` — `_validate_content_hash` requires a well-formed SHA-256.
- `contracts/LegxusDisputeResolution.py:294` — `_expected_source_id` **derives** the source identifier from the URL, and `:364` rejects any submitted `source_id` that does not equal the derived value. The client cannot label its own evidence; the identifier is a function of the URL.
- `contracts/LegxusDisputeResolution.py:317` — `_validated_references` enforces the count, per-party quotas, and URL/hash uniqueness within a filing (`:366`).
- `contracts/LegxusDisputeResolution.py:384` — `_evidence_snapshot` produces the fixed-shape tuple passed into the nondeterministic block, so the retrieval code cannot reach any other contract state.
- `contracts/LegxusDisputeResolution.py:825-835` — cross-party uniqueness is enforced at acceptance: a respondent may not re-submit a URL or a content hash the claimant already used, and the combined total may not exceed six.

The two sides implement the same policy independently. That is deliberate: a bug or a lie in the browser does not change what the contract accepts.

### Proving it

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/direct -q \
  -k "source_id_boundary or count_and_cross_party_duplicates or three_references_per_party or leader_and_validator"
```

`test_source_id_boundary_matches_browser_policy` is the direct cross-implementation check: it asserts the contract's derived source identifier equals the browser's `evidenceSourceId` for the same URL.

```bash
npm run test:filing
```

This exercises the pre-signing boundary, including that a failed verification aborts before a write and leaves the selected references available for retry or removal.

---

## 4. How validator equivalence is handled

The validator does not re-run-and-trust. It re-runs *and compares*, and the comparison is rule-based rather than a naive equality check.

- `contracts/LegxusDisputeResolution.py:616` — `_result_is_valid` is the structural gate. It rejects any result whose enums are outside the allowed sets, whose `confidence_bucket` is not an integer in `[0, 10]`, whose counts are negative, or whose `evidence_available + evidence_failed` exceeds the six-reference total (`:645`).
- `contracts/LegxusDisputeResolution.py:656-669` — the gate also enforces internal consistency: `UNDETERMINED` requires `confidence_bucket == 0` and `INSUFFICIENT` sufficiency and one of the three permitted reason codes; `CLAIMANT_UPHELD` and `RESPONDENT_UPHELD` each require their own matching reason code. A model cannot claim certainty it did not earn.
- `contracts/LegxusDisputeResolution.py:671-678` — `evidence_status` is cross-checked against the counters: `AVAILABLE` requires `available > 0` and `failed == 0`, `UNAVAILABLE` requires `available == 0` and `failed > 0`, and so on. Status cannot be asserted independently of the observed retrieval outcome.
- `contracts/LegxusDisputeResolution.py:682` — `_results_equivalent` runs both results through `_result_is_valid` first, then compares seven fields exactly: `outcome`, `evidence_sufficiency`, `reason_code`, `evidence_status`, `source_error_code`, `evidence_available`, `evidence_failed`.
- `contracts/LegxusDisputeResolution.py:698-703` — the one intentionally tolerant comparison is `confidence_bucket`. If the outcome is `UNDETERMINED` both buckets must be exactly `0`; otherwise they may differ by at most `SCORE_BUCKET_TOLERANCE = 1` (`:31`).

That tolerance is the interesting design decision. Two independent model runs against the same evidence will frequently not produce byte-identical confidence values. Demanding exact equality there would reject honest evaluations for a reason that has no bearing on whether the adjudication is sound. Demanding nothing there would let two runs disagree about how strong the evidence is. A tolerance of exactly one bucket, combined with exact agreement on the outcome, sufficiency, reason, and every evidence counter, keeps the tolerant field tolerant without letting it carry the decision.

The validator's error path is separately structured at `contracts/LegxusDisputeResolution.py:897-914`. If the *leader* failed, the validator re-runs the evaluation to determine whether the failure is reproducible:

- `[LLM_ERROR]` → the validator returns `False` immediately without re-running. A malformed model response is not an environmental condition; it will not improve on a retry.
- `[EXTERNAL]` → the validator re-runs and requires the identical error message. A transient fetch difference must reproduce exactly.
- `[TRANSIENT]` → the validator re-runs and requires the same error class, allowing a different message.
- `[EXPECTED]` and anything else → the validator returns `False`.

`contracts/LegxusDisputeResolution.py:710` — `_error_class` performs this prefix-based classification over `[LLM_ERROR]`, `[EXTERNAL]`, `[TRANSIENT]`, `[EXPECTED]`.

On the success path, `contracts/LegxusDisputeResolution.py:917-920` the validator executes its own `leader_fn()` and returns `_results_equivalent(...)`. Note that the validator's independent result is discarded if equivalence fails; only the leader's result is persisted.

### Proving it

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/direct -q \
  -k "validator_rejects_changed or confidence_bucket_tolerance or malformed_model"
```

- `test_validator_rejects_changed_source_result` asserts a diverging validator result is rejected.
- `test_confidence_bucket_tolerance_is_one` asserts the boundary is exactly ±1.
- `test_malformed_model_response_is_classified_as_llm_error` asserts the `[LLM_ERROR]` path.

```bash
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 \
  .venv/bin/python -m genvm_linter.cli typecheck contracts/LegxusDisputeResolution.py --strict
```

The strict typecheck is what forces the `cast` discipline in `_results_equivalent` and `_result_is_valid` to be explicit rather than implicit.

---

## 5. `CONSENSUS_VALIDATOR_QUORUM_REACHED` and why its trust is narrow

The observed `accept_dispute` receipt for `DSP-0001` contains a validator entry that is *not* a successful execution, yet the transaction is `FINALIZED` / `MAJORITY_AGREE`. Understanding this is the single most important thing a reviewer can check in the receipt adapter, because getting it wrong in either direction is a real bug.

### What the marker is

`CONSENSUS_VALIDATOR_QUORUM_REACHED` is a GenVM outcome, not an application concept. It records that a validator stopped participating because consensus was already decided by the quorum of validators that had reported. It is a **short-circuit notice**, not an adjudication and not a failure of the operation. The transaction was still finalized with a majority-agree consensus result and a finished return.

### How it is detected

- `src/lib/genlayer/transactions.ts:191` — `STUDIO_QUORUM_SHORT_CIRCUIT_ERROR`.
- `src/lib/genlayer/transactions.ts:193` — `isStudioQuorumShortCircuitValidator`.

### The five conditions that must all hold

The marker is recognized only when **all five** of these are simultaneously true:

| Field | Required value |
|---|---|
| `mode` | `validator` |
| `execution_result` | `ERROR` |
| `vote` | `idle` |
| `result.status` | `contract_error` |
| `genvm_result.error_code` | `CONSENSUS_VALIDATOR_QUORUM_REACHED` |

It is a conjunction of five independent field checks, none of which is optional and none of which is inferred.

### Where it is applied

- `src/lib/genlayer/transactions.ts:230` — in `decodeLeaderReturnValues`, the matching entry is **filtered out** before return-value decoding. It is never decoded, because it has no return value to decode.
- `src/lib/genlayer/transactions.ts:298` — in `validateStudioExecution`, the matching entry returns early and skips the `execution_result === 'SUCCESS'` requirement.
- `src/lib/genlayer/transactions.ts:312` — independent of the filter, the receipt must still contain **exactly one** leader execution. The short-circuit cannot be used to mask the absence of a leader.
- `src/lib/genlayer/transactions.ts:282` — consensus is still required to be `AGREE` or `MAJORITY_AGREE`, and `:354` still requires `ACCEPTED` or `FINALIZED`. The short-circuit grants no exemption from either.
- `src/lib/genlayer/transactions.ts:368` — messages and triggered transactions are still rejected for this operation.

### Why the trust must stay this narrow

A blanket rule of "ignore validator errors" would be a genuine vulnerability, and the conditions exist to prevent it. The reasoning behind each one:

- **`mode === 'validator'`** — a leader with the same error signature is a failed adjudication, not a quorum notice. The leader is the one whose result is actually persisted; a leader that errored must never be waved through.
- **`vote === 'idle'`** — this is the strongest single discriminator. A validator that attempted and failed a vote is reporting a real disagreement, and its `genvm_result` would carry a different code. `idle` is the signature of a node that simply stopped because the decision was already made. Without this check, any `contract_error` validator entry with a matching error code would be admitted regardless of whether the validator actually evaluated anything.
- **`result.status === 'contract_error'`** — ensures the entry is a VM-level error envelope and not a partially-populated success record being misread.
- **`execution_result === 'ERROR'`** — stated explicitly rather than assumed, so the check fails closed if Studio's field set changes. If GenLayer ever renamed or dropped this field, the adapter would stop recognizing the marker and reject the receipt, which is the correct failure direction.
- **`genvm_result.error_code === 'CONSENSUS_VALIDATOR_QUORUM_REACHED'`** — the exact code, compared by equality, not by substring or prefix. A different quorum-adjacent code is a different condition and stays fatal.

The general principle: relaxing validation is safe only when the relaxation is *narrower* than the set of things that could be wrong. A 5-field conjunction whose discriminating condition is `vote === 'idle'` plus an exact error-code match is narrow. Anything that admits errors by category, by error presence, or by "the overall transaction succeeded" is not — because overall success is exactly the thing an over-broad rule would be assuming in order to prove overall success.

Any other validator error remains fatal and throws a `GenLayerTransactionError` with kind `execution` (`src/lib/genlayer/transactions.ts:302`).

### Proving it

```bash
npm run test:sdk
```

- `tests/sdk/transactions.test.ts:118` — `accepts the exact Studio validator quorum-short-circuit marker`.
- `tests/sdk/transactions.test.ts:149` — `rejects altered Studio quorum-short-circuit markers`. This is the important one: it mutates marker fields and asserts rejection, which is what demonstrates the trust is conditional rather than categorical.
- `tests/sdk/fixtures.ts:137` — the fixture that produces the marker.

Against the real network:

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/integration -q -m integration -rs
```

`tests/integration/test_studio_lifecycle.py:143` applies an independent Python re-implementation of the same narrow rule to the **real** `accept_dispute` receipt `0xb81751f7…`: any validator entry whose `execution_result` is `ERROR` must match `QUORUM_MARKER` (`:46`) on `mode`, `execution_result`, `vote`, and `error_code`, or the test fails with "receipt contains an unexpected validator error". It additionally checks that the marker's `result` decodes as a GenVM contract-error payload with result byte `2` (`:164`), and that the receipt holds exactly one leader (`:175`) and at most one marker (`:178`).

So the condition is not only a test fixture — the real deployed receipt exhibits it, and a second implementation independently confirms it. The Python integration check derives the same four marker fields the adapter derives; the adapter additionally requires `result.status === 'contract_error'`, which the integration check covers structurally via the result-code byte instead.

The observed marker values are recorded in [GENLAYER_VALIDATION.md](GENLAYER_VALIDATION.md#public-transaction-evidence).

---

## 6. Studio receipt validation vs. Bradbury debug-trace validation

These are two different return-data transports with different failure modes. Treating them as interchangeable would be unsound, so the adapter selects between them explicitly and never falls back.

The selection is a function of the configured network, made once:

- `src/lib/genlayer/disputes.ts:84` — `transactionReturnRouteForNetwork` returns `studio-receipt` for the `studio` environment and `public-trace` for everything else.
- `src/lib/genlayer/disputes.ts:90` — `configuredTransactionReturnRoute` is the application-level accessor.
- `src/lib/genlayer/transactions.ts:47` — the `TransactionReturnRoute` union type makes the two routes the only legal values.

### Where they differ

| Aspect | Studio (`studio-receipt`) | Bradbury (`public-trace`) |
|---|---|---|
| Return data location | `consensus_data.leader_receipt` | `debugTraceTransaction({ hash, round: 0 })` |
| Decoded by | `decodeLeaderReturnValues` (`transactions.ts:228`) | `decodePublicTraceReturnValues` (`transactions.ts:206`) |
| Per-execution check | `validateStudioExecution` (`:288`) — each entry's `execution_result` must be `SUCCESS`, plus a decodable return envelope | `validatePublicExecution` (`:318`) — transaction-level `txExecutionResultName` must be `FINISHED_WITH_RETURN` |
| Consensus field name | `result_name` | `resultName` |
| Trust anchor | The receipt is accepted only if it carries exactly one leader execution; return values are the decoded leader/validator envelopes | The trace is accepted only if `transaction_id` matches the submitted hash, `result_code === 0`, and `return_data` is non-empty hexadecimal |

The divergence is concrete and appears in code: `readConsensusResult` at `src/lib/genlayer/transactions.ts:280` reads a *different field name* depending on route. A single field name would be a bug, not a simplification.

### Why they cannot be treated as identical

Four reasons, each of which would produce a false success or a false failure if the routes were unified:

**The proof structure differs.** Studio has no transaction-level `txExecutionResultName`; `src/lib/genlayer/transactions.ts:307-310` documents this and derives `FINISHED_WITH_RETURN` instead from a successful `execution_result` plus a decodable return envelope on every entry. Bradbury has that field and does not carry the same per-entry structure. Neither route's evidence exists in the other.

**The return payload encoding differs.** The Studio path handles two envelope shapes — a base64 string, or a `{ status: 'return', payload: { raw: [...] } }` object (`src/lib/genlayer/transactions.ts:179`) — and strips a leading GenVM result-code byte that must be `0` (`:170-177`). The Bradbury path receives `return_data` as a `0x`-prefixed hex string that is decoded directly, with no result-code byte (`:221-225`). Sharing a decoder would mean branching on every field anyway, which is the same code with less clarity about why the branches exist.

**The quorum short-circuit applies to exactly one route.** The marker in section 5 is a property of Studio's `consensus_data.leader_receipt` entries. The Bradbury trace path has no equivalent entry list. A unified validator would either apply a Studio-only exception to Bradbury data or lose it for Studio — both wrong.

**A silent fallback is a verification bypass.** If Studio validation failed and the adapter quietly retried on the trace route, then a genuinely malformed Studio receipt would be re-validated against a *different* data source and could pass. The success would then not prove what it claims to prove. This is why `decodeNetworkReturnValues` at `src/lib/genlayer/transactions.ts:385-401` switches on the route exactly once and has no fallback branch, and why route selection is derived from configuration rather than from a capability probe.

### Scope limit

Only the Studio route has been verified against a real deployment. `deployments/bradbury.template.json` retains null deployment fields, and no Bradbury lifecycle evidence is claimed. The Bradbury route is implemented and type-checked, but is not demonstrated.

### Proving it

```bash
npm run test:sdk
```

`tests/sdk/transactions.test.ts` covers both routes independently. The Studio route is pinned to the exact Studio projection — `:107` asserts the fixture has no `resultName` and no `txExecutionResultName` — while `:39` asserts the Bradbury receipt has no `consensus_data` at all. Route selection is asserted behaviorally rather than structurally: `:275` injects a `debugTraceTransaction` that throws on the Studio client and asserts the exact call sequence was `['wait', 'get', 'triggered']` with **no** `trace` call, then does the reverse for Bradbury and asserts `['wait', 'get', 'triggered', 'trace']`. `:258` covers six unbound or malformed Bradbury trace failures, each asserted to fail with a specific error kind.

```bash
npm run typecheck
```

The `TransactionReturnRoute` union at `src/lib/genlayer/transactions.ts:47` means any new route must be handled at every switch, or compilation fails.

---

## 7. Why the GenVM runner and toolchain are pinned

The contract header pins a specific GenVM build, and the rest of the toolchain is pinned to matching versions. This is not decoration; it is what makes section 4's equivalence rules meaningful.

### The pins

| Component | Pinned value | Where |
|---|---|---|
| GenVM runtime | `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` | `contracts/LegxusDisputeResolution.py:1` |
| Linter/validator release | `genlayerlabs/genvm` `v0.3.0-rc7` | `GENVM_REPO` / `GENVM_VERSION` in README, `docs/GENLAYER_VALIDATION.md`, and `.github/workflows/ci.yml:59-60` |
| CLI | `0.39.2` | `package.json` `devDependencies`, `config/genlayer_config.json` |
| SDK | `genlayer-js` `1.1.8` | `package.json` dependencies, `config/genlayer_config.json` |
| Python packages | reviewed source commits | `requirements.txt` |
| Resolved Python deps | exact versions | `constraints.txt` |

### Why each pin is load-bearing

**The GenVM pin is a semantic contract, not a build setting.** GenVM implements the nondeterministic boundary. The leader and validator run the same `leader_fn` in that runtime. The equivalence rules in section 4 were chosen against this runtime's behavior — including the `CONSENSUS_VALIDATOR_QUORUM_REACHED` code in section 5, which is a GenVM-emitted value. A different GenVM build could change error codes, `gl.nondet.web.get` response shape, or execution-result naming, and the adapter's carefully narrowed exceptions would then silently stop matching. Pinning the hash means a mismatch surfaces as a *rejection* (fail-closed) rather than as a widened acceptance.

The `# { "Depends": ... }` header at `contracts/LegxusDisputeResolution.py:1` is read by the GenVM runtime at deployment time. The same hash is recorded independently in `deployments/studio.json` as `genvmRunner`, and cross-checked against the contract by a reviewer with `sha256sum contracts/LegxusDisputeResolution.py`.

**The linter release is pinned because the validation gates are part of the claim.** `genvm_linter` performs the check, schema, and strict-typecheck passes. A different linter release can change what passes. The `GENVM_REPO` and `GENVM_VERSION` variables make the selection explicit in every command rather than implicit in whatever happens to be installed.

**The SDK is pinned because the adapter parses SDK-shaped network data.** `src/lib/genlayer/transactions.ts:2-3` imports `TransactionStatus` and the hash type from `genlayer-js/types`, and `:134` calls `abi.calldata.decode`. The receipt and calldata shapes the adapter validates are the shapes this SDK version produces. The strict dependency in `package.json` (`"genlayer-js": "1.1.8"`, no caret) plus the root `overrides` block means `npm ci` reproduces the exact tree.

**`config/genlayer_config.json` is cross-checked against the SDK at import time.** `src/lib/genlayer/config.ts:20-27` throws if the project's chain ID, label, RPC URL, or explorer URL disagree with what `genlayer-js` defines for that environment. A config that drifts from the pinned SDK fails the build rather than silently reading the wrong network. `npm run typecheck` exercises this module.

**Python pins are exact.** `requirements.txt` pins the three GenLayer packages to reviewed commits; `constraints.txt` pins their resolved public dependencies. `scripts/check_dependency_pins.py --installed` verifies the installed environment matches. The CI job at `.github/workflows/ci.yml:70-74` runs that check as a gate.

### Proving it

```bash
sha256sum contracts/LegxusDisputeResolution.py
# 5ce02d7a02abc502be3bce65cffdd3da2f72c20cbe79c0bf36d5817e2dfd67c5
```

This must equal `sourceSha256` in `deployments/studio.json`, which is the deployed source, and it proves the reviewed contract is the deployed contract.

```bash
.venv/bin/python scripts/check_dependency_pins.py --installed
npm ls genlayer genlayer-js --depth=0
```

```bash
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 \
  .venv/bin/python -m genvm_linter.cli check contracts/LegxusDisputeResolution.py
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 \
  .venv/bin/python -m genvm_linter.cli schema contracts/LegxusDisputeResolution.py
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 \
  .venv/bin/python -m genvm_linter.cli typecheck contracts/LegxusDisputeResolution.py --strict
```

The GenVM strict typecheck requires `.venv/bin` on `PATH` because it shells out to the pinned `pyright`. Running it against `.venv/bin/python` without an activated environment fails with `pyright not found`.

### The direct-mode tests run the pinned runner, not an approximation

This is worth stating explicitly, because "in-memory direct mode" can reasonably be read as a mock. It is not one. The 32 tests in `tests/direct/` execute the contract against the **byte-exact GenVM runner hash the contract header pins**.

The chain is:

1. `genlayer-test` `0.29.2` registers a `pytest11` entry point named `gltest_direct`, pointing at `gltest.direct.pytest_plugin`. Verify with `.venv/bin/python -c "import importlib.metadata as m; print([e.value for e in m.distribution('genlayer-test').entry_points if e.name=='gltest_direct'])"`.
2. That plugin's `direct_deploy` fixture delegates to `gltest.direct.loader.deploy_contract`, which at `loader.py:46-47` calls `setup_sdk_paths(contract_path, sdk_version)`.
3. `gltest.direct.sdk_loader` reads the **contract's own header**. Its regex is `"Depends":\s*"([^:]+):([^"]+)"` (`sdk_loader.py:44-45`), which matches `contracts/LegxusDisputeResolution.py:1` directly. The runner to use is not hardcoded in the test suite; it is derived from the contract under test.
4. Transitive dependencies are resolved by parsing each runner's own `runner.json` (`sdk_loader.py:226-238`). The `py-genlayer` runner manifest declares `py-lib-genlayer-std:11rhn002…`, `py-lib-cloudpickle:1dlk6mnf…`, and `cpython:1bk9g3zg…`.
5. Resolved runners are inserted at the front of `sys.path` (`sdk_loader.py:293-294`), which is what makes the `genlayer` module importable *only* inside a direct-test session.

The result is directly observable:

```bash
.venv/bin/python -c "import genlayer"
# ModuleNotFoundError: No module named 'genlayer'
```

This failure outside pytest is expected, not a broken environment. It is the signature of a runtime that is assembled per-test from the contract's declared pins rather than being a site-wide install.

And the resolved runner on disk matches the contract header exactly:

```bash
ls ~/.cache/gltest-direct/extracted/v0.3.0-rc7/py-genlayer/
# 1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6

ls ~/.cache/gltest-direct/extracted/v0.3.0-rc7/py-lib-genlayer-std/
# 11rhn002yfajawsz7fai6mykznbxkxs6l91iskj5cm82c92qhy3v
```

The first is the hash pinned at `contracts/LegxusDisputeResolution.py:1` and recorded as `genvmRunner` in `deployments/studio.json`. The second is the transitive standard library that the first declares.

This closes the loop with section 4. The equivalence rules and the `SCORE_BUCKET_TOLERANCE` bound are asserted against a specific runtime, and the direct suite runs against that exact runtime — so a behavioral change in GenLayer cannot silently invalidate the test suite the way it could against a stub.

To see the pin extracted from the contract header yourself:

```bash
.venv/bin/python -c "
import re, pathlib
c = pathlib.Path('contracts/LegxusDisputeResolution.py').read_text()
print([f'{m.group(1)}:{m.group(2)}' for m in re.finditer(r'\"Depends\":\s*\"([^:]+):([^\"]+)\"', c)])
"
# ['py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6']
```

---

## 8. The real client read/write path from the frontend

This section exists because a Portal reviewer previously concluded that the application simulated transactions in browser state. The following is the actual call chain, end to end, for the filing write.

### Filing write

1. **`src/pages/FileDisputePage.tsx:73`** — the form calls `addDispute` from the store with typed draft fields. No transaction is constructed here.
2. **`src/lib/store.tsx:429`** — `addDispute` checks configuration (`:430`) and requires an injected wallet (`:434`), then sets processing state.
3. **`src/lib/store.tsx:445`** — the write is wrapped in `writeWithConfirmedEvidence`, which enforces the evidence-free confirmation and re-verifies every selected reference immediately before the write (`src/lib/evidence/filing.ts:11`, `src/lib/evidence/upload.ts:316`).
4. **`src/lib/genlayer/disputes.ts:158-160`** — `fileDisputeOnChain` requires the configured network and a verified contract address, then obtains a wallet client.
5. **`src/lib/genlayer/client.ts:213`** — `getWalletClient` calls `requireWalletWriteState` (`:181`), which reads `eth_accounts` and `eth_chainId` and **throws if the chain is not the configured chain** (`:191`). Only then is an SDK client constructed with the injected provider.
6. **`src/lib/genlayer/disputes.ts:163`** — `client.writeContract({ address, functionName: 'file_dispute', args: [...], value: 0n })`. This is the actual SDK call. The wallet signs. The returned value is a real transaction hash.
7. **`src/lib/genlayer/disputes.ts:173`** — the hash is decoded strictly against a full 32-byte pattern (`src/lib/genlayer/transactions.ts:94`) and reported immediately via `onSubmitted` (`:174`) so the UI can display it.
8. **`src/lib/genlayer/disputes.ts:175`** — `waitForValidatedTransaction` polls to an accepted state and then validates the receipt.
9. **`src/lib/genlayer/transactions.ts:335`** — `validateSuccessfulTransaction` enforces full-hash binding, accepted/finalized status, agreeing consensus, route-specific execution validation, and zero messages and triggered transactions.
10. **`src/lib/genlayer/disputes.ts:179`** — the dispute ID is decoded from the contract's return value, never predicted.

### The lifecycle writes

Accept, decline, and evaluate share `submitLifecycleWrite` at `src/lib/genlayer/disputes.ts:217`. The ordering there is deliberate and worth reading closely:

- `:229` — the canonical dispute is **read first**.
- `:231-234` — the account and chain are re-read from the injected provider *only after* the canonical read, immediately before the signing client is built. The in-code comment states the reason: it prevents a changed account or chain from being authorized against stale wallet state.
- `:238` — `assertLifecycleAuthorization` checks the canonical record against the freshly-read account. Only the respondent may accept or decline an `AWAITING_RESPONDENT` dispute; only a named party may evaluate a `READY_FOR_EVALUATION` dispute.
- `:244` — the write is submitted.

`src/lib/genlayer/disputes.ts:192` is where the browser-side role check lives, and it is a UX guard only. The contract repeats the same checks independently at `contracts/LegxusDisputeResolution.py:815-819` (respondent-only accept/decline) and `:865-870` (named-party evaluate). A compromised browser cannot bypass the contract.

### Canonical reads

- `src/lib/genlayer/disputes.ts:115` — `hydrateCanonicalDisputes` reads `get_state_version` and then `get_all_disputes` through the typed SDK.
- `src/lib/genlayer/disputes.ts:125` — if the returned state version is not `DISPUTE_STATE_V3`, the read is rejected with a decode error rather than rendered. The `sourceSha256`-pinned contract and the browser must agree on the state schema.
- `src/lib/genlayer/disputes.ts:137` — `readCanonicalDispute` reads a single record.
- `src/lib/store.tsx:231` — `refreshCanonicalState` is called after every validated write (`:477`, `:561`).
- `src/lib/store.tsx:271` — if a canonical refresh fails, a **cache scoped to the exact chain ID, contract address, and state version** may be shown, and the UI states that the source was the cache. `src/lib/store.tsx:266-270` — if the failure is a *decode* failure, the cache and the known-transaction index are both deleted rather than displayed, because a schema mismatch means cached data cannot be trusted at all.

### What the browser never does

This is the direct answer to the previous rejection:

- It never constructs a transaction hash. Every hash originates from `writeContract` or is read back from the network.
- It never computes a verdict. The browser cannot retrieve evaluation evidence and does not run a model. `evaluate` returns a string that the adapter decodes against a three-value allowlist (`src/lib/genlayer/transactions.ts:157`).
- It never predicts a dispute identifier. The ID comes from decoding the contract's return value (`src/lib/genlayer/transactions.ts:447`); `get_total() + 1` is not used anywhere.
- It never manufactures a success. Every lifecycle success requires a network receipt that passed section 5 and section 6 validation.
- It retains transaction hashes only as a scoped convenience index (`src/lib/genlayer/transactions.ts:504`), and revalidates them against the network on load (`src/lib/store.tsx:303`). The contract does not expose a complete transaction index, and the application does not pretend otherwise.

### Proving it

```bash
npm run typecheck
npm test
```

`npm test` runs both the SDK/client/receipt/lifecycle suite and the evidence suite.

```bash
npm run test:sdk
```

`tests/sdk/lifecycle.test.ts` covers typed acceptance, decline, and evaluation writes against mocked SDK and provider clients, including the wallet-chain and role-guard orderings. **These are mocked-client tests. They are not live GenLayer integration and are not labeled as such.**

For the live, read-only verification of the same path against real Studio state:

```bash
PYTHONPATH=. .venv/bin/python -m pytest tests/integration -q -m integration -rs
```

This reads the three real transaction hashes and the canonical state for `DSP-0001`. It never signs, deploys, or mutates network state, and it has no wallet credentials in CI. It skips only on transport unavailability; malformed responses, RPC errors, missing or mismatched receipts, and canonical-state mismatches are test failures.

---

## Summary of verification commands

Every command in this document, from the repository root:

```bash
npm ci
npm run typecheck
npm test
npm run test:sdk
npm run test:filing
npm ls genlayer genlayer-js --depth=0

python3 -m venv .venv
.venv/bin/python -m pip install --constraint constraints.txt -r requirements.txt
.venv/bin/python scripts/check_dependency_pins.py --installed

PYTHONPATH=. .venv/bin/python -m pytest tests/direct -v
PYTHONPATH=. .venv/bin/python -m pytest tests/integration -v -m integration -rs

GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 .venv/bin/python -m genvm_linter.cli check contracts/LegxusDisputeResolution.py
GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 .venv/bin/python -m genvm_linter.cli schema contracts/LegxusDisputeResolution.py
PATH="$PWD/.venv/bin:$PATH" GENVM_REPO=genlayerlabs/genvm GENVM_VERSION=v0.3.0-rc7 .venv/bin/python -m genvm_linter.cli typecheck contracts/LegxusDisputeResolution.py --strict

sha256sum contracts/LegxusDisputeResolution.py
bash scripts/check_repository_hygiene.sh
```

Optional live evidence-policy check, explicitly labeled and requiring network access:

```bash
RUN_EVIDENCE_NETWORK=1 npm run test:evidence
```

## Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — trust boundaries and end-to-end flow.
- [GENLAYER_VALIDATION.md](GENLAYER_VALIDATION.md) — the public Studio transaction and canonical-state evidence.
- [evidence-policy.md](evidence-policy.md) — the evidence schema, failure taxonomy, and verification sequence.

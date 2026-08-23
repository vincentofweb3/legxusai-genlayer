import { abi } from 'genlayer-js'
import type { CalldataEncodable } from 'genlayer-js/types'
import {
  EVIDENCE_POLICY_VERSION,
  EVIDENCE_PROVIDER,
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceReference,
} from '../../src/lib/evidence/upload.ts'
import { CONTRACT_STATE_VERSION } from '../../src/lib/genlayer/types.ts'

export const CLAIMANT = '0x1111111111111111111111111111111111111111'
export const RESPONDENT = '0x2222222222222222222222222222222222222222'
export const CONTRACT = '0x3333333333333333333333333333333333333333'
export const TX_HASH = `0x${'a'.repeat(64)}`
export const CHILD_HASH = `0x${'b'.repeat(64)}`
export const COMMIT = 'abb71bf891695b737e6a4f5211f4740a3b25543d'
export const EVIDENCE_URL = `https://raw.githubusercontent.com/genlayerlabs/genvm/${COMMIT}/README.md`

export function evidenceFixture(): EvidenceReference {
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    provider: EVIDENCE_PROVIDER,
    url: EVIDENCE_URL,
    content_hash: '1'.repeat(64),
    mime_type: 'text/plain',
    byte_size: 12,
    source_id: `github:genlayerlabs/genvm@${COMMIT}:README.md`,
  }
}

export function disputeFixture(overrides: Record<string, unknown> = {}): Map<string, unknown> {
  return new Map<string, unknown>([
    ['state_version', CONTRACT_STATE_VERSION],
    ['id', 'DSP-0001'],
    ['title', 'Valid test dispute'],
    ['description', 'The complete decision criteria and dispute context are recorded here.'],
    ['criteria_version', 'ADVISORY_CRITERIA_V2'],
    ['claimant', CLAIMANT],
    ['respondent', RESPONDENT],
    ['reference_amount', 42n],
    ['reference_currency', 'USDC'],
    ['evidence_references', [new Map(Object.entries({ ...evidenceFixture(), byte_size: 12n }))]],
    ['respondent_evidence_references', []],
    ['evidence_policy', EVIDENCE_POLICY_VERSION],
    ['evidence_status', 'REGISTERED'],
    ['criteria_status', 'CLAIMANT_DECLARED'],
    ['verdict', 'PENDING'],
    ['confidence_bucket', 0n],
    ['evidence_sufficiency', 'INSUFFICIENT'],
    ['reason_code', 'PENDING_RESPONDENT_ACCEPTANCE'],
    ['source_error_code', 'NONE'],
    ['evidence_available', 0n],
    ['evidence_failed', 0n],
    ['status', 'AWAITING_RESPONDENT'],
    ['filed_at', '2026-08-19T10:00:00+00:00'],
    ['accepted_at', ''],
    ['evaluated_at', ''],
    ...Object.entries(overrides),
  ])
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function hex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString('hex')}`
}

export function resultEnvelope(value: CalldataEncodable): string {
  const payload = abi.calldata.encode(value)
  const result = new Uint8Array(payload.length + 1)
  result[0] = 0
  result.set(payload, 1)
  return base64(result)
}

export function traceReturnData(value: CalldataEncodable): string {
  const payload = abi.calldata.encode(value)
  return hex(payload)
}

export function studioResultEnvelope(value: CalldataEncodable): Record<string, unknown> {
  return {
    raw: resultEnvelope(value),
    status: 'return',
    payload: {
      raw: Array.from(abi.calldata.encode(value)),
      readable: abi.calldata.toString(value),
    },
  }
}

function isFixtureRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function studioLeaderReceiptFixture(
  value: CalldataEncodable = 'DSP-0001',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mode: 'leader',
    vote: null,
    execution_result: 'SUCCESS',
    genvm_result: {
      stderr: '',
      stdout: '',
      raw_error: null,
      error_code: null,
      error_description: null,
    },
    pending_transactions: [],
    result: studioResultEnvelope(value),
    ...overrides,
  }
}

export function studioValidatorReceiptFixture(
  value: CalldataEncodable = 'DSP-0001',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return studioLeaderReceiptFixture(value, {
    mode: 'validator',
    vote: 'agree',
    ...overrides,
  })
}

export function studioReceiptFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const receipt: Record<string, unknown> = {
    hash: TX_HASH,
    tx_id: TX_HASH,
    status: 7,
    statusName: 'FINALIZED',
    result: 6,
    result_name: 'MAJORITY_AGREE',
    messages: [],
    triggered_transactions: [],
    consensus_data: {
      leader_receipt: [studioLeaderReceiptFixture(), studioValidatorReceiptFixture()],
    },
    ...overrides,
  }

  if (Object.prototype.hasOwnProperty.call(overrides, 'consensus_data')) {
    const consensusOverrides = overrides.consensus_data
    if (!isFixtureRecord(consensusOverrides)) return receipt

    const defaultConsensus = receipt.consensus_data
    if (!isFixtureRecord(defaultConsensus)) return receipt

    const mergedConsensus: Record<string, unknown> = {
      ...defaultConsensus,
      ...consensusOverrides,
    }
    if (Object.prototype.hasOwnProperty.call(consensusOverrides, 'leader_receipt')) {
      const leaderOverrides = consensusOverrides.leader_receipt
      if (Array.isArray(leaderOverrides)) {
        const defaults = [studioLeaderReceiptFixture(), studioValidatorReceiptFixture()]
        mergedConsensus.leader_receipt = leaderOverrides.map((entry, index) => isFixtureRecord(entry)
          ? { ...(defaults[index] ?? studioValidatorReceiptFixture()), ...entry }
          : entry)
      }
    }
    receipt.consensus_data = mergedConsensus
  }

  return receipt
}

export function publicReceiptFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    txId: TX_HASH,
    statusName: 'ACCEPTED',
    resultName: 'AGREE',
    txExecutionResultName: 'FINISHED_WITH_RETURN',
    messages: [],
    ...overrides,
  }
}

export function publicTraceFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    transaction_id: TX_HASH,
    result_code: 0,
    return_data: traceReturnData('DSP-0001'),
    ...overrides,
  }
}

/** Backward-compatible alias for Studio-shaped receipt fixtures. */
export const receiptFixture = studioReceiptFixture

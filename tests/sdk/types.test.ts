import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeCanonicalDispute, decodeCanonicalDisputes, GenLayerDecodeError } from '../../src/lib/genlayer/types.ts'
import { disputeFixture, RESPONDENT } from './fixtures.ts'

function rejects(overrides: Record<string, unknown>, path: string): void {
  assert.throws(
    () => decodeCanonicalDispute(disputeFixture(overrides)),
    error => error instanceof GenLayerDecodeError && error.path.includes(path),
  )
}

test('decodes a complete canonical dispute without losing bigint precision', () => {
  const amount = (1n << 100n) + 9n
  const decoded = decodeCanonicalDispute(disputeFixture({ reference_amount: amount }))
  assert.equal(decoded.referenceAmount, amount)
  assert.equal(decoded.respondent, RESPONDENT)
  assert.equal(decoded.claimantEvidence[0].byte_size, 12)
  assert.equal(decoded.status, 'AWAITING_RESPONDENT')
})

test('decodes the canonical dispute map and validates key/id consistency', () => {
  const decoded = decodeCanonicalDisputes(new Map([['DSP-0001', disputeFixture()]]))
  assert.deepEqual(decoded.map(dispute => dispute.id), ['DSP-0001'])
  assert.throws(
    () => decodeCanonicalDisputes(new Map([['DSP-9999', disputeFixture()]])),
    error => error instanceof GenLayerDecodeError && error.path.includes('.id'),
  )
})

test('rejects malformed state version, address, bigint, evidence, and status shapes', () => {
  rejects({ state_version: 'DISPUTE_STATE_V2' }, 'state_version')
  rejects({ claimant: '0x1234' }, 'claimant')
  rejects({ reference_amount: Number.MAX_SAFE_INTEGER }, 'reference_amount')
  rejects({ status: 'UNKNOWN' }, 'status')
  rejects({ evidence_references: [{ schema_version: 'BAD' }] }, 'evidence_references[0].schema_version')
  rejects({ criteria_version: 'ADVISORY_CRITERIA_V1' }, 'criteria_version')
  rejects({ reason_code: 'UNRECOGNIZED_REASON' }, 'reason_code')
  rejects({ source_error_code: 'UNRECOGNIZED_SOURCE_ERROR' }, 'source_error_code')
})

test('rejects inconsistent lifecycle fields and party identity', () => {
  rejects({ respondent: '0x1111111111111111111111111111111111111111' }, 'dispute')
  rejects({ status: 'FINALIZED', verdict: 'PENDING' }, 'dispute')
  rejects({ status: 'READY_FOR_EVALUATION', criteria_status: 'RESPONDENT_ACCEPTED', accepted_at: '' }, 'dispute')
})

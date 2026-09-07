import {
  EVIDENCE_POLICY_VERSION,
  EVIDENCE_PROVIDER,
  EVIDENCE_SCHEMA_VERSION,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_REFERENCES,
  MAX_EVIDENCE_REFERENCES_TOTAL,
  canonicalizeEvidenceUrl,
  evidenceSourceId,
  type EvidenceReference,
} from '../evidence/upload.ts'

export const CONTRACT_STATE_VERSION = 'DISPUTE_STATE_V3' as const
export const CRITERIA_VERSION = 'ADVISORY_CRITERIA_V2' as const

export const DISPUTE_STATUSES = [
  'AWAITING_RESPONDENT',
  'READY_FOR_EVALUATION',
  'DECLINED',
  'FINALIZED',
] as const

export const EVIDENCE_STATUSES = [
  'NONE',
  'REGISTERED',
  'AVAILABLE',
  'PARTIAL',
  'UNAVAILABLE',
] as const

export const REASON_CODES = [
  'PENDING_RESPONDENT_ACCEPTANCE',
  'NO_EVIDENCE',
  'SOURCE_UNAVAILABLE',
  'CRITERIA_SUPPORTS_CLAIMANT',
  'CRITERIA_SUPPORTS_RESPONDENT',
  'INSUFFICIENT_EVIDENCE',
] as const

export const SOURCE_ERROR_CODES = [
  'NONE',
  'HTTP_CLIENT_ERROR',
  'HTTP_SERVER_ERROR',
  'REDIRECT',
  'EMPTY_RESPONSE',
  'UNSUPPORTED_MEDIA',
  'RESPONSE_TOO_LARGE',
  'CONTENT_SIZE_MISMATCH',
  'CONTENT_HASH_MISMATCH',
  'SOURCE_UNAVAILABLE',
] as const

export type DisputeStatus = typeof DISPUTE_STATUSES[number]
export type EvidenceStatus = typeof EVIDENCE_STATUSES[number]
export type ReasonCode = typeof REASON_CODES[number]
export type SourceErrorCode = typeof SOURCE_ERROR_CODES[number]

export type CanonicalDispute = {
  stateVersion: typeof CONTRACT_STATE_VERSION
  id: string
  title: string
  description: string
  criteriaVersion: typeof CRITERIA_VERSION
  claimant: `0x${string}`
  respondent: `0x${string}`
  referenceAmount: bigint
  referenceCurrency: 'GEN' | 'ETH' | 'USDC' | 'USDT'
  claimantEvidence: EvidenceReference[]
  respondentEvidence: EvidenceReference[]
  evidencePolicy: typeof EVIDENCE_POLICY_VERSION
  evidenceStatus: EvidenceStatus
  criteriaStatus: 'CLAIMANT_DECLARED' | 'RESPONDENT_ACCEPTED' | 'RESPONDENT_DECLINED'
  verdict: 'PENDING' | 'CLAIMANT_UPHELD' | 'RESPONDENT_UPHELD' | 'UNDETERMINED'
  confidenceBucket: number
  evidenceSufficiency: 'INSUFFICIENT' | 'PARTIAL' | 'SUFFICIENT'
  reasonCode: ReasonCode
  sourceErrorCode: SourceErrorCode
  evidenceAvailable: number
  evidenceFailed: number
  status: DisputeStatus
  filedAt: string
  acceptedAt: string | null
  evaluatedAt: string | null
}

export type CanonicalIdentity = {
  chainId: number
  contractAddress: `0x${string}`
  stateVersion: typeof CONTRACT_STATE_VERSION
}

export class GenLayerDecodeError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'GenLayerDecodeError'
    this.path = path
  }
}

function fail(path: string, message: string): never {
  throw new GenLayerDecodeError(path, message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Map) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function decodeMap(value: unknown, path: string): Map<string, unknown> {
  if (value instanceof Map) {
    const result = new Map<string, unknown>()
    for (const [key, entry] of value.entries()) {
      if (typeof key !== 'string') fail(path, 'map keys must be strings')
      result.set(key, entry)
    }
    return result
  }
  if (isRecord(value)) return new Map(Object.entries(value))
  return fail(path, 'expected a map/object')
}

function field(map: Map<string, unknown>, name: string, path: string): unknown {
  if (!map.has(name)) fail(`${path}.${name}`, 'missing required field')
  return map.get(name)
}

function decodeString(value: unknown, path: string, options: { allowEmpty?: boolean; max?: number } = {}): string {
  if (typeof value !== 'string') fail(path, 'expected a string')
  if (!options.allowEmpty && value.length === 0) fail(path, 'must not be empty')
  if (options.max !== undefined && value.length > options.max) fail(path, `exceeds ${options.max} characters`)
  return value
}

function decodeEnum<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  const decoded = decodeString(value, path)
  if (!allowed.includes(decoded)) fail(path, `unsupported value ${JSON.stringify(decoded)}`)
  return decoded as T[number]
}

export function decodeAddress(value: unknown, path = 'address'): `0x${string}` {
  const address = decodeString(value, path)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) fail(path, 'expected a 20-byte hexadecimal address')
  return address as `0x${string}`
}

function decodeU256(value: unknown, path: string, maximum?: bigint): bigint {
  if (typeof value !== 'bigint') fail(path, 'expected a bigint from raw calldata decoding')
  if (value < 0n) fail(path, 'must be non-negative')
  if (maximum !== undefined && value > maximum) fail(path, `exceeds ${maximum.toString()}`)
  return value
}

function checkedNumber(value: bigint, path: string, maximum: number): number {
  if (value > BigInt(maximum)) fail(path, `exceeds ${maximum}`)
  return Number(value)
}

function decodeTimestamp(value: unknown, path: string, allowEmpty: boolean): string | null {
  const timestamp = decodeString(value, path, { allowEmpty })
  if (timestamp === '') return null
  if (Number.isNaN(Date.parse(timestamp))) fail(path, 'expected an ISO-compatible timestamp')
  return timestamp
}

function decodeRequiredTimestamp(value: unknown, path: string): string {
  const timestamp = decodeTimestamp(value, path, false)
  if (timestamp === null) fail(path, 'must not be empty')
  return timestamp
}

function supportedMimeType(value: string): boolean {
  return value.startsWith('text/')
    || value === 'application/json'
    || value === 'application/xml'
    || value.endsWith('+json')
    || value.endsWith('+xml')
}

function decodeEvidence(value: unknown, path: string): EvidenceReference {
  const map = decodeMap(value, path)
  const schemaVersion = decodeEnum(field(map, 'schema_version', path), [EVIDENCE_SCHEMA_VERSION] as const, `${path}.schema_version`)
  const provider = decodeEnum(field(map, 'provider', path), [EVIDENCE_PROVIDER] as const, `${path}.provider`)
  const url = decodeString(field(map, 'url', path), `${path}.url`, { max: 512 })
  let canonicalUrl: string
  try {
    canonicalUrl = canonicalizeEvidenceUrl(url)
  } catch {
    return fail(`${path}.url`, 'does not satisfy the configured evidence policy')
  }
  if (canonicalUrl !== url) fail(`${path}.url`, 'is not canonically serialized')
  const contentHash = decodeString(field(map, 'content_hash', path), `${path}.content_hash`)
  if (!/^[0-9a-f]{64}$/.test(contentHash)) fail(`${path}.content_hash`, 'expected a lowercase SHA-256 digest')
  const mimeType = decodeString(field(map, 'mime_type', path), `${path}.mime_type`, { max: 128 })
  if (mimeType !== mimeType.toLowerCase() || !supportedMimeType(mimeType)) fail(`${path}.mime_type`, 'unsupported MIME type')
  const byteSize = checkedNumber(
    decodeU256(field(map, 'byte_size', path), `${path}.byte_size`, BigInt(MAX_EVIDENCE_BYTES)),
    `${path}.byte_size`,
    MAX_EVIDENCE_BYTES,
  )
  if (byteSize === 0) fail(`${path}.byte_size`, 'must be greater than zero')
  const sourceId = decodeString(field(map, 'source_id', path), `${path}.source_id`, { max: 320 })
  let expectedSourceId: string
  try {
    expectedSourceId = evidenceSourceId(url)
  } catch {
    return fail(`${path}.source_id`, 'could not be derived from the evidence URL')
  }
  if (sourceId !== expectedSourceId) fail(`${path}.source_id`, 'does not match the evidence URL')

  return {
    schema_version: schemaVersion,
    provider,
    url,
    content_hash: contentHash,
    mime_type: mimeType,
    byte_size: byteSize,
    source_id: sourceId,
  }
}

function decodeEvidenceList(value: unknown, path: string): EvidenceReference[] {
  if (!Array.isArray(value)) fail(path, 'expected an array')
  if (value.length > MAX_EVIDENCE_REFERENCES) fail(path, `exceeds ${MAX_EVIDENCE_REFERENCES} references`)
  return value.map((entry, index) => decodeEvidence(entry, `${path}[${index}]`))
}

function assertEvidenceUnique(claimant: EvidenceReference[], respondent: EvidenceReference[], path: string): void {
  const urls = new Set<string>()
  const hashes = new Set<string>()
  const combined = [...claimant, ...respondent]
  if (combined.length > MAX_EVIDENCE_REFERENCES_TOTAL) fail(path, `exceeds ${MAX_EVIDENCE_REFERENCES_TOTAL} total references`)
  for (const reference of combined) {
    if (urls.has(reference.url) || hashes.has(reference.content_hash)) fail(path, 'contains duplicate evidence')
    urls.add(reference.url)
    hashes.add(reference.content_hash)
  }
}

function assertLifecycle(record: CanonicalDispute, path: string): void {
  if (record.status === 'AWAITING_RESPONDENT') {
    if (record.criteriaStatus !== 'CLAIMANT_DECLARED' || record.acceptedAt !== null || record.evaluatedAt !== null) {
      fail(path, 'awaiting-respondent lifecycle fields are inconsistent')
    }
  } else if (record.status === 'READY_FOR_EVALUATION') {
    if (record.criteriaStatus !== 'RESPONDENT_ACCEPTED' || record.acceptedAt === null || record.evaluatedAt !== null) {
      fail(path, 'ready-for-evaluation lifecycle fields are inconsistent')
    }
  } else if (record.status === 'DECLINED') {
    if (record.criteriaStatus !== 'RESPONDENT_DECLINED' || record.evaluatedAt !== null) {
      fail(path, 'declined lifecycle fields are inconsistent')
    }
  } else if (record.evaluatedAt === null || record.verdict === 'PENDING') {
    fail(path, 'finalized lifecycle fields are inconsistent')
  }
}

export function decodeCanonicalDispute(value: unknown, path = 'dispute'): CanonicalDispute {
  const map = decodeMap(value, path)
  const stateVersion = decodeEnum(field(map, 'state_version', path), [CONTRACT_STATE_VERSION] as const, `${path}.state_version`)
  const id = decodeString(field(map, 'id', path), `${path}.id`)
  if (!/^DSP-[0-9]{4,}$/.test(id)) fail(`${path}.id`, 'expected a canonical DSP identifier')
  const claimantEvidence = decodeEvidenceList(field(map, 'evidence_references', path), `${path}.evidence_references`)
  const respondentEvidence = decodeEvidenceList(field(map, 'respondent_evidence_references', path), `${path}.respondent_evidence_references`)
  assertEvidenceUnique(claimantEvidence, respondentEvidence, `${path}.evidence_references`)

  const record: CanonicalDispute = {
    stateVersion,
    id,
    title: decodeString(field(map, 'title', path), `${path}.title`, { max: 120 }),
    description: decodeString(field(map, 'description', path), `${path}.description`, { max: 4000 }),
    criteriaVersion: decodeEnum(field(map, 'criteria_version', path), [CRITERIA_VERSION] as const, `${path}.criteria_version`),
    claimant: decodeAddress(field(map, 'claimant', path), `${path}.claimant`),
    respondent: decodeAddress(field(map, 'respondent', path), `${path}.respondent`),
    referenceAmount: decodeU256(field(map, 'reference_amount', path), `${path}.reference_amount`, (1n << 128n) - 1n),
    referenceCurrency: decodeEnum(field(map, 'reference_currency', path), ['GEN', 'ETH', 'USDC', 'USDT'] as const, `${path}.reference_currency`),
    claimantEvidence,
    respondentEvidence,
    evidencePolicy: decodeEnum(field(map, 'evidence_policy', path), [EVIDENCE_POLICY_VERSION] as const, `${path}.evidence_policy`),
    evidenceStatus: decodeEnum(field(map, 'evidence_status', path), EVIDENCE_STATUSES, `${path}.evidence_status`),
    criteriaStatus: decodeEnum(field(map, 'criteria_status', path), ['CLAIMANT_DECLARED', 'RESPONDENT_ACCEPTED', 'RESPONDENT_DECLINED'] as const, `${path}.criteria_status`),
    verdict: decodeEnum(field(map, 'verdict', path), ['PENDING', 'CLAIMANT_UPHELD', 'RESPONDENT_UPHELD', 'UNDETERMINED'] as const, `${path}.verdict`),
    confidenceBucket: checkedNumber(decodeU256(field(map, 'confidence_bucket', path), `${path}.confidence_bucket`, 10n), `${path}.confidence_bucket`, 10),
    evidenceSufficiency: decodeEnum(field(map, 'evidence_sufficiency', path), ['INSUFFICIENT', 'PARTIAL', 'SUFFICIENT'] as const, `${path}.evidence_sufficiency`),
    reasonCode: decodeEnum(field(map, 'reason_code', path), REASON_CODES, `${path}.reason_code`),
    sourceErrorCode: decodeEnum(field(map, 'source_error_code', path), SOURCE_ERROR_CODES, `${path}.source_error_code`),
    evidenceAvailable: checkedNumber(decodeU256(field(map, 'evidence_available', path), `${path}.evidence_available`, 6n), `${path}.evidence_available`, 6),
    evidenceFailed: checkedNumber(decodeU256(field(map, 'evidence_failed', path), `${path}.evidence_failed`, 6n), `${path}.evidence_failed`, 6),
    status: decodeEnum(field(map, 'status', path), DISPUTE_STATUSES, `${path}.status`),
    filedAt: decodeRequiredTimestamp(field(map, 'filed_at', path), `${path}.filed_at`),
    acceptedAt: decodeTimestamp(field(map, 'accepted_at', path), `${path}.accepted_at`, true),
    evaluatedAt: decodeTimestamp(field(map, 'evaluated_at', path), `${path}.evaluated_at`, true),
  }

  if (record.claimant.toLowerCase() === record.respondent.toLowerCase()) fail(path, 'claimant and respondent must differ')
  if (record.evidenceAvailable + record.evidenceFailed > MAX_EVIDENCE_REFERENCES_TOTAL) {
    fail(path, 'evidence result counts exceed the contract quota')
  }
  assertLifecycle(record, path)
  return record
}

export function decodeCanonicalDisputes(value: unknown): CanonicalDispute[] {
  const disputes = decodeMap(value, 'get_all_disputes')
  const decoded: CanonicalDispute[] = []
  for (const [id, record] of disputes.entries()) {
    const dispute = decodeCanonicalDispute(record, `get_all_disputes.${id}`)
    if (dispute.id !== id) fail(`get_all_disputes.${id}.id`, 'does not match its canonical map key')
    decoded.push(dispute)
  }
  return decoded.sort((left, right) => right.id.localeCompare(left.id, undefined, { numeric: true }))
}

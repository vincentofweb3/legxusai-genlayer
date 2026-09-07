/**
 * Phase 3 evidence policy: public GitHub raw URLs pinned to a commit SHA.
 *
 * This module never uploads private browser files and never creates a local or
 * temporary URL. A reference is submitted only after its bytes and metadata
 * have been retrieved and verified.
 */

export const EVIDENCE_SCHEMA_VERSION = 'EVIDENCE_REFERENCE_V1' as const
export const EVIDENCE_POLICY_VERSION = 'GITHUB_RAW_COMMIT_SHA256_V1' as const
export const EVIDENCE_PROVIDER = 'GITHUB_RAW' as const
export const MAX_EVIDENCE_REFERENCES = 3
export const MAX_EVIDENCE_REFERENCES_TOTAL = 6
export const MAX_EVIDENCE_BYTES = 2_000
export const MAX_EVIDENCE_URL_LENGTH = 512
export const MAX_EVIDENCE_SOURCE_ID_LENGTH = 320
export const DEFAULT_EVIDENCE_TIMEOUT_MS = 10_000

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/
const COMPONENT_PATTERN = /^[A-Za-z0-9_.-]+$/
const MIME_ALLOWLIST = new Set(['application/json', 'application/xml'])

export type EvidenceReference = {
  [key: string]: string | number
  schema_version: typeof EVIDENCE_SCHEMA_VERSION
  provider: typeof EVIDENCE_PROVIDER
  url: string
  content_hash: string
  mime_type: string
  byte_size: number
  source_id: string
}

export type EvidenceFailureCode =
  | 'INVALID_REFERENCE'
  | 'DUPLICATE_REFERENCE'
  | 'TOO_MANY_REFERENCES'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'REDIRECT'
  | 'HTTP_ERROR'
  | 'EMPTY_RESPONSE'
  | 'UNSUPPORTED_MEDIA'
  | 'RESPONSE_TOO_LARGE'
  | 'CONTENT_HASH_MISMATCH'
  | 'CONTENT_SIZE_MISMATCH'
  | 'CONTENT_MIME_MISMATCH'
  | 'SOURCE_ID_MISMATCH'
  | 'SCHEMA_MISMATCH'
  | 'PROVIDER_MISMATCH'

export class EvidenceVerificationError extends Error {
  readonly code: EvidenceFailureCode
  readonly url?: string

  constructor(code: EvidenceFailureCode, message: string, url?: string) {
    super(message)
    this.name = 'EvidenceVerificationError'
    this.code = code
    this.url = url
  }
}

function fail(code: EvidenceFailureCode, message: string, url?: string): never {
  throw new EvidenceVerificationError(code, message, url)
}

function isSupportedMimeType(value: string): boolean {
  return value.startsWith('text/') || MIME_ALLOWLIST.has(value) || value.endsWith('+json') || value.endsWith('+xml')
}

function normalizeMimeType(value: string | null): string {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase()
}

type ParsedEvidenceUrl = {
  url: string
  owner: string
  repository: string
  commit: string
  path: string
  sourceId: string
}

function makeSourceId(owner: string, repository: string, commit: string, path: string, url?: string): string {
  const sourceId = `github:${owner}/${repository}@${commit}:${path}`
  if (sourceId.length > MAX_EVIDENCE_SOURCE_ID_LENGTH) {
    fail('INVALID_REFERENCE', `Evidence source identifier exceeds ${MAX_EVIDENCE_SOURCE_ID_LENGTH} characters`, url)
  }
  return sourceId
}

function parseCanonicalUrl(value: string): ParsedEvidenceUrl {
  const input = value.trim()
  if (!input || input.length > MAX_EVIDENCE_URL_LENGTH) {
    fail('INVALID_REFERENCE', 'Evidence URL is empty or too long', value)
  }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    fail('INVALID_REFERENCE', 'Evidence URL is not valid', value)
  }

  if (parsed.protocol !== 'https:') fail('INVALID_REFERENCE', 'Evidence URLs must use HTTPS', value)
  if (parsed.hostname !== 'raw.githubusercontent.com') {
    fail('INVALID_REFERENCE', 'Evidence URL must use the selected GitHub raw provider', value)
  }
  if (parsed.port && parsed.port !== '443') fail('INVALID_REFERENCE', 'Evidence URL must use the default HTTPS port', value)
  if (parsed.username || parsed.password) fail('INVALID_REFERENCE', 'Evidence URL cannot contain credentials', value)
  if (parsed.search || parsed.hash) fail('INVALID_REFERENCE', 'Evidence URL cannot contain a query or fragment', value)

  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 4) fail('INVALID_REFERENCE', 'Evidence URL must identify a resource path', value)
  const [owner, repository, commit, ...pathParts] = parts
  if (!COMPONENT_PATTERN.test(owner) || !COMPONENT_PATTERN.test(repository)) {
    fail('INVALID_REFERENCE', 'Evidence URL repository identity is invalid', value)
  }
  if (!COMMIT_SHA_PATTERN.test(commit)) {
    fail('INVALID_REFERENCE', 'Evidence URL must be pinned to a lowercase 40-character commit hash', value)
  }
  if (pathParts.some(part => part === '.' || part === '..')) {
    fail('INVALID_REFERENCE', 'Evidence URL path is invalid', value)
  }

  // URL.href is the canonical serialization used for the contract calldata.
  const canonical = parsed.toString()
  const path = pathParts.join('/')
  return { url: canonical, owner, repository, commit, path, sourceId: makeSourceId(owner, repository, commit, path, canonical) }
}

export function canonicalizeEvidenceUrl(value: string): string {
  return parseCanonicalUrl(value).url
}

export function evidenceSourceId(url: string): string {
  return parseCanonicalUrl(url).sourceId
}

export function describeEvidenceVerificationError(error: EvidenceVerificationError): string {
  let reference = 'selected reference'
  if (error.url) {
    try {
      reference = evidenceSourceId(error.url)
    } catch {
      reference = 'selected reference'
    }
  }
  return `${error.code}: ${reference} could not be reverified. No transaction was sent; retry or remove this reference.`
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return bytesToHex(new Uint8Array(digest))
}

async function readBoundedBody(
  response: Response,
  url: string,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<Uint8Array> {
  const readerRef: { current: ReadableStreamDefaultReader<Uint8Array> | null } = { current: null }
  let timedOut = false
  let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = globalThis.setTimeout(() => {
      timedOut = true
      onTimeout()
      if (readerRef.current) void readerRef.current.cancel().catch(() => undefined)
      reject(new EvidenceVerificationError('TIMEOUT', 'Evidence retrieval timed out', url))
    }, timeoutMs)
  })

  const readBody = async (): Promise<Uint8Array> => {
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null) {
      const length = Number.parseInt(declaredLength, 10)
      if (!Number.isFinite(length) || length < 0) {
        fail('NETWORK_ERROR', 'Evidence content length is invalid', url)
      }
      if (length > MAX_EVIDENCE_BYTES) {
        fail('RESPONSE_TOO_LARGE', `Evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`, url)
      }
    }

    if (!response.body) {
      const buffer = await Promise.race([response.arrayBuffer(), timeoutPromise])
      if (timedOut) fail('TIMEOUT', 'Evidence retrieval timed out', url)
      const body = new Uint8Array(buffer)
      if (body.byteLength > MAX_EVIDENCE_BYTES) {
        fail('RESPONSE_TOO_LARGE', `Evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`, url)
      }
      return body
    }

    const reader = response.body.getReader()
    readerRef.current = reader
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const next = await Promise.race([reader.read(), timeoutPromise])
      if (timedOut) fail('TIMEOUT', 'Evidence retrieval timed out', url)
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_EVIDENCE_BYTES) {
        void reader.cancel().catch(() => undefined)
        fail('RESPONSE_TOO_LARGE', `Evidence exceeds ${MAX_EVIDENCE_BYTES} bytes`, url)
      }
      chunks.push(next.value)
    }

    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body
  }

  try {
    return await readBody()
  } finally {
    if (timeoutHandle !== undefined) globalThis.clearTimeout(timeoutHandle)
    if (readerRef.current) readerRef.current.releaseLock()
  }
}

async function fetchVerifiedBytes(url: string, timeoutMs: number): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'text/*, application/json, application/xml, application/*+json, application/*+xml' },
    })
  } catch (error) {
    if (controller.signal.aborted) fail('TIMEOUT', 'Evidence retrieval timed out', url)
    if (error instanceof TypeError && /redirect/i.test(error.message)) {
      fail('REDIRECT', 'Evidence URL redirected and was rejected', url)
    }
    fail('NETWORK_ERROR', 'Evidence retrieval failed', url)
  } finally {
    globalThis.clearTimeout(timeout)
  }

  if (response.redirected) fail('REDIRECT', 'Evidence URL redirected and was rejected', url)
  if (response.status >= 300 && response.status < 400) {
    fail('REDIRECT', 'Evidence URL redirected and was rejected', url)
  }
  if (!response.ok) fail('HTTP_ERROR', `Evidence retrieval returned HTTP ${response.status}`, url)
  const mimeType = normalizeMimeType(response.headers.get('content-type'))
  if (!isSupportedMimeType(mimeType)) fail('UNSUPPORTED_MEDIA', 'Evidence MIME type is not supported', url)
  const bytes = await readBoundedBody(response, url, timeoutMs, () => controller.abort())
  if (bytes.byteLength === 0) fail('EMPTY_RESPONSE', 'Evidence response is empty', url)
  return { bytes, mimeType }
}

export async function verifyEvidenceReference(
  value: string,
  options: { timeoutMs?: number } = {},
): Promise<EvidenceReference> {
  const parsed = parseCanonicalUrl(value)
  const { bytes, mimeType } = await fetchVerifiedBytes(parsed.url, options.timeoutMs ?? DEFAULT_EVIDENCE_TIMEOUT_MS)
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('UNSUPPORTED_MEDIA', 'Evidence body must be valid UTF-8 text', parsed.url)
  }
  const contentHash = await sha256(bytes)
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    provider: EVIDENCE_PROVIDER,
    url: parsed.url,
    content_hash: contentHash,
    mime_type: mimeType,
    byte_size: bytes.byteLength,
    source_id: parsed.sourceId,
  }
}

export async function verifyEvidenceReferences(
  values: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<EvidenceReference[]> {
  const urls = values.map(value => value.trim()).filter(Boolean)
  if (urls.length === 0) return []
  if (urls.length > MAX_EVIDENCE_REFERENCES) {
    fail('TOO_MANY_REFERENCES', `At most ${MAX_EVIDENCE_REFERENCES} evidence references are allowed`)
  }

  const references: EvidenceReference[] = []
  const seenUrls = new Set<string>()
  const seenHashes = new Set<string>()
  for (const url of urls) {
    const reference = await verifyEvidenceReference(url, options)
    if (seenUrls.has(reference.url) || seenHashes.has(reference.content_hash)) {
      fail('DUPLICATE_REFERENCE', 'Evidence references must be unique', reference.url)
    }
    seenUrls.add(reference.url)
    seenHashes.add(reference.content_hash)
    references.push(reference)
  }
  return references
}

export async function reverifyEvidenceReferences(
  references: readonly EvidenceReference[],
  options: { timeoutMs?: number } = {},
): Promise<EvidenceReference[]> {
  if (references.length === 0) return []
  if (references.length > MAX_EVIDENCE_REFERENCES) {
    fail('TOO_MANY_REFERENCES', `At most ${MAX_EVIDENCE_REFERENCES} evidence references are allowed`)
  }

  const checked: EvidenceReference[] = []
  const seenUrls = new Set<string>()
  const seenHashes = new Set<string>()
  for (const expected of references) {
    const expectedUrl = canonicalizeEvidenceUrl(expected.url)
    if (expectedUrl !== expected.url) {
      fail('INVALID_REFERENCE', 'Evidence URL is not canonical', expected.url)
    }
    const expectedSourceId = evidenceSourceId(expected.url)
    if (expected.source_id !== expectedSourceId) {
      fail('SOURCE_ID_MISMATCH', 'Evidence source identifier does not match the canonical URL', expected.url)
    }
    if (expected.schema_version !== EVIDENCE_SCHEMA_VERSION) {
      fail('SCHEMA_MISMATCH', 'Evidence schema version is not supported', expected.url)
    }
    if (expected.provider !== EVIDENCE_PROVIDER) {
      fail('PROVIDER_MISMATCH', 'Evidence provider is not supported', expected.url)
    }
    const actual = await verifyEvidenceReference(expected.url, options)
    if (actual.content_hash !== expected.content_hash.toLowerCase()) {
      fail('CONTENT_HASH_MISMATCH', 'Evidence content hash no longer matches the retrieved content', expected.url)
    }
    if (actual.byte_size !== expected.byte_size) {
      fail('CONTENT_SIZE_MISMATCH', 'Evidence byte size no longer matches the retrieved content', expected.url)
    }
    if (actual.mime_type !== expected.mime_type.toLowerCase()) {
      fail('CONTENT_MIME_MISMATCH', 'Evidence MIME type no longer matches the retrieved content', expected.url)
    }
    if (seenUrls.has(actual.url) || seenHashes.has(actual.content_hash)) {
      fail('DUPLICATE_REFERENCE', 'Evidence references must be unique', actual.url)
    }
    seenUrls.add(actual.url)
    seenHashes.add(actual.content_hash)
    checked.push(actual)
  }
  return checked
}

export function assertEvidenceCompatibleWithExisting(
  existing: readonly EvidenceReference[],
  additions: readonly EvidenceReference[],
): void {
  if (existing.length + additions.length > MAX_EVIDENCE_REFERENCES_TOTAL) {
    fail('TOO_MANY_REFERENCES', `At most ${MAX_EVIDENCE_REFERENCES_TOTAL} evidence references are allowed across both parties`)
  }
  const urls = new Set(existing.map(reference => reference.url))
  const hashes = new Set(existing.map(reference => reference.content_hash.toLowerCase()))
  for (const reference of additions) {
    if (urls.has(reference.url) || hashes.has(reference.content_hash.toLowerCase())) {
      fail('DUPLICATE_REFERENCE', 'Respondent evidence must be unique from claimant evidence', reference.url)
    }
    urls.add(reference.url)
    hashes.add(reference.content_hash.toLowerCase())
  }
}

/**
 * Reverify all selected references before invoking a write callback. The
 * callback is never called when verification fails, which keeps the signed
 * calldata identical to the references the user confirmed.
 */
export async function writeWithReverifiedEvidence<T>(
  references: readonly EvidenceReference[],
  write: (verified: EvidenceReference[]) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<{ value: T; references: EvidenceReference[] }> {
  const verified = await reverifyEvidenceReferences(references, options)
  return { value: await write(verified), references: verified }
}

/**
 * Build a candidate UI intake list. A failed addition returns an empty
 * candidate set, never a fabricated URL or local filename. Callers must retain
 * any current selection and must not use this helper as a pre-sign fallback.
 */
export async function evidenceOrEmpty(
  values: readonly string[],
  options: { timeoutMs?: number } = {},
): Promise<{ references: EvidenceReference[]; error: EvidenceVerificationError | null }> {
  try {
    return { references: await verifyEvidenceReferences(values, options), error: null }
  } catch (error) {
    if (error instanceof EvidenceVerificationError) return { references: [], error }
    return {
      references: [],
      error: new EvidenceVerificationError('NETWORK_ERROR', 'Evidence verification failed'),
    }
  }
}

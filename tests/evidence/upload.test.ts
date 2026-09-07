import assert from 'node:assert/strict'
import { afterEach, describe, mock, test } from 'node:test'
import {
  EVIDENCE_POLICY_VERSION,
  EVIDENCE_PROVIDER,
  EVIDENCE_SCHEMA_VERSION,
  EvidenceVerificationError,
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_SOURCE_ID_LENGTH,
  MAX_EVIDENCE_URL_LENGTH,
  evidenceOrEmpty,
  evidenceSourceId,
  reverifyEvidenceReferences,
  verifyEvidenceReference,
  verifyEvidenceReferences,
} from '../../src/lib/evidence/upload.ts'

const COMMIT = 'abb71bf891695b737e6a4f5211f4740a3b25543d'
const BASE_URL = `https://raw.githubusercontent.com/genlayerlabs/genvm/${COMMIT}/doc/website/src/overview/index.rst`
const BODY = 'A public, immutable-at-commit evidence record.'

const originalFetch = globalThis.fetch

afterEach(() => {
  mock.restoreAll()
  globalThis.fetch = originalFetch
})

function response(body: string, init: ResponseInit = {}, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(body, {
    ...init,
    headers: {
      'content-type': contentType,
      ...(init.headers ?? {}),
    },
  })
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = handler as typeof fetch
}

function assertCode(error: unknown, code: EvidenceVerificationError['code']): void {
  assert.ok(error instanceof EvidenceVerificationError)
  assert.equal(error.code, code)
}

describe('GitHub raw commit evidence policy', () => {
  test('retrieves bytes and returns canonical hash and provenance metadata', async () => {
    mockFetch(async (input, init) => {
      assert.equal(String(input), BASE_URL)
      assert.equal(init?.redirect, 'error')
      assert.equal(init?.method, 'GET')
      return response(BODY)
    })

    const reference = await verifyEvidenceReference(BASE_URL)
    assert.deepEqual(reference, {
      schema_version: EVIDENCE_SCHEMA_VERSION,
      provider: EVIDENCE_PROVIDER,
      url: BASE_URL,
      content_hash: '22c8ebee77fa2154e52a4b02f68566bf2f3f5ac09251051617e61a606abe903c',
      mime_type: 'text/plain',
      byte_size: new TextEncoder().encode(BODY).byteLength,
      source_id: `github:genlayerlabs/genvm@${COMMIT}:doc/website/src/overview/index.rst`,
    })
    assert.equal(evidenceSourceId(reference.url), reference.source_id)
  })

  test('accepts supported MIME parameters and rejects unsupported media', async () => {
    mockFetch(async () => response('{"ok":true}', {}, 'application/json; charset=utf-8'))
    const jsonReference = await verifyEvidenceReference(BASE_URL)
    assert.equal(jsonReference.mime_type, 'application/json')

    mockFetch(async () => response('PNG bytes are not accepted here', {}, 'image/png'))
    await assert.rejects(
      verifyEvidenceReference(BASE_URL),
      error => {
        assertCode(error, 'UNSUPPORTED_MEDIA')
        return true
      },
    )
  })

  test('rejects mutable, credential-bearing, or non-public references before fetch', async () => {
    let calls = 0
    mockFetch(async () => {
      calls += 1
      return response(BODY)
    })

    const invalidUrls = [
      'http://raw.githubusercontent.com/owner/repo/' + COMMIT + '/README.md',
      `https://github.com/genlayerlabs/genvm/${COMMIT}/blob/main/README.md`,
      `https://raw.githubusercontent.com/owner/repo/main/README.md`,
      `https://raw.githubusercontent.com/owner/repo/${COMMIT}/README.md?download=1`,
      `https://raw.githubusercontent.com/owner/repo/${COMMIT}/README.md#section`,
      `https://user:password@raw.githubusercontent.com/owner/repo/${COMMIT}/README.md`,
      `https://raw.githubusercontent.com/owner/repo/${COMMIT}/../README.md`,
      `https://raw.githubusercontent.com/owner/repo/${COMMIT.toUpperCase()}/README.md`,
    ]
    for (const url of invalidUrls) {
      await assert.rejects(verifyEvidenceReference(url), error => {
        assertCode(error, 'INVALID_REFERENCE')
        return true
      })
    }
    assert.equal(calls, 0)
  })

  test('rejects HTTP 3xx responses as explicit redirect failures', async () => {
    mockFetch(async () => response('redirected', { status: 302, headers: { location: BASE_URL } }))
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'REDIRECT')
      return true
    })
  })

  test('rejects HTTP errors, empty bodies, redirects, and timeouts', async () => {
    mockFetch(async () => response('missing', { status: 404 }))
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'HTTP_ERROR')
      return true
    })

    mockFetch(async () => response(''))
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'EMPTY_RESPONSE')
      return true
    })

    mockFetch(async () => {
      throw new TypeError('redirect mode is not allowed')
    })
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'REDIRECT')
      return true
    })

    mockFetch((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    await assert.rejects(verifyEvidenceReference(BASE_URL, { timeoutMs: 5 }), error => {
      assertCode(error, 'TIMEOUT')
      return true
    })
  })

  test('times out while consuming a stalled response body', async () => {
    mockFetch(async () => new Response(new ReadableStream<Uint8Array>({
      start() {
        // Deliberately leave the stream pending; the policy timeout must bound
        // body consumption, not only the initial response headers.
      },
    }), {
      headers: { 'content-type': 'text/plain' },
    }))

    await assert.rejects(verifyEvidenceReference(BASE_URL, { timeoutMs: 5 }), error => {
      assertCode(error, 'TIMEOUT')
      return true
    })
  })

  test('enforces the declared and streamed size limit', async () => {
    mockFetch(async () => response('x', { headers: { 'content-length': String(MAX_EVIDENCE_BYTES + 1) } }))
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'RESPONSE_TOO_LARGE')
      return true
    })

    const oversized = 'x'.repeat(MAX_EVIDENCE_BYTES + 1)
    mockFetch(async () => response(oversized))
    await assert.rejects(verifyEvidenceReference(BASE_URL), error => {
      assertCode(error, 'RESPONSE_TOO_LARGE')
      return true
    })
  })

  test('rejects duplicate URLs and duplicate content hashes', async () => {
    mockFetch(async () => response(BODY))
    await assert.rejects(verifyEvidenceReferences([BASE_URL, BASE_URL]), error => {
      assertCode(error, 'DUPLICATE_REFERENCE')
      return true
    })

    const sameBodyUrl = `https://raw.githubusercontent.com/genlayerlabs/genvm/${COMMIT}/docs/README.md`
    await assert.rejects(verifyEvidenceReferences([BASE_URL, sameBodyUrl]), error => {
      assertCode(error, 'DUPLICATE_REFERENCE')
      return true
    })
  })

  test('reverifies metadata immediately before signing and rejects changed content', async () => {
    mockFetch(async () => response(BODY))
    const reference = await verifyEvidenceReference(BASE_URL)
    const checked = await reverifyEvidenceReferences([reference])
    assert.deepEqual(checked, [reference])

    mockFetch(async () => response('changed'))
    await assert.rejects(reverifyEvidenceReferences([reference]), error => {
      assertCode(error, 'CONTENT_HASH_MISMATCH')
      return true
    })
  })

  test('classifies each metadata mismatch precisely', async () => {
    mockFetch(async () => response(BODY))
    const reference = await verifyEvidenceReference(BASE_URL)

    mockFetch(async () => response(BODY))
    await assert.rejects(reverifyEvidenceReferences([{ ...reference, byte_size: reference.byte_size + 1 }]), error => {
      assertCode(error, 'CONTENT_SIZE_MISMATCH')
      return true
    })

    mockFetch(async () => response(BODY, {}, 'application/json'))
    await assert.rejects(reverifyEvidenceReferences([reference]), error => {
      assertCode(error, 'CONTENT_MIME_MISMATCH')
      return true
    })

    mockFetch(async () => response(BODY))
    await assert.rejects(reverifyEvidenceReferences([{ ...reference, source_id: 'wrong' }]), error => {
      assertCode(error, 'SOURCE_ID_MISMATCH')
      return true
    })

    mockFetch(async () => response(BODY))
    await assert.rejects(reverifyEvidenceReferences([{ ...reference, schema_version: 'OLD' as typeof reference.schema_version }]), error => {
      assertCode(error, 'SCHEMA_MISMATCH')
      return true
    })

    mockFetch(async () => response(BODY))
    await assert.rejects(reverifyEvidenceReferences([{ ...reference, provider: 'OTHER' as typeof reference.provider }]), error => {
      assertCode(error, 'PROVIDER_MISMATCH')
      return true
    })
  })

  test('enforces the effective URL/source-ID boundary before fetch', async () => {
    const pathAtLimit = 'a'.repeat(MAX_EVIDENCE_SOURCE_ID_LENGTH - 'github:owner/repo@'.length - COMMIT.length - 1)
    const acceptedUrl = `https://raw.githubusercontent.com/owner/repo/${COMMIT}/${pathAtLimit}`
    let calls = 0
    mockFetch(async () => {
      calls += 1
      return response(BODY)
    })
    const accepted = await verifyEvidenceReference(acceptedUrl)
    assert.equal(accepted.url.length, 347)
    assert.equal(accepted.url.length < MAX_EVIDENCE_URL_LENGTH, true)
    assert.equal(accepted.source_id.length, MAX_EVIDENCE_SOURCE_ID_LENGTH)

    const overLimitUrl = `https://raw.githubusercontent.com/owner/repo/${COMMIT}/${pathAtLimit}a`
    await assert.rejects(verifyEvidenceReference(overLimitUrl), error => {
      assertCode(error, 'INVALID_REFERENCE')
      return true
    })

    const previouslyDemonstratedLongPathUrl = `${overLimitUrl}${'a'.repeat(31)}`
    assert.equal(previouslyDemonstratedLongPathUrl.length, 379)
    await assert.rejects(verifyEvidenceReference(previouslyDemonstratedLongPathUrl), error => {
      assertCode(error, 'INVALID_REFERENCE')
      return true
    })

    const absoluteUrlLimitExceeded = `${acceptedUrl}${'a'.repeat(MAX_EVIDENCE_URL_LENGTH + 1 - acceptedUrl.length)}`
    assert.equal(absoluteUrlLimitExceeded.length, MAX_EVIDENCE_URL_LENGTH + 1)
    await assert.rejects(verifyEvidenceReference(absoluteUrlLimitExceeded), error => {
      assertCode(error, 'INVALID_REFERENCE')
      return true
    })
    assert.equal(calls, 1)
  })

  test('returns [] for no evidence and on verification failure', async () => {
    const empty = await evidenceOrEmpty([])
    assert.deepEqual(empty, { references: [], error: null })

    mockFetch(async () => response('bad', { status: 503 }))
    const failed = await evidenceOrEmpty([BASE_URL])
    assert.deepEqual(failed.references, [])
    assert.equal(failed.error?.code, 'HTTP_ERROR')
  })

  test('real-network integration: pinned small GenVM documentation round-trip', { skip: process.env.RUN_EVIDENCE_NETWORK !== '1' }, async () => {
    const reference = await verifyEvidenceReference(BASE_URL, { timeoutMs: 20_000 })
    assert.equal(reference.url, BASE_URL)
    assert.equal(reference.provider, EVIDENCE_PROVIDER)
    assert.equal(reference.schema_version, EVIDENCE_SCHEMA_VERSION)
    assert.equal(reference.source_id, `github:genlayerlabs/genvm@${COMMIT}:doc/website/src/overview/index.rst`)
    assert.equal(reference.byte_size > 0, true)
    assert.match(reference.content_hash, /^[0-9a-f]{64}$/)
  })

  test('policy version remains explicit for documentation and state migrations', () => {
    assert.equal(EVIDENCE_POLICY_VERSION, 'GITHUB_RAW_COMMIT_SHA256_V1')
  })
})

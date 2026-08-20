import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { EvidenceConfirmationError, writeWithConfirmedEvidence } from '../../src/lib/evidence/filing.ts'
import { EvidenceVerificationError, verifyEvidenceReference } from '../../src/lib/evidence/upload.ts'

const COMMIT = 'abb71bf891695b737e6a4f5211f4740a3b25543d'
const URL = `https://raw.githubusercontent.com/genlayerlabs/genvm/${COMMIT}/doc/website/src/overview/index.rst`
const BODY = 'selected evidence'
const originalFetch = globalThis.fetch

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

afterEach(() => {
  mock.restoreAll()
  globalThis.fetch = originalFetch
})

test('pre-sign re-verification failure makes zero write calls', async () => {
  globalThis.fetch = (async () => response(BODY)) as typeof fetch
  const selected = await verifyEvidenceReference(URL)
  globalThis.fetch = (async () => response('changed')) as typeof fetch
  let writes = 0

  await assert.rejects(
    writeWithConfirmedEvidence({
      references: [selected],
      confirmNoEvidence: false,
      write: async () => {
        writes += 1
        return 'should-not-run'
      },
    }),
    error => error instanceof EvidenceVerificationError && error.code === 'CONTENT_HASH_MISMATCH',
  )
  assert.equal(writes, 0)
})

test('empty evidence requires explicit confirmation and signs exactly []', async () => {
  let writes = 0
  await assert.rejects(
    writeWithConfirmedEvidence({
      references: [],
      confirmNoEvidence: false,
      write: async references => {
        writes += 1
        return references
      },
    }),
    error => error instanceof EvidenceConfirmationError,
  )
  assert.equal(writes, 0)

  const result = await writeWithConfirmedEvidence({
    references: [],
    confirmNoEvidence: true,
    write: async references => {
      writes += 1
      return references
    },
  })
  assert.deepEqual(result.value, [])
  assert.deepEqual(result.references, [])
  assert.equal(writes, 1)
})

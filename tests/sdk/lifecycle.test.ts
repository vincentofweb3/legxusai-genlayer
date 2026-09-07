import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptDisputeOnChain,
  declineDisputeOnChain,
  evaluateDisputeOnChain,
  lifecycleCall,
  transactionReturnRouteForNetwork,
} from '../../src/lib/genlayer/disputes.ts'
import {
  GenLayerTransactionError,
  hydrateKnownTransactions,
  type KnownTransactionRecord,
} from '../../src/lib/genlayer/transactions.ts'
import { decodeCanonicalDispute } from '../../src/lib/genlayer/types.ts'
import { NETWORK_CONFIG } from '../../src/lib/genlayer/config.ts'
import { WalletStateError, type InjectedProvider } from '../../src/lib/genlayer/client.ts'
import { EvidenceConfirmationError, writeWithConfirmedEvidence } from '../../src/lib/evidence/filing.ts'
import { verifyEvidenceReference, type EvidenceReference } from '../../src/lib/evidence/upload.ts'
import {
  CLAIMANT,
  CONTRACT,
  EVIDENCE_URL,
  RESPONDENT,
  TX_HASH,
  disputeFixture,
  evidenceFixture,
  publicReceiptFixture,
  publicTraceFixture,
  resultEnvelope,
  studioReceiptFixture,
  traceReturnData,
} from './fixtures.ts'

type Route = 'studio-receipt' | 'public-trace'
type LifecycleOperation = 'accept' | 'decline' | 'evaluate'

const OTHER_HASH = `0x${'c'.repeat(64)}`
const OTHER_ACCOUNT = '0x4444444444444444444444444444444444444444'
const INJECTED_PROVIDER: InjectedProvider = {
  request: async (_args: { method: string; params?: unknown[] }) => [],
}

function canonical(overrides: Record<string, unknown> = {}) {
  return decodeCanonicalDispute(disputeFixture(overrides))
}

function readyDispute() {
  return canonical({
    status: 'READY_FOR_EVALUATION',
    criteria_status: 'RESPONDENT_ACCEPTED',
    accepted_at: '2026-08-19T11:00:00+00:00',
  })
}

function routeDependencies(
  route: Route,
  account: `0x${string}`,
  dispute: ReturnType<typeof canonical>,
  returnValue: string | boolean,
  options: {
    receipt?: Record<string, unknown>
    trace?: Record<string, unknown>
    traceError?: Error
    triggered?: string[]
  } = {},
) {
  const writes: Array<Record<string, unknown>> = []
  const traceCalls: Array<Record<string, unknown>> = []
  const client = {
    writeContract: async (args: Record<string, unknown>) => {
      writes.push(args)
      return TX_HASH
    },
    waitForTransactionReceipt: async () => ({}),
    getTransaction: async () => route === 'studio-receipt'
      ? studioReceiptFixture({
        consensus_data: {
          final: true,
          leader_receipt: [{ result: resultEnvelope(returnValue) }],
        },
        ...options.receipt,
      })
      : publicReceiptFixture(options.receipt),
    getTriggeredTransactionIds: async () => options.triggered ?? [],
    debugTraceTransaction: async (args: Record<string, unknown>) => {
      traceCalls.push(args)
      if (options.traceError) throw options.traceError
      return publicTraceFixture({ return_data: traceReturnData(returnValue), ...options.trace })
    },
  }
  const network = route === 'studio-receipt' ? NETWORK_CONFIG.studio : NETWORK_CONFIG.bradbury
  return {
    writes,
    traceCalls,
    dependencies: {
      network,
      contractAddress: CONTRACT,
      readDispute: async () => dispute,
      getWalletClient: async () => ({ client, account }),
    },
  }
}

function operationReturn(operation: LifecycleOperation): string | boolean {
  return operation === 'evaluate' ? 'CLAIMANT_UPHELD' : true
}

function operationDispute(operation: LifecycleOperation) {
  return operation === 'evaluate' ? readyDispute() : canonical()
}

async function submit(
  operation: LifecycleOperation,
  route: Route,
  account: `0x${string}` = RESPONDENT,
  evidence: EvidenceReference[] = [],
  options: Parameters<typeof routeDependencies>[4] = {},
) {
  const harness = routeDependencies(route, account, operationDispute(operation), operationReturn(operation), options)
  const result = operation === 'accept'
    ? await acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', evidence, undefined, harness.dependencies)
    : operation === 'decline'
      ? await declineDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', undefined, harness.dependencies)
      : await evaluateDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', undefined, harness.dependencies)
  return { result, ...harness }
}

function assertErrorKind(error: unknown, kind: GenLayerTransactionError['kind']): boolean {
  return error instanceof GenLayerTransactionError && error.kind === kind
}

test('lifecycle calldata uses canonical function names and zero value', () => {
  const evidence = [{ url: EVIDENCE_URL }]
  assert.deepEqual(lifecycleCall('ACCEPT_DISPUTE', 'DSP-0001', evidence), {
    functionName: 'accept_dispute',
    args: ['DSP-0001', evidence],
    value: 0n,
  })
  assert.deepEqual(lifecycleCall('DECLINE_DISPUTE', 'DSP-0001'), {
    functionName: 'decline_dispute',
    args: ['DSP-0001'],
    value: 0n,
  })
  assert.deepEqual(lifecycleCall('EVALUATE', 'DSP-0001'), {
    functionName: 'evaluate',
    args: ['DSP-0001'],
    value: 0n,
  })
})

test('return routes are selected explicitly from the configured network', () => {
  assert.equal(transactionReturnRouteForNetwork(NETWORK_CONFIG.studio), 'studio-receipt')
  assert.equal(transactionReturnRouteForNetwork(NETWORK_CONFIG.bradbury), 'public-trace')
})

for (const route of ['studio-receipt', 'public-trace'] as const) {
  for (const operation of ['accept', 'decline', 'evaluate'] as const) {
    test(`${operation} succeeds through the explicit ${route} route`, async () => {
      const evidence = operation === 'accept' ? [evidenceFixture()] : []
      const { result, writes, traceCalls } = await submit(operation, route, operation === 'evaluate' ? CLAIMANT : RESPONDENT, evidence)
      assert.equal(result.transaction.hash, TX_HASH)
      assert.equal(result.transaction.operation, operation === 'accept' ? 'ACCEPT_DISPUTE' : operation === 'decline' ? 'DECLINE_DISPUTE' : 'EVALUATE')
      assert.equal(result.transaction.returnValue, operationReturn(operation))
      assert.deepEqual(writes[0], operation === 'accept'
        ? { address: CONTRACT, functionName: 'accept_dispute', args: ['DSP-0001', evidence], value: 0n }
        : operation === 'decline'
          ? { address: CONTRACT, functionName: 'decline_dispute', args: ['DSP-0001'], value: 0n }
          : { address: CONTRACT, functionName: 'evaluate', args: ['DSP-0001'], value: 0n })
      if (route === 'studio-receipt') assert.deepEqual(traceCalls, [])
      else assert.deepEqual(traceCalls, [{ hash: TX_HASH, round: 0 }])
    })
  }
}

test('role and canonical status guards reject before writeContract', async () => {
  const wrongRespondent = routeDependencies('studio-receipt', CLAIMANT, canonical(), true)
  await assert.rejects(
    acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, wrongRespondent.dependencies),
    error => assertErrorKind(error, 'authorization'),
  )
  assert.equal(wrongRespondent.writes.length, 0)

  const wrongStatus = routeDependencies('studio-receipt', RESPONDENT, readyDispute(), true)
  await assert.rejects(
    declineDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', undefined, wrongStatus.dependencies),
    error => assertErrorKind(error, 'authorization'),
  )
  assert.equal(wrongStatus.writes.length, 0)

  const wrongEvaluator = routeDependencies('studio-receipt', OTHER_ACCOUNT, readyDispute(), 'CLAIMANT_UPHELD')
  await assert.rejects(
    evaluateDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', undefined, wrongEvaluator.dependencies),
    error => assertErrorKind(error, 'authorization'),
  )
  assert.equal(wrongEvaluator.writes.length, 0)
})

test('missing provider is rejected before a lifecycle wallet write', async () => {
  await assert.rejects(
    acceptDisputeOnChain(undefined, 'DSP-0001', [], undefined, {
      network: NETWORK_CONFIG.studio,
      contractAddress: CONTRACT,
      readDispute: async () => canonical(),
      getWalletClient: undefined,
    }),
    error => error instanceof WalletStateError && error.kind === 'provider',
  )
})

test('wrong injected chain is rejected before a lifecycle wallet write', async () => {
  const wrongChainProvider: InjectedProvider = {
    request: async ({ method }) => method === 'eth_accounts' ? [RESPONDENT] : '0x107d',
  }
  await assert.rejects(
    acceptDisputeOnChain(wrongChainProvider, 'DSP-0001', [], undefined, {
      network: NETWORK_CONFIG.studio,
      contractAddress: CONTRACT,
      readDispute: async () => canonical(),
    }),
    error => error instanceof WalletStateError && error.kind === 'chain',
  )
})

test('strict lifecycle return decoders reject false, wrong types, and unknown outcomes', async () => {
  const falseBoolean = routeDependencies('studio-receipt', RESPONDENT, canonical(), false)
  await assert.rejects(
    acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, falseBoolean.dependencies),
    error => assertErrorKind(error, 'execution'),
  )

  const wrongBoolean = routeDependencies('studio-receipt', RESPONDENT, canonical(), 'true')
  await assert.rejects(
    acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, wrongBoolean.dependencies),
    error => assertErrorKind(error, 'decode'),
  )

  const unknownOutcome = routeDependencies('public-trace', CLAIMANT, readyDispute(), 'MAYBE')
  await assert.rejects(
    evaluateDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', undefined, unknownOutcome.dependencies),
    error => assertErrorKind(error, 'decode'),
  )
})

for (const route of ['studio-receipt', 'public-trace'] as const) {
  test(`lifecycle return validation fails closed for malformed, failed, mismatched, missing, emitted, and child results (${route})`, async () => {
    const malformed = routeDependencies(route, RESPONDENT, canonical(), true, route === 'studio-receipt'
      ? { receipt: { consensus_data: { final: true, leader_receipt: [{ result: '' }] } } }
      : { trace: { return_data: '0x' } })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, malformed.dependencies),
      error => assertErrorKind(error, 'decode'),
    )

    const failed = routeDependencies(route, RESPONDENT, canonical(), true, route === 'studio-receipt'
      ? { receipt: { consensus_data: { final: true, leader_receipt: [{ result: Buffer.from([1]).toString('base64') }] } } }
      : { trace: { result_code: 1 } })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, failed.dependencies),
      error => assertErrorKind(error, 'execution'),
    )

    const mismatch = routeDependencies(route, RESPONDENT, canonical(), true, route === 'studio-receipt'
      ? { receipt: { txId: OTHER_HASH } }
      : { trace: { transaction_id: OTHER_HASH } })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, mismatch.dependencies),
      error => assertErrorKind(error, 'decode'),
    )

    const invalidCalldata = routeDependencies(route, RESPONDENT, canonical(), true, route === 'studio-receipt'
      ? { receipt: { consensus_data: { final: true, leader_receipt: [{ result: Buffer.from([0, 255]).toString('base64') }] } } }
      : { trace: { return_data: '0xff' } })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, invalidCalldata.dependencies),
      error => assertErrorKind(error, 'decode'),
    )

    const emitted = routeDependencies(route, RESPONDENT, canonical(), true, { triggered: [OTHER_HASH], receipt: { messages: [{ kind: 'unexpected' }] } })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, emitted.dependencies),
      error => assertErrorKind(error, 'triggered'),
    )

    const missingTrace = routeDependencies('public-trace', RESPONDENT, canonical(), true, { traceError: new Error('trace unavailable') })
    await assert.rejects(
      acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', [], undefined, missingTrace.dependencies),
      error => assertErrorKind(error, 'network'),
    )
  })
}

test('empty acceptance is explicit and signs exactly []', async () => {
  const harness = routeDependencies('studio-receipt', RESPONDENT, canonical(), true)
  await assert.rejects(
    writeWithConfirmedEvidence({
      references: [],
      confirmNoEvidence: false,
      write: verified => acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', verified, undefined, harness.dependencies),
    }),
    error => error instanceof EvidenceConfirmationError,
  )
  assert.equal(harness.writes.length, 0)

  const result = await writeWithConfirmedEvidence({
    references: [],
    confirmNoEvidence: true,
    write: verified => acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', verified, undefined, harness.dependencies),
  })
  assert.deepEqual(result.references, [])
  assert.deepEqual(harness.writes[0], {
    address: CONTRACT,
    functionName: 'accept_dispute',
    args: ['DSP-0001', []],
    value: 0n,
  })
})

test('evidence re-verification failure makes zero lifecycle wallet writes', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response('selected evidence', { status: 200, headers: { 'content-type': 'text/plain' } })) as typeof fetch
    const selected = await verifyEvidenceReference(EVIDENCE_URL)
    globalThis.fetch = (async () => new Response('changed evidence', { status: 200, headers: { 'content-type': 'text/plain' } })) as typeof fetch
    const harness = routeDependencies('studio-receipt', RESPONDENT, canonical(), true)
    await assert.rejects(
      writeWithConfirmedEvidence({
        references: [selected],
        confirmNoEvidence: false,
        write: verified => acceptDisputeOnChain(INJECTED_PROVIDER, 'DSP-0001', verified, undefined, harness.dependencies),
      }),
      error => error instanceof Error && error.name === 'EvidenceVerificationError',
    )
    assert.equal(harness.writes.length, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('known lifecycle transactions retain full hashes and operation-aware returns on rehydration', async () => {
  const records: KnownTransactionRecord[] = [
    { hash: TX_HASH, disputeId: 'DSP-0001', operation: 'ACCEPT_DISPUTE' },
    { hash: OTHER_HASH, disputeId: 'DSP-0001', operation: 'EVALUATE' },
  ]
  const client = {
    getTransaction: async ({ hash }: { hash: string }) => hash === TX_HASH
      ? studioReceiptFixture({ consensus_data: { final: true, leader_receipt: [{ result: resultEnvelope(true) }] } })
      : publicReceiptFixture({ txId: hash }),
    getTriggeredTransactionIds: async () => [],
    debugTraceTransaction: async ({ hash }: { hash: string }) => publicTraceFixture({ transaction_id: hash, return_data: traceReturnData('RESPONDENT_UPHELD') }),
  }
  const studio = await hydrateKnownTransactions(client, [records[0]], 'studio-receipt')
  assert.equal(studio.failures, 0)
  assert.equal(studio.transactions[0]?.hash, TX_HASH)
  assert.equal(studio.transactions[0]?.operation, 'ACCEPT_DISPUTE')
  assert.equal(studio.transactions[0]?.returnValue, true)

  const bradbury = await hydrateKnownTransactions(client, [records[1]], 'public-trace')
  assert.equal(bradbury.failures, 0)
  assert.equal(bradbury.transactions[0]?.hash, OTHER_HASH)
  assert.equal(bradbury.transactions[0]?.operation, 'EVALUATE')
  assert.equal(bradbury.transactions[0]?.returnValue, 'RESPONDENT_UPHELD')
})

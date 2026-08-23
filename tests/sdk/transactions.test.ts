import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GenLayerTransactionError,
  decodeCanonicalDisputeId,
  decodeLeaderReturnValues,
  decodePublicTraceReturnValues,
  hydrateKnownFilingTransactions,
  isWalletRejection,
  validateSuccessfulTransaction,
  waitForValidatedTransaction,
} from '../../src/lib/genlayer/transactions.ts'
import {
  CHILD_HASH,
  publicReceiptFixture,
  publicTraceFixture,
  studioLeaderReceiptFixture,
  studioReceiptFixture,
  studioResultEnvelope,
  studioValidatorReceiptFixture,
  TX_HASH,
} from './fixtures.ts'

test('decodes the official Studio consensus leader receipt route', () => {
  const receipt = studioReceiptFixture()
  assert.equal(receipt.result_name, 'MAJORITY_AGREE')
  assert.equal('resultName' in receipt, false)
  assert.equal('txExecutionResultName' in receipt, false)
  assert.deepEqual(decodeLeaderReturnValues(receipt), ['DSP-0001', 'DSP-0001'])
  const envelopeReceipt = studioReceiptFixture({
    consensus_data: { final: true, leader_receipt: [{ result: studioResultEnvelope('DSP-0001') }] },
  })
  assert.deepEqual(decodeLeaderReturnValues(envelopeReceipt), ['DSP-0001'])
  assert.equal(decodeCanonicalDisputeId(decodeLeaderReturnValues(envelopeReceipt)), 'DSP-0001')
})

test('decodes the official Bradbury trace route without consensus_data', () => {
  const publicReceipt = publicReceiptFixture()
  assert.equal('consensus_data' in publicReceipt, false)
  assert.deepEqual(decodePublicTraceReturnValues(publicTraceFixture(), TX_HASH), ['DSP-0001'])
})

test('validates common public transaction fields and retains the full submitted hash', () => {
  const validated = validateSuccessfulTransaction(publicReceiptFixture(), TX_HASH, [], {
    allowTriggeredTransactions: false,
    returnRoute: 'public-trace',
  })
  assert.equal(validated.hash, TX_HASH)
  assert.equal(validated.status, 'ACCEPTED')
  assert.equal(validated.executionResult, 'FINISHED_WITH_RETURN')
  assert.deepEqual(validated.triggeredTransactionIds, [])
})

test('distinguishes common status, consensus, execution, and malformed receipt failures', () => {
  const cases: Array<[Record<string, unknown>, GenLayerTransactionError['kind']]> = [
    [{ statusName: 'CANCELED' }, 'status'],
    [{ statusName: 'UNDETERMINED' }, 'status'],
    [{ statusName: 'VALIDATORS_TIMEOUT' }, 'status'],
    [{ resultName: undefined, result_name: 'MAJORITY_AGREE' }, 'decode'],
    [{ resultName: 'NO_MAJORITY' }, 'consensus'],
    [{ txExecutionResultName: 'FINISHED_WITH_ERROR' }, 'execution'],
    [{ txId: `0x${'c'.repeat(64)}` }, 'decode'],
  ]
  for (const [overrides, kind] of cases) {
    assert.throws(
      () => validateSuccessfulTransaction(publicReceiptFixture(overrides), TX_HASH, [], {
        allowTriggeredTransactions: false,
        returnRoute: 'public-trace',
      }),
      error => error instanceof GenLayerTransactionError && error.kind === kind,
    )
  }
})

test('validates and retains triggered transaction IDs only when allowed', () => {
  const receipt = publicReceiptFixture({ messages: [{ recipient: '0x1' }] })
  const validated = validateSuccessfulTransaction(receipt, TX_HASH, [CHILD_HASH], {
    allowTriggeredTransactions: true,
    returnRoute: 'public-trace',
  })
  assert.deepEqual(validated.triggeredTransactionIds, [CHILD_HASH])
  assert.throws(
    () => validateSuccessfulTransaction(receipt, TX_HASH, [], {
      allowTriggeredTransactions: true,
      returnRoute: 'public-trace',
    }),
    error => error instanceof GenLayerTransactionError && error.kind === 'triggered',
  )
  assert.throws(
    () => validateSuccessfulTransaction(publicReceiptFixture(), TX_HASH, [CHILD_HASH], {
      allowTriggeredTransactions: false,
      returnRoute: 'public-trace',
    }),
    error => error instanceof GenLayerTransactionError && error.kind === 'triggered',
  )
  assert.throws(
    () => validateSuccessfulTransaction(publicReceiptFixture({ messages: [{ recipient: '0x1' }] }), TX_HASH, [], {
      allowTriggeredTransactions: false,
      returnRoute: 'public-trace',
    }),
    error => error instanceof GenLayerTransactionError && error.kind === 'triggered',
  )
})

test('validates the exact Studio projection without camelCase consensus or transaction execution fields', () => {
  const validated = validateSuccessfulTransaction(studioReceiptFixture(), TX_HASH, [], {
    allowTriggeredTransactions: false,
    returnRoute: 'studio-receipt',
  })
  assert.equal(validated.hash, TX_HASH)
  assert.equal(validated.status, 'FINALIZED')
  assert.equal(validated.result, 'MAJORITY_AGREE')
  assert.equal(validated.executionResult, 'FINISHED_WITH_RETURN')
})

test('Studio validation fails closed for status, consensus, execution, return, and hash defects', () => {
  const failures: Array<[Record<string, unknown>, GenLayerTransactionError['kind']]> = [
    [{ statusName: undefined }, 'decode'],
    [{ statusName: 'PENDING' }, 'status'],
    [{ result_name: undefined, resultName: 'MAJORITY_AGREE' }, 'decode'],
    [{ result_name: 'NO_MAJORITY' }, 'consensus'],
    [{ hash: undefined, tx_id: undefined }, 'decode'],
    [{ tx_id: `0x${'c'.repeat(64)}` }, 'decode'],
    [{ consensus_data: { leader_receipt: [] } }, 'decode'],
    [{
      txExecutionResultName: 'FINISHED_WITH_RETURN',
      consensus_data: { leader_receipt: [studioLeaderReceiptFixture('DSP-0001', { execution_result: undefined })] },
    }, 'decode'],
    [{ consensus_data: { leader_receipt: [studioLeaderReceiptFixture('DSP-0001', { execution_result: 'ERROR' })] } }, 'execution'],
    [{
      consensus_data: {
        leader_receipt: [
          studioLeaderReceiptFixture(),
          studioValidatorReceiptFixture('DSP-0001', { execution_result: 'ERROR' }),
        ],
      },
    }, 'execution'],
    [{ consensus_data: { leader_receipt: [studioLeaderReceiptFixture('DSP-0001', { result: undefined })] } }, 'decode'],
    [{ consensus_data: { leader_receipt: [studioLeaderReceiptFixture('DSP-0001', { result: { status: 'error', payload: { raw: [] } } })] } }, 'decode'],
    [{ consensus_data: { leader_receipt: [studioLeaderReceiptFixture('DSP-0001', { mode: 'worker' })] } }, 'decode'],
    [{ consensus_data: { leader_receipt: [studioLeaderReceiptFixture(), studioLeaderReceiptFixture()] } }, 'decode'],
  ]
  for (const [overrides, kind] of failures) {
    assert.throws(
      () => validateSuccessfulTransaction(studioReceiptFixture(overrides), TX_HASH, [], {
        allowTriggeredTransactions: false,
        returnRoute: 'studio-receipt',
      }),
      error => error instanceof GenLayerTransactionError && error.kind === kind,
    )
  }
})

test('Studio validation rejects messages, child transactions, and disagreeing leader returns', async () => {
  const clients = [
    {
      receipt: studioReceiptFixture({ messages: [{ kind: 'unexpected' }] }),
      triggered: [] as string[],
      kind: 'triggered' as const,
    },
    {
      receipt: studioReceiptFixture(),
      triggered: [CHILD_HASH],
      kind: 'triggered' as const,
    },
    {
      receipt: studioReceiptFixture({
        consensus_data: {
          leader_receipt: [
            studioLeaderReceiptFixture('DSP-0001'),
            studioValidatorReceiptFixture('DSP-0002'),
          ],
        },
      }),
      triggered: [] as string[],
      kind: 'consensus' as const,
    },
  ]
  for (const { receipt, triggered, kind } of clients) {
    const client = {
      waitForTransactionReceipt: async () => ({}),
      getTransaction: async () => receipt,
      getTriggeredTransactionIds: async () => triggered,
      debugTraceTransaction: async () => { throw new Error('Studio must not use a public trace') },
    }
    await assert.rejects(
      async () => {
        const validated = await waitForValidatedTransaction(client, TX_HASH, {
          retries: 1,
          interval: 1,
          returnRoute: 'studio-receipt',
        })
        decodeCanonicalDisputeId(validated.returnValues)
      },
      error => error instanceof GenLayerTransactionError && error.kind === kind,
    )
  }
})

test('rejects malformed or unbound Bradbury traces', () => {
  const failures: Array<[Record<string, unknown>, GenLayerTransactionError['kind']]> = [
    [{ transaction_id: `0x${'c'.repeat(64)}` }, 'decode'],
    [{ result_code: 1 }, 'execution'],
    [{ return_data: '0x' }, 'decode'],
    [{ return_data: 'not-hex' }, 'decode'],
    [{ return_data: '0xff' }, 'decode'],
    [{ return_data: '0x00ff' }, 'decode'],
  ]
  for (const [overrides, kind] of failures) {
    assert.throws(
      () => decodePublicTraceReturnValues(publicTraceFixture(overrides), TX_HASH),
      error => error instanceof GenLayerTransactionError && error.kind === kind,
    )
  }
})

test('selects Studio and Bradbury return routes explicitly while waiting', async () => {
  const studioCalls: string[] = []
  const studioClient = {
    waitForTransactionReceipt: async () => { studioCalls.push('wait'); return { statusName: 'ACCEPTED' } },
    getTransaction: async () => { studioCalls.push('get'); return studioReceiptFixture() },
    getTriggeredTransactionIds: async () => { studioCalls.push('triggered'); return [] },
    debugTraceTransaction: async () => { throw new Error('must not use public trace for Studio') },
  }
  const studio = await waitForValidatedTransaction(studioClient, TX_HASH, {
    retries: 1,
    interval: 1,
    returnRoute: 'studio-receipt',
  })
  assert.deepEqual(studio.returnValues, ['DSP-0001', 'DSP-0001'])
  assert.deepEqual(studioCalls, ['wait', 'get', 'triggered'])

  const publicCalls: string[] = []
  const publicClient = {
    waitForTransactionReceipt: async () => { publicCalls.push('wait'); return { statusName: 'ACCEPTED' } },
    getTransaction: async () => { publicCalls.push('get'); return publicReceiptFixture() },
    getTriggeredTransactionIds: async () => { publicCalls.push('triggered'); return [] },
    debugTraceTransaction: async () => { publicCalls.push('trace'); return publicTraceFixture() },
  }
  const publicResult = await waitForValidatedTransaction(publicClient, TX_HASH, {
    retries: 1,
    interval: 1,
    returnRoute: 'public-trace',
  })
  assert.deepEqual(publicResult.returnValues, ['DSP-0001'])
  assert.deepEqual(publicCalls, ['wait', 'get', 'triggered', 'trace'])
})

test('missing public trace is a network/return verification failure', async () => {
  const client = {
    waitForTransactionReceipt: async () => ({ statusName: 'ACCEPTED' }),
    getTransaction: async () => publicReceiptFixture(),
    getTriggeredTransactionIds: async () => [],
    debugTraceTransaction: async () => { throw new Error('trace unavailable') },
  }
  await assert.rejects(
    waitForValidatedTransaction(client, TX_HASH, { retries: 1, interval: 1, returnRoute: 'public-trace' }),
    error => error instanceof GenLayerTransactionError && error.kind === 'network',
  )
})

test('classifies wallet rejection and polling failures separately', async () => {
  assert.equal(isWalletRejection({ cause: { code: 4001 } }), true)
  assert.equal(isWalletRejection(new Error('network')), false)
  const client = {
    waitForTransactionReceipt: async () => { throw new Error('timed out') },
    getTransaction: async () => studioReceiptFixture(),
    getTriggeredTransactionIds: async () => [],
    debugTraceTransaction: async () => publicTraceFixture(),
  }
  await assert.rejects(
    waitForValidatedTransaction(client, TX_HASH, { retries: 1, interval: 1, returnRoute: 'studio-receipt' }),
    error => error instanceof GenLayerTransactionError && error.kind === 'polling',
  )
})

test('known transaction rehydration uses the selected Studio or Bradbury route', async () => {
  const studioClient = {
    getTransaction: async () => studioReceiptFixture(),
    getTriggeredTransactionIds: async () => [],
    debugTraceTransaction: async () => { throw new Error('unexpected Studio trace') },
  }
  const studio = await hydrateKnownFilingTransactions(studioClient, [TX_HASH], 'studio-receipt')
  assert.equal(studio.failures, 0)
  assert.equal(studio.transactions[0]?.disputeId, 'DSP-0001')

  const publicClient = {
    getTransaction: async () => publicReceiptFixture(),
    getTriggeredTransactionIds: async () => [],
    debugTraceTransaction: async () => publicTraceFixture(),
  }
  const publicResult = await hydrateKnownFilingTransactions(publicClient, [TX_HASH], 'public-trace')
  assert.equal(publicResult.failures, 0)
  assert.equal(publicResult.transactions[0]?.disputeId, 'DSP-0001')

  const failed = await hydrateKnownFilingTransactions({
    ...publicClient,
    debugTraceTransaction: async () => publicTraceFixture({ transaction_id: `0x${'c'.repeat(64)}` }),
  }, [TX_HASH], 'public-trace')
  assert.deepEqual(failed, { transactions: [], failures: 1 })
})

test('never derives a dispute ID from counters or ambiguous return values', () => {
  assert.throws(() => decodeCanonicalDisputeId([1n]), error => error instanceof GenLayerTransactionError && error.kind === 'decode')
  assert.throws(() => decodeCanonicalDisputeId(['DSP-0001', 'DSP-0002']), error => error instanceof GenLayerTransactionError)
})

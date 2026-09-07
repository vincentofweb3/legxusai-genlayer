import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearCanonicalDisputeCache,
  clearLegacyCanonicalCaches,
  hydrateCanonicalDisputes,
  loadCanonicalDisputeCache,
  saveCanonicalDisputeCache,
} from '../../src/lib/genlayer/disputes.ts'
import { CONTRACT_STATE_VERSION, type CanonicalIdentity } from '../../src/lib/genlayer/types.ts'
import { CONTRACT, disputeFixture } from './fixtures.ts'

class MemoryStorage {
  readonly data = new Map<string, string>()
  get length() { return this.data.size }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  key(index: number) { return [...this.data.keys()][index] ?? null }
}

const identity: CanonicalIdentity = {
  chainId: 61999,
  contractAddress: CONTRACT,
  stateVersion: CONTRACT_STATE_VERSION,
}

function disputeCacheKey(chainId: number, contractAddress: string, stateVersion: string): string {
  return `legxus:canonical-disputes:v1:${chainId}:${contractAddress.toLowerCase()}:${stateVersion}`
}

test('empty-cache startup hydrates the canonical dispute set', async () => {
  const calls: string[] = []
  const client = {
    readContract: async ({ functionName }: { functionName: string }) => {
      calls.push(functionName)
      if (functionName === 'get_state_version') return CONTRACT_STATE_VERSION
      return new Map([['DSP-0001', disputeFixture()]])
    },
  }
  const hydration = await hydrateCanonicalDisputes(client, identity)
  assert.deepEqual(calls, ['get_state_version', 'get_all_disputes'])
  assert.deepEqual(hydration.disputes.map(dispute => dispute.id), ['DSP-0001'])
})

test('a newer canonical read replaces an older valid cache for the same identity', async () => {
  const storage = new MemoryStorage()
  const initial = await hydrateCanonicalDisputes({
    readContract: async ({ functionName }: { functionName: string }) => functionName === 'get_state_version'
      ? CONTRACT_STATE_VERSION
      : new Map([['DSP-0001', disputeFixture()]]),
  }, identity)
  saveCanonicalDisputeCache(storage, initial)
  assert.equal(loadCanonicalDisputeCache(storage, identity)?.[0]?.title, 'Valid test dispute')

  const replacement = await hydrateCanonicalDisputes({
    readContract: async ({ functionName }: { functionName: string }) => functionName === 'get_state_version'
      ? CONTRACT_STATE_VERSION
      : new Map([['DSP-0001', disputeFixture({ title: 'Newer canonical title' })]]),
  }, identity)
  saveCanonicalDisputeCache(storage, replacement)

  const cached = loadCanonicalDisputeCache(storage, identity)
  assert.equal(cached?.length, 1)
  assert.equal(cached?.[0]?.title, 'Newer canonical title')
})

test('network, contract, and state-version identity changes invalidate scoped caches', async () => {
  const canonical = await hydrateCanonicalDisputes({
    readContract: async ({ functionName }: { functionName: string }) => functionName === 'get_state_version'
      ? CONTRACT_STATE_VERSION
      : new Map([['DSP-0001', disputeFixture()]]),
  }, identity)
  const seed = new MemoryStorage()
  saveCanonicalDisputeCache(seed, canonical)
  const currentKey = disputeCacheKey(identity.chainId, identity.contractAddress, identity.stateVersion)
  const raw = seed.getItem(currentKey)
  assert.ok(raw)

  const foreignKeys = [
    disputeCacheKey(4221, identity.contractAddress, identity.stateVersion),
    disputeCacheKey(identity.chainId, '0x4444444444444444444444444444444444444444', identity.stateVersion),
    disputeCacheKey(identity.chainId, identity.contractAddress, 'DISPUTE_STATE_V2'),
  ]

  for (const foreignKey of foreignKeys) {
    const storage = new MemoryStorage()
    storage.setItem(foreignKey, raw)
    assert.equal(loadCanonicalDisputeCache(storage, identity), null)
    assert.equal(storage.getItem(foreignKey), null)
  }
})

test('malformed cache and failed hydration do not fabricate empty success or seed data', async () => {
  const storage = new MemoryStorage()
  storage.setItem(`legxus:canonical-disputes:v1:${identity.chainId}:${identity.contractAddress}:${identity.stateVersion}`, '{bad')
  assert.equal(loadCanonicalDisputeCache(storage, identity), null)

  await assert.rejects(
    hydrateCanonicalDisputes({ readContract: async () => { throw new Error('network unavailable') } }, identity),
    /network unavailable/,
  )
  assert.equal(storage.data.size, 0)
})

test('a canonical state-version mismatch invalidates the previous cache', async () => {
  const storage = new MemoryStorage()
  const initial = await hydrateCanonicalDisputes({
    readContract: async ({ functionName }: { functionName: string }) => functionName === 'get_state_version'
      ? CONTRACT_STATE_VERSION
      : new Map([['DSP-0001', disputeFixture()]]),
  }, identity)
  saveCanonicalDisputeCache(storage, initial)

  await assert.rejects(
    hydrateCanonicalDisputes({ readContract: async () => 'DISPUTE_STATE_V4' }, identity),
    error => error instanceof Error && error.message.includes('get_state_version'),
  )
  clearCanonicalDisputeCache(storage, identity)
  assert.equal(loadCanonicalDisputeCache(storage, identity), null)
})

test('legacy browser-authoritative keys are removed', () => {
  const storage = new MemoryStorage()
  storage.setItem('legxus_disputes', '[{"fake":true}]')
  storage.setItem('legxus_transactions', '[{"fake":true}]')
  clearLegacyCanonicalCaches(storage)
  assert.equal(storage.getItem('legxus_disputes'), null)
  assert.equal(storage.getItem('legxus_transactions'), null)
})

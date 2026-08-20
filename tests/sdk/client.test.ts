import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WalletStateError,
  buildPublicClientConfig,
  buildWalletClientConfig,
  requireWalletWriteState,
  type InjectedProvider,
} from '../../src/lib/genlayer/client.ts'
import { NETWORK_CONFIG } from '../../src/lib/genlayer/config.ts'
import { CLAIMANT } from './fixtures.ts'

function provider(responses: Record<string, unknown>): InjectedProvider {
  return {
    request: async ({ method }) => {
      if (!(method in responses)) throw new Error(`Unexpected method ${method}`)
      return responses[method]
    },
  }
}

test('public client configuration has no wallet account or provider dependency', () => {
  const config = buildPublicClientConfig(NETWORK_CONFIG.studio)
  assert.equal(config.chain, NETWORK_CONFIG.studio.chain)
  assert.equal(config.account, undefined)
  assert.equal(config.provider, undefined)
})

test('wallet client configuration supplies the selected account and injected provider', () => {
  const injected = provider({})
  const config = buildWalletClientConfig(injected, CLAIMANT, NETWORK_CONFIG.studio)
  assert.equal(config.account, CLAIMANT)
  assert.equal(config.provider, injected)
  assert.equal(config.chain, NETWORK_CONFIG.studio.chain)
})

test('write readiness re-reads and validates account and chain state', async () => {
  let calls = 0
  const injected: InjectedProvider = {
    request: async ({ method }) => {
      calls += 1
      return method === 'eth_accounts' ? [CLAIMANT] : '0xf22f'
    },
  }
  assert.deepEqual(await requireWalletWriteState(injected, 61999), { account: CLAIMANT, chainId: 61999 })
  assert.equal(calls, 2)
})

test('missing provider, missing account, wrong chain, and malformed state prevent writes', async () => {
  await assert.rejects(requireWalletWriteState(undefined, 61999), error => error instanceof WalletStateError && error.kind === 'provider')
  await assert.rejects(
    requireWalletWriteState(provider({ eth_accounts: [], eth_chainId: '0xf22f' }), 61999),
    error => error instanceof WalletStateError && error.kind === 'account',
  )
  await assert.rejects(
    requireWalletWriteState(provider({ eth_accounts: [CLAIMANT], eth_chainId: '0x107d' }), 61999),
    error => error instanceof WalletStateError && error.kind === 'chain',
  )
  await assert.rejects(
    requireWalletWriteState(provider({ eth_accounts: ['bad'], eth_chainId: 'not-hex' }), 61999),
    error => error instanceof WalletStateError,
  )
})

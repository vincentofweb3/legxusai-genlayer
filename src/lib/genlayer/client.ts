import { createClient } from 'genlayer-js'
import { requireConfiguredNetwork } from './config.ts'
import { decodeAddress } from './types.ts'

type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>

export type GenLayerClient = ReturnType<typeof createClient>
export type InjectedProvider = NonNullable<ClientConfig['provider']>
export type BrowserProvider = InjectedProvider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  selectedAddress?: string | null
}

export class WalletStateError extends Error {
  readonly kind: 'provider' | 'account' | 'chain'

  constructor(kind: WalletStateError['kind'], message: string) {
    super(message)
    this.name = 'WalletStateError'
    this.kind = kind
  }
}

export function parseChainId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null
  const parsed = Number.parseInt(value.slice(2), 16)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export async function readInjectedAccounts(provider: InjectedProvider): Promise<`0x${string}`[]> {
  const value = await provider.request({ method: 'eth_accounts' })
  if (!Array.isArray(value)) throw new WalletStateError('account', 'The wallet returned a malformed account list.')
  return value.map((account, index) => {
    try {
      return decodeAddress(account, `eth_accounts[${index}]`)
    } catch {
      throw new WalletStateError('account', 'The wallet returned a malformed account address.')
    }
  })
}

export async function readInjectedChainId(provider: InjectedProvider): Promise<number> {
  const chainId = parseChainId(await provider.request({ method: 'eth_chainId' }))
  if (chainId === null) throw new WalletStateError('chain', 'The wallet returned a malformed chain ID.')
  return chainId
}

export async function requireWalletWriteState(
  provider: InjectedProvider | undefined,
  expectedChainId: number,
): Promise<{ account: `0x${string}`; chainId: number }> {
  if (!provider) throw new WalletStateError('provider', 'An injected EIP-1193 wallet provider is required.')
  const [accounts, chainId] = await Promise.all([
    readInjectedAccounts(provider),
    readInjectedChainId(provider),
  ])
  if (accounts.length === 0) throw new WalletStateError('account', 'Connect a wallet account before sending a transaction.')
  if (chainId !== expectedChainId) {
    throw new WalletStateError('chain', `The wallet is on chain ${chainId}; expected chain ${expectedChainId}.`)
  }
  return { account: accounts[0], chainId }
}

export function buildPublicClientConfig(network = requireConfiguredNetwork()): ClientConfig {
  return { chain: network.chain }
}

export function buildWalletClientConfig(
  provider: InjectedProvider,
  account: `0x${string}`,
  network = requireConfiguredNetwork(),
): ClientConfig {
  return { chain: network.chain, account, provider }
}

export function getPublicClient(network = requireConfiguredNetwork()): GenLayerClient {
  return createClient(buildPublicClientConfig(network))
}

export async function getWalletClient(
  provider: InjectedProvider | undefined,
  network = requireConfiguredNetwork(),
): Promise<{ client: GenLayerClient; account: `0x${string}` }> {
  if (!provider) throw new WalletStateError('provider', 'An injected EIP-1193 wallet provider is required.')
  const { account } = await requireWalletWriteState(provider, network.chainId)
  return {
    client: createClient(buildWalletClientConfig(provider, account, network)),
    account,
  }
}

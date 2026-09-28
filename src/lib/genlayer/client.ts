import { createClient } from 'genlayer-js'
import { requireConfiguredNetwork, type EnvironmentName } from './config.ts'
import type { NETWORK_CONFIG } from './config.ts'
import { decodeAddress } from './types.ts'

type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>

export type GenLayerClient = ReturnType<typeof createClient>
export type InjectedProvider = NonNullable<ClientConfig['provider']>
export type BrowserProvider = InjectedProvider & {
  on?: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
  selectedAddress?: string | null
}

export type ConfiguredNetwork = (typeof NETWORK_CONFIG)[EnvironmentName]

export type WalletNetworkErrorKind = 'provider' | 'rejected' | 'switch' | 'add' | 'verification'

export class WalletNetworkError extends Error {
  readonly kind: WalletNetworkErrorKind

  constructor(kind: WalletNetworkErrorKind, message: string) {
    super(message)
    this.name = 'WalletNetworkError'
    this.kind = kind
  }
}

export type InjectedWalletSnapshot = {
  address?: `0x${string}` | null
  chainId?: number | null
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

function providerErrorCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as { code?: unknown; data?: unknown; cause?: unknown }
  if (typeof record.code === 'number' && Number.isInteger(record.code)) return record.code
  if (typeof record.code === 'string' && /^\d+$/.test(record.code)) return Number(record.code)
  return providerErrorCode(record.data) ?? providerErrorCode(record.cause)
}

function networkChainIdHex(network: ConfiguredNetwork): `0x${string}` {
  return `0x${network.chain.id.toString(16)}`
}

export function walletAddEthereumChainParams(network: ConfiguredNetwork): Record<string, unknown> {
  const explorerUrl = network.chain.blockExplorers?.default?.url
  return {
    chainId: networkChainIdHex(network),
    chainName: network.chain.name,
    nativeCurrency: network.chain.nativeCurrency,
    rpcUrls: [...network.chain.rpcUrls.default.http],
    ...(explorerUrl ? { blockExplorerUrls: [explorerUrl] } : {}),
  }
}

export async function switchInjectedNetwork(
  provider: InjectedProvider | undefined,
  network: ConfiguredNetwork = requireConfiguredNetwork(),
): Promise<number> {
  if (!provider) throw new WalletNetworkError('provider', 'An injected EIP-1193 wallet provider is required.')

  const chainId = networkChainIdHex(network)
  let added = false
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (error) {
    const code = providerErrorCode(error)
    if (code === 4001) {
      throw new WalletNetworkError('rejected', `The wallet rejected the request to switch to ${network.chain.name}.`)
    }
    if (code !== 4902) {
      throw new WalletNetworkError('switch', `The wallet could not switch to ${network.chain.name}.`)
    }
    added = true
    try {
      await provider.request({ method: 'wallet_addEthereumChain', params: [walletAddEthereumChainParams(network)] })
    } catch (addError) {
      if (providerErrorCode(addError) === 4001) {
        throw new WalletNetworkError('rejected', `The wallet rejected adding ${network.chain.name}.`)
      }
      throw new WalletNetworkError('add', `The wallet could not add ${network.chain.name}.`)
    }
  }

  let selectedChainId = await readInjectedChainId(provider)
  if (selectedChainId !== network.chainId && added) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
    } catch (error) {
      if (providerErrorCode(error) === 4001) {
        throw new WalletNetworkError('rejected', `The wallet rejected the request to switch to ${network.chain.name}.`)
      }
      throw new WalletNetworkError('switch', `The wallet added ${network.chain.name}, but could not select it.`)
    }
    selectedChainId = await readInjectedChainId(provider)
  }

  if (selectedChainId !== network.chainId) {
    throw new WalletNetworkError('verification', `The wallet is still on chain ${selectedChainId}; expected ${network.chainId}.`)
  }
  return selectedChainId
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

function decodeAccountEvent(value: unknown): `0x${string}` | null {
  if (!Array.isArray(value)) throw new WalletStateError('account', 'The wallet returned a malformed account list.')
  if (value.length === 0) return null
  try {
    return decodeAddress(value[0], 'accountsChanged[0]')
  } catch {
    throw new WalletStateError('account', 'The wallet returned a malformed account address.')
  }
}

export function subscribeInjectedWallet(
  provider: BrowserProvider | undefined,
  onChange: (snapshot: InjectedWalletSnapshot) => void,
  onError: (error: WalletStateError) => void,
): () => void {
  if (!provider?.on || !provider.removeListener) return () => undefined

  const handleAccountsChanged = (value: unknown) => {
    try {
      onChange({ address: decodeAccountEvent(value) })
    } catch (error) {
      onError(error instanceof WalletStateError ? error : new WalletStateError('account', 'The wallet account changed to an invalid value.'))
    }
  }
  const handleChainChanged = (value: unknown) => {
    const chainId = parseChainId(value)
    if (chainId === null) {
      onError(new WalletStateError('chain', 'The wallet returned a malformed chain ID.'))
      return
    }
    onChange({ chainId })
  }

  provider.on('accountsChanged', handleAccountsChanged)
  provider.on('chainChanged', handleChainChanged)
  return () => {
    provider.removeListener?.('accountsChanged', handleAccountsChanged)
    provider.removeListener?.('chainChanged', handleChainChanged)
  }
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

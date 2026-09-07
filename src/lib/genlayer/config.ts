import { studionet, testnetBradbury } from 'genlayer-js/chains'
import projectConfig from '../../../config/genlayer_config.json' with { type: 'json' }

export const GENLAYER_CLI_VERSION = projectConfig.toolchain.cli
export const GENLAYER_JS_VERSION = projectConfig.toolchain.sdk

const SDK_CHAINS = {
  studio: studionet,
  bradbury: testnetBradbury,
} as const

export type EnvironmentName = keyof typeof SDK_CHAINS

function defineNetwork(environment: EnvironmentName) {
  const configuredNetwork = projectConfig.environments[environment]
  const chain = SDK_CHAINS[environment]
  const sdkRpcUrl = chain.rpcUrls.default.http[0]
  const sdkExplorerUrl = chain.blockExplorers?.default?.url ?? null

  if (
    configuredNetwork.chainId !== chain.id
    || configuredNetwork.label !== chain.name
    || configuredNetwork.rpcUrl !== sdkRpcUrl
    || configuredNetwork.explorerUrl !== sdkExplorerUrl
  ) {
    throw new Error(`Project network metadata for ${environment} does not match genlayer-js ${GENLAYER_JS_VERSION}.`)
  }

  return {
    environment,
    ...configuredNetwork,
    chain,
  }
}

export const NETWORK_CONFIG = {
  studio: defineNetwork('studio'),
  bradbury: defineNetwork('bradbury'),
} as const

export interface DeploymentManifest {
  application: 'LegxusAI'
  environment: EnvironmentName
  networkAlias: string
  chainId: number
  rpcUrl: string
  explorerUrl: string | null
  contractAddress: string | null
  deploymentTxHash: string | null
  genlayerCliVersion: string
  genlayerJsVersion: string
  genvmRunner: string | null
}

const requestedEnvironment = (import.meta.env?.VITE_GENLAYER_ENV ?? '').trim().toLowerCase()
const activeEnvironment: EnvironmentName | null = requestedEnvironment === 'studio' || requestedEnvironment === 'bradbury'
  ? requestedEnvironment
  : null
const requestedContractAddress = (import.meta.env?.VITE_DISPUTE_CONTRACT_ADDRESS ?? '').trim()
const contractAddress = /^0x[0-9a-fA-F]{40}$/.test(requestedContractAddress)
  ? requestedContractAddress
  : null
const configurationIssue = !activeEnvironment
  ? 'Set VITE_GENLAYER_ENV to studio or bradbury.'
  : !requestedContractAddress
    ? 'Set VITE_DISPUTE_CONTRACT_ADDRESS to a verified deployment on the selected target.'
    : !contractAddress
      ? 'VITE_DISPUTE_CONTRACT_ADDRESS must be a 20-byte hexadecimal address.'
      : null

export const GENLAYER_CONFIG = {
  requestedEnvironment,
  environment: activeEnvironment,
  network: activeEnvironment ? NETWORK_CONFIG[activeEnvironment] : null,
  contractAddress,
  configurationIssue,
  settlement: 'advisory-only' as const,
  toolchain: {
    cli: GENLAYER_CLI_VERSION,
    sdk: GENLAYER_JS_VERSION,
    genvmRunner: projectConfig.toolchain.genvmRunner,
  },
}

export function getNetworkLabel() {
  return GENLAYER_CONFIG.network?.label ?? 'Network not configured'
}

export function requireConfiguredNetwork() {
  if (!GENLAYER_CONFIG.network) {
    throw new Error('Set VITE_GENLAYER_ENV to studio or bradbury before using GenLayer.')
  }
  return GENLAYER_CONFIG.network
}

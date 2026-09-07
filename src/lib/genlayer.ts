import { TransactionStatus } from 'genlayer-js/types'
import { GENLAYER_CONFIG } from './genlayer/config.ts'

export { TransactionStatus }
export { getPublicClient as getReadClient, getWalletClient } from './genlayer/client.ts'
export {
  acceptDisputeOnChain,
  declineDisputeOnChain,
  evaluateDisputeOnChain,
  GenLayerConfigurationError as GenLayerNotConfiguredError,
  configuredCanonicalIdentity,
  fileDisputeOnChain,
  hydrateCanonicalDisputes,
} from './genlayer/disputes.ts'
export type { CanonicalDispute } from './genlayer/types.ts'
export type { DisputeTransaction, FilingTransaction } from './genlayer/transactions.ts'

export const DISPUTE_CONTRACT_ADDRESS = GENLAYER_CONFIG.contractAddress ?? undefined

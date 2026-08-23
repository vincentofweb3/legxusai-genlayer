import { abi } from 'genlayer-js'
import { TransactionStatus } from 'genlayer-js/types'
import type { TransactionHash as SdkTransactionHash } from 'genlayer-js/types'
import type { CanonicalIdentity } from './types'

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/
const TRANSACTION_CACHE_PREFIX = 'legxus:known-transactions:v1:'

export type TransactionHash = SdkTransactionHash
export type SuccessfulTransactionStatus = 'ACCEPTED' | 'FINALIZED'

export type ValidatedTransaction = {
  hash: TransactionHash
  status: SuccessfulTransactionStatus
  result: 'AGREE' | 'MAJORITY_AGREE'
  executionResult: 'FINISHED_WITH_RETURN'
  returnValues: unknown[]
  triggeredTransactionIds: TransactionHash[]
}

export type EvaluationOutcome = 'CLAIMANT_UPHELD' | 'RESPONDENT_UPHELD' | 'UNDETERMINED'
export type TransactionOperation = 'FILE_DISPUTE' | 'ACCEPT_DISPUTE' | 'DECLINE_DISPUTE' | 'EVALUATE'
export type TransactionReturnValue = string | boolean | EvaluationOutcome

export type DisputeTransaction = ValidatedTransaction & {
  disputeId: string
  operation: TransactionOperation
  returnValue: TransactionReturnValue
}

/** Compatibility name retained for existing filing integrations. */
export type FilingTransaction = DisputeTransaction

export function transactionOperationLabel(operation: TransactionOperation): string {
  if (operation === 'FILE_DISPUTE') return 'Dispute filed'
  if (operation === 'ACCEPT_DISPUTE') return 'Respondent accepted'
  if (operation === 'DECLINE_DISPUTE') return 'Respondent declined'
  return 'Evaluation requested'
}

export type KnownTransactionRecord = {
  hash: TransactionHash
  disputeId: string
  operation: TransactionOperation
}

export type TransactionReturnRoute = 'studio-receipt' | 'public-trace'

export type ReceiptClient = {
  waitForTransactionReceipt: (args: {
    hash: TransactionHash
    status: TransactionStatus
    retries: number
    interval: number
  }) => Promise<unknown>
  getTransaction: (args: { hash: TransactionHash }) => Promise<unknown>
  getTriggeredTransactionIds: (args: { hash: TransactionHash }) => Promise<unknown>
  debugTraceTransaction: (args: { hash: TransactionHash; round?: number }) => Promise<unknown>
}

export type TransactionReadClient = {
  getTransaction: (args: { hash: TransactionHash }) => Promise<unknown>
  getTriggeredTransactionIds: (args: { hash: TransactionHash }) => Promise<unknown>
  debugTraceTransaction: (args: { hash: TransactionHash; round?: number }) => Promise<unknown>
}

export class GenLayerTransactionError extends Error {
  readonly kind:
    | 'wallet-rejected'
    | 'polling'
    | 'status'
    | 'consensus'
    | 'execution'
    | 'decode'
    | 'triggered'
    | 'network'
    | 'authorization'

  constructor(kind: GenLayerTransactionError['kind'], message: string) {
    super(message)
    this.name = 'GenLayerTransactionError'
    this.kind = kind
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Map) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function decodeTransactionHash(value: unknown, path = 'transaction hash'): TransactionHash {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new GenLayerTransactionError('decode', `${path} must be a full 32-byte hexadecimal hash.`)
  }
  return value as TransactionHash
}

function bytesFromBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new GenLayerTransactionError('decode', 'The leader receipt result is not valid base64.')
  }
  let binary: string
  try {
    binary = globalThis.atob(value)
  } catch {
    throw new GenLayerTransactionError('decode', 'The leader receipt result could not be decoded from base64.')
  }
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function bytesFromHex(value: unknown, path: string): Uint8Array {
  if (typeof value !== 'string' || value === '0x' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new GenLayerTransactionError('decode', `${path} must be a nonempty 0x-prefixed byte string.`)
  }
  const bytes = new Uint8Array((value.length - 2) / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(2 + index * 2, 4 + index * 2), 16)
  }
  return bytes
}

function bytesFromArray(value: unknown, path: string): Uint8Array {
  if (!Array.isArray(value) || value.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new GenLayerTransactionError('decode', `${path} must be a byte array.`)
  }
  return Uint8Array.from(value)
}

function decodeCalldata(bytes: Uint8Array): unknown {
  try {
    return abi.calldata.decode(bytes)
  } catch {
    throw new GenLayerTransactionError('decode', 'The verified return payload is not valid GenLayer calldata.')
  }
}

export function decodeSuccessfulBooleanReturn(values: unknown[], operation: string): true {
  if (values.length === 0) {
    throw new GenLayerTransactionError('decode', `${operation} returned no contract value.`)
  }
  if (values.some(value => typeof value !== 'boolean')) {
    throw new GenLayerTransactionError('decode', `${operation} did not return a strict boolean value.`)
  }
  if (values.some(value => value === false)) {
    throw new GenLayerTransactionError('execution', `${operation} returned false instead of confirming success.`)
  }
  return true
}

export function decodeEvaluationOutcome(values: unknown[]): EvaluationOutcome {
  if (values.length === 0) {
    throw new GenLayerTransactionError('decode', 'Evaluation returned no contract value.')
  }
  const allowed: readonly EvaluationOutcome[] = ['CLAIMANT_UPHELD', 'RESPONDENT_UPHELD', 'UNDETERMINED']
  const outcomes = values.map((value, index) => {
    if (typeof value !== 'string' || !allowed.includes(value as EvaluationOutcome)) {
      throw new GenLayerTransactionError('decode', `Evaluation return ${index} is not an allowed advisory outcome.`)
    }
    return value as EvaluationOutcome
  })
  if (new Set(outcomes).size !== 1) {
    throw new GenLayerTransactionError('consensus', 'Evaluation receipts disagree on the advisory outcome.')
  }
  return outcomes[0]
}

function decodeStudioResultBytes(bytes: Uint8Array, source: string): unknown {
  if (bytes.length === 0) throw new GenLayerTransactionError('decode', `The ${source} return payload is empty.`)
  if (bytes[0] !== 0) {
    throw new GenLayerTransactionError('execution', `The ${source} returned GenVM result code ${bytes[0]} instead of a contract return.`)
  }
  if (bytes.length < 2) throw new GenLayerTransactionError('decode', `The ${source} return payload is empty.`)
  return decodeCalldata(bytes.slice(1))
}

function decodeResultEnvelope(value: unknown): unknown {
  if (typeof value === 'string') {
    const bytes = bytesFromBase64(value)
    return decodeStudioResultBytes(bytes, 'Studio leader receipt')
  }

  if (!isRecord(value) || value.status !== 'return' || !isRecord(value.payload)) {
    throw new GenLayerTransactionError('decode', 'The Studio leader receipt does not contain a verified return envelope.')
  }
  return decodeCalldata(bytesFromArray(value.payload.raw, 'leader receipt payload.raw'))
}

/** Decode the public SDK's transaction-hash-bound debug trace return surface. */
export function decodePublicTraceReturnValues(trace: unknown, expectedHashValue: unknown): unknown[] {
  const expectedHash = decodeTransactionHash(expectedHashValue)
  if (!isRecord(trace)) {
    throw new GenLayerTransactionError('decode', 'The public transaction trace is malformed.')
  }
  const traceHash = decodeTransactionHash(trace.transaction_id, 'trace transaction_id')
  if (traceHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new GenLayerTransactionError('decode', 'The transaction trace does not match the submitted transaction hash.')
  }
  if (typeof trace.result_code !== 'number' || !Number.isInteger(trace.result_code)) {
    throw new GenLayerTransactionError('decode', 'The public transaction trace has no valid result code.')
  }
  if (trace.result_code !== 0) {
    throw new GenLayerTransactionError('execution', `The public transaction trace returned result code ${trace.result_code}.`)
  }
  const returnData = bytesFromHex(trace.return_data, 'trace return_data')
  if (returnData.length === 0) {
    throw new GenLayerTransactionError('decode', 'The public transaction trace return payload is empty.')
  }
  return [decodeCalldata(returnData)]
}

export function decodeLeaderReturnValues(receipt: unknown): unknown[] {
  const entries = readStudioLeaderReceipts(receipt)
  return entries.map((entry, index) => {
    if (!Object.prototype.hasOwnProperty.call(entry, 'result')) {
      throw new GenLayerTransactionError('decode', `Leader receipt ${index} has no contract result.`)
    }
    return decodeResultEnvelope(entry.result)
  })
}

function readStudioLeaderReceipts(receipt: unknown): Record<string, unknown>[] {
  if (!isRecord(receipt) || !isRecord(receipt.consensus_data)) {
    throw new GenLayerTransactionError('decode', 'The transaction receipt has no consensus data.')
  }
  const leaderReceipts = receipt.consensus_data.leader_receipt
  const entries = Array.isArray(leaderReceipts) ? leaderReceipts : [leaderReceipts]
  if (entries.length === 0 || entries[0] === undefined) {
    throw new GenLayerTransactionError('decode', 'The transaction receipt has no leader receipt.')
  }
  return entries.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new GenLayerTransactionError('decode', `Leader receipt ${index} is malformed.`)
    }
    return entry
  })
}

function readRequiredString(receipt: Record<string, unknown>, field: string): string {
  const value = receipt[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new GenLayerTransactionError('decode', `The transaction receipt has no valid ${field}.`)
  }
  return value
}

function validateReceiptHash(receipt: Record<string, unknown>, expectedHash: TransactionHash): void {
  const candidates = [receipt.hash, receipt.txId, receipt.tx_id].filter(candidate => candidate !== undefined)
  if (candidates.length === 0) {
    throw new GenLayerTransactionError('decode', 'The transaction receipt has no full transaction hash.')
  }
  for (const candidate of candidates) {
    const receiptHash = decodeTransactionHash(candidate, 'receipt hash')
    if (receiptHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new GenLayerTransactionError('decode', 'The receipt hash does not match the submitted transaction hash.')
    }
  }
}

function readConsensusResult(
  receipt: Record<string, unknown>,
  returnRoute: TransactionReturnRoute,
): ValidatedTransaction['result'] {
  const field = returnRoute === 'studio-receipt' ? 'result_name' : 'resultName'
  const result = readRequiredString(receipt, field)
  if (result !== 'AGREE' && result !== 'MAJORITY_AGREE') {
    throw new GenLayerTransactionError('consensus', `Consensus did not agree on the transaction result (received ${result}).`)
  }
  return result
}

function validateStudioExecution(receipt: Record<string, unknown>): 'FINISHED_WITH_RETURN' {
  const entries = readStudioLeaderReceipts(receipt)
  let leaderCount = 0
  entries.forEach((entry, index) => {
    const mode = readRequiredString(entry, 'mode')
    if (mode !== 'leader' && mode !== 'validator') {
      throw new GenLayerTransactionError('decode', `Leader receipt ${index} has an unsupported execution mode.`)
    }
    if (mode === 'leader') leaderCount += 1

    const executionResult = readRequiredString(entry, 'execution_result')
    if (executionResult !== 'SUCCESS') {
      throw new GenLayerTransactionError('execution', `Leader receipt ${index} execution failed (received ${executionResult}).`)
    }
    if (!Object.prototype.hasOwnProperty.call(entry, 'result')) {
      throw new GenLayerTransactionError('decode', `Leader receipt ${index} has no contract result.`)
    }
    // Studio omits transaction-level txExecutionResultName. A successful
    // execution_result plus a decodable return envelope is the official
    // genlayer-js@1.1.8 proof that this execution finished with a return.
    decodeResultEnvelope(entry.result)
  })
  if (leaderCount !== 1) {
    throw new GenLayerTransactionError('decode', 'The Studio receipt must contain exactly one leader execution.')
  }
  return 'FINISHED_WITH_RETURN'
}

function validatePublicExecution(receipt: Record<string, unknown>): 'FINISHED_WITH_RETURN' {
  const executionResult = readRequiredString(receipt, 'txExecutionResultName')
  if (executionResult !== 'FINISHED_WITH_RETURN') {
    throw new GenLayerTransactionError('execution', `Contract execution did not finish with a return value (received ${executionResult}).`)
  }
  return executionResult
}

export function decodeTriggeredTransactionIds(value: unknown): TransactionHash[] {
  if (!Array.isArray(value)) throw new GenLayerTransactionError('triggered', 'Triggered transaction IDs must be an array.')
  const result = value.map((hash, index) => decodeTransactionHash(hash, `triggered transaction ${index}`))
  if (new Set(result.map(hash => hash.toLowerCase())).size !== result.length) {
    throw new GenLayerTransactionError('triggered', 'Triggered transaction IDs contain duplicates.')
  }
  return result
}

export function validateSuccessfulTransaction(
  receiptValue: unknown,
  expectedHashValue: unknown,
  triggeredValue: unknown,
  options: {
    allowTriggeredTransactions: boolean
    returnRoute: TransactionReturnRoute
  },
): ValidatedTransaction {
  const expectedHash = decodeTransactionHash(expectedHashValue)
  if (!isRecord(receiptValue)) throw new GenLayerTransactionError('decode', 'The transaction receipt is malformed.')
  validateReceiptHash(receiptValue, expectedHash)

  const status = readRequiredString(receiptValue, 'statusName')
  if (status === 'CANCELED') throw new GenLayerTransactionError('status', 'The transaction was canceled.')
  if (status === 'UNDETERMINED') throw new GenLayerTransactionError('status', 'The transaction reached an undetermined consensus state.')
  if (status === 'LEADER_TIMEOUT' || status === 'VALIDATORS_TIMEOUT') {
    throw new GenLayerTransactionError('status', `The transaction ended with ${status}.`)
  }
  if (status !== 'ACCEPTED' && status !== 'FINALIZED') {
    throw new GenLayerTransactionError('status', `The transaction is not accepted or finalized (received ${status}).`)
  }

  const result = readConsensusResult(receiptValue, options.returnRoute)
  const executionResult = options.returnRoute === 'studio-receipt'
    ? validateStudioExecution(receiptValue)
    : validatePublicExecution(receiptValue)

  if (receiptValue.messages !== undefined && !Array.isArray(receiptValue.messages)) {
    throw new GenLayerTransactionError('decode', 'The transaction messages field is malformed.')
  }
  const triggeredTransactionIds = decodeTriggeredTransactionIds(triggeredValue)
  const messageCount = Array.isArray(receiptValue.messages) ? receiptValue.messages.length : 0
  if (!options.allowTriggeredTransactions && (triggeredTransactionIds.length > 0 || messageCount > 0)) {
    throw new GenLayerTransactionError('triggered', 'This contract operation unexpectedly emitted messages or created triggered transactions.')
  }
  if (options.allowTriggeredTransactions && messageCount > 0 && triggeredTransactionIds.length === 0) {
    throw new GenLayerTransactionError('triggered', 'The receipt emitted messages but no triggered transaction IDs were found.')
  }

  return {
    hash: expectedHash,
    status,
    result,
    executionResult: 'FINISHED_WITH_RETURN',
    returnValues: [],
    triggeredTransactionIds,
  }
}

async function decodeNetworkReturnValues(
  client: Pick<ReceiptClient, 'debugTraceTransaction'>,
  receipt: unknown,
  hash: TransactionHash,
  route: TransactionReturnRoute,
): Promise<unknown[]> {
  if (route === 'studio-receipt') return decodeLeaderReturnValues(receipt)

  let trace: unknown
  try {
    trace = await client.debugTraceTransaction({ hash, round: 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown trace verification failure'
    throw new GenLayerTransactionError('network', `Unable to fetch the public transaction return trace: ${message}`)
  }
  return decodePublicTraceReturnValues(trace, hash)
}

export async function waitForValidatedTransaction(
  client: ReceiptClient,
  hashValue: unknown,
  options: {
    allowTriggeredTransactions?: boolean
    retries?: number
    interval?: number
    returnRoute: TransactionReturnRoute
  },
): Promise<ValidatedTransaction> {
  const hash = decodeTransactionHash(hashValue)
  try {
    await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
      retries: options.retries ?? 100,
      interval: options.interval ?? 5_000,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown polling failure'
    throw new GenLayerTransactionError('polling', `Unable to reach an accepted transaction state: ${message}`)
  }

  let receipt: unknown
  let triggered: unknown
  try {
    [receipt, triggered] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTriggeredTransactionIds({ hash }),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown receipt verification failure'
    throw new GenLayerTransactionError('network', `Unable to fetch the full receipt and triggered transactions: ${message}`)
  }
  const validated = validateSuccessfulTransaction(receipt, hash, triggered, {
    allowTriggeredTransactions: options.allowTriggeredTransactions ?? false,
    returnRoute: options.returnRoute,
  })
  return {
    ...validated,
    returnValues: await decodeNetworkReturnValues(client, receipt, hash, options.returnRoute),
  }
}

export function decodeCanonicalDisputeId(values: unknown[]): string {
  if (values.length === 0) throw new GenLayerTransactionError('decode', 'The filing receipt contains no contract return value.')
  const ids = values.map((value, index) => {
    if (typeof value !== 'string' || !/^DSP-[0-9]{4,}$/.test(value)) {
      throw new GenLayerTransactionError('decode', `Filing return ${index} is not a canonical dispute identifier.`)
    }
    return value
  })
  if (new Set(ids).size !== 1) {
    throw new GenLayerTransactionError('consensus', 'Leader receipts disagree on the canonical dispute identifier.')
  }
  return ids[0]
}

export function isWalletRejection(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && current.code === 4001) return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}

export function transactionCacheKey(identity: CanonicalIdentity): string {
  return `${TRANSACTION_CACHE_PREFIX}${identity.chainId}:${identity.contractAddress.toLowerCase()}:${identity.stateVersion}`
}

function isTransactionOperation(value: unknown): value is TransactionOperation {
  return value === 'FILE_DISPUTE'
    || value === 'ACCEPT_DISPUTE'
    || value === 'DECLINE_DISPUTE'
    || value === 'EVALUATE'
}

function decodeKnownTransactionRecord(value: unknown, index: number): KnownTransactionRecord {
  if (typeof value === 'string') {
    return { hash: decodeTransactionHash(value, `known transaction ${index}`), disputeId: '', operation: 'FILE_DISPUTE' }
  }
  if (!isRecord(value)) {
    throw new GenLayerTransactionError('decode', `Known transaction ${index} is malformed.`)
  }
  const hash = decodeTransactionHash(value.hash, `known transaction ${index} hash`)
  if (!isTransactionOperation(value.operation)) {
    throw new GenLayerTransactionError('decode', `Known transaction ${index} has an unsupported operation.`)
  }
  const disputeId = value.disputeId
  if (typeof disputeId !== 'string' || (disputeId !== '' && !/^DSP-[0-9]{4,}$/.test(disputeId))) {
    throw new GenLayerTransactionError('decode', `Known transaction ${index} has an invalid dispute identifier.`)
  }
  if (value.operation !== 'FILE_DISPUTE' && disputeId === '') {
    throw new GenLayerTransactionError('decode', `Known transaction ${index} requires a dispute identifier.`)
  }
  return { hash, disputeId, operation: value.operation }
}

export function loadKnownTransactionRecords(storage: StorageLike, identity: CanonicalIdentity): KnownTransactionRecord[] {
  const key = transactionCacheKey(identity)
  removeForeignTransactionCaches(storage, key)
  const raw = storage.getItem(key)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('known transaction cache must be an array')
    const records = parsed.map(decodeKnownTransactionRecord)
    const unique = new Map<string, KnownTransactionRecord>()
    records.forEach(record => unique.set(record.hash.toLowerCase(), record))
    return [...unique.values()].slice(0, 50)
  } catch {
    storage.removeItem(key)
    return []
  }
}

export function saveKnownTransactionRecords(storage: StorageLike, identity: CanonicalIdentity, records: KnownTransactionRecord[]): void {
  const key = transactionCacheKey(identity)
  removeForeignTransactionCaches(storage, key)
  const unique = new Map<string, KnownTransactionRecord>()
  records.forEach(record => {
    const decoded = decodeKnownTransactionRecord(record, 0)
    unique.set(decoded.hash.toLowerCase(), decoded)
  })
  storage.setItem(key, JSON.stringify([...unique.values()].slice(0, 50)))
}

export function clearKnownTransactionRecords(storage: StorageLike, identity: CanonicalIdentity): void {
  storage.removeItem(transactionCacheKey(identity))
}

function removeForeignTransactionCaches(storage: StorageLike, currentKey: string): void {
  if (typeof storage.length !== 'number' || typeof storage.key !== 'function') return
  const stale: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(TRANSACTION_CACHE_PREFIX) && key !== currentKey) stale.push(key)
  }
  stale.forEach(key => storage.removeItem(key))
}

export function loadKnownTransactionHashes(storage: StorageLike, identity: CanonicalIdentity): TransactionHash[] {
  return loadKnownTransactionRecords(storage, identity).map(record => record.hash)
}

export function saveKnownTransactionHashes(storage: StorageLike, identity: CanonicalIdentity, hashes: TransactionHash[]): void {
  saveKnownTransactionRecords(storage, identity, hashes.map(hash => ({
    hash: decodeTransactionHash(hash),
    disputeId: '',
    operation: 'FILE_DISPUTE',
  })))
}

export function clearKnownTransactionHashes(storage: StorageLike, identity: CanonicalIdentity): void {
  clearKnownTransactionRecords(storage, identity)
}

function decodeKnownTransactionReturn(
  record: KnownTransactionRecord,
  values: unknown[],
): { disputeId: string; returnValue: TransactionReturnValue } {
  if (record.operation === 'FILE_DISPUTE') {
    const disputeId = decodeCanonicalDisputeId(values)
    if (record.disputeId && record.disputeId !== disputeId) {
      throw new GenLayerTransactionError('decode', 'The filing return does not match the known dispute identifier.')
    }
    return { disputeId, returnValue: disputeId }
  }
  if (record.operation === 'ACCEPT_DISPUTE' || record.operation === 'DECLINE_DISPUTE') {
    return { disputeId: record.disputeId, returnValue: decodeSuccessfulBooleanReturn(values, record.operation) }
  }
  return { disputeId: record.disputeId, returnValue: decodeEvaluationOutcome(values) }
}

export async function hydrateKnownTransactions(
  client: TransactionReadClient,
  records: KnownTransactionRecord[],
  returnRoute: TransactionReturnRoute,
): Promise<{ transactions: DisputeTransaction[]; failures: number }> {
  const transactions: DisputeTransaction[] = []
  let failures = 0
  for (const record of records) {
    try {
      const [receipt, triggered] = await Promise.all([
        client.getTransaction({ hash: record.hash }),
        client.getTriggeredTransactionIds({ hash: record.hash }),
      ])
      const transaction = validateSuccessfulTransaction(receipt, record.hash, triggered, {
        allowTriggeredTransactions: false,
        returnRoute,
      })
      const returnValues = await decodeNetworkReturnValues(client, receipt, record.hash, returnRoute)
      const decoded = decodeKnownTransactionReturn(record, returnValues)
      transactions.push({
        ...transaction,
        returnValues,
        disputeId: decoded.disputeId,
        operation: record.operation,
        returnValue: decoded.returnValue,
      })
    } catch {
      failures += 1
    }
  }
  return { transactions, failures }
}

export async function hydrateKnownFilingTransactions(
  client: TransactionReadClient,
  hashes: TransactionHash[],
  returnRoute: TransactionReturnRoute,
): Promise<{ transactions: FilingTransaction[]; failures: number }> {
  return hydrateKnownTransactions(
    client,
    hashes.map(hash => ({ hash, disputeId: '', operation: 'FILE_DISPUTE' })),
    returnRoute,
  )
}

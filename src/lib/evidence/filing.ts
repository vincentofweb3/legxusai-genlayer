import type { EvidenceReference } from './upload.ts'
import { writeWithReverifiedEvidence } from './upload.ts'

export class EvidenceConfirmationError extends Error {
  constructor(message = 'Confirm an evidence-free filing before signing.') {
    super(message)
    this.name = 'EvidenceConfirmationError'
  }
}

export async function writeWithConfirmedEvidence<T>(args: {
  references: readonly EvidenceReference[]
  confirmNoEvidence: boolean
  write: (verified: EvidenceReference[]) => Promise<T>
  timeoutMs?: number
}): Promise<{ value: T; references: EvidenceReference[] }> {
  if (args.references.length === 0 && !args.confirmNoEvidence) {
    throw new EvidenceConfirmationError()
  }
  return writeWithReverifiedEvidence(
    args.references,
    args.write,
    args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs },
  )
}

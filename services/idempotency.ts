import { createHash } from 'crypto';
/**
 * Generate idempotency key for a payout item
 * This ensures the same payout cannot be executed twice
 */
export function generateIdempotencyKey(
  platformId: string,
  batchId: string,
  rowIndex: number
): string {
  const input = `${platformId}:${batchId}:${rowIndex}`;
  return createHash('sha256').update(input).digest('hex');
}
/**
 * Generate idempotency keys for a batch of payouts
 */
export function generateBatchIdempotencyKeys(
  platformId: string,
  batchId: string,
  count: number
): string[] {
  return Array.from({ length: count }, (_, i) =>
    generateIdempotencyKey(platformId, batchId, i)
  );
}
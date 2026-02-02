import { PayoutItem, Policy, ExecutionMode } from '@/types';
export interface PlannedGroup {
  mode: ExecutionMode;
  sourceChainId: number;
  destChainId: number;
  destToken: string;
  items: PayoutItem[];
  totalAmount: bigint;
  estimatedFeesUSD?: number;
}
export interface PlanResult {
  groups: PlannedGroup[];
  summary: {
    totalItems: number;
    hubModeItems: number;
    directModeItems: number;
    uniqueDestChains: number;
  };
}
/**
 * Decide execution mode based on amount and recipient count
 * - DIRECT: large payouts (>$1000) or single recipient
 * - HUB: smaller payouts batched together
 */
function decideMode(amountUSD: number, recipientCount: number): ExecutionMode {
  if (amountUSD > 1000 || recipientCount === 1) {
    return 'DIRECT';
  }
  return 'HUB';
}
/**
 * Group payout items by (sourceChain, destChain, destToken)
 * and assign execution mode
 */
export function planPayouts(
  items: PayoutItem[],
  policy: Policy,
  priceMap: Record<string, number> = {} // token -> USD price
): PlanResult {
  // Group by routing key
  const groupMap = new Map<string, PayoutItem[]>();
  for (const item of items) {
    const key = `${item.source.chainId}-${item.recipient.preferredChainId}-${item.recipient.preferredToken}`;
    const existing = groupMap.get(key) || [];
    existing.push(item);
    groupMap.set(key, existing);
  }
  const groups: PlannedGroup[] = [];
  let hubModeItems = 0;
  let directModeItems = 0;
  for (const [key, groupItems] of groupMap) {
    const [sourceChainId, destChainId, destToken] = key.split('-');
    
    // Calculate total amount for the group
    const totalAmount = groupItems.reduce(
      (sum, item) => sum + item.source.amount,
      BigInt(0)
    );
    // Estimate USD value (simplified - in production, fetch real prices)
    const tokenPrice = priceMap[destToken] || 1; // default to 1 for stablecoins
    const totalUSD = Number(totalAmount) / 1e6 * tokenPrice; // assuming 6 decimals
    const mode = decideMode(totalUSD / groupItems.length, groupItems.length);
    if (mode === 'HUB') {
      hubModeItems += groupItems.length;
    } else {
      directModeItems += groupItems.length;
    }
    groups.push({
      mode,
      sourceChainId: parseInt(sourceChainId),
      destChainId: parseInt(destChainId),
      destToken,
      items: groupItems,
      totalAmount,
    });
  }
  const uniqueDestChains = new Set(groups.map((g) => g.destChainId)).size;
  return {
    groups,
    summary: {
      totalItems: items.length,
      hubModeItems,
      directModeItems,
      uniqueDestChains,
    },
  };
}
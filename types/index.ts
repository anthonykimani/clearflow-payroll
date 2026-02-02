export interface Policy {
    maxFeeBps: number;
    maxSlippageBps: number;
    minPayoutUSD: number;
    bannedTokens: string[];
    allowedChains: number[];
}

export type BatchStatus = 'draft' | 'planned' | 'executing' | 'completed' | 'failed';

export interface Batch {
  id: string;
  platformId: string;
  status: BatchStatus;
  policy: Policy;
  createdAt: Date;
  updatedAt: Date;
}

export type PayoutItemStatus = 'planned' | 'quoted' | 'executing' | 'completed' | 'failed';
export type ExecutionMode = 'HUB' | 'DIRECT';
export interface PayoutItemRecipient {
  address: string;
  preferredChainId: number;
  preferredToken: string;
}
export interface PayoutItemSource {
  chainId: number;
  token: string;
  amount: bigint;
}
export interface ExecutionFees {
  gasCostUSD?: number;
  bridgeFeeUSD?: number;
}
export interface ExecutionMetadata {
  mode: ExecutionMode;
  routeId?: string;
  quotedAt?: Date;
  bridgeTxHash?: string;
  destinationTxHash?: string;
  fees?: ExecutionFees;
  executedAt?: Date;
}
export interface PayoutItem {
  id: string;
  batchId: string;
  recipient: PayoutItemRecipient;
  source: PayoutItemSource;
  status: PayoutItemStatus;
  execution?: ExecutionMetadata;
  idempotencyKey: string;
  retryCount: number;
  failedReason?: string;
}

export interface CSVPayoutRow {
  recipientAddress: string;
  destinationChainId: number;
  preferredToken: string;
  amount: string;  // string for parsing, convert to bigint
}
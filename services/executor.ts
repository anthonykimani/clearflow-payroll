import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/db";
import { convertQuoteToRoute, executeRoute, getQuote } from "@lifi/sdk";
import { createWalletClient, http, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia, base, baseSepolia, optimism, polygon } from "viem/chains";

// Chain configs
const CHAINS = {
    8453: base,
    42161: arbitrum,
    137: polygon,
    10: optimism,
    84532: baseSepolia,
    421614: arbitrumSepolia,
};

// Token addresses (mainnet - add testnet as needed)
const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
    8453: { USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
    42161: { USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
    137: { USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },
    10: { USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
    // Testnets
    84532: { USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' }, // Base Sepolia
    421614: { USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' }, // Arbitrum Sepolia
};

export interface ExecutionResult {
    success: boolean;
    itemId: string;
    txHash?: string;
    error?: string;
}

/**
 * Create wallet client for signing transactions
 */
function getWalletClient(chainId: number): WalletClient {
    const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error('EXECUTOR_PRIVATE_KEY not set');
    }

    const chain = CHAINS[chainId as keyof typeof CHAINS];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    return createWalletClient({
        account,
        chain,
        transport: http(),
    });
}


/**Check if a payout has already been executed chain-state check */
async function checkAlreadyExecuted(idempotencyKey: string): Promise<{ executed: boolean; txHash?: string }> {
    // For MVP, check our DB. In production, also verify on-chain
    const item = await prisma.payoutItem.findFirst({
        where: { idempotencyKey, status: 'completed' },
    });

    if (item?.executionMeta) {
        const meta = item.executionMeta as { bridgeTxHash?: string };
        return { executed: true, txHash: meta.bridgeTxHash };
    }

    return { executed: false }
}

/**
 * Execute a single payout item
 * 
 */
export async function executePayoutItem(itemId: string, useMock = false): Promise<ExecutionResult> {
    const item = await prisma.payoutItem.findUnique({ where: { id: itemId } });

    if (!item) {
        return { success: false, itemId, error: "Item not found" };
    }

    // Idempotency check 
    if (item.status === 'completed') {
        const meta = item.executionMeta as { bridgeTxHash?: string } | null;
        return { success: true, itemId, txHash: meta?.bridgeTxHash }
    }

    const alreadyDone = await checkAlreadyExecuted(item.idempotencyKey);
    if (alreadyDone.executed) {
        await prisma.payoutItem.update({
            where: { id: itemId },
            data: { status: "completed" },
        });

        return { success: true, itemId, txHash: alreadyDone.txHash };
    }

    // Mark as executing
    await prisma.payoutItem.update({
        where: { id: itemId },
        data: { status: 'executing' },
    });

    try {
        let txHash: string;

        if (useMock) {
            // Mock execution for testing
            txHash = `0x${Date.now().toString(16)}${'0'.repeat(40)}`
            await new Promise((r) => setTimeout(r, 1000))
        } else {
            // Real LI.FI execution
            const fromToken = TOKEN_ADDRESSES[item.sourceChainId]?.[item.sourceToken];
            const toToken = TOKEN_ADDRESSES[item.destChainId]?.[item.preferredToken];
            if (!fromToken || !toToken) {
                throw new Error(`Token not supported: ${item.sourceToken} or ${item.preferredToken}`);
            }
            const walletClient = getWalletClient(item.sourceChainId);
            const fromAddress = walletClient.account?.address;
            if (!fromAddress) {
                throw new Error('Wallet address not available');
            }
            // Get fresh quote
            const quote = await getQuote({
                fromChain: item.sourceChainId,
                toChain: item.destChainId,
                fromToken,
                toToken,
                fromAmount: item.amount.toString(),
                fromAddress,
                toAddress: item.recipientAddress,
            });

            // convert quote to route for execution
            const route = convertQuoteToRoute(quote);


            // Execute the route
            const executedRoute = await executeRoute(route, {
                updateRouteHook: (updatedRoute) => {
                    console.log("Route updated:", updatedRoute.id)
                }
            });

            // Get tx has from the executed route

            const step = executedRoute.steps[0];
            const process = step?.execution?.process?.[0];
            txHash = process?.txHash || `pending-${Date.now()}`;
        }
        // Store Result
        const existingMeta = (item.executionMeta as Record<string, unknown>) || {};
        await prisma.payoutItem.update({
            where: { id: itemId },
            data: {
                status: 'completed',
                executionMeta: {
                    ...existingMeta,
                    bridgeTxHash: txHash,
                    executedAt: new Date().toISOString(),
                } as Prisma.InputJsonValue,
            },
        });
        return { success: true, itemId, txHash };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Execution failed';

        await prisma.payoutItem.update({
            where: { id: itemId },
            data: {
                status: 'failed',
                failedReason: errorMsg,
                retryCount: { increment: 1 },
            },
        });
        return { success: false, itemId, error: errorMsg };
    }
}

/**
 * Execute all items in a batch
 */
export async function executeBatch(
    batchId: string,
    useMock = false
): Promise<{
    results: ExecutionResult[];
    summary: { total: number; succeeded: number; failed: number };
}> {
    const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: { items: true },
    });
    if (!batch) {
        throw new Error('Batch not found');
    }
    await prisma.batch.update({
        where: { id: batchId },
        data: { status: 'executing' },
    });
    const results: ExecutionResult[] = [];
    for (const item of batch.items) {
        if (item.status === 'quoted' || (item.status === 'failed' && item.retryCount < 3)) {
            const result = await executePayoutItem(item.id, useMock);
            results.push(result);
        }
    }
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const finalStatus = failed === 0 ? 'completed' : succeeded === 0 ? 'failed' : 'completed';
    await prisma.batch.update({
        where: { id: batchId },
        data: { status: finalStatus },
    });
    return {
        results,
        summary: { total: results.length, succeeded, failed },
    };
}
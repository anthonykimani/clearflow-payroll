import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/db";
import { getTransferQuote } from "@/lib/lifi";
import { checkPayout } from "@/services";
import { Policy } from "@/types";
import { NextRequest, NextResponse } from "next/server";


const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  8453: { USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },   // Base
  42161: { USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' }, // Arbitrum
  137: { USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' },   // Polygon
  10: { USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },    // Optimism
};

// POST /api/batches/[id]/quote - Get quotes for all items
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }>}
) {
    try {
        const { id } = await params;
        const body = await request.json().catch(()=> ({}));
        const fromAddress = body.fromAddress || '0x0000000000000000000000000000000000000000';

        const batch = await prisma.batch.findUnique({
            where: { id },
            include: { items: true },
        })

        if(!batch) {
            return NextResponse.json({ error: "Batch not found" }, { status: 404 });
        }

        if(batch.status !== 'planned') {
            return NextResponse.json(
                { error: `Batch must be 'planned' to quote. Current: '${batch.status}'` },
                { status: 400 }
            );
        }

        const policy = batch.policy as unknown as Policy;
        const quotes = [];
        const policyViolations = [];

        for (const item of batch.items ) {
            try {
                const fromToken = TOKEN_ADDRESSES[item.sourceChainId]?.[item.sourceToken];
                const toToken = TOKEN_ADDRESSES[item.destChainId]?.[item.preferredToken];

                if (!fromToken || !toToken) {
                    quotes.push({
                        itemId: item.id,
                        error: `Token not supported on chain`
                    })
                    continue;
                }
                // Skip quote for same-chain transfers ( no bridge needed)
                if (item.sourceChainId === item.destChainId) {
                    quotes.push({
                        itemId: item.id,
                        samechain: true,
                        estimatedGasCostUSD: 0.1,
                        estimatedBridgeFeeUSD: 0
                    });
                    continue;
                }
    
                const quote = await getTransferQuote({
                    fromChainId: item.sourceChainId,
                    toChainId: item.destChainId,
                    fromToken,
                    toToken,
                    fromAmount: item.amount.toString(),
                    fromAddress,
                    toAddress: item.recipientAddress,
                })

                // check against policy
                const totalFeeBps = Math.round(
                    ((quote.estimatedGasCostUSD + quote.estimatedBridgeFeeUSD) / parseFloat(item.amount.toString()))  * 1000
                );

                const policyCheck = checkPayout(
                    {
                        amountUSD: parseFloat(item.amount.toString()),
                        feeBps: totalFeeBps,
                        slippageBps: quote.slippageBps,
                        destChainId: item.destChainId,
                        token: item.preferredToken,
                    },
                    policy
                );

                if(!policyCheck.valid) {
                    policyViolations.push({
                        itemId: item.id,
                        violations: policyCheck.violations
                    });
                }

                // Update item with quote metadata
                await prisma.payoutItem.update({
                    where: { id: item.id },
                    data: {
                        status: "quoted",
                        executionMeta: {
                            routeId: quote.routeId,
                            quotedAt: new Date().toISOString(),
                            fees: {
                                gasCostUSD: quote.estimatedGasCostUSD,
                                bridgeFeeUSD: quote.estimatedBridgeFeeUSD,
                            },
                        } as Prisma.InputJsonValue,
                    }
                });

                quotes.push({
                    itemId: item.id,
                    ...quote,
                    policyValid: policyCheck.valid,
                });
            } catch (err) {
                quotes.push({
                    itemId: item.id,
                    error: err instanceof Error ? err.message : "Quote Failed"
                })
            }
        }

        return NextResponse.json({
            success: true,
            quotes,
            policyViolations,
            summary: {
                total: batch.items.length,
                quoted: quotes.filter((q) => !q.error).length,
                failed: quotes.filter((q) => q.error).length,
                policyIssues: policyViolations.length
            }
        })
    } catch (error) {
        console.error("Quote error", error);
        return NextResponse.json({ error: "Internal Server Error"}, { status: 500 });;
    }
}
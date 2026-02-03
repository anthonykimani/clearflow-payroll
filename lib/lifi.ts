import { createConfig, getQuote, executeRoute } from "@lifi/sdk";

createConfig({
    integrator: 'clearflow',
});

export interface QuoteParams {
    fromChainId: number;
    toChainId: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    toAddress: string;
}


export interface QuoteResult {
    routeId: string;
    estimatedGasCostUSD: number;
    estimatedBridgeFeeUSD: number;
    estimatedOutput: string;
    slippageBps: number;
    executionTimeSeconds: number;
}

/**
 * Get a quote from LI.FI for a cross-chain transfer
 */
export async function getTransferQuote(params: QuoteParams): Promise<QuoteResult> {
    const quote = await getQuote({
        fromChain: params.fromChainId,
        toChain: params.toChainId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress
    })

    const gasCostUSD = parseFloat(quote.estimate.gasCosts?.[0]?.amountUSD || '0');
    const feeCostUSD = parseFloat(quote.estimate.feeCosts?.[0]?.amountUSD || '0');

    return {
        routeId: quote.id,
        estimatedGasCostUSD: gasCostUSD,
        estimatedBridgeFeeUSD: feeCostUSD,
        estimatedOutput: quote.estimate.toAmount,
        slippageBps: Math.round((1 - parseFloat(quote.estimate.toAmount) / parseFloat(params.fromAmount)) * 10000),
        executionTimeSeconds: quote.estimate.executionDuration || 0,
    };
}

export { executeRoute };
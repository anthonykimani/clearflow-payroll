import { Policy } from "@/types";

export interface PolicyViolation {
    field: string;
    message: string;
    value: unknown;
}

export interface PolicyCheckResult {
    valid: boolean;
    violations: PolicyViolation[];
}

export function checkPayout(payout: {
    amountUSD: number;
    feeBps: number;
    slippageBps: number;
    destChainId: number;
    token: string;
}, policy: Policy ): PolicyCheckResult {
    const violations: PolicyViolation[] = [];

    // check minimum payout
    if (payout.amountUSD < policy.minPayoutUSD) {
        violations.push({
            field: "amount",
            message: `Payout $${payout.amountUSD} below minimum $${policy.minPayoutUSD}`,
            value: payout.amountUSD,
        })
    }

    // check fee cap 
    if (payout.feeBps > policy.maxFeeBps) {
        violations.push({
            field: "fee",
            message: `Fee ${payout.feeBps}bps exceeds max ${policy.maxFeeBps}bps`,
            value: payout.feeBps
        })
    }

    // check slippage cap
    if (payout.slippageBps > policy.maxSlippageBps) {
        violations.push({
            field: "slippage",
            message: `Slippage ${payout.slippageBps}bps exceeds max ${policy.maxSlippageBps}bps`,
            value: payout.slippageBps
        });
    }

    // check allowed chains
    if (!policy.allowedChains.includes(payout.destChainId)) {
        violations.push({
            field: 'chain',
            message: `Chain ${payout.destChainId} not in allowed list`,
            value: payout.destChainId
        })
    }

    // check banned tokens
    if (policy.bannedTokens.includes(payout.token.toUpperCase())) {
        violations.push({
            field: "token",
            message: `Token ${payout.token} is banned`,
            value: payout.token
        })
    }

    return {
        valid: violations.length === 0,
        violations
    };
}

/**
 * Default policy for new batches
 */
export const DEFAULT_POLICY: Policy = {
    maxFeeBps: 200,
    maxSlippageBps: 100,
    minPayoutUSD: 50,
    allowedChains: [
        8453,
        42161,
        137,
        10
    ],
    bannedTokens: [],
};
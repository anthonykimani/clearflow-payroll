import { CSVPayoutRow } from "@/types";
import { isAddress } from "viem"

export interface ParsedCSVResult {
    valid: CSVPayoutRow[];
    errors: { row: number; message: string }[];
}

/**
 * Parse CSV text into payout rows
 * Expected format: recipientAddress, destinationChainId, preferredToken, amount
 */
export function parsePayoutCSV(csvText: string): ParsedCSVResult {
    const lines = csvText.trim().split('\n');
    const valid: CSVPayoutRow[] = [];
    const errors: { row: number; message: string }[] = [];

    // Skip header row if present
    const startIndex = lines[0]?.toLocaleLowerCase().includes('address') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',').map((p) => p.trim());
        const rowNum = i + 1;
        if (parts.length < 4) {
            errors.push({ row: rowNum, message: 'Missing columns (need: address, chainId, token, amount)' });
            continue;
        }
        const [recipientAddress, chainIdStr, preferredToken, amount] = parts;
        // Validate address
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(recipientAddress)) {
            errors.push({ row: rowNum, message: `Invalid address: ${recipientAddress}` });
            continue;
        }
        // Validate chainId
        const destinationChainId = parseInt(chainIdStr, 10);
        if (isNaN(destinationChainId)) {
            errors.push({ row: rowNum, message: `Invalid chainId: ${chainIdStr}` });
            continue;
        }
        // Validate amount
        if (!amount || isNaN(parseFloat(amount))) {
            errors.push({ row: rowNum, message: `Invalid amount: ${amount}` });
            continue;
        }
        valid.push({
            recipientAddress,
            destinationChainId,
            preferredToken: preferredToken.toUpperCase(),
            amount,
        })
    }

    return { valid, errors }
}
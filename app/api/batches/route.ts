import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/db';
import { parsePayoutCSV } from '@/services/csv-parser';
import { generateIdempotencyKey } from '@/services/idempotency';
import { DEFAULT_POLICY } from '@/services/policy';
import { randomUUID } from 'crypto';
import { Prisma } from '@/app/generated/prisma/client';
// POST /api/batches - Create a new batch from CSV
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const platformId = formData.get('platformId') as string || 'default';
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    const csvText = await file.text();
    const { valid, errors } = parsePayoutCSV(csvText);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'CSV validation failed', details: errors },
        { status: 400 }
      );
    }
    if (valid.length === 0) {
      return NextResponse.json(
        { error: 'No valid payout rows found' },
        { status: 400 }
      );
    }
    // Create batch with items in a transaction
    const batchId = randomUUID();
    const batch = await prisma.batch.create({
      data: {
        id: batchId,
        platformId,
        status: 'draft',
        policy: DEFAULT_POLICY as unknown as Prisma.InputJsonValue,
        items: {
          create: valid.map((row, index) => ({
            recipientAddress: row.recipientAddress,
            destChainId: row.destinationChainId,
            preferredToken: row.preferredToken,
            sourceChainId: 8453, // Default source: Base (configurable later)
            sourceToken: 'USDC',
            amount: row.amount,
            status: 'planned',
            idempotencyKey: generateIdempotencyKey(platformId, batchId, index),
          })),
        },
      },
      include: {
        items: true,
      },
    });
    return NextResponse.json({
      success: true,
      batch: {
        id: batch.id,
        status: batch.status,
        itemCount: batch.items.length,
      },
    });
  } catch (error) {
    console.error('Batch creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
// GET /api/batches - List all batches
export async function GET() {
  try {
    const batches = await prisma.batch.findMany({
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({
      batches: batches.map((b) => ({
        id: b.id,
        platformId: b.platformId,
        status: b.status,
        itemCount: b._count.items,
        createdAt: b.createdAt,
      })),
    });
  } catch (error) {
    console.error('Batch list error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
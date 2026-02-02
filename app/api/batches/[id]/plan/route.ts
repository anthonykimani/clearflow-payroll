import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/db';
import { planPayouts } from '@/services/planner';
import { Policy, PayoutItem } from '@/types';
// POST /api/batches/[id]/plan - Generate execution plan
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    if (batch.status !== 'draft') {
      return NextResponse.json(
        { error: `Cannot plan batch in '${batch.status}' status. Must be 'draft'.` },
        { status: 400 }
      );
    }
    // Convert DB items to PayoutItem type
    const payoutItems: PayoutItem[] = batch.items.map((item) => ({
      id: item.id,
      batchId: item.batchId,
      recipient: {
        address: item.recipientAddress,
        preferredChainId: item.destChainId,
        preferredToken: item.preferredToken,
      },
      source: {
        chainId: item.sourceChainId,
        token: item.sourceToken,
        amount: BigInt(item.amount.toString()),
      },
      status: item.status as PayoutItem['status'],
      idempotencyKey: item.idempotencyKey,
      retryCount: item.retryCount,
      failedReason: item.failedReason || undefined,
    }));
    // Run planner
    const plan = planPayouts(payoutItems, batch.policy as unknown as Policy);
    // Update batch status to planned
    await prisma.batch.update({
      where: { id },
      data: { status: 'planned' },
    });
    return NextResponse.json({
      success: true,
      plan: {
        groups: plan.groups.map((g) => ({
          mode: g.mode,
          sourceChainId: g.sourceChainId,
          destChainId: g.destChainId,
          destToken: g.destToken,
          itemCount: g.items.length,
          totalAmount: g.totalAmount.toString(),
        })),
        summary: plan.summary,
      },
    });
  } catch (error) {
    console.error('Planning error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
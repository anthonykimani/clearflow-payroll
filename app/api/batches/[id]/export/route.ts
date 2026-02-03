import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/db';

// GET /api/batches/[id]/export - Export batch as CSV/JSON
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }
    const exportData = batch.items.map((item) => {
      const meta = item.executionMeta as Record<string, unknown> | null;
      return {
        id: item.id,
        recipientAddress: item.recipientAddress,
        destinationChain: item.destChainId,
        sourceChain: item.sourceChainId,
        token: item.preferredToken,
        amount: item.amount.toString(),
        status: item.status,
        txHash: meta?.bridgeTxHash || null,
        executedAt: meta?.executedAt || null,
        gasCostUSD: (meta?.fees as Record<string, unknown>)?.gasCostUSD || null,
        bridgeFeeUSD: (meta?.fees as Record<string, unknown>)?.bridgeFeeUSD || null,
        failedReason: item.failedReason,
      };
    });
    if (format === 'csv') {
      const headers = [
        'id', 'recipientAddress', 'destinationChain', 'sourceChain',
        'token', 'amount', 'status', 'txHash', 'executedAt',
        'gasCostUSD', 'bridgeFeeUSD', 'failedReason'
      ];
      
      const csvRows = [
        headers.join(','),
        ...exportData.map((row) =>
          headers.map((h) => {
            const val = row[h as keyof typeof row];
            return val === null ? '' : `"${val}"`;
          }).join(',')
        ),
      ];
      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="batch-${id}.csv"`,
        },
      });
    }
    return NextResponse.json({
      batchId: batch.id,
      status: batch.status,
      exportedAt: new Date().toISOString(),
      items: exportData,
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
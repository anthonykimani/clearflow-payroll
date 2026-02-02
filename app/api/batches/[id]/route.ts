import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/db';
// GET /api/batches/[id] - Get batch details with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ batch });
  } catch (error) {
    console.error('Batch fetch error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
// PATCH /api/batches/[id] - Update batch status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;
    const validStatuses = ['draft', 'planned', 'executing', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }
    const batch = await prisma.batch.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ batch });
  } catch (error) {
    console.error('Batch update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
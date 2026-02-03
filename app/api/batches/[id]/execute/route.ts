import { prisma } from "@/db";
import { executeBatch } from "@/services/executor";
import { NextRequest, NextResponse } from "next/server";


export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const useMock = body.mock === true;

        const batch = await prisma.batch.findUnique({
            where: { id }
        });

        if (!batch) {
            return NextResponse.json({ error: "Batch not found" }, { status: 404 });
        }

        // Only execute planned batches
        if (batch.status !== 'planned') {
            return NextResponse.json({ error: `Cannot execute batch in ${batch.status} status. Must be 'planned'` }, { status: 400 })
        }

        const result = await executeBatch(id, useMock);

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error("Execution Error: ", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Execution failed" }, { status: 500 })
    }
} 
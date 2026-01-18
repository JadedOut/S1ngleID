import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// EMERGENCY: Clear all credentials from database
export async function POST(req: NextRequest) {
    try {
        const deleted = await prisma.credential.deleteMany({});

        console.log('🗑️ Deleted all credentials:', deleted.count);

        return NextResponse.json({
            success: true,
            message: `Deleted ${deleted.count} credentials`
        });
    } catch (error: any) {
        console.error('Delete error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}

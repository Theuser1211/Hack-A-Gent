import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { WorkItem, ApiResponse } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<WorkItem[]>>> {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo-user-1';
    
    if (!userId) {
      return NextResponse.json(
        { error: { message: 'User ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const workItems = db.workItems.getAll(userId);
    
    // Sort by creation date, newest first
    const sortedItems = [...workItems].sort((a, b) => b.createdAt - a.createdAt);
    
    return NextResponse.json({ data: sortedItems }, { status: 200 });
  } catch (err) {
    console.error('[API /ai/history]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

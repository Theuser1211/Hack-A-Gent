import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkItem, ApiResponse } from '@/lib/types';
import { getWorkItems } from '@/lib/db';

const historySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  limit: z.number().min(1).max(50).optional().default(10),
  offset: z.number().min(0).optional().default(0)
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = historySchema.safeParse(body);
    
    if (!validationResult.success) {
      const error = validationResult.error.issues[0];
      return NextResponse.json(
        { error: { message: error.message, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const { userId, limit, offset } = validationResult.data;
    
    const items = getWorkItems(userId);
    
    // Sort by creation date descending (newest first)
    const sortedItems = [...items].sort((a, b) => b.createdAt - a.createdAt);
    
    // Apply pagination
    const paginatedItems = sortedItems.slice(offset, offset + limit);
    
    return NextResponse.json(
      { data: { items: paginatedItems, total: items.length } },
      { status: 200 }
    );
    
  } catch (err) {
    console.error('[API /ai/history]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

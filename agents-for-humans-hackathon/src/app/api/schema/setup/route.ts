import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// This endpoint is for demonstration - in a real app with SQLite,
// schema setup would happen via migrations, not an API route.
// We return success to indicate the demo database is ready.

export async function POST(request: NextRequest) {
  try {
    // Validate request body - though we don't expect any for schema setup
    const body = await request.json();
    
    // In a real implementation, we might accept a reset flag
    // For demo purposes, we just confirm the database is initialized
    
    // Verify our seeded data exists
    const contexts = db.aiContext.findMany({});
    const workItems = db.workItems.findMany({});
    const prefs = db.userPrefs.findUnique({ userId: 'user-1' });
    
    if (contexts.length === 0 || workItems.length === 0 || !prefs) {
      return NextResponse.json(
        { error: { message: 'Database seeding failed', code: 'SEEDING_ERROR' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { data: { message: 'Database schema initialized and seeded successfully' } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /api/schema/setup]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

// GET endpoint to check database status
export async function GET(request: NextRequest) {
  try {
    const contexts = db.aiContext.findMany({});
    const workItems = db.workItems.findMany({});
    
    return NextResponse.json(
      { data: { 
        status: 'ready',
        contextsCount: contexts.length,
        workItemsCount: workItems.length
      } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /api/schema/setup]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

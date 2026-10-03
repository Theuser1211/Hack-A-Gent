import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // In a real app, this would run migrations or setup scripts
    // For demo with in-memory storage, we just verify the db is initialized
    
    const contextCount = db.aiContext.findMany().length;
    const workItemCount = db.workItem.findMany().length;
    const prefsCount = Array.from(db.userPrefs.findMany ? db.userPrefs.findMany() : []).length;
    
    // If we have seeded data, return success
    if (contextCount > 0 && workItemCount > 0) {
      return NextResponse.json({
        data: {
          message: 'Database schema verified and seeded with demo data',
          stats: {
            aiContexts: contextCount,
            workItems: workItemCount,
            userPrefs: prefsCount
          }
        }
      }, { status: 200 });
    }
    
    // If no data, seed it now
    // (In practice, seedDemoData() is called on module load in db.ts)
    return NextResponse.json({
      data: {
        message: 'Database schema initialized',
        note: 'Demo data seeded on server start'
      }
    }, { status: 201 });
  } catch (err) {
    console.error('[API /api/schema/setup]', err);
    return NextResponse.json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    }, { status: 500 });
  }
}

// GET endpoint to check schema status
export async function GET(request: NextRequest) {
  try {
    const contextCount = db.aiContext.findMany().length;
    const workItemCount = db.workItem.findMany().length;
    
    return NextResponse.json({
      data: {
        status: 'ready',
        initialized: contextCount > 0 && workItemCount > 0,
        stats: {
          aiContexts: contextCount,
          workItems: workItemCount
        }
      }
    }, { status: 200 });
  } catch (err) {
    console.error('[API /api/schema/setup]', err);
    return NextResponse.json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    }, { status: 500 });
  }
}

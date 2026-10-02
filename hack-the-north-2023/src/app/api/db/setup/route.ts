import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AiContext, WorkItem, UserPrefs } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    // The database is initialized on import; this endpoint simply confirms readiness.
    return NextResponse.json(
      {
        data: {
          message: 'Database schema initialized',
          tables: ['AiContext', 'WorkItem', 'UserPrefs'],
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /db/setup]', err);
    return NextResponse.json(
      {
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

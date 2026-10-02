import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { AiContext, WorkItem, UserPrefs } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const aiContexts = db.prepare('SELECT * FROM AiContext').all() as AiContext[];
    const workItems = db.prepare('SELECT * FROM WorkItem').all() as WorkItem[];
    const userPrefs = db.prepare('SELECT * FROM UserPrefs').all() as UserPrefs[];

    const schema = {
      AiContext: ['id', 'userId', 'inputs', 'createdAt'],
      WorkItem: ['id', 'type', 'status', 'outputSnapshot', 'createdAt'],
      UserPrefs: ['id', 'userId', 'prefs', 'createdAt'],
    };

    return NextResponse.json(
      { data: { schema, seedData: { aiContexts, workItems, userPrefs } } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /db]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

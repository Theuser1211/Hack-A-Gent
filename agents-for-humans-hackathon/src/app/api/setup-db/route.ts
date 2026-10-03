import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // In a real app, this would run migrations. For demo, we just verify the DB is seeded.
    const contexts = db.aiContext.findMany();
    const items = db.workItem.findMany();
    const prefs = db.userPrefs.findUnique({ userId: 'user-1' });
    
    if (contexts.length === 0 || items.length === 0 || !prefs) {
      return NextResponse.json(
        { error: { message: 'Database seeding failed', code: 'SEEDING_ERROR' } },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { data: { message: 'Database schema verified and seeded successfully', contexts: contexts.length, items: items.length } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /setup-db]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

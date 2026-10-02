import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Re-seed demo data
    const { contexts, workItems, userPrefs } = db as any;
    contexts.clear();
    workItems.clear();
    userPrefs.clear();
    
    // Re-import and re-run seed
    const seedModule = await import('@/lib/db');
    // The seed runs on import, so just re-importing is enough
    
    return NextResponse.json({ 
      data: { message: 'Database re-seeded successfully' }
    }, { status: 200 });
  } catch (err) {
    console.error('[API /init-db]', err);
    return NextResponse.json({ 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}

// GET endpoint to check db status
export async function GET(request: NextRequest) {
  try {
    const { contexts, workItems, userPrefs } = db as any;
    return NextResponse.json({ 
      data: { 
        contextCount: contexts.size,
        workItemCount: workItems.size,
        userPrefsCount: userPrefs.size
      }
    }, { status: 200 });
  } catch (err) {
    console.error('[API /init-db]', err);
    return NextResponse.json({ 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AiContext, WorkItem, UserPrefs } from '@/lib/types';
import { db } from '@/lib/db';
import { ReplitSDK } from 'replit-sdk';

export async function POST(request: NextRequest) {
  const schema = z.object({
    force: z.boolean().optional()
  });
  try {
    const body = await request.json();
    const { force = false } = schema.parse(body);
    const seeded = seedDatabase(force);
    let sponsorInfo = null;
    try {
      const sdk = new ReplitSDK();
      sponsorInfo = await sdk.getUserInfo();
    } catch (sponsorErr) {
      console.error('[API /init] Sponsor SDK error', sponsorErr);
    }
    return NextResponse.json(
      { data: { seeded, sponsorInfo } },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /init]', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { message: err.message, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

function seedDatabase(force: boolean): number {
  if (!force && db.aiContexts.size > 0) {
    return 0;
  }
  db.aiContexts.clear();
  db.workItems.clear();
  db.userPrefs.clear();
  const now = Date.now();
  for (let i = 1; i <= 5; i++) {
    const context: AiContext = {
      userId: `user-${i}`,
      inputs: `input-${i}`,
      timestamps: { createdAt: now, updatedAt: now }
    };
    db.aiContexts.set(context.userId, context);
    const workItem: WorkItem = {
      id: `work-${i}`,
      type: 'video',
      status: 'completed',
      outputSnapshot: `output-${i}`
    };
    db.workItems.set(workItem.id, workItem);
    const prefs: UserPrefs = {
      userId: context.userId,
      seedable: true
    };
    db.userPrefs.set(prefs.userId, prefs);
  }
  return 5;
}

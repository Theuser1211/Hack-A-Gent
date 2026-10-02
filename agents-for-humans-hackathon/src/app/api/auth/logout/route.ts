import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const logoutSchema = z.object({
  sessionId: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = logoutSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { sessionId } = parseResult.data;

    // Delete session
    const session = await db.session.findUnique({ id: sessionId });
    if (!session) {
      return NextResponse.json(
        { error: { message: 'Session not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    await db.session.delete({ id: sessionId });

    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (err) {
    console.error('[API /auth/logout]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: { message: 'Session ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const session = db.session.findUnique({ id: sessionId });
    if (!session) {
      return NextResponse.json(
        { error: { message: 'Invalid session', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    db.session.delete({ id: sessionId });

    return NextResponse.json({ data: { success: true } }, { status: 200 });
  } catch (err) {
    console.error('[API /auth/logout]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
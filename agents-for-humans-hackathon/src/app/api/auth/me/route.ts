import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { message: 'Missing or invalid authorization header', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];

    // In a real app, we'd verify the JWT token
    // For demo, we'll extract user ID from token format
    if (!token.startsWith('mock-jwt-token-')) {
      return NextResponse.json(
        { error: { message: 'Invalid token', code: 'INVALID_TOKEN' } },
        { status: 401 }
      );
    }

    // Tokens are minted as `mock-jwt-token-<userId>-<issuedAt>`. User ids contain
    // dashes themselves, so strip the trailing numeric timestamp rather than
    // splitting on '-'.
    const userId = token.replace('mock-jwt-token-', '').replace(/-\d+$/, '');
    const { db } = await import('@/lib/db');
    // Resolve the account the token actually names. Returning a fixed demo
    // user here would let any validly-shaped token read someone else's account.
    const user = await db.user.findUnique({ id: userId });
    if (!user) {
      return NextResponse.json(
        { error: { message: 'User not found', code: 'USER_NOT_FOUND' } },
        { status: 404 }
      );
    }

    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(
      { data: userWithoutPassword },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /auth/me]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
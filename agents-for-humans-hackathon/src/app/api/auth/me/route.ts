import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/lib/types';
import { db, findUserByRefreshToken } from '@/lib/db';

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
    if (!token.startsWith('mock-jwt-token-') && !token.startsWith('refresh-')) {
      return NextResponse.json(
        { error: { message: 'Invalid token', code: 'INVALID_TOKEN' } },
        { status: 401 }
      );
    }

    // Extract user ID from token: mock-jwt-token-<userId>-<issuedAt>
    // User IDs may contain dashes, so we remove the prefix and the trailing timestamp
    // by replacing the trailing `-<digits>` pattern.
    const userIdFromToken = token
      .replace('mock-jwt-token-', '')
      .replace('refresh-', '')
      .replace(/-(\d+)$/, '');

    // Look up user by the extracted ID
    const user = db.user.findUnique({ id: userIdFromToken });
    if (!user) {
      return NextResponse.json(
        { error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } },
        { status: 401 }
      );
    }

    const { password: _, passwordHash: __, ...userWithoutPassword } = user;
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
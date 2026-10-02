import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { User } from '@/lib/types';

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = refreshSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { refreshToken } = parseResult.data;

    const { db } = await import('@/lib/db');
    const isValid = await db.validateRefreshToken(refreshToken);
    if (!isValid) {
      return NextResponse.json(
        { error: { message: 'Invalid or expired refresh token', code: 'INVALID_TOKEN' } },
        { status: 401 }
      );
    }

    // In a real app, we'd decode the refresh token to get user ID
    // For demo, we'll use the first user
    const user = await db.findUserByEmail('alice@example.com');
    if (!user) {
      return NextResponse.json(
        { error: { message: 'User not found', code: 'USER_NOT_FOUND' } },
        { status: 404 }
      );
    }

    const { password: _, ...userWithoutPassword } = user;
    const newToken = `mock-jwt-token-${user.id}-${Date.now()}`;

    // Rotate refresh token
    await db.removeRefreshToken(refreshToken);
    const newRefreshToken = `refresh-token-${Date.now()}`;
    await db.addRefreshToken(newRefreshToken);

    return NextResponse.json(
      { data: { user: userWithoutPassword, token: newToken, refreshToken: newRefreshToken } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /auth/refresh]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
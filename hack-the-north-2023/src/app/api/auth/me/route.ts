import { NextRequest, NextResponse } from 'next/server';
import { z, ValidationError } from 'zod';
import { User } from '@/lib/types';
import { findUserById } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: { message: 'Unauthorized', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }
    const token = authHeader.split(' ')[1];
    const userId = token.replace('mock-token-', '');
    const user = findUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: { message: 'User not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }
    const response: User = { id: user.id, email: user.email, name: user.name };
    return NextResponse.json({ data: response }, { status: 200 });
  } catch (err) {
    console.error('[API /auth/me]', err);
    if (err instanceof ValidationError) {
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

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findUserByEmail } from '@/lib/db';
import { randomUUID } from 'crypto';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Simple in-memory token store for demo purposes
const tokens = new Map<string, string>(); // token -> userId

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = findUserByEmail(email);
    if (!user || user.passwordHash !== password) {
      return NextResponse.json(
        { error: { message: 'Invalid credentials', code: 'AUTH_ERROR' } },
        { status: 401 }
      );
    }

    const token = randomUUID();
    tokens.set(token, user.id);

    return NextResponse.json(
      {
        data: {
          token,
          user: { id: user.id, email: user.email },
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /auth/login]', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { message: err.errors.map((e) => e.message).join(', '), code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

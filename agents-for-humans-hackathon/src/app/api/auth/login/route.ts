import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { LoginRequest, AuthResponse } from '@/lib/types';
import { db, findUserByEmail } from '@/lib/db';
import { createHash } from 'crypto';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    const user = findUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: { message: 'Invalid credentials', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    // Verify password against stored hash
    const providedHash = hashPassword(password);
    if (user.passwordHash !== providedHash && user.password !== providedHash) {
      return NextResponse.json(
        { error: { message: 'Invalid credentials', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const session = db.session.create({ userId: user.id, expiresAt });

    const response: AuthResponse = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      session: {
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      },
    };

    return NextResponse.json({ data: response }, { status: 200 });
  } catch (err) {
    console.error('[API /auth/login]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
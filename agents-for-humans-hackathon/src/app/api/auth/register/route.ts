import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RegisterRequest, AuthResponse } from '@/lib/types';
import { db, createUser, findUserByEmail } from '@/lib/db';
import { createHash } from 'crypto';

const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
});

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { email, password, name } = validationResult.data;

    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: { message: 'User already exists', code: 'CONFLICT' } },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(password);
    const user = createUser({ email, name, passwordHash });

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

    return NextResponse.json({ data: response }, { status: 201 });
  } catch (err) {
    console.error('[API /auth/register]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
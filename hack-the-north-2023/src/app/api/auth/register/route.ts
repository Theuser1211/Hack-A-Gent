import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { User } from '@/lib/types';
import { findUserByEmail, createUser } from '@/lib/db';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = registerSchema.parse(body);

    if (findUserByEmail(email)) {
      return NextResponse.json(
        { error: { message: 'Email already registered', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const passwordHash = password; // demo only, no hashing
    const user = createUser(email, passwordHash);

    return NextResponse.json(
      { data: { id: user.id, email: user.email } },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /auth/register]', err);
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

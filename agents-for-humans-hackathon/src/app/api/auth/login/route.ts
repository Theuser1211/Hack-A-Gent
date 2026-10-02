import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { LoginRequest, User } from '@/lib/types';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = loginSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { email, password } = parseResult.data;

    // Find user by email
    const user = await db.user.findUnique({ email });
    if (!user) {
      // Return same message for security (avoid user enumeration)
      return NextResponse.json(
        { error: { message: 'Invalid email or password', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    // Verify password (in real app, compare hashes)
    if (user.password !== password) {
      return NextResponse.json(
        { error: { message: 'Invalid email or password', code: 'UNAUTHORIZED' } },
        { status: 401 }
      );
    }

    // Create session
    const session = await db.session.create({ userId: user.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });

    // Return response without password
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(
      { data: { user: userWithoutPassword, session } },
      { status: 200 }
    );
  } catch (err) {
    console.error('[API /auth/login]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

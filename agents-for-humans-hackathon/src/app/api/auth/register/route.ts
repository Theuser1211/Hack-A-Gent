import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { RegisterRequest, User } from '@/lib/types';

const registerSchema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters' }),
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { email, password, name } = parseResult.data;

    // Check if user already exists
    const existingUser = await db.user.findUnique({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: { message: 'User already exists', code: 'CONFLICT' } },
        { status: 400 }
      );
    }

    // Create user
    const user = await db.user.create({ email, password, name });

    // Create session
    const session = await db.session.create({ userId: user.id, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });

    // Return response without password
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(
      { data: { user: userWithoutPassword, session } },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /auth/register]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

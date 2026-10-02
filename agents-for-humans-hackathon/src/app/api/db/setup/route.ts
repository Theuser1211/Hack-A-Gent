import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resetDatabase } from '@/lib/db';

// Simple validation error class for internal use
class ValidationError extends Error {}

const requestSchema = z.object({
  reset: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = requestSchema.parse(rawBody);

    if (parsed.reset) {
      resetDatabase();
    }

    return NextResponse.json(
      { data: { message: 'Database seeded successfully' } },
      { status: 201 }
    );
  } catch (err) {
    console.error('[API /api/db/setup]', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: { message: err.message, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
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

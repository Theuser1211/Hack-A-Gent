import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AiRun } from '@/lib/types';
import { aiRuns } from '@/lib/db';

const QuerySchema = z.object({
  userId: z.string().min(1),
});

class ValidationError extends Error {}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const result = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!result.success) {
      throw new ValidationError(result.error.message);
    }
    const { userId } = result.data;

    const runs: AiRun[] = [];
    aiRuns.forEach((run) => {
      if (run.userId === userId) runs.push(run);
    });

    return NextResponse.json({ data: runs }, { status: 200 });
  } catch (err) {
    console.error('[API /api/ai/history]', err);
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

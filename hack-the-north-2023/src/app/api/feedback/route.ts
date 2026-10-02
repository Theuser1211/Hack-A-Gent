import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Feedback } from '@/lib/types';
import { feedbacks, aiRuns } from '@/lib/db';

const FeedbackSchema = z.object({
  runId: z.string().min(1),
  rating: z.enum(['1', '2', '3', '4', '5']).transform((v) => Number(v)),
  comment: z.string().optional(),
});

class ValidationError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = FeedbackSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }
    const { runId, rating, comment } = parsed.data;

    if (!aiRuns.has(runId)) {
      return NextResponse.json(
        { error: { message: 'Run not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const newFeedback: Feedback = {
      runId,
      rating,
      comment: comment ?? null,
      createdAt: new Date().toISOString(),
    };

    feedbacks.push(newFeedback);

    return NextResponse.json({ data: newFeedback }, { status: 201 });
  } catch (err) {
    console.error('[API /api/feedback]', err);
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

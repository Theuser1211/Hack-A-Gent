import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { AiRun } from '@/lib/types';
import { aiRuns } from '@/lib/db';
// Sponsor SDK placeholder – replace with real SDK when available
import { replitClient } from 'replit-sdk'; // assume this SDK exists

const RunSchema = z.object({
  userId: z.string().min(1),
  inputs: z.array(z.string().min(1)).min(1),
});

class ValidationError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = RunSchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.message);
    }
    const { userId, inputs } = parsed.data;

    // Simulate a sponsor API call (e.g., Replit AI endpoint)
    let sponsorResult: any;
    try {
      sponsorResult = await replitClient.runAi({ inputs });
    } catch (sdkErr) {
      console.error('[API /api/ai/run] Sponsor SDK error', sdkErr);
      // Continue with mock result for demo
      sponsorResult = { type: 'mock', title: 'Demo Result' };
    }

    const newRun: AiRun = {
      id: uuidv4(),
      userId,
      inputs,
      status: 'completed',
      output: sponsorResult,
      createdAt: new Date().toISOString(),
    };

    aiRuns.set(newRun.id, newRun);

    return NextResponse.json({ data: newRun }, { status: 201 });
  } catch (err) {
    console.error('[API /api/ai/run]', err);
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

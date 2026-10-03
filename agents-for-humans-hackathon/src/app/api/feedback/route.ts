import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { WorkItem, ApiResponse, AiContext } from '@/lib/types';

const feedbackSchema = z.object({
  workItemId: z.string().min(1, 'Work item ID is required'),
  adjustment: z.object({
    description: z.string().min(1, 'Adjustment description is required').max(500),
    mediaType: z.enum(['video', 'article', 'song']).optional(),
    timeframe: z.string().max(100).optional(),
    keywords: z.array(z.string().max(50)).max(10).optional()
  })
});

// Mock sponsor API (same as in ai/run)
class MockSponsorApi {
  async search(context: AiContext): Promise<{ result: string; confidence: number }> {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const desc = context.inputs.description.toLowerCase();
    
    if (desc.includes('never gonna give you up') || desc.includes('rickroll')) {
      return { result: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', confidence: 0.95 };
    }
    
    if (desc.includes('quantum') || desc.includes('physics')) {
      return { result: 'https://en.wikipedia.org/wiki/Quantum_mechanics', confidence: 0.88 };
    }
    
    if (desc.includes('bohemian rhapsody') || desc.includes('queen')) {
      return { result: 'https://open.spotify.com/track/6rqhFgbbKwnb9MLmUQDhG6', confidence: 0.92 };
    }
    
    return {
      result: `https://example.com/search?q=${encodeURIComponent(context.inputs.description)}`,
      confidence: 0.6
    };
  }
}

const sponsorApi = new MockSponsorApi();

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse<WorkItem>>> {
  try {
    const body = await request.json();
    const validationResult = feedbackSchema.safeParse(body);
    
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.errors.map(err => err.path.join('->')).join(', ');
      return NextResponse.json(
        { error: { message: `Invalid input: ${fieldErrors}`, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const { workItemId, adjustment } = validationResult.data;
    
    // Validate work item exists
    const existingWorkItem = db.workItems.getById(workItemId);
    if (!existingWorkItem) {
      return NextResponse.json(
        { error: { message: 'Work item not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }
    
    // Create new work item for refinement
    const refinementWorkItem = db.workItems.create({
      type: 'refinement',
      status: 'pending',
      outputSnapshot: null,
      confidenceScore: null
    });
    
    // Update to processing
    db.workItems.update(refinementWorkItem.id, { status: 'processing' });
    
    try {
      // Create context from adjustment
      const context: AiContext = {
        userId: 'demo-user-1', // In real app, extract from auth/session
        inputs: adjustment,
        timestamp: Date.now()
      };
      
      // Call sponsor API with adjusted inputs
      const sponsorResult = await sponsorApi.search(context);
      
      // Complete refinement work item
      const completedWorkItem = db.workItems.update(refinementWorkItem.id, {
        status: 'completed',
        outputSnapshot: sponsorResult.result,
        confidenceScore: sponsorResult.confidence
      });
      
      if (!completedWorkItem) {
        throw new Error('Failed to update refinement work item');
      }
      
      return NextResponse.json({ data: completedWorkItem }, { status: 200 });
    } catch (sponsorError) {
      // Mark refinement as failed
      db.workItems.update(refinementWorkItem.id, { status: 'failed' });
      
      console.error('[API /feedback] Sponsor API error:', sponsorError);
      return NextResponse.json(
        { error: { message: 'Search service temporarily unavailable', code: 'SPONSOR_API_ERROR' } },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error('[API /feedback]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

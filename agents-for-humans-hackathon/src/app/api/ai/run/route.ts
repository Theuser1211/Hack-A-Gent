import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { AiContext, WorkItem, ApiResponse } from '@/lib/types';

const aiContextSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  inputs: z.object({
    description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
    mediaType: z.enum(['video', 'article', 'song']).optional(),
    timeframe: z.string().max(100).optional(),
    keywords: z.array(z.string().max(50)).max(10, 'Too many keywords').optional()
  })
});

// Mock sponsor API (simulating a search/service API)
class MockSponsorApi {
  async search(context: AiContext): Promise<{ result: string; confidence: number }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Mock results based on description keywords
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
    
    // Default fallback
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
    const validationResult = aiContextSchema.safeParse(body);
    
    if (!validationResult.success) {
      const fieldErrors = validationResult.error.errors.map(err => err.path.join('->')).join(', ');
      return NextResponse.json(
        { error: { message: `Invalid input: ${fieldErrors}`, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const { userId, inputs } = validationResult.data;
    const context: AiContext = {
      userId,
      inputs,
      timestamp: Date.now()
    };
    
    // Create pending work item
    const workItem = db.workItems.create({
      type: 'search',
      status: 'pending',
      outputSnapshot: null,
      confidenceScore: null
    });
    
    // Update to processing
    db.workItems.update(workItem.id, { status: 'processing' });
    
    try {
      // Call sponsor API
      const sponsorResult = await sponsorApi.search(context);
      
      // Complete work item
      const completedWorkItem = db.workItems.update(workItem.id, {
        status: 'completed',
        outputSnapshot: sponsorResult.result,
        confidenceScore: sponsorResult.confidence
      });
      
      if (!completedWorkItem) {
        throw new Error('Failed to update work item');
      }
      
      return NextResponse.json({ data: completedWorkItem }, { status: 200 });
    } catch (sponsorError) {
      // Mark work item as failed
      db.workItems.update(workItem.id, { status: 'failed' });
      
      console.error('[API /ai/run] Sponsor API error:', sponsorError);
      return NextResponse.json(
        { error: { message: 'Search service temporarily unavailable', code: 'SPONSOR_API_ERROR' } },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error('[API /ai/run]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

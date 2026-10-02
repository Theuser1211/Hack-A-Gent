import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { WorkItem, ApiResponse } from '@/lib/types';
import { updateWorkItem, getWorkItems } from '@/lib/db';

const feedbackSchema = z.object({
  workItemId: z.string().min(1, 'Work item ID is required'),
  userId: z.string().min(1, 'User ID is required'),
  adjustment: z.object({
    description: z.string().max(500).optional(),
    mediaType: z.enum(['video', 'article', 'song']).optional(),
    timeframe: z.string().max(100).optional(),
    keywords: z.array(z.string().max(50)).max(10).optional()
  }).optional(),
  rating: z.number().min(1).max(5).optional()
});

// Mock sponsor API for refined search
async function callRefinedSearchApi(originalInputs: any, adjustments: any): Promise<{ output: string; confidence: number }> {
  await new Promise(resolve => setTimeout(resolve, 600));
  
  // Simulate refined search based on adjustments
  const refinedDesc = adjustments?.description || originalInputs.description;
  
  if (refinedDesc.toLowerCase().includes('volkswagen') && refinedDesc.toLowerCase().includes('whistling')) {
    return { output: '"Budapest" by George Ezra - 2015 Volkswagen Golf commercial', confidence: 0.94 };
  }
  
  if (refinedDesc.toLowerCase().includes('honeybee') && refinedDesc.toLowerCase().includes('math')) {
    return { output: 'Research: Honeybees understand zero and can do basic arithmetic', confidence: 0.89 };
  }
  
  return {
    output: `Refined search for: "${refinedDesc}" - trying alternative matches...`,
    confidence: 0.6
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = feedbackSchema.safeParse(body);
    
    if (!validationResult.success) {
      const error = validationResult.error.issues[0];
      return NextResponse.json(
        { error: { message: error.message, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const { workItemId, userId, adjustment, rating } = validationResult.data;
    
    // Verify work item exists and belongs to user
    const userItems = getWorkItems(userId);
    const workItem = userItems.find(item => item.id === workItemId);
    
    if (!workItem) {
      return NextResponse.json(
        { error: { message: 'Work item not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }
    
    // If we have adjustments, create a refined search
    if (adjustment) {
      // Get original context (simplified - in real app would fetch from contexts)
      const originalInputs = {
        description: 'that song with the whistling', // placeholder
        mediaType: 'song',
        timeframe: undefined,
        keywords: []
      };
      
      const { output, confidence } = await callRefinedSearchApi(originalInputs, adjustment);
      
      // Create new work item for refined search
      const refinedWorkItem: WorkItem = {
        id: `work-refined-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'refinement',
        status: 'completed',
        outputSnapshot: output,
        confidenceScore: confidence,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      
      // In a real app, we'd store this properly
      // For demo, we'll just return it
      return NextResponse.json(
        { data: refinedWorkItem },
        { status: 200 }
      );
    }
    
    // If just rating, update the work item
    if (rating !== undefined) {
      updateWorkItem(workItemId, {
        // In a real app, we might store ratings separately
        // For demo, we'll just acknowledge the update
      });
      
      return NextResponse.json(
        { data: { message: 'Feedback recorded', workItemId } },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { data: { message: 'Feedback processed' } },
      { status: 200 }
    );
    
  } catch (err) {
    console.error('[API /feedback]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

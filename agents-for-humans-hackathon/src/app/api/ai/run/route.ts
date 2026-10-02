import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AiContext, WorkItem, ApiResponse } from '@/lib/types';
import { getUserPrefs, addAiContext, addWorkItem, updateWorkItem } from '@/lib/db';

const aiContextSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  inputs: z.object({
    description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
    mediaType: z.enum(['video', 'article', 'song']).optional(),
    timeframe: z.string().max(100).optional(),
    keywords: z.array(z.string().max(50)).max(10, 'Too many keywords').optional()
  })
});

// Mock sponsor API (simulating a search service)
async function callSearchApi(inputs: AiContext['inputs']): Promise<{ output: string; confidence: number }> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Simple mock logic based on keywords
  const desc = inputs.description.toLowerCase();
  if (desc.includes('whistling') && desc.includes('car')) {
    return { output: '"Budapest" by George Ezra - Volkswagen commercial', confidence: 0.87 };
  }
  if (desc.includes('bees') && desc.includes('math')) {
    return { output: 'Study: Bees can learn to associate symbols with quantities', confidence: 0.92 };
  }
  if (desc.includes('cat') && desc.includes('piano')) {
    return { output: 'Keyboard Cat playing jazz piano - original 2007 video', confidence: 0.78 };
  }
  
  // Fallback mock response
  return {
    output: `No exact match found for: "${inputs.description}". Try adding more specific details like timeframe, media type, or keywords.`,
    confidence: 0.3
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validationResult = aiContextSchema.safeParse(body);
    
    if (!validationResult.success) {
      const error = validationResult.error.issues[0];
      return NextResponse.json(
        { error: { message: error.message, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }
    
    const { userId, inputs } = validationResult.data;
    
    // Verify user exists (in real app, this would be auth)
    const userPrefs = getUserPrefs(userId);
    if (!userPrefs) {
      return NextResponse.json(
        { error: { message: 'User not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }
    
    // Create AI context
    const context: AiContext = {
      userId,
      inputs,
      timestamp: Date.now()
    };
    
    addAiContext(context);
    
    // Create work item
    const workItem: WorkItem = {
      id: `work-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'search',
      status: 'processing',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    addWorkItem(workItem);
    
    // Call sponsor API (mocked)
    const { output, confidence } = await callSearchApi(inputs);
    
    // Update work item with result
    const completedWorkItem: WorkItem = {
      ...workItem,
      status: 'completed',
      outputSnapshot: output,
      confidenceScore: confidence,
      updatedAt: Date.now()
    };
    
    updateWorkItem(completedWorkItem.id, {
      status: 'completed',
      outputSnapshot: output,
      confidenceScore: confidence,
      updatedAt: Date.now()
    });
    
    return NextResponse.json(
      { data: completedWorkItem },
      { status: 200 }
    );
    
  } catch (err) {
    console.error('[API /ai/run]', err);
    return NextResponse.json(
      { error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

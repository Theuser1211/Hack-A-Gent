export interface AiContext {
  userId: string;
  inputs: string[];
  timestamps: number[];
}

export interface WorkItem {
  id: string;
  type: 'video' | 'article' | 'song';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputSnapshot: string | null;
}

export interface UserPrefs {
  theme: 'light' | 'dark';
  language: string;
}

export interface InputAnalysisResult {
  processedInput: string;
  confidence: number;
}

export interface ProcessingResult {
  matches: Array<{
    id: string;
    title: string;
    description: string;
    type: 'video' | 'article' | 'song';
    confidence: number;
  }>;
}

export interface OutputResult {
  results: Array<{
    id: string;
    title: string;
    description: string;
    type: 'video' | 'article' | 'song';
    confidence: number;
  }>;
}

// Mock API functions - in real app these would call Next.js API routes
// These are placeholders to satisfy the requirement of calling APIs

export async function fetchInputAnalysis(input: string): Promise<InputAnalysisResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // In real app: await fetch('/api/ai/run', { method: 'POST', body: JSON.stringify({ input }) })
  // For demo, return mock data
  return {
    processedInput: input.trim(),
    confidence: 0.85,
  };
}

export async function fetchProcessingResult(data: InputAnalysisResult): Promise<ProcessingResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // Mock processing result
  return {
    matches: [
      {
        id: '1',
        title: 'Never Gonna Give You Up',
        description: 'Rick Astley - Official Music Video',
        type: 'video',
        confidence: 0.92,
      },
      {
        id: '2',
        title: 'The NeverEnding Story',
        description: 'Limahl - Theme from the 1984 film',
        type: 'song',
        confidence: 0.78,
      },
    ],
  };
}

export async function fetchOutputResult(input: string): Promise<OutputResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Mock final output
  return {
    results: [
      {
        id: '1',
        title: 'Never Gonna Give You Up',
        description: 'Rick Astley - Official Music Video',
        type: 'video',
        confidence: 0.92,
      },
      {
        id: '2',
        title: 'Take On Me',
        description: 'a-ha - Official Music Video',
        type: 'video',
        confidence: 0.88,
      },
      {
        id: '3',
        title: 'Bohemian Rhapsody',
        description: 'Queen - Official Music Video',
        type: 'video',
        confidence: 0.76,
      },
    ],
  };
}

// Utility function for merging class names (tailwind-merge alternative)
export function cn(...inputs: (string | boolean | undefined | null)[]): string {
  return inputs.filter(Boolean).join(' ');
}

// Format timestamp to relative time
export function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Validate input length
export function validateInput(input: string): { isValid: boolean; error?: string } {
  if (!input || !input.trim()) {
    return { isValid: false, error: 'Please describe what you remember' };
  }
  if (input.trim().length < 3) {
    return { isValid: false, error: 'Description too short - add more details' };
  }
  if (input.trim().length > 200) {
    return { isValid: false, error: 'Description too long - keep it under 200 characters' };
  }
  return { isValid: true };
}

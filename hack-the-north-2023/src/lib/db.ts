import { AiRun, Feedback } from '@/lib/types';

// In‑memory storage for demo purposes
export const aiRuns = new Map<string, AiRun>();
export const feedbacks: Feedback[] = [];

// Seed with a few realistic records
function seed() {
  const now = Date.now();
  const sampleRuns: AiRun[] = [
    {
      id: 'run_1',
      userId: 'user_a',
      inputs: ['song with a piano intro and a female vocalist'],
      status: 'completed',
      output: { type: 'song', title: 'River', artist: 'Leon Bridges' },
      createdAt: new Date(now - 1000 * 60 * 5).toISOString(),
    },
    {
      id: 'run_2',
      userId: 'user_b',
      inputs: ['movie where the protagonist is a chef in Paris'],
      status: 'completed',
      output: { type: 'movie', title: 'Chef', year: 2014 },
      createdAt: new Date(now - 1000 * 60 * 30).toISOString(),
    },
    {
      id: 'run_3',
      userId: 'user_a',
      inputs: ['article about quantum computing breakthroughs 2023'],
      status: 'completed',
      output: { type: 'article', url: 'https://example.com/quantum-2023' },
      createdAt: new Date(now - 1000 * 60 * 60).toISOString(),
    },
  ];

  for (const run of sampleRuns) {
    aiRuns.set(run.id, run);
  }
}

seed();
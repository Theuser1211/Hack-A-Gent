export const config = {
  name: 'Quarry',
  description: 'A reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.',
  theme: {
    colors: {
      primary: '#0f172a',
      secondary: '#64748b',
      accent: '#3b82f6',
      background: '#ffffff',
      muted: '#f1f5f9'
    }
  },
  api: {
    aiRun: '/api/ai/run',
    aiHistory: '/api/ai/history',
    feedback: '/api/feedback'
  },
  features: {
    demoMode: true,
    seedData: true,
    streamingResults: true
  }
};

export type Config = typeof config;

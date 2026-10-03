export const config = {
  name: 'Quarry',
  description: 'A reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.',
  theme: {
    colors: {
      primary: '#0ea5e9',
      secondary: '#64748b',
      background: '#ffffff',
      foreground: '#0f172a',
      muted: '#f1f5f9'
    }
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || '',
    endpoints: {
      aiRun: '/api/ai/run',
      aiHistory: '/api/ai/history',
      feedback: '/api/feedback'
    }
  },
  featureFlags: {
    enableDemoMode: !!process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE,
    seedData: !!process.env.NEXT_PUBLIC_SEED_DATA
  }
};
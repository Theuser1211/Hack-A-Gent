// ---- Strategy Template Types ----

export type StrategyTemplateCategory =
  | 'wow_first'
  | 'single_flow'
  | 'demo_safety'
  | 'perceived_intelligence'
  | 'narrative_driven';

export interface StrategyTemplate {
  id: string;
  name: string;
  category: StrategyTemplateCategory;
  description: string;
  executionSteps: string[];
  uxPriority: number;
  backendPriority: number;
  wowFactor: number;
  riskLevel: number;
  predictedScoreBonus: number;
  guardrails: string[];
  antiPatterns: string[];
}

// ---- Real-World Winning Patterns ----

export const WINNING_STRATEGIES: StrategyTemplate[] = [
  // 1. "Wow First, Logic Later"
  {
    id: 'wow-first',
    name: 'Wow First, Logic Later',
    category: 'wow_first',
    description:
      'Prioritize UI demo above all else. Fake backend if needed. Maximize judge impression in first 5 seconds.',
    executionSteps: [
      'Build visually stunning landing page',
      'Add interactive demo that works with mock data',
      'Polish transitions and animations',
      'Add real backend only if time permits',
      'Deploy and verify visual flow',
    ],
    uxPriority: 10,
    backendPriority: 2,
    wowFactor: 0.95,
    riskLevel: 0.2,
    predictedScoreBonus: 12,
    guardrails: [
      'Never show raw mock data Ã¢â‚¬â€ simulate realism',
      'At least one interactive element must work end-to-end',
      'Loading states must look intentional, not broken',
    ],
    antiPatterns: [
      'Building auth system before UI',
      'Writing tests before demo is visible',
      'Spending time on database schema',
    ],
  },

  // 2. "Single Flow Obsession"
  {
    id: 'single-flow',
    name: 'Single Flow Obsession',
    category: 'single_flow',
    description: '1 user journey only. No branching complexity. Optimize completion rate of that single flow.',
    executionSteps: [
      'Map one complete user journey',
      'Build entry point (landing/login)',
      'Build core action (the main feature)',
      'Build success state (result/output screen)',
      'Deploy and test the single flow end-to-end',
    ],
    uxPriority: 8,
    backendPriority: 5,
    wowFactor: 0.7,
    riskLevel: 0.15,
    predictedScoreBonus: 8,
    guardrails: [
      'Only one button path Ã¢â‚¬â€ no side navigation',
      'Every screen leads to the next Ã¢â‚¬â€ no dead ends',
      'Error state must redirect back to flow start',
    ],
    antiPatterns: [
      'Multiple user roles or permission levels',
      'Settings pages or configuration UIs',
      'Feature toggles or A/B testing',
    ],
  },

  // 3. "Demo Safety Net"
  {
    id: 'demo-safety',
    name: 'Demo Safety Net',
    category: 'demo_safety',
    description: 'Fallback UI if API fails. Graceful degradation always. Demo never crashes.',
    executionSteps: [
      'Build main UI with static mock data first',
      'Layer API integration on top',
      'Add error boundaries and fallback components',
      'Add offline/demo mode toggle',
      'Deploy with fallback enabled by default',
    ],
    uxPriority: 7,
    backendPriority: 4,
    wowFactor: 0.5,
    riskLevel: 0.08,
    predictedScoreBonus: 5,
    guardrails: [
      'Every API call must have a fallback response',
      'Demo mode must look identical to live mode',
      'Network errors must show graceful messages, not stack traces',
    ],
    antiPatterns: [
      'Hard dependency on external API availability',
      'No error boundaries on critical components',
      'Showing loading spinners without timeouts',
    ],
  },

  // 4. "Perceived Intelligence Bias"
  {
    id: 'perceived-intelligence',
    name: 'Perceived Intelligence Bias',
    category: 'perceived_intelligence',
    description: 'Add AI-like features even if simulated. Autocomplete, smart suggestions, adaptive UI.',
    executionSteps: [
      'Identify a decision point in the UI',
      'Add smart-suggestion widget',
      'Simulate AI response with rule-based logic',
      'Add typing indicator and "AI thinking" animation',
      'Ensure response feels intelligent, not random',
    ],
    uxPriority: 9,
    backendPriority: 3,
    wowFactor: 0.9,
    riskLevel: 0.18,
    predictedScoreBonus: 10,
    guardrails: [
      'Simulated AI must produce plausible outputs',
      'Response time must include artificial delay for realism',
      'Never claim real AI if using mock Ã¢â‚¬â€ let judge infer',
    ],
    antiPatterns: [
      'Obvious if-else responses that feel robotic',
      'No loading state Ã¢â‚¬â€ instant reply breaks illusion',
      'Claiming GPT integration without demo evidence',
    ],
  },

  // 5. "Narrative Driven Build"
  {
    id: 'narrative-driven',
    name: 'Narrative Driven Build',
    category: 'narrative_driven',
    description:
      'Problem Ã¢â€ â€™ Pain Ã¢â€ â€™ Solution Ã¢â€ â€™ Wow Moment. Enforce storytelling in every UI screen.',
    executionSteps: [
      'Build problem screen (why this exists)',
      'Build pain screen (what users struggle with)',
      'Build solution screen (the app in action)',
      'Build wow moment (the impressive result)',
      'Deploy and verify narrative flow',
    ],
    uxPriority: 9,
    backendPriority: 3,
    wowFactor: 0.85,
    riskLevel: 0.22,
    predictedScoreBonus: 9,
    guardrails: [
      'Each screen must advance the story',
      'Judge must understand the problem in <10 seconds',
      'Wow moment must be the final and most impressive screen',
    ],
    antiPatterns: [
      'Boring welcome screen with login form',
      'Jumping straight to technical features without context',
      'No clear narrative arc across screens',
    ],
  },
];

// ---- Template Lookup ----

export function getWinningStrategyById(id: string): StrategyTemplate | undefined {
  return WINNING_STRATEGIES.find((s) => s.id === id);
}

export function getWinningStrategiesByCategory(category: StrategyTemplateCategory): StrategyTemplate[] {
  return WINNING_STRATEGIES.filter((s) => s.category === category);
}

export function getHighestImpactStrategy(): StrategyTemplate {
  return [...WINNING_STRATEGIES].sort((a, b) => b.wowFactor - a.wowFactor)[0]!;
}

export function getLowestRiskStrategy(): StrategyTemplate {
  return [...WINNING_STRATEGIES].sort((a, b) => a.riskLevel - b.riskLevel)[0]!;
}

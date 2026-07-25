import type { CompetitionAnalysis } from '../pipeline/types.js';
import type { InterviewQuestion, OptimizationBudget } from './types.js';

export function generateQuestions(analysis: CompetitionAnalysis): InterviewQuestion[] {
  const questions: InterviewQuestion[] = [];

  const sponsorQuestion = createSponsorQuestion(analysis);
  if (sponsorQuestion) {
    questions.push(sponsorQuestion);
  }

  questions.push(createBudgetQuestion());
  questions.push(createProjectIdeaQuestion());

  return questions;
}

function createSponsorQuestion(analysis: CompetitionAnalysis): InterviewQuestion | null {
  if (!analysis.sponsorAPIs || analysis.sponsorAPIs.length === 0) {
    return null;
  }

  return {
    id: 'q_sponsors',
    text: 'Which sponsor APIs do you want to use in your project?',
    category: 'sponsor_selection',
    options: analysis.sponsorAPIs.map((api) => ({
      value: api.name,
      label: api.provider,
      description: api.description,
      influences: {
        sponsorApis: [api.name],
        technologyPreference: inferTechPreference(api.name),
      },
    })),
    required: false,
    dependsOn: [],
    skipLabel: 'S. Skip sponsor APIs',
  };
}

function createBudgetQuestion(): InterviewQuestion {
  const budgets: OptimizationBudget[] = ['minimal', 'balanced', 'aggressive'];

  return {
    id: 'q_budget',
    text: 'What is your optimization budget?',
    category: 'optimization',
    options: budgets.map((b) => ({
      value: b,
      label: b.charAt(0).toUpperCase() + b.slice(1),
      description: budgetDescription(b),
      influences: { optimizationBudget: b },
    })),
    required: true,
    dependsOn: [],
  };
}

function createProjectIdeaQuestion(): InterviewQuestion {
  return {
    id: 'q_idea',
    text: 'Do you have a project idea you want to build?',
    category: 'project_idea',
    options: [],
    required: false,
    dependsOn: [],
    skipLabel: 'S. Auto-generate the best project idea',
  };
}

function budgetDescription(budget: OptimizationBudget): string {
  switch (budget) {
    case 'minimal':
      return 'Core features only, focus on polish and demo readiness';
    case 'balanced':
      return 'Good feature set with reasonable depth and presentation quality';
    case 'aggressive':
      return 'Full-featured project with advanced features and maximum judge impact';
  }
}

function inferTechPreference(apiName: string): string[] {
  const lower = apiName.toLowerCase();
  if (lower.includes('openai') || lower.includes('hugging')) return ['python'];
  if (lower.includes('firebase') || lower.includes('supabase')) return ['nextjs'];
  if (lower.includes('twilio')) return ['express'];
  if (lower.includes('stripe')) return ['nextjs'];
  return [];
}

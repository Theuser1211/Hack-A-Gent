import type { CompetitionAnalysis } from '../pipeline/types.js';
import type { InterviewQuestion, OptimizationBudget } from './types.js';

const MIN_TEAM_SIZE = 1;
const MAX_TEAM_SIZE = 10;
const MIN_HOURS = 1;
const MAX_HOURS = 168;
const SPONSOR_CONFIDENCE_THRESHOLD: import('../confidence.js').ConfidenceLevel = 'confirmed';

export function generateQuestions(analysis: CompetitionAnalysis): InterviewQuestion[] {
  const questions: InterviewQuestion[] = [];

  const teamSizeQuestion = createTeamSizeQuestion(analysis);
  if (teamSizeQuestion) {
    questions.push(teamSizeQuestion);
  }

  const hoursQuestion = createHoursRemainingQuestion(analysis);
  if (hoursQuestion) {
    questions.push(hoursQuestion);
  }

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

  const confidence = analysis.extractionConfidence?.sponsorAPIs?.confidence;
  if (confidence !== SPONSOR_CONFIDENCE_THRESHOLD) {
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

function createTeamSizeQuestion(analysis: CompetitionAnalysis): InterviewQuestion | null {
  const inferredTeamSize = inferTeamSize(analysis);
  const text = analysis.challenge.problemStatement || '';
  const hasInferred = /\d+\s*(?:person|member|people)\s*(?:team|group)/i.test(text);
  if (hasInferred) {
    return null;
  }

  return {
    id: 'q_team_size',
    text: `What is your team size? (1-${MAX_TEAM_SIZE}, default ${inferredTeamSize}):`,
    category: 'team_size',
    options: [],
    required: true,
    dependsOn: [],
    minValue: MIN_TEAM_SIZE,
    maxValue: MAX_TEAM_SIZE,
    defaultAnswer: String(inferredTeamSize),
  };
}

function createHoursRemainingQuestion(analysis: CompetitionAnalysis): InterviewQuestion | null {
  const inferredHours = inferHoursRemaining(analysis);
  const hasDeadline = analysis.deadlines && analysis.deadlines.length > 0 &&
    analysis.deadlines.some(d => d.type === 'submission');
  if (hasDeadline) {
    return null;
  }

  return {
    id: 'q_hours_remaining',
    text: `Hours remaining until deadline? (1-${MAX_HOURS}, default ${inferredHours}):`,
    category: 'hours_remaining',
    options: [],
    required: true,
    dependsOn: [],
    minValue: MIN_HOURS,
    maxValue: MAX_HOURS,
    defaultAnswer: String(inferredHours),
  };
}

function inferTeamSize(analysis: CompetitionAnalysis): number {
  const text = analysis.challenge.problemStatement || '';
  const match = text.match(/(\d+)\s*(?:person|member|people)\s*(?:team|group)/i);
  if (match) {
    const size = parseInt(match[1]!, 10);
    return Math.max(1, Math.min(10, size));
  }
  return 1;
}

function inferHoursRemaining(analysis: CompetitionAnalysis): number {
  if (analysis.deadlines && analysis.deadlines.length > 0) {
    const submissionDeadline = analysis.deadlines.find(d => d.type === 'submission');
    if (submissionDeadline) {
      const parsed = new Date(submissionDeadline.date);
      if (!isNaN(parsed.getTime())) {
        const hours = Math.max(1, Math.round((parsed.getTime() - Date.now()) / 3600000));
        return Math.min(168, hours);
      }
    }
  }
  return 5;
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

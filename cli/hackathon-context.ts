import type { CompetitionAnalysis } from './pipeline/types.js';

/**
 * Structured hackathon context consumed by every agent.
 * Built once from parsed URL + user answers, then passed through the pipeline.
 */
export interface HackathonContext {
  title: string;
  organizer: string;
  projectName: string;
  deadline: string;
  hoursRemaining: number;
  hoursRemainingKnown: boolean;
  teamSize: number;
  teamSizeFixed: boolean;
  preferredStack: string[];
  stackDetected: boolean;
  sponsorPrizes: SponsorPrize[];
  judgingCriteria: JudgingCriterion[];
  requiredAPIs: string[];
  restrictions: string[];
  primaryGoal: 'win' | 'sponsor_prize' | 'complete' | 'learn';
  hasExistingRepo: boolean;
  source: string;
}

export interface SponsorPrize {
  sponsor: string;
  prize: string;
  requirements: string[];
  apiRequired: boolean;
}

export interface JudgingCriterion {
  name: string;
  weight: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ExecutionPlan {
  title: string;
  targetPrize: string;
  estimatedTime: string;
  strategy: string[];
  architecture: string;
  features: Array<{ name: string; reason: string }>;
  risks: Array<{ risk: string; mitigation: string }>;
  timeline: string[];
  demoStrategy: string[];
  submissionStrategy: string[];
}

/**
 * Build a HackathonContext from a CompetitionAnalysis (parsed) + user answers.
 * Only questions that CANNOT be inferred from the parsed data are collected.
 */
export function buildContext(
  analysis: CompetitionAnalysis | null,
  answers: {
    url: string;
    projectName?: string | null;
    preferredStack?: string | null;
    teamSize?: string | null;
    hoursRemaining?: string | null;
    primaryGoal?: string | null;
    hasExistingRepo?: string | null;
  },
): HackathonContext {
  const now = new Date();

  // --- Infer from competition analysis ---
  const title = analysis?.challenge.title ?? 'Untitled Hackathon';
  const organizer = analysis?.challenge.organizer ?? 'Unknown';
  const sponsorPrizes: SponsorPrize[] = (analysis?.sponsorAPIs ?? []).map(a => ({
    sponsor: a.name,
    prize: `${a.name} Prize`,
    requirements: a.strategicValue === 'must_use' ? [`Must use ${a.name} API`] : [],
    apiRequired: a.strategicValue === 'must_use',
  }));
  const judgingCriteria: JudgingCriterion[] = (analysis?.judgingCriteria ?? []).map(c => ({
    name: c.name,
    weight: c.weight,
    priority: c.priority,
  }));
  const restrictions = analysis?.restrictions ?? [];
  const requiredAPIs = (analysis?.sponsorAPIs ?? [])
    .filter(a => a.strategicValue === 'must_use')
    .map(a => a.name);

  // --- Infer deadlines from parsed data ---
  let deadline = '';
  let hoursRemaining = 5;
  let hoursRemainingKnown = false;

  if (analysis?.deadlines && analysis.deadlines.length > 0) {
    const submissionDeadline = analysis.deadlines.find(d => d.type === 'submission');
    if (submissionDeadline) {
      deadline = submissionDeadline.date;
      const parsed = parseDate(deadline);
      if (parsed) {
        hoursRemaining = Math.max(0, Math.round((parsed.getTime() - now.getTime()) / 3600000));
        hoursRemainingKnown = true;
      }
    }
  }

  // --- Infer team size from competition ---
  let teamSize = 1;
  let teamSizeFixed = false;
  const teamMatch = analysis?.challenge.problemStatement.match(/(\d+)\s*(?:person|member|people)\s*(?:team|group)/i);
  if (teamMatch) {
    teamSize = parseInt(teamMatch[1]!, 10);
    teamSizeFixed = true;
  }

  // --- Detect stack from analysis ---
  const detectedStack = analysis?.challenge.problemStatement
    ? inferTechStack(analysis.challenge.problemStatement + ' ' + (analysis?.sponsorAPIs.map(a => a.name).join(' ') ?? ''))
    : [];

  // --- Merge with user answers (user answers override inference) ---
  const finalHoursRemaining = answers.hoursRemaining ? parseFloat(answers.hoursRemaining) : hoursRemaining;
  return {
    title,
    organizer,
    projectName: answers.projectName || title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
    deadline,
    hoursRemaining: isNaN(finalHoursRemaining) ? 5 : finalHoursRemaining,
    hoursRemainingKnown: !!answers.hoursRemaining || hoursRemainingKnown,
    teamSize: answers.teamSize ? parseInt(answers.teamSize, 10) || 1 : teamSize,
    teamSizeFixed,
    preferredStack: answers.preferredStack ? [answers.preferredStack] : detectedStack,
    stackDetected: detectedStack.length > 0,
    sponsorPrizes,
    judgingCriteria,
    requiredAPIs,
    restrictions,
    primaryGoal: (answers.primaryGoal as HackathonContext['primaryGoal']) || 'win',
    hasExistingRepo: answers.hasExistingRepo === 'yes',
    source: answers.url,
  };
}

/** Parse various date formats into a Date object */
function parseDate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Try "Month Day, Year" format
  const m = dateStr.match(/([A-Za-z]+)\s+(\d+),?\s*(\d{4})/);
  if (m) {
    const parsed = new Date(`${m[1]} ${m[2]}, ${m[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Infer tech stack from text content (local copy, mirrors devpost-ingestion-layer) */
function inferTechStack(text: string): string[] {
  const known: Record<string, RegExp> = {
    React: /react/i,
    'Node.js': /node/i,
    Python: /python/i,
    TypeScript: /typescript/i,
    'Next.js': /next\.?js/i,
    Vercel: /vercel/i,
    Docker: /docker/i,
    PostgreSQL: /postgres/i,
    MongoDB: /mongo/i,
    GraphQL: /graphql/i,
    'Tailwind CSS': /tailwind/i,
    Vue: /vue/i,
    Firebase: /firebase/i,
    AWS: /aws/i,
    Supabase: /supabase/i,
    TensorFlow: /tensorflow/i,
    PyTorch: /pytorch/i,
    Flutter: /flutter/i,
    Swift: /swift/i,
    Kotlin: /kotlin/i,
    'OpenAI API': /openai/i,
    'Gemini API': /gemini/i,
    Twilio: /twilio/i,
    Stripe: /stripe/i,
  };
  return Object.entries(known)
    .filter(([, p]) => p.test(text))
    .map(([name]) => name);
}

/** Determine what questions to ask based on what's already known */
export function determineMissingInfo(ctx: HackathonContext): Array<{ key: string; question: string; defaultAnswer?: string }> {
  const questions: Array<{ key: string; question: string; defaultAnswer?: string }> = [];

  // Solo or team? (only if team size wasn't fixed by competition)
  if (!ctx.teamSizeFixed) {
    questions.push({ key: 'teamSize', question: 'Solo or team? (optional, default 1): ', defaultAnswer: '1' });
  }

  // Preferred stack? (only if no stack detected)
  if (!ctx.stackDetected) {
    questions.push({ key: 'preferredStack', question: 'Preferred stack (optional): ' });
  }

  // Hours remaining? (only if no deadline found)
  if (!ctx.hoursRemainingKnown) {
    questions.push({ key: 'hoursRemaining', question: 'Hours remaining (optional, default 5): ', defaultAnswer: '5' });
  }

  // Primary goal? (always useful to know intent)
  questions.push({
    key: 'primaryGoal',
    question: 'Primary goal? (win / sponsor prize / complete / learn, optional): ',
    defaultAnswer: 'win',
  });

  // Existing repository?
  if (!ctx.hasExistingRepo) {
    questions.push({ key: 'hasExistingRepo', question: 'Existing repository URL? (optional, press Enter to skip): ' });
  }

  return questions;
}


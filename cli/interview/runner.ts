import { ask } from '../output.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';
import { runProductIntelligence } from '../product-intelligence/orchestrator.js';

import type { InterviewQuestion, InterviewResult, InterviewState, OptimizationBudget } from './types.js';

export type AskFunction = (question: string) => Promise<string | null>;

export async function runInterview(
  questions: InterviewQuestion[],
  askFn: AskFunction = ask,
  analysis?: CompetitionAnalysis,
): Promise<InterviewResult> {
  if (questions.length === 0) {
    return emptyResult(analysis);
  }

  const state: InterviewState = {
    currentQuestionIndex: 0,
    answers: {},
    skipped: [],
    completed: false,
  };

  for (const question of questions) {
    const answer = await askQuestion(question, askFn);

    if (answer === null) {
      state.skipped.push(question.id);
      state.answers[question.id] = null;
    } else {
      state.answers[question.id] = answer;
    }

    state.currentQuestionIndex++;
  }

  state.completed = true;
  return buildResult(questions, state, analysis);
}

async function askQuestion(
  question: InterviewQuestion,
  askFn: AskFunction,
): Promise<string | null> {
  if (!question) return null;
  if (question.category === 'project_idea') {
    const prompt = formatQuestion(question);
    const raw = await askFn(prompt);
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === 's') return null;
    return trimmed;
  }

  if (question.category === 'team_size' || question.category === 'hours_remaining') {
    return askNumericQuestion(question, askFn);
  }

  if (!question.options || question.options.length === 0) {
    return null;
  }

  const prompt = formatQuestion(question);
  const raw = await askFn(prompt);

  if (raw === null) return null;

  const trimmed = raw.trim();

  if (trimmed.toLowerCase() === 's') return null;

  if (question.category === 'sponsor_selection') {
    const indices = trimmed.split(/[, ]+/).map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n >= 1 && n <= question.options.length);
    if (indices.length === 0) return null;
    const values = [...new Set(indices.map((i) => question.options[i - 1]!.value))];
    return values.join(',');
  }

  const optionIndex = parseInt(trimmed, 10);
  if (!isNaN(optionIndex) && optionIndex >= 1 && optionIndex <= question.options.length) {
    return question.options[optionIndex - 1]!.value;
  }

  return null;
}

async function askNumericQuestion(
  question: InterviewQuestion,
  askFn: AskFunction,
): Promise<string | null> {
  const min = question.minValue ?? 1;
  const max = question.maxValue ?? 168;
  const defaultAnswer = question.defaultAnswer ?? String(min);

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const prompt = formatNumericQuestion(question, defaultAnswer, attempts > 0);
    const raw = await askFn(prompt);

    if (raw === null) return null;

    const trimmed = raw.trim();
    if (trimmed.toLowerCase() === 's') return null;

    if (trimmed === '') {
      return defaultAnswer;
    }

    const num = parseFloat(trimmed);
    if (isNaN(num)) {
      attempts++;
      if (attempts >= maxAttempts) return null;
      continue;
    }

    if (num < min || num > max) {
      attempts++;
      if (attempts >= maxAttempts) return null;
      continue;
    }

    return String(Math.round(num));
  }

  return null;
}

function formatNumericQuestion(
  question: InterviewQuestion,
  defaultAnswer: string,
  showError: boolean,
): string {
  let buf = `\n  ${question.text}\n`;

  if (showError) {
    const min = question.minValue ?? 1;
    const max = question.maxValue ?? 168;
    buf += `  ${min}-${max} range required. Try again or press Enter for default (${defaultAnswer}).\n`;
  }

  buf += `  ${defaultAnswer} (default)\n`;
  buf += `  S. ${question.skipLabel ?? 'Skip'}\n`;
  buf += '  Your choice: ';

  return buf;
}

function formatQuestion(question: InterviewQuestion): string {
  let buf = `\n  ${question.text}\n`;

  for (let i = 0; i < question.options.length; i++) {
    const opt = question.options[i]!;
    buf += `  ${i + 1}. ${opt.label} — ${opt.description}\n`;
  }

  if (question.category === 'sponsor_selection') {
    buf += '  (comma-separated numbers for multiple selections)\n';
  }

  buf += `  S. ${question.skipLabel ?? 'Skip'}\n`;
  buf += '  Your choice: ';

  return buf;
}

function buildResult(questions: InterviewQuestion[], state: InterviewState, analysis?: CompetitionAnalysis): InterviewResult {
  let selectedPrize: string | null = null;
  const selectedSponsorApis: string[] = [];
  let optimizationBudget: OptimizationBudget = 'balanced';
  let userProjectIdea: string | null = null;
  let teamSize: number | null = null;
  let hoursRemaining: number | null = null;
  const techPrefs = new Set<string>();

  for (const q of questions) {
    const answeredValue = state.answers[q.id];

    if (answeredValue == null) continue;

    if (q.category === 'prize_selection') {
      selectedPrize = answeredValue;
    }

    if (q.category === 'sponsor_selection') {
      const apiNames = answeredValue.split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of apiNames) {
        selectedSponsorApis.push(name);
      }
    }

    if (q.category === 'optimization') {
      optimizationBudget = answeredValue as OptimizationBudget;
    }

    if (q.category === 'project_idea') {
      userProjectIdea = answeredValue;
    }

    if (q.category === 'team_size') {
      teamSize = parseInt(answeredValue, 10);
    }

    if (q.category === 'hours_remaining') {
      hoursRemaining = parseInt(answeredValue, 10);
    }

    if (q.category === 'sponsor_selection') {
      const apiNames = answeredValue.split(',').map((s) => s.trim()).filter(Boolean);
      for (const name of apiNames) {
        const selected = q.options.find((o) => o.value === name);
        if (selected?.influences?.technologyPreference) {
          for (const pref of selected.influences.technologyPreference) {
            techPrefs.add(pref);
          }
        }
      }
    } else {
      const selected = q.options.find((o) => o.value === answeredValue);
      if (selected?.influences?.technologyPreference) {
        for (const pref of selected.influences.technologyPreference) {
          techPrefs.add(pref);
        }
      }
    }
  }

  const hasIdeaQuestion = questions.some((q) => q.category === 'project_idea');
  const needsAuto = !userProjectIdea && analysis && hasIdeaQuestion;
  const productIntelligence = needsAuto
    ? runProductIntelligence(analysis, {
        selectedPrize,
        selectedSponsorApis,
        optimizationBudget,
        userProjectIdea,
        autoGeneratedIdea: null,
        technologyPreferences: [...techPrefs],
        allAnswers: { ...state.answers },
      })
    : null;

  return {
    selectedPrize,
    selectedSponsorApis,
    optimizationBudget,
    userProjectIdea,
    autoGeneratedIdea: productIntelligence?.winner.oneLiner ?? null,
    ideation: productIntelligence?.brainstorm ?? null,
    productIntelligence,
    technologyPreferences: [...techPrefs],
    allAnswers: { ...state.answers },
    teamSize,
    hoursRemaining,
  };
}

function emptyResult(analysis?: CompetitionAnalysis): InterviewResult {
  const base = {
    selectedPrize: null,
    selectedSponsorApis: [] as string[],
    optimizationBudget: 'balanced' as OptimizationBudget,
    userProjectIdea: null,
    autoGeneratedIdea: null as string | null,
    technologyPreferences: [] as string[],
    allAnswers: {} as Record<string, string | null>,
    teamSize: null,
    hoursRemaining: null,
  };

  if (analysis) {
    const productIntelligence = runProductIntelligence(analysis, base);
    base.autoGeneratedIdea = productIntelligence.winner.oneLiner;
    (base as InterviewResult).ideation = productIntelligence.brainstorm;
    (base as InterviewResult).productIntelligence = productIntelligence;
  }

  return base as InterviewResult;
}

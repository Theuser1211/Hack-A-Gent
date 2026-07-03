import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, getSeededRandom } from './determinism-kernel.js';
import { type TaskGraph } from './task-graph.js';

export type QuestionPriority = 'blocking' | 'optimization' | 'preference';
export type AmbiguityLevel = 'high' | 'medium' | 'low';

export interface StrategistQuestion {
  id: string;
  question: string;
  priority: QuestionPriority;
  ambiguity: AmbiguityLevel;
  expectedGain: number;
  category: 'tech_stack' | 'feature' | 'deployment' | 'scope' | 'judging' | 'constraint';
  context: string;
}

export interface AmbiguityGap {
  field: string;
  level: AmbiguityLevel;
  impactIfWrong: string;
  canContinue: boolean;
}

export class HumanInteractionStrategist {
  private readonly seed: number;
  private readonly strategistId: string;
  private readonly decisionLogger: DecisionLogger;
  private askedQuestions: StrategistQuestion[] = [];
  private executionGainThreshold = 0.3;
  private ambiguityCache = new Map<string, AmbiguityGap[]>();

  constructor(seed = 42) {
    this.seed = seed;
    this.strategistId = 'hq-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 4000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getAskedQuestions(): StrategistQuestion[] {
    return [...this.askedQuestions];
  }

  setGainThreshold(threshold: number): void {
    this.executionGainThreshold = Math.max(0, Math.min(1, threshold));
  }

  detectAmbiguityGaps(devpostData: {
    title: string;
    problemStatement: string;
    judgingCriteria: string[];
    constraints: string[];
    recommendedStack: string[];
    submissionRequirements: string[];
  }): AmbiguityGap[] {
    const gaps: AmbiguityGap[] = [];
    const text = devpostData.problemStatement + ' ' + devpostData.title;

    if (devpostData.recommendedStack.length === 0) {
      gaps.push({
        field: 'tech_stack',
        level: 'high',
        impactIfWrong: 'Wrong framework choice wastes hours',
        canContinue: false,
      });
    } else if (devpostData.recommendedStack.length < 2) {
      gaps.push({
        field: 'tech_stack',
        level: 'medium',
        impactIfWrong: 'Suboptimal framework may limit features',
        canContinue: true,
      });
    }

    if (devpostData.judgingCriteria.length === 0) {
      gaps.push({
        field: 'judging',
        level: 'high',
        impactIfWrong: 'Cannot optimize for winning criteria',
        canContinue: true,
      });
    }

    if (devpostData.submissionRequirements.length === 0) {
      gaps.push({
        field: 'scope',
        level: 'medium',
        impactIfWrong: 'May miss submission requirements',
        canContinue: true,
      });
    }

    const vagueWords = ['something', 'app', 'website', 'platform', 'tool', 'system', 'solution'];
    const vagueCount = vagueWords.filter((w) => text.toLowerCase().includes(w)).length;
    if (vagueCount >= 3) {
      gaps.push({
        field: 'feature',
        level: 'high',
        impactIfWrong: 'Vague problem statement leads to wrong features',
        canContinue: true,
      });
    }

    if (text.length < 100) {
      gaps.push({
        field: 'scope',
        level: 'high',
        impactIfWrong: 'Insufficient context to build correctly',
        canContinue: false,
      });
    }

    this.ambiguityCache.set(devpostData.title, gaps);
    return gaps;
  }

  generateQuestions(gaps: AmbiguityGap[], taskGraph?: TaskGraph): StrategistQuestion[] {
    const questions: StrategistQuestion[] = [];
    const rng = getSeededRandom(this.seed + this.askedQuestions.length);

    for (const gap of gaps) {
      if (gap.level === 'low') continue;

      const gain = gap.level === 'high' ? 0.6 + rng.next() * 0.3 : 0.2 + rng.next() * 0.3;
      if (gain < this.executionGainThreshold) continue;

      const question = this.buildQuestion(gap);
      if (question) questions.push(question);
    }

    if (taskGraph) {
      const blockedTasks = taskGraph.findBlockersForUserDecision();
      if (blockedTasks.length > 0) {
        questions.push({
          id: 'q-' + createDeterministicUuid(this.seed, this.askedQuestions.length + questions.length).slice(0, 8),
          question: `Task "${blockedTasks[0]!.description}" is blocked. How should we proceed?`,
          priority: 'blocking',
          ambiguity: 'high',
          expectedGain: 0.9,
          category: 'scope',
          context: `Blocked task: ${blockedTasks[0]!.description}. Error: ${blockedTasks[0]!.error}`,
        });
      }
    }

    this.decisionLogger.log(
      'strategy',
      'generate_questions',
      `Generated ${questions.length} questions from ${gaps.length} gaps (threshold: ${this.executionGainThreshold})`,
      questions.length > 0 ? 0.8 : 0.5,
      [],
      { gapCount: gaps.length, blockingCount: questions.filter((q) => q.priority === 'blocking').length },
    );

    this.askedQuestions.push(...questions);
    return questions;
  }

  private buildQuestion(gap: AmbiguityGap): StrategistQuestion | null {
    const base: Omit<StrategistQuestion, 'id' | 'question' | 'expectedGain'> = {
      priority: gap.canContinue ? (gap.level === 'high' ? 'optimization' : 'preference') : 'blocking',
      ambiguity: gap.level,
      category: gap.field as StrategistQuestion['category'],
      context: gap.impactIfWrong,
    };

    switch (gap.field) {
      case 'tech_stack':
        return {
          ...base,
          id: 'q-stack-' + createDeterministicUuid(this.seed, this.askedQuestions.length).slice(0, 6),
          question: 'Which framework should we use? (Next.js, Vite+React, Svelte, or Vue)',
          expectedGain: 0.8,
        };
      case 'judging':
        return {
          ...base,
          id: 'q-judge-' + createDeterministicUuid(this.seed, this.askedQuestions.length).slice(0, 6),
          question: 'What are the key judging criteria we should prioritize?',
          expectedGain: 0.7,
        };
      case 'feature':
        return {
          ...base,
          id: 'q-feat-' + createDeterministicUuid(this.seed, this.askedQuestions.length).slice(0, 6),
          question: 'Can you describe the core feature in more detail?',
          expectedGain: 0.6,
        };
      case 'scope':
        return {
          ...base,
          id: 'q-scope-' + createDeterministicUuid(this.seed, this.askedQuestions.length).slice(0, 6),
          question: 'What is the minimum viable product scope?',
          expectedGain: 0.85,
        };
      case 'deployment':
        return {
          ...base,
          id: 'q-deploy-' + createDeterministicUuid(this.seed, this.askedQuestions.length).slice(0, 6),
          question: 'Where should we deploy? (Vercel, Netlify, or GitHub Pages)',
          expectedGain: 0.5,
        };
      default:
        return null;
    }
  }

  prioritizeQuestions(questions: StrategistQuestion[]): StrategistQuestion[] {
    const priorityOrder: Record<QuestionPriority, number> = { blocking: 0, optimization: 1, preference: 2 };
    return [...questions].sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.expectedGain - a.expectedGain;
    });
  }

  shouldAskQuestion(question: StrategistQuestion): boolean {
    if (question.priority === 'blocking') return true;
    if (question.expectedGain < this.executionGainThreshold) return false;
    return this.askedQuestions.filter((q) => q.category === question.category).length < 2;
  }
}

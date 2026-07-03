import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { RuntimeSnapshot } from './unified-types.js';

export type InterruptReason =
  | 'missing_requirement'
  | 'ambiguity'
  | 'deployment_approval'
  | 'risk_threshold_exceeded'
  | 'tool_permission_required'
  | 'user_confirmation'
  | 'error_recovery'
  | 'strategy_review';

export type QuestionType = 'yes_no' | 'choice' | 'text' | 'multi_choice';

export interface InterruptQuestion {
  questionId: string;
  type: QuestionType;
  title: string;
  description: string;
  options?: string[];
  required: boolean;
  context: Record<string, unknown>;
}

export interface InterruptState {
  interruptId: string;
  reason: InterruptReason;
  questions: InterruptQuestion[];
  snapshot: RuntimeSnapshot | null;
  createdAt: string;
  resolved: boolean;
  responses: Array<{ questionId: string; answer: string | string[] }>;
  resumedAt: string | null;
}

export class InterruptProtocol {
  private readonly seed: number;
  private readonly decisionLogger: DecisionLogger;
  private currentInterrupt: InterruptState | null = null;

  constructor(seed = 42) {
    this.seed = seed;
    this.decisionLogger = new DecisionLogger(seed + 3000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  hasActiveInterrupt(): boolean {
    return this.currentInterrupt !== null && !this.currentInterrupt.resolved;
  }
  getActiveInterrupt(): InterruptState | null {
    return this.currentInterrupt?.resolved ? null : this.currentInterrupt;
  }

  raiseInterrupt(reason: InterruptReason, questions: InterruptQuestion[], snapshot?: RuntimeSnapshot): InterruptState {
    this.currentInterrupt = {
      interruptId: 'int-' + createDeterministicUuid(this.seed, Date.now()).slice(0, 8),
      reason,
      questions,
      snapshot: snapshot ?? null,
      createdAt: deterministicNow(this.seed),
      resolved: false,
      responses: [],
      resumedAt: null,
    };

    this.decisionLogger.log('planner', 'interrupt', `Interrupt: ${reason}`, 0.6, [], {
      interruptId: this.currentInterrupt.interruptId,
      questionCount: questions.length,
      reason,
    });

    return this.currentInterrupt;
  }

  resolveInterrupt(responses: Array<{ questionId: string; answer: string | string[] }>): boolean {
    if (!this.currentInterrupt || this.currentInterrupt.resolved) return false;

    for (const r of responses) {
      const question = this.currentInterrupt.questions.find((q) => q.questionId === r.questionId);
      if (!question) continue;
      this.currentInterrupt.responses.push(r);
    }

    const allRequiredAnswered = this.currentInterrupt.questions
      .filter((q) => q.required)
      .every((q) => this.currentInterrupt!.responses.some((r) => r.questionId === q.questionId));

    if (allRequiredAnswered) {
      this.currentInterrupt.resolved = true;
      this.currentInterrupt.resumedAt = deterministicNow(this.seed);
      this.decisionLogger.log('planner', 'interrupt_resolved', 'Interrupt resolved', 0.9, [], {
        interruptId: this.currentInterrupt.interruptId,
        responseCount: responses.length,
      });
    }

    return this.currentInterrupt.resolved;
  }

  detectAmbiguity(input: string, existingData: Record<string, unknown>): InterruptQuestion[] {
    const questions: InterruptQuestion[] = [];

    if (!input || input.length < 10) {
      questions.push({
        questionId: 'q-' + createDeterministicUuid(this.seed, 1).slice(0, 8),
        type: 'text',
        title: 'Project Description',
        description: 'Please provide a detailed description of the project you want to build.',
        required: true,
        context: {},
      });
    }

    if (!existingData.judgingCriteria || (existingData.judgingCriteria as string[])?.length === 0) {
      questions.push({
        questionId: 'q-' + createDeterministicUuid(this.seed, 2).slice(0, 8),
        type: 'multi_choice',
        title: 'Judging Criteria',
        description: 'Select the judging criteria that apply:',
        options: ['Innovation', 'Technical Complexity', 'Impact', 'UX/Design', 'Feasibility', 'Completeness'],
        required: true,
        context: {},
      });
    }

    if (!existingData.constraints || (existingData.constraints as string[])?.length === 0) {
      questions.push({
        questionId: 'q-' + createDeterministicUuid(this.seed, 3).slice(0, 8),
        type: 'text',
        title: 'Constraints',
        description: 'Are there any constraints or limitations? (time, tech, team size, etc.)',
        required: false,
        context: {},
      });
    }

    return questions;
  }

  requestDeploymentApproval(deployTarget: string, repoName: string): InterruptState {
    return this.raiseInterrupt('deployment_approval', [
      {
        questionId: 'q-' + createDeterministicUuid(this.seed, 4).slice(0, 8),
        type: 'yes_no',
        title: 'Approve Deployment',
        description: `Deploy project to ${deployTarget}${repoName ? ` from repo ${repoName}` : ''}?`,
        required: true,
        context: { deployTarget, repoName },
      },
    ]);
  }

  requestRiskReview(risks: Array<{ category: string; description: string; probability: number }>): InterruptState {
    return this.raiseInterrupt('risk_threshold_exceeded', [
      {
        questionId: 'q-' + createDeterministicUuid(this.seed, 5).slice(0, 8),
        type: 'choice',
        title: 'Risk Review',
        description: `The following risks exceed threshold:\n${risks.map((r) => `  - [${r.category}] ${r.description} (${(r.probability * 100).toFixed(0)}%)`).join('\n')}\n\nProceed?`,
        options: ['Proceed with all risks', 'Proceed with mitigation', 'Pause and revise plan', 'Abort'],
        required: true,
        context: { risks },
      },
    ]);
  }
}

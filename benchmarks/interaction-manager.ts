import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { TaskGraph, TaskGraphSnapshot } from './task-graph.js';

export type QuestionType = 'choice' | 'text' | 'confirm' | 'multi-select';

export interface ClarificationQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[] | null;
  context: string;
  required: boolean;
  defaultValue: string | null;
  relatedTaskIds: string[];
  relatedCapability: string | null;
}

export interface UserResponse {
  id: string;
  questionId: string;
  answer: string | string[];
  timestamp: string;
}

export interface ExecutionCheckpoint {
  checkpointId: string;
  taskGraphSnapshot: TaskGraphSnapshot;
  pendingQuestions: ClarificationQuestion[];
  answeredQuestions: UserResponse[];
  executionPointer: { currentTaskId: string | null; phase: string; agentStates: Record<string, string> };
  createdAt: string;
  seed: number;
}

export class InteractionManager {
  private pendingQuestions: ClarificationQuestion[] = [];
  private answeredQuestions: UserResponse[] = [];
  private readonly seed: number;
  private readonly managerId: string;

  constructor(seed = 42) {
    this.seed = seed;
    this.managerId = `interact-${createDeterministicUuid(seed, 0).slice(0, 8)}`;
  }

  askQuestion(
    type: QuestionType,
    prompt: string,
    context: string,
    options: string[] | null = null,
    required = true,
    defaultValue: string | null = null,
    relatedTaskIds: string[] = [],
    relatedCapability: string | null = null,
  ): ClarificationQuestion {
    const question: ClarificationQuestion = {
      id: `q-${createDeterministicUuid(this.seed, this.pendingQuestions.length + 1).slice(0, 8)}`,
      prompt,
      options,
      context,
      required,
      defaultValue,
      relatedTaskIds,
      relatedCapability,
    };
    this.pendingQuestions.push(question);
    return question;
  }

  getPendingQuestions(): ClarificationQuestion[] {
    return [...this.pendingQuestions];
  }

  hasPendingQuestions(): boolean {
    return this.pendingQuestions.length > 0;
  }

  answerQuestion(questionId: string, answer: string | string[]): boolean {
    const idx = this.pendingQuestions.findIndex((q) => q.id === questionId);
    if (idx === -1) return false;
    const question = this.pendingQuestions[idx]!;
    this.answeredQuestions.push({
      id: question.id,
      questionId,
      answer,
      timestamp: deterministicNow(this.seed + this.answeredQuestions.length),
    });
    this.pendingQuestions.splice(idx, 1);
    return true;
  }

  answerFirstPending(answer: string | string[]): boolean {
    if (this.pendingQuestions.length === 0) return false;
    return this.answerQuestion(this.pendingQuestions[0]!.id, answer);
  }

  getAllAnsweredQuestions(): UserResponse[] {
    return [...this.answeredQuestions];
  }

  getAnswerForQuestion(questionId: string): UserResponse | undefined {
    return this.answeredQuestions.find((r) => r.questionId === questionId);
  }

  getAnswerByPrompt(promptSubstring: string): UserResponse | undefined {
    const question =
      this.pendingQuestions.find((q) => q.prompt.toLowerCase().includes(promptSubstring.toLowerCase())) ??
      this.answeredQuestions.find((r) => {
        const found = this.pendingQuestions.find((q) => q.id === r.questionId);
        return found && found.prompt.toLowerCase().includes(promptSubstring.toLowerCase());
      });
    if (!question) return undefined;
    const q = this.pendingQuestions.find((q) => q.id === question.id);
    if (q) return undefined;
    return this.getAnswerForQuestion(question.id);
  }

  createCheckpoint(
    taskGraph: TaskGraph,
    currentTaskId: string | null,
    phase: string,
    agentStates: Record<string, string>,
  ): ExecutionCheckpoint {
    return {
      checkpointId: `ckpt-${createDeterministicUuid(this.seed, Date.now()).slice(0, 8)}`,
      taskGraphSnapshot: taskGraph.saveCheckpoint(),
      pendingQuestions: [...this.pendingQuestions],
      answeredQuestions: [...this.answeredQuestions],
      executionPointer: { currentTaskId, phase, agentStates },
      createdAt: deterministicNow(this.seed),
      seed: this.seed,
    };
  }

  restoreFromCheckpoint(checkpoint: ExecutionCheckpoint): {
    taskGraph: TaskGraphSnapshot;
    pendingQuestions: ClarificationQuestion[];
    answeredQuestions: UserResponse[];
    executionPointer: ExecutionCheckpoint['executionPointer'];
  } {
    this.pendingQuestions = [...checkpoint.pendingQuestions];
    this.answeredQuestions = [...checkpoint.answeredQuestions];
    return {
      taskGraph: checkpoint.taskGraphSnapshot,
      pendingQuestions: checkpoint.pendingQuestions,
      answeredQuestions: checkpoint.answeredQuestions,
      executionPointer: checkpoint.executionPointer,
    };
  }

  getFrameworkChoiceQuestion(taskIds: string[]): ClarificationQuestion {
    return this.askQuestion(
      'choice',
      'Which frontend framework would you like to use?',
      'Framework selection affects project scaffolding, component structure, and build configuration.',
      ['Next.js (React)', 'Vite + React', 'Vue 3', 'SvelteKit', 'Angular', 'Plain HTML/CSS/JS'],
      true,
      'Next.js (React)',
      taskIds,
      'frontend_scaffolding',
    );
  }

  getDeploymentTargetQuestion(taskIds: string[]): ClarificationQuestion {
    return this.askQuestion(
      'choice',
      'Where should we deploy the project?',
      'Deployment target affects build configuration, environment variables, and CI/CD setup.',
      ['Vercel', 'Netlify', 'GitHub Pages', 'Docker (self-hosted)', 'Local only (no deployment)'],
      true,
      'Vercel',
      taskIds,
      'deployment',
    );
  }

  getDatabaseChoiceQuestion(taskIds: string[]): ClarificationQuestion {
    return this.askQuestion(
      'choice',
      'Which database would you like to use?',
      'Database selection affects schema generation, API design, and connection configuration.',
      ['PostgreSQL', 'SQLite', 'MongoDB', 'Firebase/Firestore', 'None (local storage)'],
      true,
      'PostgreSQL',
      taskIds,
      'database_setup',
    );
  }

  getAuthStrategyQuestion(taskIds: string[]): ClarificationQuestion {
    return this.askQuestion(
      'choice',
      'What authentication strategy should we use?',
      'Authentication affects API middleware, frontend routing, and user model design.',
      ['JWT (session-based)', 'NextAuth.js', 'Clerk', 'Supabase Auth', 'None (public app)'],
      true,
      'JWT (session-based)',
      taskIds,
      'authentication',
    );
  }

  getCustomQuestion(
    prompt: string,
    context: string,
    options: string[] | null = null,
    taskIds: string[] = [],
  ): ClarificationQuestion {
    return this.askQuestion('text', prompt, context, options, true, null, taskIds);
  }
}

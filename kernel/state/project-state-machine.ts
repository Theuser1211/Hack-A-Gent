import { setup, type MachineSnapshot } from 'xstate';

import type { Phase } from '../types/index.js';

// ── Context ───────────────────────────────────────────────────────────────

export interface ProjectContext {
  projectId: string;
  currentPhase: Phase;
  errorCount: number;
  fixLoopIterations: number;
  maxFixIterations: number;
}

export interface ProjectInput {
  projectId: string;
}

// ── Events ────────────────────────────────────────────────────────────────

export type ProjectEvent =
  | { type: 'ANALYZE_COMPLETE' }
  | { type: 'QUESTIONS_GENERATED' }
  | { type: 'ANSWERS_RECEIVED' }
  | { type: 'PLAN_CREATED' }
  | { type: 'ARCHITECTURE_CREATED' }
  | { type: 'BUILD_COMPLETE' }
  | { type: 'TEST_COMPLETE' }
  | { type: 'JUDGE_COMPLETE' }
  | { type: 'ALL_JUDGES_PASS' }
  | { type: 'ANY_JUDGE_FAIL' }
  | { type: 'FIXES_APPLIED' }
  | { type: 'SUBMISSION_READY' }
  | { type: 'PHASE_FAIL' }
  | { type: 'ABORT' };

// ── Machine ───────────────────────────────────────────────────────────────

export const projectMachine = setup({
  types: {
    context: {} as ProjectContext,
    events: {} as ProjectEvent,
    input: {} as ProjectInput,
  },
  guards: {
    maxFixesReached: ({ context }) => context.fixLoopIterations >= context.maxFixIterations,
  },
  actions: {
    incrementFixLoop: ({ context }) => {
      context.fixLoopIterations++;
    },
    resetFixLoop: ({ context }) => {
      context.fixLoopIterations = 0;
    },
    incrementError: ({ context }) => {
      context.errorCount++;
    },
    resetError: ({ context }) => {
      context.errorCount = 0;
    },
  },
}).createMachine({
  id: 'project',
  initial: 'INIT',
  context: ({ input }) => ({
    projectId: input.projectId,
    currentPhase: 'INIT' as Phase,
    errorCount: 0,
    fixLoopIterations: 0,
    maxFixIterations: 3,
  }),
  states: {
    INIT: {
      on: {
        ANALYZE_COMPLETE: 'ANALYZING',
        ABORT: 'FAILED',
      },
    },
    ANALYZING: {
      entry: ({ context }) => {
        context.currentPhase = 'ANALYZING';
      },
      on: {
        QUESTIONS_GENERATED: 'QUESTIONING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    QUESTIONING: {
      entry: ({ context }) => {
        context.currentPhase = 'QUESTIONING';
      },
      on: {
        ANSWERS_RECEIVED: 'PLANNING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    PLANNING: {
      entry: ({ context }) => {
        context.currentPhase = 'PLANNING';
      },
      on: {
        PLAN_CREATED: 'ARCHITECTING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    ARCHITECTING: {
      entry: ({ context }) => {
        context.currentPhase = 'ARCHITECTING';
      },
      on: {
        ARCHITECTURE_CREATED: 'BUILDING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    BUILDING: {
      entry: ({ context }) => {
        context.currentPhase = 'BUILDING';
      },
      on: {
        BUILD_COMPLETE: 'TESTING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    TESTING: {
      entry: ({ context }) => {
        context.currentPhase = 'TESTING';
      },
      on: {
        TEST_COMPLETE: 'JUDGING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    JUDGING: {
      entry: ({ context }) => {
        context.currentPhase = 'JUDGING';
      },
      on: {
        ALL_JUDGES_PASS: 'DECIDING',
        ANY_JUDGE_FAIL: 'DECIDING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    DECIDING: {
      entry: ({ context }) => {
        context.currentPhase = 'DECIDING';
      },
      on: {
        ALL_JUDGES_PASS: 'SUBMITTING',
        ANY_JUDGE_FAIL: [{ guard: 'maxFixesReached', target: 'FAILED' }, { target: 'FIX_AND_RETEST' }],
      },
    },
    FIX_AND_RETEST: {
      entry: [
        ({ context }) => {
          context.currentPhase = 'FIX_AND_RETEST';
        },
        'incrementFixLoop',
      ],
      on: {
        FIXES_APPLIED: 'TESTING',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    SUBMITTING: {
      entry: ({ context }) => {
        context.currentPhase = 'SUBMITTING';
      },
      on: {
        SUBMISSION_READY: 'COMPLETED',
        PHASE_FAIL: 'FAILED',
        ABORT: 'FAILED',
      },
    },
    COMPLETED: {
      entry: ({ context }) => {
        context.currentPhase = 'COMPLETED';
      },
      type: 'final',
    },
    FAILED: {
      entry: ({ context }) => {
        context.currentPhase = 'FAILED';
      },
      type: 'final',
    },
  },
});

export type ProjectMachine = typeof projectMachine;

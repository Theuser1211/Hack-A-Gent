import { setup, type MachineSnapshot } from 'xstate';

import type { TaskStatus } from '../types/index.js';

// ── Context ───────────────────────────────────────────────────────────────

export interface TaskContext {
  taskId: string;
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  checkpointId: string | null;
}

export interface TaskInput {
  taskId: string;
  maxRetries?: number;
}

// ── Events ────────────────────────────────────────────────────────────────

export type TaskEvent =
  | { type: 'DEPS_RESOLVED' }
  | { type: 'ASSIGN' }
  | { type: 'START' }
  | { type: 'COMPLETE' }
  | { type: 'FAIL'; error?: string }
  | { type: 'RETRY' }
  | { type: 'BLOCK'; reason?: string }
  | { type: 'UNBLOCK' }
  | { type: 'WAIT'; checkpointId: string }
  | { type: 'RESUME' }
  | { type: 'SKIP' };

// ── Machine ───────────────────────────────────────────────────────────────

export const taskMachine = setup({
  types: {
    context: {} as TaskContext,
    events: {} as TaskEvent,
    input: {} as TaskInput,
  },
  guards: {
    canRetry: ({ context }) => context.retryCount < context.maxRetries,
  },
  actions: {
    incrementRetry: ({ context }) => {
      context.retryCount++;
    },
    resetRetry: ({ context }) => {
      context.retryCount = 0;
    },
    setCheckpoint: ({ context, event }) => {
      if (event.type === 'WAIT') {
        context.checkpointId = event.checkpointId;
      }
    },
    clearCheckpoint: ({ context }) => {
      context.checkpointId = null;
    },
  },
}).createMachine({
  id: 'task',
  initial: 'PENDING',
  context: ({ input }) => ({
    taskId: input.taskId,
    status: 'PENDING' as TaskStatus,
    retryCount: 0,
    maxRetries: input.maxRetries ?? 3,
    checkpointId: null,
  }),
  states: {
    PENDING: {
      on: {
        DEPS_RESOLVED: 'READY',
        FAIL: 'FAILED',
        SKIP: 'SKIPPED',
      },
    },
    READY: {
      entry: ({ context }) => {
        context.status = 'READY';
      },
      on: {
        ASSIGN: 'RUNNING',
        BLOCK: 'BLOCKED',
        SKIP: 'SKIPPED',
      },
    },
    RUNNING: {
      entry: ({ context }) => {
        context.status = 'RUNNING';
      },
      on: {
        COMPLETE: 'COMPLETED',
        FAIL: 'FAILED',
        WAIT: 'WAITING',
        BLOCK: 'BLOCKED',
      },
    },
    WAITING: {
      entry: [
        ({ context }) => {
          context.status = 'WAITING';
        },
        'setCheckpoint',
      ],
      on: {
        RESUME: 'READY',
        FAIL: 'FAILED',
        BLOCK: 'BLOCKED',
      },
      exit: 'clearCheckpoint',
    },
    BLOCKED: {
      entry: ({ context }) => {
        context.status = 'BLOCKED';
      },
      on: {
        UNBLOCK: 'PENDING',
        FAIL: 'FAILED',
      },
    },
    FAILED: {
      entry: ({ context }) => {
        context.status = 'FAILED';
      },
      on: {
        RETRY: [{ guard: 'canRetry', target: 'READY', actions: 'incrementRetry' }],
      },
    },
    COMPLETED: {
      entry: ({ context }) => {
        context.status = 'COMPLETED';
      },
      type: 'final',
    },
    SKIPPED: {
      entry: ({ context }) => {
        context.status = 'SKIPPED';
      },
      type: 'final',
    },
  },
});

export type TaskMachine = typeof taskMachine;

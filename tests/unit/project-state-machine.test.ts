import { describe, it, expect } from 'vitest';
import { interpret } from 'xstate';

import { projectMachine } from '../../kernel/state/project-state-machine.js';

describe('ProjectStateMachine', () => {
  it('starts in INIT state', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();
    expect(actor.getSnapshot().value).toBe('INIT');
  });

  it('transitions through happy path to COMPLETED', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();

    actor.send({ type: 'ANALYZE_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('ANALYZING');

    actor.send({ type: 'QUESTIONS_GENERATED' });
    expect(actor.getSnapshot().value).toBe('QUESTIONING');

    actor.send({ type: 'ANSWERS_RECEIVED' });
    expect(actor.getSnapshot().value).toBe('PLANNING');

    actor.send({ type: 'PLAN_CREATED' });
    expect(actor.getSnapshot().value).toBe('ARCHITECTING');

    actor.send({ type: 'ARCHITECTURE_CREATED' });
    expect(actor.getSnapshot().value).toBe('BUILDING');

    actor.send({ type: 'BUILD_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('TESTING');

    actor.send({ type: 'TEST_COMPLETE' });
    expect(actor.getSnapshot().value).toBe('JUDGING');

    actor.send({ type: 'ALL_JUDGES_PASS' });
    expect(actor.getSnapshot().value).toBe('DECIDING');

    actor.send({ type: 'ALL_JUDGES_PASS' });
    expect(actor.getSnapshot().value).toBe('SUBMITTING');

    actor.send({ type: 'SUBMISSION_READY' });
    expect(actor.getSnapshot().value).toBe('COMPLETED');
  });

  it('transitions to FIX_AND_RETEST when judges fail', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();

    // Fast-forward to JUDGING
    actor.send({ type: 'ANALYZE_COMPLETE' });
    actor.send({ type: 'QUESTIONS_GENERATED' });
    actor.send({ type: 'ANSWERS_RECEIVED' });
    actor.send({ type: 'PLAN_CREATED' });
    actor.send({ type: 'ARCHITECTURE_CREATED' });
    actor.send({ type: 'BUILD_COMPLETE' });
    actor.send({ type: 'TEST_COMPLETE' });

    expect(actor.getSnapshot().value).toBe('JUDGING');

    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('DECIDING');

    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('FIX_AND_RETEST');
  });

  it('fails after max fix iterations', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();

    // Fast-forward to DECIDING then fail
    actor.send({ type: 'ANALYZE_COMPLETE' });
    actor.send({ type: 'QUESTIONS_GENERATED' });
    actor.send({ type: 'ANSWERS_RECEIVED' });
    actor.send({ type: 'PLAN_CREATED' });
    actor.send({ type: 'ARCHITECTURE_CREATED' });
    actor.send({ type: 'BUILD_COMPLETE' });
    actor.send({ type: 'TEST_COMPLETE' });
    actor.send({ type: 'ANY_JUDGE_FAIL' });

    // Fix loop iteration 1
    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('FIX_AND_RETEST');

    actor.send({ type: 'FIXES_APPLIED' });
    actor.send({ type: 'TEST_COMPLETE' });
    actor.send({ type: 'ANY_JUDGE_FAIL' });

    // Fix loop iteration 2
    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('FIX_AND_RETEST');

    actor.send({ type: 'FIXES_APPLIED' });
    actor.send({ type: 'TEST_COMPLETE' });
    actor.send({ type: 'ANY_JUDGE_FAIL' });

    // Fix loop iteration 3 - max reached
    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('FIX_AND_RETEST');

    actor.send({ type: 'FIXES_APPLIED' });
    actor.send({ type: 'TEST_COMPLETE' });
    actor.send({ type: 'ANY_JUDGE_FAIL' });

    // Should now fail
    actor.send({ type: 'ANY_JUDGE_FAIL' });
    expect(actor.getSnapshot().value).toBe('FAILED');
  });

  it('transitions to FAILED on any ABORT event', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();

    actor.send({ type: 'ABORT' });
    expect(actor.getSnapshot().value).toBe('FAILED');
  });

  it('tracks currentPhase in context', () => {
    const actor = interpret(projectMachine, { input: { projectId: 'proj-1' } }).start();

    expect(actor.getSnapshot().context.currentPhase).toBe('INIT');

    actor.send({ type: 'ANALYZE_COMPLETE' });
    expect(actor.getSnapshot().context.currentPhase).toBe('ANALYZING');
  });
});

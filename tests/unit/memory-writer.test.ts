import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemoryWriter } from '../../kernel/memory/memory-writer.js';

describe('MemoryWriter', () => {
  let writer: MemoryWriter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    writer = new MemoryWriter(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates project directory when it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'new', 'nested', 'project');
    const nestedWriter = new MemoryWriter(nestedDir);
    await nestedWriter.appendLog({
      timestamp: '2026-06-25T10:00:00Z',
      phase: 'INIT',
      agent_id: 'test',
      action: 'Create dir test',
      task_id: null,
      correlation_id: 'corr',
      body: 'Testing directory creation',
      result: 'success',
      artifacts: [],
    });

    const content = await nestedWriter.readFile('AGENT_LOG.md');
    expect(content).toContain('Testing directory creation');
  });

  it('appends log entries to AGENT_LOG.md', async () => {
    await writer.appendLog({
      timestamp: '2026-06-25T10:00:00Z',
      phase: 'ANALYZING',
      agent_id: 'planner.v1',
      action: 'Parsed Devpost page',
      task_id: 'task-001',
      correlation_id: 'corr-001',
      body: 'Found 4 tracks and 12 prizes',
      result: 'success',
      artifacts: ['plan/v1-analysis.json'],
    });

    const content = readFileSync(path.join(tmpDir, 'AGENT_LOG.md'), 'utf-8');
    expect(content).toContain('[2026-06-25T10:00:00Z]');
    expect(content).toContain('planner.v1');
    expect(content).toContain('Parsed Devpost page');
    expect(content).toContain('task-001');
  });

  it('appends bug entries to BUGS.md', async () => {
    await writer.appendBug({
      id: 'Bug-001',
      timestamp: '2026-06-25T14:00:00Z',
      severity: 'high',
      found_by: 'testing.agent',
      phase: 'TESTING',
      task_id: 'task-002',
      type: 'functional',
      description: 'Auth callback fails on missing state parameter',
      files: ['src/app/auth/callback/route.ts:45'],
      steps_to_reproduce: '1. Click login\n2. Callback invoked without state\n3. Error thrown',
      status: 'open',
      assigned_to: 'agent.frontend',
      fix_commit: null,
      retest_status: 'pending',
    });

    const content = readFileSync(path.join(tmpDir, 'BUGS.md'), 'utf-8');
    expect(content).toContain('Bug-001');
    expect(content).toContain('**Severity:** high');
    expect(content).toContain('functional');
  });

  it('appends decision entries to DECISIONS.md', async () => {
    await writer.appendDecision({
      id: 'DEC-001',
      timestamp: '2026-06-25T11:00:00Z',
      decision: 'Use Next.js App Router',
      agent_id: 'architect.agent',
      task_id: 'task-003',
      phase: 'ARCHITECTING',
      context: 'Project requires nested layouts',
      alternatives: [{ name: 'Pages Router', analysis: 'Simpler but less flexible' }],
      rationale: 'App Router provides superior layout composition',
      consequences: 'Team needs to learn App Router patterns',
      status: 'active',
      superseded_by: null,
    });

    const content = readFileSync(path.join(tmpDir, 'DECISIONS.md'), 'utf-8');
    expect(content).toContain('DEC-001');
    expect(content).toContain('Use Next.js App Router');
    expect(content).toContain('architect.agent');
  });

  it('updates TODO.md with sections', async () => {
    await writer.updateTodo([
      {
        phase: 'BUILDING',
        milestone: 'Authentication',
        items: [
          {
            task_id: 'task-auth-1',
            description: 'User schema',
            assigned_agent: 'db.agent',
            status_symbol: 'x',
            status: 'COMPLETED',
            dependencies: [],
          },
          {
            task_id: 'task-auth-2',
            description: 'Auth API',
            assigned_agent: 'backend.agent',
            status_symbol: ' ',
            status: 'RUNNING',
            dependencies: ['task-auth-1'],
          },
        ],
      },
    ]);

    const content = readFileSync(path.join(tmpDir, 'TODO.md'), 'utf-8');
    expect(content).toContain('BUILDING');
    expect(content).toContain('Authentication');
    expect(content).toContain('task-auth-1');
    expect(content).toContain('task-auth-2');
  });

  it('reads file content', async () => {
    await writer.appendLog({
      timestamp: '2026-06-25T10:00:00Z',
      phase: 'INIT',
      agent_id: 'test',
      action: 'Test',
      task_id: null,
      correlation_id: 'corr',
      body: 'Test entry',
      result: 'success',
      artifacts: [],
    });

    const content = await writer.readFile('AGENT_LOG.md');
    expect(content).toContain('Test entry');
  });

  it('returns empty string for non-existent file', async () => {
    const content = await writer.readFile('BUGS.md');
    expect(content).toBe('');
  });

  it('appends decision entry without task_id or superseded_by', async () => {
    await writer.appendDecision({
      id: 'DEC-002',
      timestamp: '2026-06-25T12:00:00Z',
      decision: 'Use SQLite',
      agent_id: 'architect.agent',
      task_id: null,
      phase: 'ARCHITECTING',
      context: 'Simple data needs',
      alternatives: [],
      rationale: 'No complex queries needed',
      consequences: 'Easy to set up',
      status: 'active',
      superseded_by: null,
    });

    const content = await writer.readFile('DECISIONS.md');
    expect(content).toContain('DEC-002');
    expect(content).toContain('Use SQLite');
    // Should not have Task or Superseded By lines
    expect(content).not.toContain('**Task:**');
    expect(content).not.toContain('**Superseded By:**');
  });

  it('updates TODO with items without assigned agent', async () => {
    await writer.updateTodo([
      {
        phase: 'BUILDING',
        milestone: 'Auth',
        items: [
          {
            task_id: 'task-1',
            description: 'Do thing',
            assigned_agent: null,
            status_symbol: ' ',
            status: 'PENDING',
            dependencies: [],
          },
        ],
      },
    ]);

    const content = await writer.readFile('TODO.md');
    expect(content).toContain('task-1');
    // Just the status symbol and task_id, no agent suffix
    expect(content).toMatch(/\[ \] `task-1`$/m);
  });

  it('searches log by keyword', async () => {
    await writer.appendLog({
      timestamp: '2026-06-25T10:00:00Z',
      phase: 'TESTING',
      agent_id: 'tester',
      action: 'Ran E2E tests',
      task_id: 'task-004',
      correlation_id: 'corr-002',
      body: 'All E2E tests passed for auth flow',
      result: 'success',
      artifacts: [],
    });

    const results = await writer.searchLog('E2E');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.body.toLowerCase()).toContain('e2e');
  });
});

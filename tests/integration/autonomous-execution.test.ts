import { existsSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BrowserTestAgent } from '../../benchmarks/browser-test-agent.js';
import { CapabilityRegistry } from '../../benchmarks/capability-registry.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { HackathonOrchestrator } from '../../benchmarks/hackathon-orchestrator.js';
import { InteractionManager } from '../../benchmarks/interaction-manager.js';
import { TaskGraph } from '../../benchmarks/task-graph.js';
import { ToolExecutor } from '../../benchmarks/tool-executor.js';

const TEST_ROOT = path.join(import.meta.dirname, '..', '..', 'tmp', 'autonomous-test');

describe('TaskGraph', () => {
  it('creates a graph with dependency ordering', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('Setup', 'infra', []);
    const b = g.addNode('Build frontend', 'frontend', [a]);
    const c = g.addNode('Build backend', 'backend', [a]);
    const d = g.addNode('Integration test', 'testing', [b, c]);
    const order = g.computeExecutionOrder();
    expect(order).toHaveLength(4);
    expect(order[0]).toBe(a);
    expect(order[3]).toBe(d);
  });

  it('returns ready nodes', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('Setup', 'infra', []);
    g.addNode('Build', 'frontend', [a]);
    const ready = g.getReadyNodes();
    expect(ready).toHaveLength(1);
    expect(ready[0]!.id).toBe(a);
  });

  it('tracks progress', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('A', 'infra', []);
    g.addNode('B', 'frontend', [a]);
    expect(g.getProgress()).toEqual({ total: 2, pending: 2, running: 0, done: 0, blocked: 0 });
    g.markDone(a);
    expect(g.getProgress()).toEqual({ total: 2, pending: 1, running: 0, done: 1, blocked: 0 });
  });

  it('blocks and unblocks tasks', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('A', 'infra', []);
    g.markBlocked(a, 'error');
    expect(g.getNode(a)!.status).toBe('blocked');
    expect(g.getProgress().blocked).toBe(1);
  });

  it('saves and loads checkpoints', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('A', 'infra', []);
    g.addNode('B', 'frontend', [a]);
    g.markDone(a);
    const json = g.toJSON();
    const g2 = TaskGraph.fromJSON(json);
    expect(g2.getProgress()).toEqual({ total: 2, pending: 1, running: 0, done: 1, blocked: 0 });
  });

  it('hasUnfinishedWork reflects completion', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('A', 'infra', []);
    expect(g.hasUnfinishedWork()).toBe(true);
    g.markDone(a);
    expect(g.hasUnfinishedWork()).toBe(false);
  });

  it('getNodesByCategory filters correctly', () => {
    const g = new TaskGraph('test', 42);
    g.addNode('A', 'infra', []);
    g.addNode('B', 'frontend', []);
    g.addNode('C', 'backend', []);
    expect(g.getNodesByCategory('frontend')).toHaveLength(1);
    expect(g.getNodesByCategory('frontend')[0]!.description).toBe('B');
    expect(g.getNodesByCategory('infra')).toHaveLength(1);
    expect(g.getNodesByCategory('backend')).toHaveLength(1);
    expect(g.getNodesByCategory('testing')).toHaveLength(0);
  });
});

describe('InteractionManager', () => {
  let im: InteractionManager;

  beforeEach(() => {
    im = new InteractionManager(42);
  });

  it('asks and answers clarification questions', () => {
    const q = im.getFrameworkChoiceQuestion(['task-1', 'task-2']);
    expect(q.type).toBe('choice');
    expect(q.options).toContain('Next.js (React)');
    expect(q.relatedTaskIds).toContain('task-1');
    const answered = im.answerQuestion(q.id, 'Next.js (React)');
    expect(answered).toBe(true);
    expect(im.getAnswerForQuestion(q.id)!.answer).toBe('Next.js (React)');
  });

  it('prevents double-answering', () => {
    const q = im.getCustomQuestion('Test?', 'desc', null);
    im.answerQuestion(q.id, 'yes');
    expect(im.answerQuestion(q.id, 'no')).toBe(false);
  });

  it('creates text questions', () => {
    const q = im.getCustomQuestion('What is your name?', 'desc', null);
    expect(q.type).toBe('text');
    expect(q.options).toBeNull();
  });

  it('creates questions with options', () => {
    const q = im.getCustomQuestion('Pick one?', 'desc', ['A', 'B']);
    expect(q.type).toBe('text');
    expect(q.options).toEqual(['A', 'B']);
  });

  it('creates checkpoint with full state', () => {
    const g = new TaskGraph('test', 42);
    const a = g.addNode('A', 'infra', []);
    g.markDone(a);
    const ckpt = im.createCheckpoint(g, null, 'execution', { extra: 'data' });
    expect(ckpt.checkpointId).toBeTruthy();
    expect(ckpt.executionPointer.phase).toBe('execution');
    expect(ckpt.taskGraphSnapshot.nodes).toHaveLength(1);
  });
});

describe('CapabilityRegistry', () => {
  let cr: CapabilityRegistry;

  beforeEach(() => {
    cr = new CapabilityRegistry(42);
  });

  it('has 13 built-in capabilities', () => {
    expect(cr.getAllCapabilities()).toHaveLength(13);
  });

  it('finds capabilities by alias', () => {
    const cap = cr.resolveCapabilityByAlias('react');
    expect(cap).toBeTruthy();
    expect(cap!.name).toBe('nextjs_framework');
  });

  it('finds capability gaps', () => {
    const gaps = cr.findCapabilityGaps(['kubernetes_advanced', 'nonexistent_cap']);
    expect(gaps.length).toBeGreaterThanOrEqual(2);
  });

  it('requests and approves upgrades', () => {
    const req = cr.requestUpgrade('Docker support upgrade', 'docker_advanced', 'tool', 'Need container orchestration');
    expect(req.status).toBe('pending');
    const spec = cr.generateUpgradeSpec(req.requestId);
    expect(spec).toBeTruthy();
    expect(spec!.moduleName).toBeTruthy();
    cr.approveUpgrade(req.requestId);
    const cap = cr.getCapability('docker_advanced');
    expect(cap).toBeTruthy();
    expect(cap!.name).toBe('docker_advanced');
  });

  it('generates upgrade spec with missing dependencies', () => {
    const req = cr.requestUpgrade('Vercel deploy', 'vercel_deployment', 'tool', 'Need Vercel');
    const spec = cr.generateUpgradeSpec(req.requestId);
    expect(spec).toBeDefined();
  });

  it('registers new capabilities', () => {
    const def = cr.register({
      name: 'custom_cap',
      version: '1.0.0',
      category: 'tool',
      description: 'Custom tool',
      dependencies: [],
      moduleSpec: null,
      metadata: {},
    });
    expect(def).toBeTruthy();
    expect(def.name).toBe('custom_cap');
    const cap = cr.getCapability('custom_cap');
    expect(cap).toBeTruthy();
    expect(cap!.name).toBe('custom_cap');
  });

  it('returns undefined for unknown capability', () => {
    expect(cr.getCapability('nonexistent')).toBeUndefined();
  });
});

describe('ToolExecutor', () => {
  let te: ToolExecutor;

  beforeEach(() => {
    te = new ToolExecutor(TEST_ROOT, 42);
  });
  afterEach(() => {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it('writes and reads files', async () => {
    const r1 = await te.execute('file', 'write', { path: 'test.txt', content: 'hello' });
    expect(r1.success).toBe(true);
    const r2 = await te.execute('file', 'read', { path: 'test.txt' });
    expect(r2.success).toBe(true);
    expect(r2.output).toBe('hello');
  });

  it('reads nonexistent file returns error', async () => {
    const r = await te.execute('file', 'read', { path: 'nope.txt' });
    expect(r.success).toBe(false);
  });

  it('patches existing files', async () => {
    await te.execute('file', 'write', { path: 'patch-test.txt', content: 'hello world' });
    const r = await te.execute('file', 'patch', { path: 'patch-test.txt', oldString: 'world', newString: 'there' });
    expect(r.success).toBe(true);
    const readBack = await te.execute('file', 'read', { path: 'patch-test.txt' });
    expect(readBack.output).toBe('hello there');
  });

  it('deletes files', async () => {
    await te.execute('file', 'write', { path: 'delete-me.txt', content: 'bye' });
    const r = await te.execute('file', 'delete', { path: 'delete-me.txt' });
    expect(r.success).toBe(true);
    const check = await te.execute('file', 'read', { path: 'delete-me.txt' });
    expect(check.success).toBe(false);
  });

  it('creates directories', async () => {
    const r = await te.execute('file', 'mkdir', { path: 'nested/deep/dir' });
    expect(r.success).toBe(true);
    expect(existsSync(path.join(TEST_ROOT, 'nested', 'deep', 'dir'))).toBe(true);
  });

  it('scaffolds basic projects', async () => {
    const r = await te.execute('scaffold', 'basic', { template: 'basic', projectDir: 'basic-project' });
    expect(r.success).toBe(true);
    expect(existsSync(path.join(TEST_ROOT, 'basic-project', 'package.json'))).toBe(true);
  });

  it('returns error for unknown tool type', async () => {
    const r = await te.execute('unknown_tool' as any, 'anything', {});
    expect(r.success).toBe(false);
    expect(r.error).toContain('Unknown tool');
  });

  it('returns error for unknown deploy target with missing dir', async () => {
    const r = await te.execute('deploy', 'unknown' as any, { target: 'unknown', projectDir: 'fail' });
    expect(r.success).toBe(false);
  });
});

describe('BrowserTestAgent', () => {
  let te: ToolExecutor;
  let agent: BrowserTestAgent;

  beforeEach(() => {
    te = new ToolExecutor(TEST_ROOT, 42);
    agent = new BrowserTestAgent(te, 42);
  });

  it('builds a test spec', () => {
    const spec = agent.buildTestSpec('Home', 'http://localhost:3000', ['main', 'h1'], ['Welcome']);
    expect(spec.name).toBe('Home');
    expect(spec.url).toBe('http://localhost:3000');
    expect(spec.expectedSelectors).toEqual(['main', 'h1']);
    expect(spec.expectedText).toEqual(['Welcome']);
  });

  it('runs a test (simulated via tool executor)', async () => {
    const spec = agent.buildTestSpec('Home', 'http://localhost:3000', ['main', 'h1'], ['Welcome']);
    const result = await agent.runTest(spec);
    expect(result).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
  });

  it('runs test and repair cycle', async () => {
    const g = new TaskGraph('test', 42);
    const taskId = g.addNode('Fix homepage', 'frontend', []);
    const spec = agent.buildTestSpec('Home', 'http://localhost:3000', ['main'], ['Missing']);
    const result = await agent.testAndRepairCycle([spec], g, taskId);
    expect(result.allPassed).toBeDefined();
    expect(typeof result.repairs.length).toBe('number');
  });
});

describe('HackathonOrchestrator', () => {
  let orch: HackathonOrchestrator;

  beforeEach(() => {
    orch = new HackathonOrchestrator(TEST_ROOT, 42);
  });

  it('parses a Devpost URL', async () => {
    const data = await orch.parseDevpost('https://devpost.com/software/test-project');
    expect(data.title).toBeTruthy();
    expect(data.judgingCriteria.length).toBeGreaterThanOrEqual(1);
  });

  it('parses direct problem statement', async () => {
    const input =
      'Project: AI Chatbot\nProblem: Build an AI chatbot with NLP\nJudging Criteria: Functionality, Innovation\nTech Stack: React, Python, PostgreSQL\nRequirements: Web UI, Real-time chat';
    const data = await orch.parseDevpost(input);
    expect(data.title).toBe('AI Chatbot');
    expect(data.judgingCriteria.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts requirements from devpost data', async () => {
    const input =
      'Project: Test\nProblem: Test app\nJudging Criteria: Quality, Speed\nTech Stack: Node.js\nRequirements: API';
    const data = await orch.parseDevpost(input);
    const reqs = await orch.extractRequirements(data);
    expect(reqs.length).toBeGreaterThanOrEqual(5);
  });

  it('creates execution plan with task graph', async () => {
    const input =
      'Project: WebApp\nProblem: Build a web app\nJudging Criteria: UX, Performance\nTech Stack: Next.js, PostgreSQL\nRequirements: Auth, Dashboard';
    const data = await orch.parseDevpost(input);
    const reqs = await orch.extractRequirements(data);
    const plan = await orch.createExecutionPlan(data, reqs);
    expect(plan.projectName).toBeTruthy();
    expect(plan.framework).toContain('nextjs');
    expect(plan.database).toContain('postgres');
    const tasks = orch.getTaskGraph().getAllNodes();
    expect(tasks.length).toBeGreaterThanOrEqual(10);
  });

  it('detects Vue framework from tech stack', async () => {
    const input =
      'Project: App\nProblem: App\nJudging Criteria: Quality\nTech Stack: Vue.js, MongoDB\nRequirements: UI';
    const data = await orch.parseDevpost(input);
    const reqs = await orch.extractRequirements(data);
    const plan = await orch.createExecutionPlan(data, reqs);
    expect(plan.framework).toContain('vue');
    expect(plan.database).toContain('mongo');
  });

  it('executes plan end-to-end with task completion', async () => {
    const input =
      'Project: MiniApp\nProblem: Small app\nJudging Criteria: Functionality\nTech Stack: React\nRequirements: Pages';
    const data = await orch.parseDevpost(input);
    const reqs = await orch.extractRequirements(data);
    await orch.createExecutionPlan(data, reqs);
    await orch.executePlan();
    const state = orch.getState();
    expect(state.phase).toBe('complete');
    const progress = orch.getTaskGraph().getProgress();
    expect(progress.done).toBeGreaterThanOrEqual(4);
  });

  it('creates checkpoints', () => {
    const ckpt = orch.createCheckpoint();
    expect(ckpt.phase).toBe('parsing');
  });
});

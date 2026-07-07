import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DeploymentRepairController } from '../../benchmarks/deployment-repair-controller.js';
import { ExecutionEnvironmentRouter } from '../../benchmarks/execution-environment-router.js';
import { HumanControlLayer } from '../../benchmarks/human-control-layer.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { InternetToolGateway } from '../../benchmarks/internet-tool-gateway.js';
import { LiveBrowserTestAgent } from '../../benchmarks/live-browser-test-agent.js';
import { RemoteProjectState } from '../../benchmarks/remote-project-state.js';
import { TaskGraph } from '../../benchmarks/task-graph.js';

const TEST_ROOT = path.join(import.meta.dirname, '..', '..', 'tmp', 'phase10-test');
const STATE_DIR = path.join(TEST_ROOT, '.hackagent-state');

describe('InternetToolGateway', () => {
  let gw: InternetToolGateway;

  beforeEach(() => {
    mkdirSync(TEST_ROOT, { recursive: true });
    gw = new InternetToolGateway({ workingDir: TEST_ROOT }, 42);
  });
  afterEach(() => {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it('creates mock GitHub repo when no token', async () => {
    const result = await gw.createGitHubRepository({ repoName: 'test-repo', description: 'Test' });
    expect(result.success).toBe(true);
    expect(result.repoUrl).toContain('mock/test-repo');
  });

  it('pushes mock commits when no token', async () => {
    const result = await gw.pushCommits('test-repo', {
      message: 'Initial',
      files: [{ path: 'README.md', content: '# Test' }],
    });
    expect(result.success).toBe(true);
    expect(result.commitSha).toContain('mock-sha');
  });

  it('syncs local to remote (mock)', async () => {
    const projectDir = path.join(TEST_ROOT, 'sync-test');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, 'test.txt'), 'hello', 'utf-8');
    const result = await gw.syncLocalToRemote(projectDir, 'sync-repo', 'Initial sync');
    expect(result.success).toBe(true);
    expect(result.repoUrl).toContain('mock/sync-repo');
  });

  it('deploys mock to vercel', async () => {
    const projectDir = path.join(TEST_ROOT, 'vercel-test');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, 'package.json'), '{}', 'utf-8');
    const result = await gw.deploy({ target: 'vercel', projectDir: 'vercel-test' });
    expect(result.success).toBe(true);
    expect(result.url).toContain('vercel.app');
  });

  it('deploys mock to netlify', async () => {
    const projectDir = path.join(TEST_ROOT, 'netlify-test');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(path.join(projectDir, 'package.json'), '{}', 'utf-8');
    const result = await gw.deploy({ target: 'netlify', projectDir: 'netlify-test' });
    expect(result.success).toBe(true);
    expect(result.url).toContain('netlify.app');
  });

  it('writes project files', async () => {
    const files = [
      { path: 'src/index.ts', content: 'console.log("hello");' },
      { path: 'src/utils/helper.ts', content: 'export const help = () => {};' },
    ];
    const ok = await gw.writeProjectFiles('my-project', files);
    expect(ok).toBe(true);
    expect(existsSync(path.join(TEST_ROOT, 'my-project', 'src', 'index.ts'))).toBe(true);
    expect(existsSync(path.join(TEST_ROOT, 'my-project', 'src', 'utils', 'helper.ts'))).toBe(true);
  });

  it('mock rollback returns true', async () => {
    const ok = await gw.rollbackCommit('test-repo', 'abc123');
    expect(ok).toBe(true);
  });

  it('mock create branch returns true', async () => {
    const ok = await gw.createBranch('test-repo', 'feature-branch');
    expect(ok).toBe(true);
  });

  it('mock open PR returns URL', async () => {
    const url = await gw.openPullRequest('test-repo', 'Feature', 'Body', 'feature-branch');
    expect(url).toBe('mock-pr-1');
  });

  it('creates sync manifest', () => {
    const dir = path.join(TEST_ROOT, 'manifest-src');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'file1.txt'), 'content1', 'utf-8');
    writeFileSync(path.join(dir, 'file2.txt'), 'content2', 'utf-8');
    const manifest = gw.createSyncManifest('manifest-src', 'manifest-repo', 'Commit');
    expect(manifest.repoName).toBe('manifest-repo');
    expect(manifest.commitBatches.length).toBeGreaterThanOrEqual(1);
  });

  it('logs all calls', async () => {
    await gw.createGitHubRepository({ repoName: 'log-test' });
    await gw.deploy({ target: 'vercel', projectDir: 'log-test' });
    const logs = gw.getCallLog();
    expect(logs.length).toBe(2);
    expect(logs[0]!.tool).toBe('github');
    expect(logs[1]!.tool).toBe('deploy');
  });
});

describe('RemoteProjectState', () => {
  let rps: RemoteProjectState;

  beforeEach(() => {
    mkdirSync(STATE_DIR, { recursive: true });
    rps = new RemoteProjectState(STATE_DIR, 42);
  });
  afterEach(() => {
    try {
      rmSync(STATE_DIR, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it('starts a new project', () => {
    const state = rps.startProject('test-project', { source: 'test' });
    expect(state.projectName).toBe('test-project');
    expect(state.phase).toBe('parsing');
    expect(state.metadata.source).toBe('test');
  });

  it('sets phase and persists', () => {
    rps.startProject('phase-test');
    rps.setPhase('github_sync');
    const state = rps.getState()!;
    expect(state.phase).toBe('github_sync');
    expect(state.updatedAt).toBeTruthy();
  });

  it('sets github snapshot', () => {
    rps.startProject('gh-test');
    rps.setGitHubSnapshot({
      repoName: 'my-repo',
      repoUrl: 'https://github.com/test/my-repo',
      cloneUrl: 'https://github.com/test/my-repo.git',
      branch: 'main',
      lastCommitSha: 'abc123',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const state = rps.getState()!;
    expect(state.gitHub?.repoUrl).toContain('my-repo');
    expect(state.gitHub?.lastCommitSha).toBe('abc123');
  });

  it('updates deployment snapshot', () => {
    rps.startProject('deploy-test');
    rps.setDeploymentSnapshot({
      target: 'vercel',
      url: 'https://test.vercel.app',
      deployId: 'd1',
      status: 'deployed',
      logs: [],
      deployedAt: new Date().toISOString(),
    });
    rps.updateDeploymentSnapshot({ status: 'rolled_back' });
    expect(rps.getState()!.deployment?.status).toBe('rolled_back');
  });

  it('adds build records', () => {
    rps.startProject('build-test');
    rps.addBuildRecord({
      buildNumber: 1,
      status: 'passed',
      output: 'ok',
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 1000,
    });
    expect(rps.getState()!.buildHistory).toHaveLength(1);
  });

  it('adds agent logs', () => {
    rps.startProject('log-test');
    rps.addAgentLog({
      agentId: 'agent-1',
      taskId: 'task-1',
      action: 'build',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      output: 'done',
      error: null,
    });
    expect(rps.getState()!.agentLogs).toHaveLength(1);
  });

  it('saves and loads state', () => {
    rps.startProject('save-load');
    rps.setPhase('complete');
    rps.save();

    const rps2 = new RemoteProjectState(STATE_DIR, 42);
    const loaded = rps2.load('save-load');
    expect(loaded).toBeTruthy();
    expect(loaded!.projectName).toBe('save-load');
    expect(loaded!.phase).toBe('complete');
  });

  it('canResume returns true for incomplete projects', () => {
    rps.startProject('resume-test');
    rps.setPhase('building');
    const result = rps.canResume();
    expect(result.canResume).toBe(true);
    expect(result.resumePoint).toBe('building');
  });

  it('canResume returns false for complete projects', () => {
    rps.startProject('done-test');
    rps.setPhase('complete');
    const result = rps.canResume();
    expect(result.canResume).toBe(false);
  });

  it('auto-save and stop-auto-save work without errors', () => {
    rps.startProject('auto-save');
    rps.startAutoSave();
    rps.stopAutoSave();
    expect(rps.getState()!.projectName).toBe('auto-save');
  });

  it('exports artifact', () => {
    rps.startProject('export-test');
    const outPath = path.join(STATE_DIR, 'exported.artifact.json');
    const result = rps.exportAsArtifact(outPath);
    expect(existsSync(result)).toBe(true);
    const data = JSON.parse(readFileSync(result, 'utf-8'));
    expect(data.projectName).toBe('export-test');
  });
});

describe('ExecutionEnvironmentRouter', () => {
  let router: ExecutionEnvironmentRouter;

  beforeEach(() => {
    router = new ExecutionEnvironmentRouter(42);
  });

  it('returns all environments', () => {
    const envs = router.getEnvironments();
    expect(envs.length).toBeGreaterThanOrEqual(4);
    expect(envs.map((e) => e.envType)).toContain('local_node');
    expect(envs.map((e) => e.envType)).toContain('cloud_github');
  });

  it('routes frontend tasks to local_node', () => {
    const task = {
      id: 't1',
      category: 'frontend' as const,
      description: 'Build UI',
      status: 'pending' as const,
      dependencies: [],
      assignedAgent: '',
      artifacts: [],
      error: null,
      createdAt: '',
      startedAt: null,
      completedAt: null,
      checkpointData: null,
    };
    const decision = router.routeTask(task);
    expect(decision.assignedEnvironment).toBe('local_node');
    expect(decision.taskId).toBe('t1');
  });

  it('routes infra tasks to local_node when no token', () => {
    const task = {
      id: 't2',
      category: 'infra' as const,
      description: 'Setup infra',
      status: 'pending' as const,
      dependencies: [],
      assignedAgent: '',
      artifacts: [],
      error: null,
      createdAt: '',
      startedAt: null,
      completedAt: null,
      checkpointData: null,
    };
    const decision = router.routeTask(task);
    expect(decision.assignedEnvironment).toBe('local_node');
  });

  it('routes deployment tasks considering token availability', () => {
    const task = {
      id: 't3',
      category: 'deployment' as const,
      description: 'Deploy',
      status: 'pending' as const,
      dependencies: [],
      assignedAgent: '',
      artifacts: [],
      error: null,
      createdAt: '',
      startedAt: null,
      completedAt: null,
      checkpointData: null,
    };
    const decision = router.routeTask(task, { github: true, vercel: true });
    expect(decision.assignedEnvironment).toBe('cloud_deploy');
    expect(decision.prerequisites).toContain('github_token');
  });

  it('establishes execution order respecting parallel budget', () => {
    const tasks = [
      {
        id: 'a',
        category: 'frontend' as const,
        description: '1',
        status: 'pending' as const,
        dependencies: [],
        assignedAgent: '',
        artifacts: [],
        error: null,
        createdAt: '',
        startedAt: null,
        completedAt: null,
        checkpointData: null,
      },
      {
        id: 'b',
        category: 'frontend' as const,
        description: '2',
        status: 'pending' as const,
        dependencies: [],
        assignedAgent: '',
        artifacts: [],
        error: null,
        createdAt: '',
        startedAt: null,
        completedAt: null,
        checkpointData: null,
      },
      {
        id: 'c',
        category: 'backend' as const,
        description: '3',
        status: 'pending' as const,
        dependencies: [],
        assignedAgent: '',
        artifacts: [],
        error: null,
        createdAt: '',
        startedAt: null,
        completedAt: null,
        checkpointData: null,
      },
    ];
    const assignment = router.decideExecutionOrder(tasks, 2);
    expect(assignment.size).toBeGreaterThanOrEqual(1);
  });
});

describe('HumanControlLayer', () => {
  let ctrl: HumanControlLayer;

  beforeEach(() => {
    ctrl = new HumanControlLayer(42);
  });

  it('starts unpaused', () => {
    expect(ctrl.isPaused()).toBe(false);
  });

  it('pause and resume', () => {
    expect(ctrl.pause('Testing')).toBe(true);
    expect(ctrl.isPaused()).toBe(true);
    expect(ctrl.getState().pauseReason).toBe('Testing');
    expect(ctrl.resume()).toBe(true);
    expect(ctrl.isPaused()).toBe(false);
  });

  it('double pause returns false', () => {
    ctrl.pause('First');
    expect(ctrl.pause('Second')).toBe(false);
  });

  it('double resume returns false', () => {
    expect(ctrl.resume()).toBe(false);
  });

  it('creates deployment approval', () => {
    const appr = ctrl.requestDeploymentApproval('Deploy to production', { url: 'test.com' });
    expect(appr.type).toBe('deployment');
    expect(appr.approved).toBeNull();
    expect(ctrl.hasUnresolvedApprovals()).toBe(true);
  });

  it('approves pending approval', () => {
    const appr = ctrl.requestDeploymentApproval('Deploy', {});
    expect(ctrl.approve(appr.approvalId)).toBe(true);
    const resolved = ctrl.getState().resolvedApprovals;
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.approved).toBe(true);
  });

  it('rejects pending approval', () => {
    const appr = ctrl.requestDeploymentApproval('Deploy', {});
    expect(ctrl.reject(appr.approvalId)).toBe(true);
    const resolved = ctrl.getState().resolvedApprovals;
    expect(resolved[0]!.approved).toBe(false);
  });

  it('injects constraints', () => {
    const constraint = ctrl.injectConstraint('Must use PostgreSQL', 'tech_stack', 'postgres');
    expect(constraint.type).toBe('tech_stack');
    expect(constraint.active).toBe(true);
    const techConstraints = ctrl.getConstraintsByType('tech_stack');
    expect(techConstraints).toHaveLength(1);
  });

  it('removes constraints', () => {
    const c = ctrl.injectConstraint('Budget limit', 'budget', 100);
    expect(ctrl.removeConstraint(c.constraintId)).toBe(true);
    expect(ctrl.getActiveConstraints()).toHaveLength(0);
  });

  it('applies overrides', () => {
    const ovr = ctrl.applyOverride('skip_task', 'task-123', { skipped: true }, 'Task not needed');
    expect(ovr.action).toBe('skip_task');
    expect(ovr.applied).toBe(true);
  });

  it('skipTask creates override', () => {
    const ovr = ctrl.skipTask('task-456', 'Not relevant');
    expect(ovr.targetId).toBe('task-456');
  });

  it('isActionBlocked when paused', () => {
    ctrl.pause('Paused');
    expect(ctrl.isActionBlocked('deploy')).toBe(true);
    expect(ctrl.isActionBlocked('build')).toBe(true);
  });

  it('isActionBlocked when approvals pending', () => {
    ctrl.requestDeploymentApproval('Approve me', {});
    expect(ctrl.isActionBlocked('deploy')).toBe(true);
    expect(ctrl.isActionBlocked('build')).toBe(false);
  });

  it('finds approval by id', () => {
    const a = ctrl.requestDeploymentApproval('Find me', {});
    expect(ctrl.getApprovalById(a.approvalId)).toBeTruthy();
    ctrl.approve(a.approvalId);
    expect(ctrl.getApprovalById(a.approvalId)).toBeTruthy();
  });

  it('modifyRequirement', () => {
    const ovr = ctrl.modifyRequirement('req-1', 'New description');
    expect(ovr.action).toBe('modify_requirement');
    expect((ovr.value as any).newDescription).toBe('New description');
  });

  it('restartPipeline', () => {
    const ovr = ctrl.restartPipeline('Major issues');
    expect(ovr.action).toBe('restart_pipeline');
  });
});

describe('DeploymentRepairController', () => {
  let gw: InternetToolGateway;
  let ctrl: HumanControlLayer;
  let tg: TaskGraph;
  let drc: DeploymentRepairController;

  beforeEach(() => {
    gw = new InternetToolGateway({ workingDir: TEST_ROOT }, 42);
    ctrl = new HumanControlLayer(42);
    tg = new TaskGraph('test', 42);
    drc = new DeploymentRepairController(gw, ctrl, tg, { maxRepairCycles: 2 }, 42);
  });

  it('starts with pending status', () => {
    expect(drc.getStatus()).toBe('pending');
    expect(drc.getCycles()).toHaveLength(0);
  });

  it('runs mock deployment', async () => {
    mkdirSync(path.join(TEST_ROOT, 'deploy-cycle'), { recursive: true });
    writeFileSync(path.join(TEST_ROOT, 'deploy-cycle', 'package.json'), '{}', 'utf-8');
    const result = await drc.startDeployment('test-repo', 'vercel', 'deploy-cycle');
    expect(result.success).toBe(true);
    expect(drc.getStatus()).toBe('deploying');
    expect(drc.getCurrentCycle()).toBeTruthy();
  });

  it('monitorAndRepair on successful deploy', async () => {
    mkdirSync(path.join(TEST_ROOT, 'monitor-test'), { recursive: true });
    writeFileSync(path.join(TEST_ROOT, 'monitor-test', 'package.json'), '{}', 'utf-8');
    const result = await drc.startDeployment('test-repo', 'vercel', 'monitor-test');
    const cycle = await drc.monitorAndRepair(result, tg, []);
    expect(cycle.status).toBe('live');
  });

  it('shouldContinue returns true within limits', () => {
    expect(drc.shouldContinue()).toBe(true);
  });

  it('rollback mock works', async () => {
    const ok = await drc.rollback('test-repo', 'abc123');
    expect(ok).toBe(true);
  });
});

describe('LiveBrowserTestAgent', () => {
  let gw: InternetToolGateway;
  let agent: LiveBrowserTestAgent;

  beforeEach(() => {
    gw = new InternetToolGateway({ workingDir: TEST_ROOT }, 42);
    agent = new LiveBrowserTestAgent(gw, 42);
  });

  it('builds a test spec', () => {
    const spec = agent.buildTestSpec('Homepage', 'http://localhost:3000', ['main', 'h1'], ['Welcome']);
    expect(spec.name).toBe('Homepage');
    expect(spec.expectedSelectors).toEqual(['main', 'h1']);
    expect(spec.expectedTexts).toEqual(['Welcome']);
  });

  it('runTest returns result for reachable URL', async () => {
    const spec = agent.buildTestSpec('Example', 'https://example.com', ['body'], ['Example']);
    const result = await agent.runTest(spec);
    expect(result.passed).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runTest returns result for unreachable URL', async () => {
    const spec = agent.buildTestSpec('Unreachable', 'http://localhost:99999', [], []);
    const result = await agent.runTest(spec);
    expect(result).toBeDefined();
  });

  it('testAndRepairCycle runs without error', async () => {
    const g = new TaskGraph('test', 42);
    const taskId = g.addNode('Fix UI', 'frontend', []);
    const spec = agent.buildTestSpec('Test', 'http://localhost:3000', ['main'], ['Missing']);
    const result = await agent.testAndRepairCycle([spec], g, taskId);
    expect(result.allPassed).toBeDefined();
    expect(result.cyclesUsed).toBeGreaterThanOrEqual(0);
  });
});

describe('InternetHackathonOrchestrator', () => {
  let orch: InternetHackathonOrchestrator;

  beforeEach(() => {
    mkdirSync(STATE_DIR, { recursive: true });
    orch = new InternetHackathonOrchestrator(TEST_ROOT, STATE_DIR, 42);
  });
  afterEach(() => {
    try {
      rmSync(STATE_DIR, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  });

  it('parses Devpost URL', async () => {
    const data = await orch.parseDevpost('Project: Ai Assistant\nProblem: Build an AI assistant\nJudging Criteria: Quality, Speed, Innovation\nTech Stack: React, Python\nRequirements: Web UI');
    expect(data.title).toBe('Ai Assistant');
    expect(data.judgingCriteria.length).toBeGreaterThanOrEqual(1);
  });

  it('parses direct input', async () => {
    const input =
      'Project: AI Chatbot\nProblem: Build chatbot\nJudging Criteria: Quality, Speed\nTech Stack: React, Python\nRequirements: Web UI';
    const data = await orch.parseDevpost(input);
    expect(data.title).toBe('AI Chatbot');
    expect(data.judgingCriteria).toContain('Quality');
  });

  it('extracts requirements', async () => {
    const data = await orch.parseDevpost(
      'Project: Test\nProblem: Test\nJudging Criteria: Quality\nTech Stack: Node.js\nRequirements: API',
    );
    const reqs = await orch.extractRequirements(data);
    expect(reqs.length).toBeGreaterThanOrEqual(5);
  });

  it('creates execution plan', async () => {
    const data = await orch.parseDevpost(
      'Project: WebApp\nProblem: Web app\nJudging Criteria: UX, Performance\nTech Stack: Next.js, PostgreSQL\nRequirements: Auth',
    );
    const reqs = await orch.extractRequirements(data);
    const plan = await orch.createExecutionPlan(data, reqs);
    expect(plan.projectName).toBeTruthy();
    expect(plan.framework).toContain('nextjs');
    expect(plan.gitHubRepo).toBeTruthy();
    const tasks = orch.getTaskGraph().getAllNodes();
    expect(tasks.length).toBeGreaterThanOrEqual(10);
  });

  it('executes full pipeline end-to-end', async () => {
    const data = await orch.parseDevpost(
      'Project: MiniApp\nProblem: Small app\nJudging Criteria: Functionality\nTech Stack: React\nRequirements: Pages',
    );
    const reqs = await orch.extractRequirements(data);
    await orch.createExecutionPlan(data, reqs);
    await orch.executeFullPipeline();
    const progress = orch.getProgress();
    expect(progress.phase).toBe('complete');
    expect(progress.tasks.done).toBeGreaterThanOrEqual(4);
  });

  it('getProgress returns correct shape', async () => {
    const data = await orch.parseDevpost(
      'Project: P\nProblem: P\nJudging Criteria: Q\nTech Stack: React\nRequirements: UI',
    );
    const reqs = await orch.extractRequirements(data);
    await orch.createExecutionPlan(data, reqs);
    const progress = orch.getProgress();
    expect(progress.phase).toBe('decomposition');
    expect(progress.tasks.total).toBeGreaterThan(0);
    expect(typeof progress.tasks.done).toBe('number');
  });

  it('pause and resume', () => {
    expect(orch.pause('Test pause')).toBe(true);
    expect(orch.isPaused()).toBe(true);
    expect(orch.resume()).toBe(true);
    expect(orch.isPaused()).toBe(false);
  });

  it('approve and reject deployment', () => {
    const ctrl = orch.getHumanControl();
    const appr = ctrl.requestDeploymentApproval('Test deploy', {});
    expect(orch.approveDeployment(appr.approvalId)).toBe(true);
    const appr2 = ctrl.requestDeploymentApproval('Test reject', {});
    expect(orch.rejectDeployment(appr2.approvalId)).toBe(true);
  });

  it('injectConstraint', () => {
    const constraint = orch.injectConstraint('Use TypeScript', 'tech_stack', 'typescript');
    expect(constraint.type).toBe('tech_stack');
    expect(constraint.active).toBe(true);
  });

  it('skipTask', () => {
    const tg = orch.getTaskGraph();
    const taskId = tg.addNode('Skip me', 'frontend', []);
    const ovr = orch.skipTask(taskId, 'Not needed');
    expect(ovr.targetId).toBe(taskId);
  });

  it('full injectDevpostUrl pipeline', async () => {
    await orch.injectDevpostUrl(
      'Project: FullPipe\nProblem: Full pipeline test\nJudging Criteria: Quality\nTech Stack: Node.js\nRequirements: API',
    );
    const progress = orch.getProgress();
    expect(progress.phase).toBe('complete');
  });

  it('records decisions', async () => {
    const data = await orch.parseDevpost(
      'Project: D\nProblem: D\nJudging Criteria: Q\nTech Stack: React\nRequirements: UI',
    );
    const reqs = await orch.extractRequirements(data);
    await orch.createExecutionPlan(data, reqs);
    await orch.executeFullPipeline();
    const decisions = orch.getDecisionLog();
    expect(decisions.length).toBeGreaterThan(0);
  });
});

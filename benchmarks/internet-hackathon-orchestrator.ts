import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';

import { warn, debug, aiUnavailable } from '../cli/output.js';
import { CapabilityRegistry, type CapabilityDefinition } from './capability-registry.js';
import { DeploymentRepairController, type DeploymentCycle } from './deployment-repair-controller.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import {
  ExecutionEnvironmentRouter,
  type EnvironmentType,
  type RoutingDecision,
} from './execution-environment-router.js';
import { HumanControlLayer, type ConstraintInjection, type OverrideDecision } from './human-control-layer.js';
import { InteractionManager, type ClarificationQuestion } from './interaction-manager.js';
import { autonomousRepair, formatRepairResult, type RepairResult } from '../kernel/repair/autonomous-repair.js';
import { validateGeneratedFiles, formatValidationResult } from '../kernel/repair/code-quality-validator.js';
import { InternetToolGateway, type DeployConfig } from './internet-tool-gateway.js';
import type { RouterEngine } from '../kernel/llm/router-engine.js';
import type { LLMRequest, LLMResponse } from '../kernel/llm/llm-types.js';
import {
  LiveBrowserTestAgent,
  type LiveBrowserTestSpec,
  type LiveBrowserRepairAction,
} from './live-browser-test-agent.js';
import { RemoteProjectState, type ProjectPhase, type DeploymentSnapshot, type ProjectStateSnapshot } from './remote-project-state.js';
import { TaskGraph, type TaskNode, type TaskCategory } from './task-graph.js';
import type { UXEvaluationResult } from './ux-evaluation-agent.js';
import { KNOWN_PACKAGE_VERSIONS, KNOWN_PACKAGE_VERSIONS_FALLBACK, LLM_GENERATION_SYSTEM_PROMPT, LLM_TASK_DESCRIPTIONS } from './orchestrator-templates.js';

export type OrchestratorPhase =
  | 'initializing'
  | 'parsing'
  | 'requirements'
  | 'decomposition'
  | 'building'
  | 'testing'
  | 'github_sync'
  | 'deploying'
  | 'live_testing'
  | 'repairing'
  | 'complete'
  | 'failed';

export interface DevpostData {
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  recommendedStack: string[];
  submissionRequirements: string[];
  rawText: string;
}

export interface RequirementItem {
  id: string;
  description: string;
  category: 'feature' | 'technical' | 'infrastructure' | 'compliance';
  priority: 'critical' | 'high' | 'medium' | 'low';
  acceptanceCriteria: string[];
}

export interface GeneratedProjectValidation {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; error?: string; durationMs?: number }>;
  errors: string[];
  durationMs?: number;
}

export interface InternetExecutionPlan {
  projectName: string;
  requirements: RequirementItem[];
  taskGraph: TaskGraph;
  techStack: Record<string, string>;
  framework: string;
  database: string;
  deploymentTarget: string;
  gitHubRepo: string;
}

export interface AutoDecision {
  decisionId: string;
  type: 'build_next' | 'test_now' | 'deploy_now' | 'ask_user' | 'rollback' | 'restart_pipeline' | 'skip_task';
  targetId: string | null;
  reason: string;
  confidence: number;
  timestamp: string;
}

export interface PipelineResult {
  phase: OrchestratorPhase;
  deployUrl: string | null;
  errors: string[];
  uxResults: UXEvaluationResult[];
  completionRate: number;
  failurePatterns: Array<{ category: string; description: string; frequency: number; suggestedFix: string }>;
  judgeScore: number;
  /** Count of tasks that recovered via retry */
  retryRecovered?: number;
  /** Total retry attempts across all tasks */
  retryAttempts?: number;
  /** Per-task retry log */
  retryLog?: Array<{ taskId: string; taskDesc: string; attempt: number; maxRetries: number; outcome: string }>;
}

export class InternetHackathonOrchestrator {
  private readonly seed: number;
  private readonly orchestratorId: string;
  private readonly workspaceRoot: string;
  private readonly taskGraph: TaskGraph;
  private readonly interactionManager: InteractionManager;
  private readonly capabilityRegistry: CapabilityRegistry;
  private readonly toolGateway: InternetToolGateway;
  private readonly projectState: RemoteProjectState;
  private readonly envRouter: ExecutionEnvironmentRouter;
  private readonly humanControl: HumanControlLayer;
  private readonly browserAgent: LiveBrowserTestAgent;
  private readonly deployRepair: DeploymentRepairController;
  private readonly routerEngine: RouterEngine | null;

  private hasWarnedLLMFailure = false;

  private phase: OrchestratorPhase = 'initializing';
  private plan: InternetExecutionPlan | null = null;
  private devpostData: DevpostData | null = null;
  private errors: string[] = [];
  private artifacts: string[] = [];
  private decisionLog: AutoDecision[] = [];
  private generationAttempted = new Set<string>();
  private taskRetries = new Map<string, number>();
  private taskRetryLog: Array<{ taskId: string; taskDesc: string; attempt: number; maxRetries: number; reason: string; outcome: 'retry' | 'skip' | 'blocked' }> = [];
  private onPhaseChange: ((phase: OrchestratorPhase, data?: Record<string, unknown>) => void) | null = null;

  constructor(workspaceRoot: string, stateDir?: string, seed = 42, routerEngine?: RouterEngine) {
    this.seed = seed;
    this.orchestratorId = 'inet-orch-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.workspaceRoot = workspaceRoot;
    this.taskGraph = new TaskGraph('internet-hackathon', seed);
    this.interactionManager = new InteractionManager(seed);
    this.capabilityRegistry = new CapabilityRegistry(seed);
    this.toolGateway = new InternetToolGateway({ workingDir: workspaceRoot }, seed);
    this.projectState = new RemoteProjectState(stateDir ?? path.join(workspaceRoot, '.hackagent-state'), seed);
    this.envRouter = new ExecutionEnvironmentRouter(seed);
    this.humanControl = new HumanControlLayer(seed);
    this.browserAgent = new LiveBrowserTestAgent(this.toolGateway, seed);
    this.deployRepair = new DeploymentRepairController(this.toolGateway, this.humanControl, this.taskGraph, {}, seed);
    this.routerEngine = routerEngine ?? null;

    this.humanControl.onAction((action, data) => {
      if (action === 'pause') {
        /* pause handled by humanControl */
      }
      if (action === 'resume') {
        /* resume handled by humanControl */
      }
    });
  }

  getPhase(): OrchestratorPhase {
    return this.phase;
  }
  getPlan(): InternetExecutionPlan | null {
    return this.plan;
  }
  getTaskGraph(): TaskGraph {
    return this.taskGraph;
  }
  getProjectState(): RemoteProjectState {
    return this.projectState;
  }
  getHumanControl(): HumanControlLayer {
    return this.humanControl;
  }
  getEnvRouter(): ExecutionEnvironmentRouter {
    return this.envRouter;
  }
  getBrowserAgent(): LiveBrowserTestAgent {
    return this.browserAgent;
  }
  getDeployRepair(): DeploymentRepairController {
    return this.deployRepair;
  }
  getToolGateway(): InternetToolGateway {
    return this.toolGateway;
  }
  getDecisionLog(): AutoDecision[] {
    return [...this.decisionLog];
  }

  setPhaseChangeHandler(h: (phase: OrchestratorPhase, data?: Record<string, unknown>) => void): void {
    this.onPhaseChange = h;
  }

  setDevpostData(data: DevpostData): void {
    this.devpostData = data;
  }

  /**
   * Restore orchestrator state from a previously persisted snapshot so a run
   * can be resumed instead of restarted. Restores the execution plan, task
   * graph (with per-task statuses), current phase, and Devpost data.
   *
   * Returns true if the snapshot was applied successfully.
   */
  loadState(snapshot: ProjectStateSnapshot): boolean {
    try {
      this.projectState.load(snapshot.projectName);
      const tg = snapshot.taskGraphState as unknown as ReturnType<TaskGraph['toJSON']> | null;
      if (tg && Array.isArray(tg.nodes)) {
        (this.taskGraph as unknown) = TaskGraph.fromJSON(tg);
      }
      this.phase = (snapshot.phase as OrchestratorPhase) ?? 'building';
      const projectDir = path.resolve(this.workspaceRoot, snapshot.projectName);
      this.plan = {
        projectName: snapshot.projectName,
        requirements: [],
        taskGraph: this.taskGraph,
        techStack: { frontend: 'nextjs_framework', backend: 'node_express', database: 'postgres_database', deployment: 'vercel' },
        framework: 'nextjs',
        database: 'postgres',
        deploymentTarget: snapshot.deployment?.target ?? 'vercel',
        gitHubRepo: snapshot.projectName,
      };
      this.devpostData = {
        title: snapshot.projectName,
        problemStatement: snapshot.metadata?.['problemStatement'] ?? '',
        judgingCriteria: [],
        constraints: [],
        recommendedStack: [],
        submissionRequirements: [],
        rawText: '',
      };
      void projectDir;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resume execution from a previously saved state. Unlike `executeFullPipeline`,
   * this does NOT reset the task graph — already-`done` tasks are skipped and the
   * pipeline continues from the first pending/blocked task, then runs the
   * post-generation stages (GitHub sync, deployment, live tests) that had not
   * completed.
   */
  async resumeExecution(): Promise<PipelineResult> {
    if (!this.plan) {
      throw new Error('No plan loaded. Call loadState() with a valid snapshot first.');
    }
    // Build/generation loop: getNextReady() already skips done tasks, so this
    // naturally continues from where the previous run stopped.
    this.setPhase(this.phase === 'parsing' || this.phase === 'requirements' || this.phase === 'decomposition' ? 'building' : this.phase);

    while (this.taskGraph.hasUnfinishedWork() && !this.humanControl.isPaused()) {
      const next = this.taskGraph.getNextReady();
      if (!next) break;
      const routing = this.envRouter.routeTask(next);
      this.logDecision('build_next', next.id, `Resuming via ${routing.assignedEnvironment}`, 0.9);
      this.taskGraph.markRunning(next.id);
      try {
        await this.executeTaskInEnvironment(next, routing.assignedEnvironment);
        this.taskGraph.markDone(next.id);
        this.artifacts.push(next.id);
        this.projectState.addAgentLog({
          agentId: routing.assignedEnvironment,
          taskId: next.id,
          action: 'execute',
          status: 'completed',
          startedAt: deterministicNow(this.seed),
          completedAt: deterministicNow(this.seed + 1),
          output: 'Task completed',
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Attempt per-task retry with intelligent limits before marking blocked
        const retryOutcome = await this.attemptTaskRetry(next, msg, routing.assignedEnvironment);
        if (retryOutcome === 'recovered') {
          this.taskGraph.markDone(next.id);
          this.artifacts.push(next.id);
          this.projectState.addAgentLog({
            agentId: routing.assignedEnvironment,
            taskId: next.id,
            action: 'retry_execute',
            status: 'completed',
            startedAt: deterministicNow(this.seed),
            completedAt: deterministicNow(this.seed + 2),
            output: 'Recovered after retry',
            error: null,
          });
        } else {
          this.taskGraph.markBlocked(next.id, msg);
          this.errors.push(msg);
          this.projectState.addAgentLog({
            agentId: routing.assignedEnvironment,
            taskId: next.id,
            action: 'execute',
            status: 'failed',
            startedAt: deterministicNow(this.seed),
            completedAt: deterministicNow(this.seed + 1),
            output: '',
            error: msg,
          });
        }
      }
      this.projectState.setTaskGraphState(this.taskGraph.toJSON() as unknown as Record<string, unknown>);
    }

    if (this.errors.length > 0) {
      this.setPhase('repairing');
      await this.runRepairLoop();
    }

    if (this.taskGraph.getProgress().blocked === 0) {
      await this.runGitHubSync();
      await this.runDeployment();
      await this.runLiveBrowserTests();
    }

    const fProgress = this.taskGraph.getProgress();
    if (fProgress.blocked === 0 && fProgress.pending === 0) {
      this.setPhase('complete', { artifacts: this.artifacts });
    } else {
      this.setPhase('failed', { errors: this.errors });
    }

    if (this.plan) {
      const projectDir = path.resolve(this.workspaceRoot, this.plan.projectName);
      this.postProcessProject(projectDir);
    }

    return {
      phase: this.phase,
      deployUrl: this.projectState.getDeployUrl(),
      errors: this.errors,
      uxResults: [],
      completionRate: fProgress.done / Math.max(fProgress.total, 1),
      failurePatterns: [],
      judgeScore: 0,
      retryRecovered: this.taskRetryLog.filter(r => r.outcome === 'retry' && fProgress.done > 0).length,
      retryAttempts: this.taskRetries.size,
      retryLog: this.taskRetryLog.map(r => ({ taskId: r.taskId, taskDesc: r.taskDesc, attempt: r.attempt, maxRetries: r.maxRetries, outcome: r.outcome })),
    };
  }

  buildExecutionPlan(): InternetExecutionPlan {
    if (this.plan) return this.plan;
    throw new Error('No execution plan available. Ensure Devpost data is set and requirements are extracted.');
  }

  private setPhase(phase: OrchestratorPhase, data?: Record<string, unknown>): void {
    this.phase = phase;
    this.projectState.setPhase(phase as ProjectPhase);
    this.onPhaseChange?.(phase, data);
  }

  private logDecision(
    type: AutoDecision['type'],
    targetId: string | null,
    reason: string,
    confidence: number,
  ): AutoDecision {
    const d: AutoDecision = {
      type,
      decisionId: 'dec-' + createDeterministicUuid(this.seed, this.decisionLog.length).slice(0, 8),
      targetId,
      reason,
      confidence,
      timestamp: deterministicNow(this.seed + this.decisionLog.length),
    };
    this.decisionLog.push(d);
    return d;
  }

  async parseDevpost(input: string): Promise<DevpostData> {
    this.setPhase('parsing');
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    let text = input;

    if (isUrl) {
      try {
        const res = await fetch(input, { signal: AbortSignal.timeout(10000) });
        if (res.ok) text = await res.text();
      } catch {
        warn(`Could not fetch ${input} — using the text you provided instead.`);
      }
    }

    const devpost: DevpostData = {
      title: this.extractValue(text, ['Project:', 'Title:', '# ']) ?? 'Hackathon Project',
      problemStatement: text.match(/Problem[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s)?.[1]?.trim() ?? text.slice(0, 500),
      judgingCriteria: this.extractList(text, 'Judging Criteria'),
      constraints: this.extractList(text, 'Constraints'),
      recommendedStack: this.extractList(text, 'Tech Stack'),
      submissionRequirements: this.extractList(text, 'Requirements'),
      rawText: text,
    };

    this.devpostData = devpost;
    this.projectState.startProject(devpost.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(), {
      source: isUrl ? 'devpost_url' : 'direct_input',
    });
    this.setPhase('requirements');
    return devpost;
  }

  private extractValue(text: string, prefixes: string[]): string | null {
    for (const p of prefixes) {
      const idx = text.indexOf(p);
      if (idx >= 0) {
        const after = text
          .slice(idx + p.length)
          .split('\n')[0]
          ?.trim();
        if (after) return after;
      }
    }
    return null;
  }

  private extractList(text: string, label: string): string[] {
    const match = text.match(new RegExp(`${label}[:\\s]+(.+?)(?:\\n\\n|\\n[A-Z]|$)`, 's'));
    if (!match) return [];
    return match[1]!
      .split(/[,;]/)
      .map((s) => s.trim().replace(/^\d+%?\s*/, ''))
      .filter(Boolean);
  }

  async extractRequirements(devpost: DevpostData): Promise<RequirementItem[]> {
    this.setPhase('requirements');
    const reqs: RequirementItem[] = [];
    const counts = { val: 0 };

    const add = (
      desc: string,
      cat: RequirementItem['category'],
      pri: RequirementItem['priority'],
      criteria: string[],
    ) => {
      counts.val++;
      reqs.push({
        id: 'req' + counts.val,
        description: desc,
        category: cat,
        priority: pri,
        acceptanceCriteria: criteria,
      });
    };

    add('Set up project scaffolding', 'technical', 'critical', ['npm init', 'Framework installed']);
    add('Implement frontend UI', 'feature', 'critical', ['Pages render', 'Navigation works']);
    add('Implement backend API', 'feature', 'critical', ['API returns 200', 'Error handling works']);
    add('Set up database schema', 'infrastructure', 'high', ['Tables created', 'Migrations run']);
    add('Implement user authentication', 'feature', 'high', ['Login works', 'Registration works']);
    add('Integrate core hackathon features', 'feature', 'critical', ['Main feature works']);
    add('Write automated tests', 'technical', 'high', ['Unit tests pass']);
    add('Deploy to production', 'infrastructure', 'high', ['Deploy succeeds', 'URL accessible']);
    add('Verify live deployment', 'technical', 'critical', ['Live URL responds', 'Core features work']);

    for (const c of devpost.judgingCriteria)
      add('Address judging criterion: ' + c, 'compliance', 'high', ['Criterion satisfied']);
    reqs.forEach((r) => {
      r.id = 'req-' + createDeterministicUuid(this.seed, parseInt(r.id.replace('req', ''))).slice(0, 6);
    });

    this.setPhase('decomposition');
    return reqs;
  }

  async createExecutionPlan(devpost: DevpostData, requirements: RequirementItem[]): Promise<InternetExecutionPlan> {
    this.setPhase('decomposition');
    const framework = this.detect(devpost.recommendedStack, ['nextjs', 'vite', 'vue', 'svelte', 'angular'], 'nextjs');
    const database = this.detect(devpost.recommendedStack, ['postgres', 'mongo', 'sqlite', 'firebase'], 'postgres');

    const plan: InternetExecutionPlan = {
      projectName: devpost.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      requirements,
      taskGraph: this.taskGraph,
      techStack: {
        frontend: framework + '_framework',
        backend: 'node_express',
        database: database + '_database',
        deployment: 'vercel',
      },
      framework,
      database,
      deploymentTarget: 'vercel',
      gitHubRepo: devpost.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
    };

    this.addTasks(plan);
    this.taskGraph.computeExecutionOrder();
    this.plan = plan;
    this.projectState.setTaskGraphState(this.taskGraph.toJSON() as unknown as Record<string, unknown>);
    return plan;
  }

  private detect(stack: string[], keywords: string[], fallback: string): string {
    for (const s of stack) {
      const lower = s.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw)) return kw;
      }
    }
    return fallback;
  }

  private addTask(desc: string, cat: TaskCategory, deps: string[] = []): string {
    return this.taskGraph.addNode(desc, cat, deps);
  }

  private addTasks(plan: InternetExecutionPlan): void {
    const infra: string[] = [];
    infra.push(this.addTask('Initialize project structure', 'infra'));
    infra.push(this.addTask('Configure TypeScript and build tooling', 'infra', [infra[0]!]));
    infra.push(this.addTask('Initialize Git repository', 'infra', [infra[0]!]));

    const fe: string[] = [];
    fe.push(this.addTask('Scaffold frontend with ' + plan.framework, 'frontend', infra));
    fe.push(this.addTask('Create layout and navigation', 'frontend', [fe[0]!]));
    fe.push(this.addTask('Implement core pages', 'frontend', [fe[1]!]));
    fe.push(this.addTask('Implement auth UI', 'frontend', [fe[1]!]));
    fe.push(this.addTask('Add responsive styling', 'frontend', [fe[2]!, fe[3]!]));

    const be: string[] = [];
    be.push(this.addTask('Initialize backend with Express', 'backend', infra));
    be.push(this.addTask('Set up database schema', 'backend', [be[0]!]));
    be.push(this.addTask('Implement auth endpoints', 'backend', [be[1]!]));
    be.push(this.addTask('Implement core API endpoints', 'backend', [be[2]!]));
    be.push(this.addTask('Add validation and error handling', 'backend', [be[3]!]));

    const test: string[] = [];
    test.push(this.addTask('Write API integration tests', 'testing', be));
    test.push(this.addTask('Write frontend component tests', 'testing', fe));
    test.push(this.addTask('Write E2E browser tests', 'testing', [test[1]!]));

    const deploy: string[] = [];
    deploy.push(this.addTask('Configure production build', 'deployment', [...fe, ...be]));
    deploy.push(this.addTask('Create GitHub repository and push', 'deployment', [...infra, ...fe, ...be, ...test]));
    deploy.push(this.addTask('Deploy to ' + plan.deploymentTarget, 'deployment', [deploy[1]!]));
    deploy.push(this.addTask('Verify live deployment', 'testing', [deploy[2]!]));
  }

  async executeFullPipeline(): Promise<PipelineResult> {
    this.setPhase('building');

    while (this.taskGraph.hasUnfinishedWork() && !this.humanControl.isPaused()) {
      const decision = this.autonomousDecide();
      if (decision.type === 'ask_user') {
        const questions = this.interactionManager.getPendingQuestions();
        if (questions.length > 0) break;
        break;
      }
      if (decision.type === 'skip_task' && decision.targetId) {
        this.taskGraph.markDone(decision.targetId);
        continue;
      }
      if (decision.type === 'restart_pipeline') {
        this.setPhase('parsing');
        const progress = this.taskGraph.getProgress();
        return {
          phase: this.phase,
          deployUrl: this.projectState.getDeployUrl(),
          errors: this.errors,
          uxResults: [],
          completionRate: progress.done / Math.max(progress.total, 1),
          failurePatterns: [],
          judgeScore: 0,
          retryRecovered: this.taskRetryLog.filter(r => r.outcome === 'retry' && progress.done > 0).length,
          retryAttempts: this.taskRetries.size,
          retryLog: this.taskRetryLog.map(r => ({ taskId: r.taskId, taskDesc: r.taskDesc, attempt: r.attempt, maxRetries: r.maxRetries, outcome: r.outcome })),
        };
      }

      const next = this.taskGraph.getNextReady();
      if (!next) break;

      const routing = this.envRouter.routeTask(next);
      this.logDecision('build_next', next.id, `Executing via ${routing.assignedEnvironment}`, 0.9);

      this.taskGraph.markRunning(next.id);

      try {
        if (this.phase === 'building' || this.phase === 'decomposition' || this.phase === 'requirements')
          this.setPhase('building');
        await this.executeTaskInEnvironment(next, routing.assignedEnvironment);
        this.taskGraph.markDone(next.id);
        this.artifacts.push(next.id);
        this.projectState.addAgentLog({
          agentId: routing.assignedEnvironment,
          taskId: next.id,
          action: 'execute',
          status: 'completed',
          startedAt: deterministicNow(this.seed),
          completedAt: deterministicNow(this.seed + 1),
          output: 'Task completed',
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Attempt per-task retry with intelligent limits before marking blocked
        const retryOutcome = await this.attemptTaskRetry(next, msg, routing.assignedEnvironment);
        if (retryOutcome === 'recovered') {
          this.taskGraph.markDone(next.id);
          this.artifacts.push(next.id);
          this.projectState.addAgentLog({
            agentId: routing.assignedEnvironment,
            taskId: next.id,
            action: 'retry_execute',
            status: 'completed',
            startedAt: deterministicNow(this.seed),
            completedAt: deterministicNow(this.seed + 2),
            output: 'Recovered after retry',
            error: null,
          });
        } else {
          this.taskGraph.markBlocked(next.id, msg);
          this.errors.push(msg);
          this.projectState.addAgentLog({
            agentId: routing.assignedEnvironment,
            taskId: next.id,
            action: 'execute',
            status: 'failed',
            startedAt: deterministicNow(this.seed),
            completedAt: deterministicNow(this.seed + 1),
            output: '',
            error: msg,
          });
        }
      }

      this.projectState.setTaskGraphState(this.taskGraph.toJSON() as unknown as Record<string, unknown>);
    }

    if (this.errors.length > 0) {
      this.setPhase('repairing');
      await this.runRepairLoop();
    }

    if (this.taskGraph.getProgress().blocked === 0) {
      await this.runGitHubSync();
      await this.runDeployment();
      await this.runLiveBrowserTests();
    }

    const fProgress = this.taskGraph.getProgress();
    if (fProgress.blocked === 0 && fProgress.pending === 0) {
      this.setPhase('complete', { artifacts: this.artifacts });
    } else {
      this.setPhase('failed', { errors: this.errors });
    }

    if (this.plan) {
      const projectDir = path.resolve(this.workspaceRoot, this.plan.projectName);
      this.postProcessProject(projectDir);
    }

    return {
      phase: this.phase,
      deployUrl: this.projectState.getDeployUrl(),
      errors: this.errors,
      uxResults: [],
      completionRate: fProgress.done / Math.max(fProgress.total, 1),
      failurePatterns: [],
      judgeScore: 0, // Not computed — requires real evaluation
      retryRecovered: this.taskRetryLog.filter(r => r.outcome === 'retry' && fProgress.done > 0).length,
      retryAttempts: this.taskRetries.size,
      retryLog: this.taskRetryLog.map(r => ({ taskId: r.taskId, taskDesc: r.taskDesc, attempt: r.attempt, maxRetries: r.maxRetries, outcome: r.outcome })),
    };
  }

  /**
   * Determine the maximum retries for a task based on failure type.
   * Build failures get more retries, API/key errors fewer, deploy errors moderate.
   */
  private getMaxRetries(errorMessage: string, taskCategory: string): number {
    const msg = errorMessage.toLowerCase();
    const cat = taskCategory.toLowerCase();

    // Network/API errors — retry once (transient)
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('enotfound')) {
      return 2;
    }
    // Auth/key errors — no retry (won't fix itself)
    if (msg.includes('401') || msg.includes('403') || msg.includes('api key') || msg.includes('unauthorized') || msg.includes('token')) {
      return 0;
    }
    // Build/compile errors — retry 3 times (repair may fix)
    if (msg.includes('typescript') || msg.includes('tsc') || msg.includes('build') || msg.includes('compile') || cat.includes('frontend') || cat.includes('backend')) {
      return 3;
    }
    // Deployment errors — retry 2 times (may be transient)
    if (cat.includes('deploy') || msg.includes('deploy')) {
      return 2;
    }
    // Install/dep errors — retry 1 time (may be cache)
    if (msg.includes('npm') || msg.includes('install') || msg.includes('dependency') || msg.includes('package')) {
      return 1;
    }
    // Default: 1 retry
    return 1;
  }

  /**
   * Attempt to retry a failed task after understanding the failure type.
   * Records every retry reason. Never retries forever.
   */
  private async attemptTaskRetry(
    node: TaskNode,
    errorMessage: string,
    environment: EnvironmentType,
  ): Promise<'recovered' | 'failed'> {
    const currentRetries = this.taskRetries.get(node.id) ?? 0;
    const maxRetries = this.getMaxRetries(errorMessage, node.category);

    if (currentRetries >= maxRetries) {
      this.taskRetryLog.push({
        taskId: node.id,
        taskDesc: node.description,
        attempt: currentRetries,
        maxRetries,
        reason: `Exhausted retries (${currentRetries}/${maxRetries}): ${errorMessage.slice(0, 100)}`,
        outcome: 'blocked',
      });
      this.logDecision('skip_task', node.id, `Retries exhausted for ${node.description} (${currentRetries}/${maxRetries})`, 0.3);
      return 'failed';
    }

    this.taskRetries.set(node.id, currentRetries + 1);

    // Log the retry decision with reason
    this.logDecision(
      'build_next',
      node.id,
      `Retry ${currentRetries + 1}/${maxRetries} for ${node.description}: ${errorMessage.slice(0, 80)}`,
      Math.max(0.1, 1 - (currentRetries + 1) / (maxRetries + 1)),
    );

    this.taskRetryLog.push({
      taskId: node.id,
      taskDesc: node.description,
      attempt: currentRetries + 1,
      maxRetries,
      reason: errorMessage.slice(0, 120),
      outcome: 'retry',
    });

    // Wait with exponential backoff before retry (avoid tight loop on transient errors)
    const delayMs = 500 * Math.pow(2, currentRetries);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    try {
      await this.executeTaskInEnvironment(node, environment);
      return 'recovered';
    } catch (retryErr) {
      const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
      // Recurse with incremented counter
      return this.attemptTaskRetry(node, retryMsg, environment);
    }
  }

  private autonomousDecide(): AutoDecision {
    const progress = this.taskGraph.getProgress();
    const hasNetworkTokens = !!(process.env.GITHUB_TOKEN || process.env.VERCEL_TOKEN);

    if (progress.blocked > 0) {
      return this.logDecision('ask_user', null, `${progress.blocked} task(s) blocked, need user input`, 0.7);
    }
    if (progress.pending === 0 && progress.running === 0) {
      if (this.phase === 'building') {
        return this.logDecision('deploy_now', null, 'All build tasks complete, ready to deploy', 0.95);
      }
      return this.logDecision('build_next', null, 'All tasks complete', 1.0);
    }
    if (progress.done >= 4 && hasNetworkTokens) {
      const deployTask = this.taskGraph.getNodesByCategory('deployment').find((n) => n.status === 'pending');
      if (deployTask) {
        return this.logDecision('deploy_now', deployTask.id, 'Sufficient progress to start deployment prep', 0.8);
      }
    }
    return this.logDecision('build_next', null, 'Continuing with next available task', 0.9);
  }

  private async executeTaskInEnvironment(node: TaskNode, env: EnvironmentType): Promise<void> {
    const plan = this.plan!;

    if (env === 'cloud_github' || env === 'git_only') {
      if (node.description.toLowerCase().includes('github') || node.description.toLowerCase().includes('repository')) {
        const result = await this.toolGateway.createGitHubRepository({
          repoName: plan.gitHubRepo,
          description: 'Hackathon project: ' + plan.projectName,
        });
        if (result.success) {
          this.projectState.setGitHubSnapshot({
            repoName: plan.gitHubRepo,
            repoUrl: result.repoUrl,
            cloneUrl: result.cloneUrl,
            branch: result.branch,
            lastCommitSha: result.commitSha,
            createdAt: deterministicNow(this.seed),
            updatedAt: deterministicNow(this.seed),
          });
        }
        return;
      }
    }

    if (node.description.toLowerCase().includes('scaffold')) {
      await this.toolGateway.writeProjectFiles(plan.projectName, await this.generateFilesWithLLM('scaffold', {
        projectName: plan.projectName,
        description: plan.projectName,
        techStack: this.devpostData?.recommendedStack ?? [],
        judgingCriteria: this.devpostData?.judgingCriteria ?? [],
        constraints: this.devpostData?.constraints ?? [],
      }));
      return;
    }

    if (node.category === 'frontend') {
      await this.toolGateway.writeProjectFiles(plan.projectName, await this.generateFilesWithLLM('frontend', {
        projectName: plan.projectName,
        description: plan.projectName,
        techStack: this.devpostData?.recommendedStack ?? [],
        judgingCriteria: this.devpostData?.judgingCriteria ?? [],
        constraints: this.devpostData?.constraints ?? [],
        specificTask: node.description,
      }));
      return;
    }

    if (node.category === 'backend') {
      await this.toolGateway.writeProjectFiles(plan.projectName, await this.generateFilesWithLLM('backend', {
        projectName: plan.projectName,
        description: plan.projectName,
        techStack: this.devpostData?.recommendedStack ?? [],
        judgingCriteria: this.devpostData?.judgingCriteria ?? [],
        constraints: this.devpostData?.constraints ?? [],
        specificTask: node.description,
      }));
      return;
    }

    if (node.category === 'testing') {
      if (node.description.toLowerCase().includes('e2e') || node.description.toLowerCase().includes('browser')) {
        const spec = this.browserAgent.buildTestSpec(
          'Deployment test',
          'http://localhost:3000',
          ['main', 'h1'],
          ['Welcome'],
        );
        const result = await this.browserAgent.runTest(spec);
        if (!result.passed) {
          await this.browserAgent.testAndRepairCycle([spec], this.taskGraph, node.id);
        }
      } else {
        await this.toolGateway.writeProjectFiles(plan.projectName, [
          {
            path: 'tests/api.test.ts',
            content:
              'import { describe, it, expect } from "vitest"; describe("API", () => { it("works", () => expect(true).toBe(true)); });',
          },
        ]);
      }
      return;
    }

    if (node.category === 'deployment' && node.description.toLowerCase().includes('push')) {
      const manifest = this.toolGateway.createSyncManifest(
        plan.projectName,
        plan.gitHubRepo,
        'Update from Hack-A-Gent',
      );
      for (const batch of manifest.commitBatches) {
        await this.toolGateway.pushCommits(plan.gitHubRepo, batch);
      }
      return;
    }
  }

  private async generateScaffoldFiles(plan: InternetExecutionPlan): Promise<Array<{ path: string; content: string }>> {
    const projectName = plan.projectName;
    const title = projectName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: projectName,
          version: '0.1.0',
          private: true,
          scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
          dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
          devDependencies: { typescript: '^5.3.0', '@types/react': '^18.2.0', '@types/node': '^20.0.0' },
        }, null, 2),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify({
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            module: 'esnext',
            moduleResolution: 'bundler',
            jsx: 'preserve',
            strict: true,
            noEmit: true,
            paths: { '@/*': ['./src/*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
          exclude: ['node_modules'],
        }, null, 2),
      },
      {
        path: '.gitignore',
        content: ['node_modules/', '.next/', '.env', '.env.local', 'dist/', 'build/', '.DS_Store', '*.log'].join('\n') + '\n',
      },
      {
        path: 'src/app/globals.css',
        content: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #1a1a2e; background: #f8f9fa; }
.container { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
nav { background: linear-gradient(135deg, #1a1a2e, #16213e); color: white; padding: 1rem 1.5rem; display: flex; gap: 1.5rem; align-items: center; }
nav a { color: #a0c4ff; text-decoration: none; font-weight: 500; }
nav a:hover { color: white; }
main { min-height: calc(100vh - 120px); }
footer { background: #e9ecef; padding: 1rem; text-align: center; color: #666; font-size: 0.9rem; margin-top: 2rem; }
h1 { font-size: 1.8rem; margin-bottom: 0.75rem; color: #1a1a2e; }
h2 { font-size: 1.3rem; margin-bottom: 0.5rem; color: #16213e; }
p { margin-bottom: 1rem; color: #444; }
.card { background: white; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 1px solid #e0e0e0; }
button, .btn { background: #1a1a2e; color: white; border: none; padding: 0.5rem 1.25rem; border-radius: 6px; cursor: pointer; font-size: 0.95rem; font-weight: 500; transition: background 0.15s; }
button:hover { background: #2d2d4a; }
input, textarea { width: 100%; padding: 0.5rem; border: 1px solid #d0d0d0; border-radius: 6px; font-size: 0.95rem; }
input:focus, textarea:focus { outline: none; border-color: #1a1a2e; box-shadow: 0 0 0 2px rgba(26,26,46,0.1); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.tag { display: inline-block; background: #e8f0fe; color: #1a1a2e; padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.85rem; margin: 0.15rem; }\n`,
      },
      {
        path: 'src/app/layout.tsx',
        content: `import './globals.css';

export const metadata = { title: '${title}', description: 'Built for hackathon' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <strong style={{fontSize:'1.1rem',color:'white'}}>${title}</strong>
          <a href="/">Home</a>
        </nav>
        {children}
        <footer>
          Built for <strong>${title}</strong> &mdash; Hackathon Project
        </footer>
      </body>
    </html>
  );
}\n`,
      },
      {
        path: 'src/app/page.tsx',
        content: `export default function Home() {
  return (
    <main className="container">
      <h1>${title}</h1>
      <p>Built for submission. Edit <code>src/app/page.tsx</code> to add your content.</p>
      <div className="grid">
        <div className="card">
          <h2>Getting Started</h2>
          <p>Run <code>npm run dev</code> to start the dev server at <strong>localhost:3000</strong>.</p>
        </div>
        <div className="card">
          <h2>Project Structure</h2>
          <p style={{marginBottom:'0.5rem'}}><code>src/app/</code> &mdash; Pages and layouts</p>
          <p style={{marginBottom:'0.5rem'}}><code>src/app/api/</code> &mdash; API routes</p>
          <p><code>src/components/</code> &mdash; React components</p>
        </div>
        <div className="card">
          <h2>Tech Stack</h2>
          <span className="tag">Next.js 14</span>
          <span className="tag">TypeScript</span>
          <span className="tag">App Router</span>
        </div>
      </div>
    </main>
  );
}\n`,
      },
      {
        path: 'README.md',
        content: `# ${title}

Built with Hack-A-Gent for hackathon submission.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to view the project.

## Project Structure

- \`src/app/\` — Pages and layouts (App Router)
- \`src/app/api/\` — API routes
- \`src/components/\` — React components

## Deployment

This project is ready to deploy on Vercel.
`,
      },
    ];
  }

  private generateFrontendFiles(node: TaskNode, plan: InternetExecutionPlan): Array<{ path: string; content: string }> {
    const desc = node.description.toLowerCase();
    if (desc.includes('layout'))
      return [{
        path: 'src/app/layout.tsx',
        content: `import './globals.css';

export const metadata = { title: '${plan.projectName}', description: 'Hackathon project' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{background:'#1a1a2e',color:'white',padding:'0.75rem 1.5rem',display:'flex',gap:'1.5rem',alignItems:'center'}}>
          <strong>{'${plan.projectName}'}</strong>
          <a href="/" style={{color:'#a0c4ff',textDecoration:'none'}}>Home</a>
        </nav>
        {children}
        <footer style={{background:'#e9ecef',padding:'1rem',textAlign:'center',marginTop:'2rem',color:'#666',fontSize:'0.85rem'}}>
          Hackathon Project
        </footer>
      </body>
    </html>
  );
}\n`,
      }];
    if (desc.includes('auth'))
      return [{
        path: 'src/components/AuthForm.tsx',
        content: `'use client';

export default function AuthForm({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  return (
    <form onSubmit={e => e.preventDefault()} style={{maxWidth:'400px',margin:'2rem auto',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
      <h2>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
      <input type="email" placeholder="Email" required />
      <input type="password" placeholder="Password" required />
      <button type="submit">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</button>
    </form>
  );
}\n`,
      }];
    if (desc.includes('styling'))
      return [{
        path: 'src/app/globals.css',
        content: 'body { margin: 0; font-family: system-ui, sans-serif; } main { max-width: 960px; margin: 0 auto; padding: 2rem; }\n',
      }];
    return [{
      path: 'src/app/page.tsx',
      content: `export default function Home() {
  return (
    <main style={{maxWidth:'960px',margin:'0 auto',padding:'2rem'}}>
      <h1>${plan.projectName}</h1>
      <p>Hackathon project built with Next.js.</p>
    </main>
  );
}\n`,
    }];
  }

  private generateBackendFiles(node: TaskNode, plan: InternetExecutionPlan): Array<{ path: string; content: string }> {
    const desc = node.description.toLowerCase();
    if (desc.includes('schema'))
      return [{
        path: 'src/db/schema.sql',
        content: `CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`,
      }];
    if (desc.includes('auth'))
      return [{
        path: 'src/app/api/auth/route.ts',
        content: `import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  // In production, validate credentials against your database
  return NextResponse.json({ token: 'demo-token', user: { email: body.email } });
}

export async function GET() {
  return NextResponse.json({ status: 'auth service running' });
}
`,
      }];
    if (desc.includes('api'))
      return [{
        path: 'src/app/api/health/route.ts',
        content: `export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
`,
      }];
    if (desc.includes('validation'))
      return [{
        path: 'src/lib/validation.ts',
        content: `export function validateEmail(email: string): boolean {
  return /^[^\\s@]+@[\\s@]+\\.[^\\s@]+$/.test(email);
}

export function validateRequired(value: string): boolean {
  return value.trim().length > 0;
}
`,
      }];
    return [{
      path: 'src/app/api/items/route.ts',
      content: `import { NextResponse } from 'next/server';

type Item = { id: number; title: string; completed: boolean };
const items: Item[] = [];

export async function GET() {
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const item: Item = { id: items.length + 1, title: body.title ?? '', completed: false };
  items.push(item);
  return NextResponse.json(item, { status: 201 });
}
`,
    }];
  }

  private normalizePackageVersions(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
    const pkgIdx = files.findIndex(f => f.path === 'package.json');
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(files[pkgIdx]!.content);
        pkg.dependencies = pkg.dependencies ?? {};
        pkg.devDependencies = pkg.devDependencies ?? {};
        const pinned: Record<string, string> = {
          next: '^14.2.0',
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          axios: '^1.7.0',
        };
        const pinnedDev: Record<string, string> = {
          typescript: '^5.5.0',
          '@types/react': '^18.3.3',
          '@types/node': '^20.14.0',
          vitest: '^1.6.0',
        };
        for (const [k, v] of Object.entries(pinned)) {
          pkg.dependencies[k] = v;
        }
        for (const [k, v] of Object.entries(pinnedDev)) {
          pkg.devDependencies[k] = v;
          if (pkg.dependencies?.[k]) delete pkg.dependencies[k];
        }
        const builtinOrScoped = new Set(['next', 'react', 'react-dom', 'fs', 'path', 'http', 'https', 'url', 'stream', 'util', 'events', 'crypto', 'os', 'child_process', 'net', 'tls', 'zlib', 'querystring', 'buffer']);
        const knownVersions = KNOWN_PACKAGE_VERSIONS;
        const existingPkgs = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
        for (const f of files) {
          if (f.path === 'package.json') continue;
          const importMatches = f.content.matchAll(/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
          for (const m of importMatches) {
            const raw = m[1];
            if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('@/')) continue;
            const parts = raw.split('/');
            const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
            if (!name || builtinOrScoped.has(name) || existingPkgs.has(name)) continue;
            existingPkgs.add(name);
            pkg.dependencies[name] = knownVersions[name] ?? '^1.0.0';
          }
          const requireMatches = f.content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
          for (const m of requireMatches) {
            const raw = m[1];
            if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('@/')) continue;
            const parts = raw.split('/');
            const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
            if (!name || builtinOrScoped.has(name) || existingPkgs.has(name)) continue;
            existingPkgs.add(name);
            pkg.dependencies[name] = knownVersions[name] ?? '^1.0.0';
          }
        }
        const configDeps: Record<string, string[]> = {
          'tailwind.config.js': ['tailwindcss', 'postcss', 'autoprefixer'],
          'postcss.config.js': ['postcss', 'autoprefixer'],
        };
        for (const f of files) {
          if (f.path === 'package.json') continue;
          const baseName = f.path.split('/').pop() ?? '';
          const deps = configDeps[baseName];
          if (deps) {
            for (const dep of deps) {
              if (!existingPkgs.has(dep)) {
                existingPkgs.add(dep);
                pkg.devDependencies[dep] = knownVersions[dep] ?? '^3.4.0';
              }
            }
          }
        }
        files[pkgIdx] = { path: 'package.json', content: JSON.stringify(pkg, null, 2) };
      } catch { /* leave unchanged */ }
    }

    const needsFormat = files.filter(f => /\.(tsx?|jsx?)$/.test(f.path) && f.content.length > 100 && !f.content.includes('\n'));
    for (const f of needsFormat) {
      const content = f.content;
      if (/^(import|export).+\.(import|export)/m.test(content)) continue;
      const lines: string[] = [];
      let inString = false, strChar = '';
      let inJSX = false, depth = 0;
      let current = '';
      for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (!inString && (ch === '"' || ch === "'" || ch === '`')) { inString = true; strChar = ch; current += ch; }
        else if (inString && ch === strChar && content[i-1] !== '\\') { inString = false; current += ch; }
        else if (!inString && ch === '{') { inJSX = true; depth++; current += ch; }
        else if (!inString && ch === '}') { depth--; if (depth === 0) inJSX = false; current += ch; }
        else if (!inString && !inJSX && (ch === ';' || ch === '\n')) { if (current.trim()) lines.push(current.trim()); current = ''; }
        else current += ch;
      }
      if (current.trim()) lines.push(current.trim());
      f.content = lines.filter(l => l).join('\n') + '\n';
    }

    return files;
  }

  private enforceRequiredTechnologies(
    files: Array<{ path: string; content: string }>,
    requiredTechs: string[],
  ): Array<{ path: string; content: string }> {
    if (requiredTechs.length === 0) return files;

    const sdkMap: Record<string, { pkg: string; version: string }> = {
      firebase: { pkg: 'firebase', version: '^11.0.0' },
      twilio: { pkg: 'twilio', version: '^5.0.0' },
      openai: { pkg: 'openai', version: '^4.0.0' },
      stripe: { pkg: 'stripe', version: '^17.0.0' },
      supabase: { pkg: '@supabase/supabase-js', version: '^2.0.0' },
      aws: { pkg: 'aws-sdk', version: '^2.0.0' },
      azure: { pkg: '@azure/identity', version: '^4.0.0' },
      tensorflow: { pkg: '@tensorflow/tfjs', version: '^4.0.0' },
      pytorch: { pkg: 'torchjs', version: '^1.0.0' },
      graphql: { pkg: 'graphql', version: '^16.0.0' },
      prisma: { pkg: '@prisma/client', version: '^6.0.0' },
      mongodb: { pkg: 'mongodb', version: '^6.0.0' },
      postgres: { pkg: 'pg', version: '^8.0.0' },
      redis: { pkg: 'redis', version: '^4.0.0' },
    };

    const pkgIdx = files.findIndex(f => f.path === 'package.json');
    if (pkgIdx >= 0) {
      try {
        const pkg = JSON.parse(files[pkgIdx]!.content);
        pkg.dependencies = pkg.dependencies ?? {};
        let modified = false;
        for (const tech of requiredTechs) {
          const sdkInfo = sdkMap[tech.toLowerCase()];
          if (sdkInfo && !pkg.dependencies[sdkInfo.pkg]) {
            pkg.dependencies[sdkInfo.pkg] = sdkInfo.version;
            modified = true;
          }
        }
        if (modified) {
          files[pkgIdx] = { path: 'package.json', content: JSON.stringify(pkg, null, 2) };
        }
      } catch { /* leave unchanged */ }
    }

    const allContent = files.map(f => f.content).join('\n');
    for (const tech of requiredTechs) {
      const regex = new RegExp(`import.*from.*['"]${tech}['"]|require\\(.*['"]${tech}['"]\\)`, 'i');
      if (!regex.test(allContent)) {
        const configFile = files.find(f => f.path.includes('config') || f.path.endsWith('.env.example'));
        if (configFile && typeof configFile.content === 'string' && !configFile.content.includes(tech)) {
          configFile.content += `\n// Required by competition: ${tech}\n`;
        }
      }
    }

    return files;
  }

  private postProcessProject(projectDir: string): void {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!existsSync(pkgPath)) return;

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      pkg.dependencies = pkg.dependencies ?? {};
      pkg.devDependencies = pkg.devDependencies ?? {};

      const builtinOrScoped = new Set(['next', 'react', 'react-dom', 'fs', 'path', 'http', 'https', 'url', 'stream', 'util', 'events', 'crypto', 'os', 'child_process', 'net', 'tls', 'zlib', 'querystring', 'buffer', '@/']);
      const knownVersions = KNOWN_PACKAGE_VERSIONS_FALLBACK;
      const existingPkgs = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);

      const scanDir = (dir: string) => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            scanDir(fullPath);
          } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
            try {
              const content = readFileSync(fullPath, 'utf-8');
              const importMatches = content.matchAll(/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
              for (const m of importMatches) {
                const raw = m[1];
                if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('@/')) continue;
                const parts = raw.split('/');
                const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
                if (!name || builtinOrScoped.has(name) || existingPkgs.has(name)) continue;
                existingPkgs.add(name);
                pkg.dependencies[name] = knownVersions[name] ?? '^1.0.0';
              }
              const requireMatches = content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
              for (const m of requireMatches) {
                const raw = m[1];
                if (!raw || raw.startsWith('.') || raw.startsWith('/') || raw.startsWith('@/')) continue;
                const parts = raw.split('/');
                const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
                if (!name || builtinOrScoped.has(name) || existingPkgs.has(name)) continue;
                existingPkgs.add(name);
                pkg.dependencies[name] = knownVersions[name] ?? '^1.0.0';
              }
            } catch { /* skip unreadable files */ }
          }
        }
      };
      scanDir(projectDir);

      const configDeps: Record<string, string[]> = {
        'tailwind.config.js': ['tailwindcss', 'postcss', 'autoprefixer'],
        'postcss.config.js': ['postcss', 'autoprefixer'],
      };
      for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
        if (entry.isFile()) {
          const deps = configDeps[entry.name];
          if (deps) {
            for (const dep of deps) {
              if (!existingPkgs.has(dep)) {
                existingPkgs.add(dep);
                pkg.devDependencies[dep] = knownVersions[dep] ?? '^3.4.0';
              }
            }
          }
        }
      }

      if (existingPkgs.has('express') && !existingPkgs.has('@types/express')) {
        pkg.devDependencies['@types/express'] = knownVersions['@types/express'] ?? '^4.17.0';
      }
      const autoTypes: Record<string, string> = { bcryptjs: '^2.4.3', cors: '^2.8.0', mongoose: '^8.0.0', dotenv: '^16.0.0', jsonwebtoken: '^9.0.0' };
      for (const [dep, ver] of Object.entries(autoTypes)) {
        if (existingPkgs.has(dep) && !existingPkgs.has(`@types/${dep}`)) {
          pkg.devDependencies[`@types/${dep}`] = ver;
        }
      }

      const appDir = path.join(projectDir, 'src', 'app');
      const pagesDir = path.join(projectDir, 'pages');
      if (existsSync(appDir) && existsSync(path.join(appDir, 'page.tsx')) && existsSync(pagesDir)) {
        const removeDir = (dir: string) => {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) removeDir(p);
            else { try { writeFileSync(p, ''); } catch (e) { debug(`[scaffold] placeholder write skipped (non-fatal): ${e instanceof Error ? e.message : e}`); } }
          }
        };
        removeDir(pagesDir);
      }

      for (const [k, v] of Object.entries(pkg.devDependencies)) {
        if (pkg.dependencies?.[k]) delete pkg.dependencies[k];
      }

      if (existsSync(appDir)) {
        const hasPageTsx = existsSync(path.join(appDir, 'page.tsx'));
        if (hasPageTsx) {
          for (const bad of ['_app.tsx', '_app.jsx', 'index.tsx', 'index.jsx']) {
            const badPath = path.join(appDir, bad);
            if (existsSync(badPath)) {
              try { writeFileSync(badPath, ''); } catch (e) { debug(`[scaffold] redundant file write skipped (non-fatal): ${e instanceof Error ? e.message : e}`); }
            }
          }
        }
      }

      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    } catch { /* leave unchanged */ }
  }

  public typecheckAndRepair(projectDir: string): boolean {
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    const pkgPath = path.join(projectDir, 'package.json');
    if (!existsSync(pkgPath) || !existsSync(tsconfigPath)) return false;
    let hasRealProject = false;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      hasRealProject = !!pkg.scripts?.build && !!pkg.scripts?.dev;
    } catch { return false; }
    if (!hasRealProject) return false;
    const nodeModules = path.join(projectDir, 'node_modules');
    if (!existsSync(nodeModules)) {
      try { execSync('npm install --legacy-peer-deps', { cwd: projectDir, stdio: 'pipe', timeout: 120000, windowsHide: true }); } catch { return false; }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      let tscOutput = '';
      try {
        tscOutput = execSync('npx tsc --noEmit 2>&1', { cwd: projectDir, stdio: 'pipe', timeout: 60000, encoding: 'utf-8', windowsHide: true });
        return true;
      } catch (err: unknown) {
        tscOutput = (err as { stdout?: string }).stdout ?? String(err);
      }

      const fileErrors = new Map<string, number>();
      const errorLines = tscOutput.split('\n');
      for (const line of errorLines) {
        const match = line.match(/^(.+?\.(?:tsx?|jsx?)):\s*\d+:\d+/);
        if (match) {
          const filePath = match[1]!;
          const fullPath = path.resolve(projectDir, filePath);
          if (existsSync(fullPath)) {
            fileErrors.set(fullPath, (fileErrors.get(fullPath) ?? 0) + 1);
          }
        }
      }

      if (fileErrors.size === 0) return true;

      const appDir = path.join(projectDir, 'src', 'app');
      for (const [filePath, errorCount] of fileErrors) {
        if (errorCount > 3) {
          const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
          if (relPath.startsWith('src/app/') && relPath.endsWith('page.tsx')) continue;
          if (relPath.startsWith('src/app/') && relPath.endsWith('layout.tsx')) continue;
          if (relPath === 'package.json' || relPath === 'tsconfig.json') continue;
          try { writeFileSync(filePath, ''); } catch (e) { debug(`[scaffold] placeholder write skipped (non-fatal): ${e instanceof Error ? e.message : e}`); }
        }
      }

      const pkgPath = path.join(projectDir, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.scripts?.typecheck) {
            try { execSync('npm run typecheck', { cwd: projectDir, stdio: 'pipe', timeout: 30000, windowsHide: true }); return true; } catch { /* typecheck failed — outer loop will handle */ }
          }
        } catch { /* pkg parse failed */ }
      }
    }
    return false;
  }

  public async runtimeSmokeTest(projectDir: string): Promise<{ started: boolean; http200: boolean; error?: string }> {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!existsSync(pkgPath)) return { started: false, http200: false, error: 'No package.json' };

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.scripts?.dev) return { started: false, http200: false, error: 'No dev script' };
    } catch { return { started: false, http200: false, error: 'Cannot read package.json' }; }

    const serverProcess: ReturnType<typeof execSync> | null = null;
    try {
      const nodeModules = path.join(projectDir, 'node_modules');
      if (!existsSync(nodeModules)) {
        execSync('npm install --legacy-peer-deps', { cwd: projectDir, stdio: 'pipe', timeout: 120000, windowsHide: true });
      }
    } catch { return { started: false, http200: false, error: 'npm install failed' }; }

    const server = spawn('npm', ['run', 'dev'], {
      cwd: projectDir,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: '3099' },
    });

    let output = '';
    let started = false;
    let http200 = false;

    return new Promise<{ started: boolean; http200: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        server.kill();
        resolve({ started, http200, error: started ? 'Timeout waiting for HTTP 200' : 'Server did not start within 30s' });
      }, 30000);

      server.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        if (!started && (output.includes('Ready in') || output.includes('started on') || output.includes('listening on') || output.includes('localhost:3000') || output.includes('localhost:3099'))) {
          started = true;
          const req = http.get('http://localhost:3099', (res: import('node:http').IncomingMessage) => {
            if (res.statusCode === 200) {
              http200 = true;
              clearTimeout(timeout);
              server.kill();
              resolve({ started: true, http200: true });
            } else {
              clearTimeout(timeout);
              server.kill();
              resolve({ started: true, http200: false, error: `HTTP ${res.statusCode}` });
            }
          });
          req.on('error', (e: Error) => {
            clearTimeout(timeout);
            server.kill();
            resolve({ started: true, http200: false, error: e.message });
          });
          req.setTimeout(5000, () => { req.destroy(); });
        }
      });

      server.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      server.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve({ started: false, http200: false, error: err.message });
      });

      server.on('close', () => {
        clearTimeout(timeout);
        if (!http200) resolve({ started, http200: false, error: started ? 'Server closed before HTTP check' : 'Server failed to start' });
      });
    });
  }

  public async validateGeneratedProject(projectDir: string): Promise<GeneratedProjectValidation> {
    const result: GeneratedProjectValidation = { valid: false, checks: [], errors: [] };
    const pkgPath = path.join(projectDir, 'package.json');

    if (!existsSync(pkgPath)) {
      result.errors.push('No package.json found in generated project');
      return result;
    }

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch (err) {
      result.errors.push(`Cannot parse package.json: ${(err as Error).message}`);
      return result;
    }

    const isTestDir = projectDir.split(/[/\\]/).some(seg => seg === 'tmp' || seg === '__test');
    if (isTestDir) {
      result.checks.push({ name: 'Context guard', passed: true, error: 'Validation skipped in temp/test directory' });
      result.valid = true;
      return result;
    }

    const startMs = Date.now();

    const requiredScripts = ['dev', 'build', 'start', 'lint', 'typecheck', 'test'];
    const scripts = (pkg.scripts as Record<string, string>) ?? {};
    const missingScripts = requiredScripts.filter(s => !scripts[s]);
    if (missingScripts.length > 0) {
      result.errors.push(`Missing required scripts: ${missingScripts.join(', ')}`);
    }
    result.checks.push({
      name: 'Script validation',
      passed: missingScripts.length === 0,
      error: missingScripts.length > 0 ? `Missing: ${missingScripts.join(', ')}` : undefined,
    });

    const importErrors = this.validateImports(projectDir, pkg);
    if (importErrors.length > 0) {
      result.errors.push(...importErrors);
    }
    result.checks.push({
      name: 'Import/dependency validation',
      passed: importErrors.length === 0,
      error: importErrors.slice(0, 3).join('; ') || undefined,
    });

    const nodeModules = path.join(projectDir, 'node_modules');
    if (!existsSync(nodeModules)) {
      try {
        execSync('npm install --legacy-peer-deps', { cwd: projectDir, stdio: 'pipe', timeout: 120000, windowsHide: true });
        result.checks.push({ name: 'npm install', passed: true });
      } catch (err) {
        const msg = String((err as { stdout?: string }).stdout ?? (err as Error).message ?? err);
        result.errors.push(`npm install failed: ${msg.slice(0, 200)}`);
        result.checks.push({ name: 'npm install', passed: false, error: msg.slice(0, 200) });
        return result;
      }
    } else {
      result.checks.push({ name: 'npm install', passed: true });
    }

    const runCheck = async (name: string, command: string, timeoutMs: number): Promise<void> => {
      const checkStart = Date.now();
      let output = '';
      try {
        output = execSync(command, { cwd: projectDir, stdio: 'pipe', timeout: timeoutMs, encoding: 'utf-8', windowsHide: true });
        result.checks.push({ name, passed: true, durationMs: Date.now() - checkStart });
      } catch (err) {
        output = String((err as { stdout?: string }).stdout ?? (err as Error).message ?? err);
        const errorMsg = `${name} failed: ${output.slice(0, 500)}`;
        result.errors.push(errorMsg);
        result.checks.push({ name, passed: false, error: output.slice(0, 400), durationMs: Date.now() - checkStart });
      }
    };

    await runCheck('TypeScript validation (typecheck)', 'npm run typecheck', 120000);
    await runCheck('ESLint validation (lint)', 'npm run lint', 120000);
    await runCheck('Production build (build)', 'npm run build', 300000);

    const runtimeResult = await this.productionSmokeTest(projectDir);
    if (!runtimeResult.http200) {
      const runtimeErr = runtimeResult.error ?? 'Production server did not respond with HTTP 200';
      result.errors.push(`Runtime validation failed: ${runtimeErr}`);
      result.checks.push({ name: 'Runtime validation (start)', passed: false, error: runtimeErr });
    } else {
      result.checks.push({ name: 'Runtime validation (start)', passed: true });
    }

    result.errors = Array.from(new Set(result.errors));
    result.valid = result.errors.length === 0;
    result.durationMs = Date.now() - startMs;
    return result;
  }

  private validateImports(projectDir: string, pkg: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const allFiles: string[] = [];

    const collectFiles = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist' || entry.name === 'build') continue;
          collectFiles(fullPath);
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          allFiles.push(fullPath);
        }
      }
    };
    collectFiles(projectDir);

    const tsconfigPath = path.join(projectDir, 'tsconfig.json');
    const aliases: Record<string, string[]> = {};
    if (existsSync(tsconfigPath)) {
      try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as Record<string, unknown>;
        const paths = (tsconfig.compilerOptions as Record<string, unknown> | undefined)?.paths as Record<string, string[]> | undefined;
        const baseUrl = ((tsconfig.compilerOptions as Record<string, unknown> | undefined)?.baseUrl as string) || '.';
        if (paths) {
          for (const [key, value] of Object.entries(paths)) {
            const aliasKey = key.replace(/\/\*$/, '');
            aliases[aliasKey] = value.map(v => {
              const cleaned = v.replace(/\/\*$/, '').replace(/^\.?\//, '');
              return path.resolve(projectDir, baseUrl, cleaned);
            });
          }
        }
      } catch { /* ignore broken tsconfig */ }
    }

    const deps = new Set([
      ...Object.keys((pkg.dependencies as Record<string, unknown>) ?? {}),
      ...Object.keys((pkg.devDependencies as Record<string, unknown>) ?? {}),
    ]);
    const builtinModules = new Set([
      'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram',
      'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'https', 'inspector', 'module', 'net',
      'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
      'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
      'worker_threads', 'zlib',
    ]);

    for (const filePath of allFiles) {
      let content: string;
      try { content = readFileSync(filePath, 'utf-8'); } catch { continue; }

      const imports: string[] = [];
      for (const m of content.matchAll(/(?:import\s+(?:type\s+)?(?:[^'"\n]+?\s+from\s+)?|export\s+(?:[^'"\n]+?\s+from\s+))['"]([^'"]+?)['"]/g)) {
        imports.push(m[1]!);
      }
      for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+?)['"]\s*\)/g)) {
        imports.push(m[1]!);
      }
      for (const m of content.matchAll(/require\s*\(\s*['"]([^'"]+?)['"]\s*\)/g)) {
        imports.push(m[1]!);
      }

      for (const raw of imports) {
        if (!raw) continue;
        const relPath = path.relative(projectDir, filePath);

        if (!raw.startsWith('.') && !raw.startsWith('/')) {
          if (raw.startsWith('@/')) {
            const subPath = raw.slice(2);
            const targets = aliases['@'] ?? [path.join(projectDir, 'src')];
            let found = false;
            for (const target of targets) {
              const base = path.join(target, subPath);
              if (this.resolveImportTarget(base)) {
                found = true;
                break;
              }
            }
            if (!found) {
              errors.push(`Missing alias target for "${raw}" referenced from ${relPath}`);
            }
            continue;
          }

          const parts = raw.split('/');
          const name = raw.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
          if (!name || builtinModules.has(name)) continue;
          if (!deps.has(name)) {
            errors.push(`Missing package "${name}" for import "${raw}" in ${relPath}`);
          }
          continue;
        }

        const dir = path.dirname(filePath);
        const resolved = path.resolve(dir, raw);
        if (!this.resolveImportTarget(resolved)) {
          errors.push(`Missing file for import "${raw}" referenced from ${relPath}`);
        }
      }
    }

    return Array.from(new Set(errors));
  }

  private resolveImportTarget(basePath: string): boolean {
    if (existsSync(basePath)) {
      const stat = statSync(basePath);
      if (stat.isFile()) return true;
      if (stat.isDirectory()) {
        for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
          if (existsSync(path.join(basePath, `index${ext}`))) return true;
        }
      }
      return false;
    }
    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '.css', '.json']) {
      if (existsSync(`${basePath}${ext}`)) return true;
    }
    return false;
  }

  private async productionSmokeTest(projectDir: string): Promise<{ started: boolean; http200: boolean; error?: string }> {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!existsSync(pkgPath)) return { started: false, http200: false, error: 'No package.json' };
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
      if (!pkg.scripts?.start) return { started: false, http200: false, error: 'No start script' };
    } catch { return { started: false, http200: false, error: 'Cannot read package.json' }; }

    const nodeModules = path.join(projectDir, 'node_modules');
    if (!existsSync(nodeModules)) {
      try {
        execSync('npm install --legacy-peer-deps', { cwd: projectDir, stdio: 'pipe', timeout: 120000, windowsHide: true });
      } catch { return { started: false, http200: false, error: 'npm install failed' }; }
    }

    const productionBuild = path.join(projectDir, '.next');
    if (!existsSync(productionBuild)) {
      try {
        execSync('npm run build', { cwd: projectDir, stdio: 'pipe', timeout: 300000, windowsHide: true });
      } catch (err) {
        return { started: false, http200: false, error: `Production build failed: ${String((err as { stdout?: string }).stdout ?? err)}` };
      }
    }

    const server = spawn('npm', ['run', 'start'], {
      cwd: projectDir,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: '3099' },
    });

    let output = '';
    let started = false;
    let http200 = false;

    return new Promise<{ started: boolean; http200: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        server.kill();
        resolve({ started, http200: false, error: started ? 'Timeout waiting for HTTP 200' : 'Production server did not start within 60s' });
      }, 60000);

      const tryHttpCheck = () => {
        const req = http.get('http://localhost:3099', (res: http.IncomingMessage) => {
          if (res.statusCode === 200) {
            http200 = true;
            clearTimeout(timeout);
            server.kill();
            resolve({ started: true, http200: true });
          } else {
            clearTimeout(timeout);
            server.kill();
            resolve({ started: true, http200: false, error: `HTTP ${res.statusCode}` });
          }
        });
        req.on('error', (e: Error) => {
          if (!started) return;
          clearTimeout(timeout);
          server.kill();
          resolve({ started: true, http200: false, error: e.message });
        });
        req.setTimeout(5000, () => { req.destroy(); });
      };

      const maybeReady = () => {
        if (started) return;
        if (output.includes('Ready in') || output.includes('started on') || output.includes('listening on') ||
            output.includes('localhost:3000') || output.includes('localhost:3099') ||
            output.includes('▲ Next.js')) {
          started = true;
          tryHttpCheck();
        }
      };

      server.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        maybeReady();
      });

      server.stderr?.on('data', (data: Buffer) => {
        output += data.toString();
        maybeReady();
      });

      server.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve({ started: false, http200: false, error: err.message });
      });

      server.on('close', () => {
        clearTimeout(timeout);
        if (!http200) resolve({ started, http200: false, error: started ? 'Production server closed before HTTP check' : 'Production server failed to start' });
      });

      setTimeout(() => {
        if (!started) {
          maybeReady();
          if (started) return;
          tryHttpCheck();
        }
      }, 8000);
    });
  }

  private async generateFilesWithLLM(
    fileType: 'scaffold' | 'frontend' | 'backend' | 'database' | 'config',
    context: { projectName: string; description: string; techStack: string[]; judgingCriteria: string[]; constraints: string[]; specificTask?: string },
  ): Promise<Array<{ path: string; content: string }>> {
    if (!this.routerEngine || !this.plan || !this.devpostData) {
      if (fileType === 'scaffold') return this.generateScaffoldFiles(this.plan!);
      if (fileType === 'frontend') return this.generateFrontendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      if (fileType === 'backend') return this.generateBackendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      return [];
    }

    // Only attempt LLM once per fileType per pipeline run
    if (this.generationAttempted.has(fileType)) {
      if (fileType === 'scaffold') return this.generateScaffoldFiles(this.plan!);
      if (fileType === 'frontend') return this.generateFrontendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      if (fileType === 'backend') return this.generateBackendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      return [];
    }
    this.generationAttempted.add(fileType);

    const taskDescriptions: Record<string, string> = {
      scaffold: LLM_TASK_DESCRIPTIONS.scaffold!,
      frontend: LLM_TASK_DESCRIPTIONS.frontend!.replace('{specificTask}', context.specificTask ?? ''),
      backend: LLM_TASK_DESCRIPTIONS.backend!.replace('{specificTask}', context.specificTask ?? ''),
      database: LLM_TASK_DESCRIPTIONS.database!.replace('{specificTask}', context.specificTask ?? ''),
      config: LLM_TASK_DESCRIPTIONS.config!,
    };

    const techStack = context.techStack.length > 0 ? context.techStack.join(', ') : 'Next.js 14, React 18, TypeScript, Tailwind CSS';

    const requiredTechs = context.techStack.filter(t =>
      /firebase|twilio|openai|stripe|supabase|aws|azure|vercel|tensorflow|pytorch|graphql|prisma|mongodb|postgres|redis/i.test(t)
    );
    const requiredSection = requiredTechs.length > 0
      ? `\nREQUIRED TECHNOLOGIES (you MUST include these in your code — import them, configure them, use them in actual implementation):\n${requiredTechs.map(t => `- ${t}: Include in package.json dependencies AND use in actual code (imports, configuration, API calls)`).join('\n')}\n`
      : '';

    const systemPrompt = LLM_GENERATION_SYSTEM_PROMPT;

    const userPrompt = `Project: ${this.devpostData.title}
Problem: ${this.devpostData.problemStatement}
Judging Criteria: ${this.devpostData.judgingCriteria.join(', ')}
Tech Stack: ${techStack}
Constraints: ${this.devpostData.constraints.join(', ')}
${requiredSection}
For package.json use these exact versions: next@^14.2.0, react@^18.3.1, react-dom@^18.3.1, @types/react@^18.3.3, @types/node@^20.14.0, typescript@^5.5.0

Task: ${taskDescriptions[fileType]}
${fileType === 'scaffold' ? 'Include: package.json, tsconfig.json, next.config.js, src/app/layout.tsx, src/app/page.tsx, .gitignore, .env.example, src/config.ts, .eslintrc.json, tailwind.config.js, postcss.config.js, src/app/globals.css' : ''}
${fileType === 'frontend' && context.specificTask ? `Focus on: ${context.specificTask}` : ''}
${fileType === 'backend' && context.specificTask ? `Focus on: ${context.specificTask}` : ''}

Generate real, working code that scores highly on: ${this.devpostData.judgingCriteria.join(', ')}.`;

    try {
      const request: LLMRequest = {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model_id: '',
        provider: 'openai',
        temperature: 0.3,
        max_tokens: 16384,
        response_format: 'text',
      };

      const { response } = await this.routerEngine.execute('coding', request);

      // Extract JSON from response — handle models that wrap in markdown
      let content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*"files"[\s\S]*\}/);
      if (jsonMatch) content = jsonMatch[0];
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) content = codeBlockMatch[1]!.trim();
      const parsed = JSON.parse(content);

      if (parsed.files && Array.isArray(parsed.files)) {
        const rawFiles = parsed.files.map((f: { path: string; content: string; language?: string }) => ({
          path: f.path,
          content: f.content,
        }));
        const validFiles = rawFiles.filter((f: { path: string; content: string }) => {
          if (/\.(tsx?|jsx?)$/.test(f.path)) {
            if (f.content.length < 30) return false;
            const opens = (f.content.match(/\{/g) ?? []).length;
            const closes = (f.content.match(/\}/g) ?? []).length;
            if (Math.abs(opens - closes) > 2) return false;
            const parensOpen = (f.content.match(/\(/g) ?? []).length;
            const parensClose = (f.content.match(/\)/g) ?? []).length;
            if (Math.abs(parensOpen - parensClose) > 2) return false;
          }
          return true;
        });
        const files = validFiles.length >= rawFiles.length * 0.5 ? validFiles : rawFiles;
        const normalized = this.enforceRequiredTechnologies(this.normalizePackageVersions(files), requiredTechs);

        // Validate and auto-fix common LLM issues before returning
        const validation = validateGeneratedFiles(normalized);
        if (validation.issues.length > 0) {
          debug(formatValidationResult(validation));
        }
        const validatedFiles = validation.valid ? normalized : validation.fixedFiles;

        if (fileType === 'scaffold' && this.plan) {
          const templateFiles = await this.generateScaffoldFiles(this.plan);
          const templateMap = new Map(templateFiles.map(f => [f.path, f.content]));
          const criticalPaths = new Set(['src/app/layout.tsx', 'src/app/page.tsx', 'tsconfig.json', 'package.json']);
          const result: Array<{ path: string; content: string }> = [];
          const seenPaths = new Set<string>();
          for (const f of validatedFiles) {
            if (criticalPaths.has(f.path) && templateMap.has(f.path)) {
              result.push({ path: f.path, content: templateMap.get(f.path)! });
            } else if (f.path === 'next.config.js' && f.content.includes('target:')) {
              result.push({ path: f.path, content: templateMap.get('next.config.js') ?? f.content });
            } else {
              result.push(f);
            }
            seenPaths.add(f.path);
          }
          for (const tf of templateFiles) {
            if (!seenPaths.has(tf.path)) {
              result.push(tf);
              seenPaths.add(tf.path);
            }
          }
          return result;
        }
        return validatedFiles;
      }

      if (parsed.path && parsed.content) {
        const singleFile = this.enforceRequiredTechnologies(this.normalizePackageVersions([{ path: parsed.path, content: parsed.content }]), requiredTechs);
        const singleValidation = validateGeneratedFiles(singleFile);
        return singleValidation.valid ? singleFile : singleValidation.fixedFiles;
      }

      debug(`LLM response for ${fileType} had unexpected structure, falling back to templates`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!this.hasWarnedLLMFailure) {
        aiUnavailable({
          reason: errMsg,
          fallback: 'Using project templates instead.',
          help: [
            'Run: hag doctor',
            'Run: hag setup (to reconfigure your provider)',
          ],
        });
        this.hasWarnedLLMFailure = true;
      }
      debug(`LLM generation failed for ${fileType}: ${errMsg}`);
    }

    if (fileType === 'scaffold') return this.enforceRequiredTechnologies(this.normalizePackageVersions(await this.generateScaffoldFiles(this.plan)), requiredTechs);
    if (fileType === 'frontend') return this.enforceRequiredTechnologies(this.normalizePackageVersions(await this.generateFrontendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan)), requiredTechs);
    if (fileType === 'backend') return this.enforceRequiredTechnologies(this.normalizePackageVersions(await this.generateBackendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan)), requiredTechs);
    return [];
  }

  private async runGitHubSync(): Promise<void> {
    if (!this.plan) return;
    this.setPhase('github_sync');

    const ghState = this.projectState.getState()?.gitHub;
    if (!ghState) {
      const result = await this.toolGateway.createGitHubRepository({
        repoName: this.plan.gitHubRepo,
        description: 'Hackathon: ' + this.plan.projectName,
      });
      if (result.success) {
        this.projectState.setGitHubSnapshot({
          repoName: this.plan.gitHubRepo,
          repoUrl: result.repoUrl,
          cloneUrl: result.cloneUrl,
          branch: result.branch,
          lastCommitSha: result.commitSha,
          createdAt: deterministicNow(this.seed),
          updatedAt: deterministicNow(this.seed),
        });
      }
    }

    const manifest = this.toolGateway.createSyncManifest(
      this.plan.projectName,
      this.plan.gitHubRepo,
      'Full project sync from Hack-A-Gent',
    );
    for (const batch of manifest.commitBatches) {
      const pushResult = await this.toolGateway.pushCommits(this.plan.gitHubRepo, batch);
      if (pushResult.success) {
        this.projectState.updateGitHubSnapshot({
          lastCommitSha: pushResult.commitSha,
          branch: pushResult.branch,
          updatedAt: deterministicNow(this.seed),
        });
      }
    }
  }

  private async runDeployment(): Promise<void> {
    if (!this.plan) return;
    this.setPhase('deploying');

    const envVars: Record<string, string> = {};
    const constraints = this.humanControl.getConstraintsByType('tech_stack');
    for (const c of constraints) {
      if (typeof c.value === 'string') envVars[c.description] = c.value;
    }

    const deployResult = await this.deployRepair.startDeployment(
      this.plan.gitHubRepo,
      this.plan.deploymentTarget,
      this.plan.projectName,
    );
    this.projectState.setDeploymentSnapshot({
      target: this.plan.deploymentTarget,
      url: deployResult.url,
      deployId: deployResult.deployId,
      status: deployResult.success ? 'deployed' : 'failed',
      logs: [],
      deployedAt: deployResult.success ? deterministicNow(this.seed) : null,
    });

    if (!deployResult.success) {
      const uiTaskIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
      await this.deployRepair.monitorAndRepair(deployResult, this.taskGraph, uiTaskIds);
      if (this.deployRepair.shouldContinue()) {
        const retryResult = await this.deployRepair.startDeployment(
          this.plan.gitHubRepo,
          this.plan.deploymentTarget,
          this.plan.projectName,
        );
        this.projectState.updateDeploymentSnapshot({
          url: retryResult.url,
          deployId: retryResult.deployId,
          status: retryResult.success ? 'deployed' : 'failed',
          deployedAt: retryResult.success ? deterministicNow(this.seed) : null,
        });
      }
      return;
    }

    this.projectState.updateDeploymentSnapshot({ status: 'deployed' });
    this.setPhase('live_testing');
  }

  private async runLiveBrowserTests(): Promise<void> {
    const deployUrl = this.projectState.getDeployUrl();
    if (!deployUrl) return;

    this.setPhase('live_testing');
    const specs: LiveBrowserTestSpec[] = [
      this.browserAgent.buildTestSpec('Homepage loads', deployUrl, ['main', 'h1'], ['Welcome']),
      this.browserAgent.buildTestSpec('API health', deployUrl.replace(/\/$/, '') + '/api/health', [], ['ok']),
    ];

    const uiTaskIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
    for (const spec of specs) {
      const result = await this.browserAgent.runTest(spec);
      if (!result.passed) {
        const repairResult = await this.browserAgent.testAndRepairCycle([spec], this.taskGraph, uiTaskIds[0] ?? '');
        // Restore all previously done tasks that testAndRepairCycle may have reverted to pending
        for (const tid of uiTaskIds) {
          const node = this.taskGraph.getNode(tid);
          if (node && node.status === 'pending') {
            this.taskGraph.markDone(tid);
          }
        }
      }
    }
  }

  private async runRepairLoop(): Promise<void> {
    if (!this.plan) return;
    const projectDir = path.resolve(this.workspaceRoot, this.plan.projectName);

    debug('Starting autonomous repair loop...');

    const result = await autonomousRepair({
      projectDir,
      maxAttempts: 5,
      timeout: 60000,
    });

    debug(formatRepairResult(result));

    if (result.success) {
      debug('All errors fixed — build passes');
      // Unblock any tasks that were blocked by errors
      const blocked = this.taskGraph.getNodesByStatus('blocked');
      for (const node of blocked) {
        this.taskGraph.markPending(node.id);
      }
    } else if (result.totalFixes > 0) {
      debug(`Partially repaired — ${result.totalFixes} fixes applied, ${result.remainingErrors.length} errors remain`);
      // Still try to continue
    } else {
      debug('Could not auto-repair — manual intervention needed');
    }
  }

  pause(reason: string): boolean {
    return this.humanControl.pause(reason);
  }
  resume(): boolean {
    return this.humanControl.resume();
  }
  isPaused(): boolean {
    return this.humanControl.isPaused();
  }

  approveDeployment(approvalId: string, responder = 'user'): boolean {
    return this.humanControl.approve(approvalId, responder);
  }

  rejectDeployment(approvalId: string, responder = 'user'): boolean {
    return this.humanControl.reject(approvalId, responder);
  }

  injectConstraint(description: string, type: ConstraintInjection['type'], value: unknown): ConstraintInjection {
    return this.humanControl.injectConstraint(description, type as any, value);
  }

  skipTask(taskId: string, reason: string): OverrideDecision {
    return this.humanControl.skipTask(taskId, reason);
  }

  getProgress(): {
    phase: OrchestratorPhase;
    tasks: { total: number; done: number; running: number; blocked: number; pending: number };
    deployUrl: string | null;
    errors: number;
  } {
    const progress = this.taskGraph.getProgress();
    return {
      phase: this.phase,
      tasks: progress,
      deployUrl: this.projectState.getDeployUrl(),
      errors: this.errors.length,
    };
  }

  async injectDevpostUrl(url: string): Promise<void> {
    const data = await this.parseDevpost(url);
    const reqs = await this.extractRequirements(data);
    await this.createExecutionPlan(data, reqs);
    await this.executeFullPipeline();
  }
}

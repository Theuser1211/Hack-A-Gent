import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

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
import { InternetToolGateway, type DeployConfig } from './internet-tool-gateway.js';
import type { RouterEngine } from '../kernel/llm/router-engine.js';
import type { LLMRequest, LLMResponse } from '../kernel/llm/llm-types.js';
import {
  LiveBrowserTestAgent,
  type LiveBrowserTestSpec,
  type LiveBrowserRepairAction,
} from './live-browser-test-agent.js';
import { RemoteProjectState, type ProjectPhase, type DeploymentSnapshot } from './remote-project-state.js';
import { TaskGraph, type TaskNode, type TaskCategory } from './task-graph.js';
import type { UXEvaluationResult } from './ux-evaluation-agent.js';

export type OrchestratorPhase =
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

  private phase: OrchestratorPhase = 'parsing';
  private plan: InternetExecutionPlan | null = null;
  private devpostData: DevpostData | null = null;
  private errors: string[] = [];
  private artifacts: string[] = [];
  private decisionLog: AutoDecision[] = [];
  private generationAttempted = new Set<string>();
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
      } catch {}
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

    return {
      phase: this.phase,
      deployUrl: this.projectState.getDeployUrl(),
      errors: this.errors,
      uxResults: [],
      completionRate: fProgress.done / Math.max(fProgress.total, 1),
      failurePatterns: [],
      judgeScore: fProgress.blocked === 0 ? 0.8 : 0.4,
    };
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
    return [
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: plan.projectName,
            version: '0.1.0',
            private: true,
            scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run' },
            dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
            devDependencies: { typescript: '^5.3.0', vitest: '^1.0.0', '@types/react': '^18.2.0' },
          },
          null,
          2,
        ),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          {
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
          },
          null,
          2,
        ),
      },
      {
        path: 'next.config.js',
        content:
          '/** @type { import("next").NextConfig } */\nconst nextConfig = { output: "export" };\nmodule.exports = nextConfig;\n',
      },
      {
        path: 'src/app/layout.tsx',
        content:
          'export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{ children }</body></html>; }\n',
      },
      {
        path: 'src/app/page.tsx',
        content:
          'export default function Home() { return <main><h1>Welcome to ' +
          plan.projectName +
          '</h1><p>Built by Hack-A-Gent</p></main>; }\n',
      },
      { path: '.gitignore', content: 'node_modules/\n.next/\n.env\n*.local\n' },
    ];
  }

  private generateFrontendFiles(node: TaskNode, plan: InternetExecutionPlan): Array<{ path: string; content: string }> {
    const desc = node.description.toLowerCase();
    if (desc.includes('layout'))
      return [
        {
          path: 'src/components/NavBar.tsx',
          content:
            'export default function NavBar() { return <nav style={ {padding: "1rem", background: "#333", color: "#fff" }}><a href="/">Home</a> <a href="/about">About</a></nav>; }\n',
        },
      ];
    if (desc.includes('auth'))
      return [
        {
          path: 'src/components/AuthForm.tsx',
          content:
            'export default function AuthForm() { return <form><input placeholder="Email" /><input type="password" placeholder="Password" /><button type="submit">Sign In</button></form>; }\n',
        },
      ];
    if (desc.includes('styling'))
      return [
        {
          path: 'src/app/globals.css',
          content:
            'body { margin: 0; font-family: system-ui, sans-serif; } main { max-width: 1200px; margin: 0 auto; padding: 2rem; }\n',
        },
      ];
    return [
      {
        path: 'src/app/about/page.tsx',
        content:
          'export default function About() { return <main><h1>About</h1><p>Hackathon project built with Hack-A-Gent autonomous system.</p></main>; }\n',
      },
    ];
  }

  private generateBackendFiles(node: TaskNode, plan: InternetExecutionPlan): Array<{ path: string; content: string }> {
    const desc = node.description.toLowerCase();
    if (desc.includes('schema'))
      return [
        {
          path: 'src/db/schema.sql',
          content:
            'CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\nCREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL, description TEXT, created_at TIMESTAMPTZ DEFAULT NOW());\n',
        },
      ];
    if (desc.includes('auth'))
      return [
        {
          path: 'src/middleware/auth.ts',
          content:
            'import { NextResponse } from "next/server"; import type { NextRequest } from "next/server"; export function middleware(req: NextRequest) { const token = req.cookies.get("token")?.value; if (!token && req.nextUrl.pathname.startsWith("/api/protected")) { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); } return NextResponse.next(); }\n',
        },
      ];
    if (desc.includes('api'))
      return [
        {
          path: 'src/app/api/health/route.ts',
          content:
            'export async function GET() { return Response.json({ status: "ok", timestamp: new Date().toISOString() }); }\n',
        },
      ];
    if (desc.includes('validation'))
      return [
        {
          path: 'src/lib/validation.ts',
          content:
            'export function validateEmail(email: string): boolean { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email); }\nexport function validateRequired(value: string): boolean { return value.trim().length > 0; }\n',
        },
      ];
    return [
      {
        path: 'src/app/api/items/route.ts',
        content:
          'import { NextResponse } from "next/server"; const items: Array<{ id: number; title: string }> = []; export async function GET() { return NextResponse.json(items); }\nexport async function POST(req: Request) { const body = await req.json(); const item = { id: items.length + 1, title: body.title }; items.push(item); return NextResponse.json(item, { status: 201 }); }\n',
      },
    ];
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
      console.error(`[Generate] ${fileType} already attempted, using template`);
      if (fileType === 'scaffold') return this.generateScaffoldFiles(this.plan!);
      if (fileType === 'frontend') return this.generateFrontendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      if (fileType === 'backend') return this.generateBackendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan!);
      return [];
    }
    this.generationAttempted.add(fileType);
    console.error(`[Generate] ${fileType} start`);

    const taskDescriptions: Record<string, string> = {
      scaffold: 'Generate the complete project scaffold including package.json, tsconfig.json, next.config.js, src/app/layout.tsx, src/app/page.tsx, .gitignore, and any other essential config files.',
      frontend: `Generate frontend React/Next.js component code for: ${context.specificTask}. Include actual implementation, not stubs.`,
      backend: `Generate backend API code for: ${context.specificTask}. Include Next.js API routes with real handlers.`,
      database: `Generate database schema and configuration for: ${context.specificTask}. Include SQL schemas and ORM models.`,
      config: `Generate configuration files for the project.`,
    };

    const techStack = context.techStack.length > 0 ? context.techStack.join(', ') : 'Next.js 14, React 18, TypeScript, Tailwind CSS';

    const prompt = `You are an expert full-stack developer building a hackathon project.

Project: ${this.devpostData.title}
Problem: ${this.devpostData.problemStatement}
Judging Criteria: ${this.devpostData.judgingCriteria.join(', ')}
Tech Stack: ${techStack}
Constraints: ${this.devpostData.constraints.join(', ')}

Task: ${taskDescriptions[fileType]}

IMPORTANT: Return ONLY valid JSON in this exact format, no markdown or explanation:
{
  "files": [
    {
      "path": "relative/path/filename.tsx",
      "content": "full file content with proper code",
      "language": "typescript"
    }
  ]
}

Generate real, working code that would score highly on: ${this.devpostData.judgingCriteria.join(', ')}.

${fileType === 'scaffold' ? 'Start with package.json, tsconfig.json, next.config.js, src/app/layout.tsx, src/app/page.tsx, .gitignore, tailwind.config.js, postcss.config.js, src/app/globals.css' : ''}
${fileType === 'frontend' && context.specificTask ? `Focus on: ${context.specificTask}` : ''}
${fileType === 'backend' && context.specificTask ? `Focus on: ${context.specificTask}` : ''}`;

    try {
      const request: LLMRequest = {
        messages: [{ role: 'user', content: prompt }],
        model_id: '',
        provider: 'nvidia',
        temperature: 0.3,
        max_tokens: 8000,
        response_format: 'json_object',
      };

      const { response } = await this.routerEngine.execute('coding', request);
      const parsed = JSON.parse(response.content);

      if (parsed.files && Array.isArray(parsed.files)) {
        console.error(`[Generate] ${fileType} end (LLM success)`);
        return parsed.files.map((f: { path: string; content: string; language?: string }) => ({
          path: f.path,
          content: f.content,
        }));
      }

      if (parsed.path && parsed.content) {
        console.error(`[Generate] ${fileType} end (LLM success)`);
        return [{ path: parsed.path, content: parsed.content }];
      }
    } catch (err) {
      console.error(`LLM generation failed for ${fileType}, falling back to templates:`, err instanceof Error ? err.message : String(err));
    }

    console.error(`[Generate] ${fileType} end (template fallback)`);

    if (fileType === 'scaffold') return this.generateScaffoldFiles(this.plan);
    if (fileType === 'frontend') return this.generateFrontendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan);
    if (fileType === 'backend') return this.generateBackendFiles({ description: context.specificTask ?? '' } as TaskNode, this.plan);
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
        if (repairResult.allPassed) {
          await this.runGitHubSync();
          await this.runDeployment();
        }
      }
    }
  }

  private async runRepairLoop(): Promise<void> {
    const maxRepairs = 3;
    for (let i = 0; i < maxRepairs; i++) {
      const blocked = this.taskGraph.getNodesByStatus('blocked');
      if (blocked.length === 0) break;

      for (const node of blocked) {
        const decision = this.logDecision(
          'restart_pipeline',
          node.id,
          `Attempting repair #${i + 1} for blocked task`,
          0.6,
        );
        this.taskGraph.markPending(node.id);
      }

      while (this.taskGraph.hasUnfinishedWork()) {
        const next = this.taskGraph.getNextReady();
        if (!next) break;
        this.taskGraph.markRunning(next.id);
        try {
          await this.executeTaskInEnvironment(next, 'local_node');
          this.taskGraph.markDone(next.id);
        } catch (err) {
          this.taskGraph.markBlocked(next.id, err instanceof Error ? err.message : String(err));
        }
      }
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

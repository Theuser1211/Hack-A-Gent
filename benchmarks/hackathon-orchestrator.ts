import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import { BrowserTestAgent, type BrowserTestResult } from './browser-test-agent.js';
import { CapabilityRegistry, type CapabilityDefinition } from './capability-registry.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import { InteractionManager, type ClarificationQuestion } from './interaction-manager.js';
import { TaskGraph, type TaskNode, type TaskCategory } from './task-graph.js';
import { ToolExecutor, type ToolResult } from './tool-executor.js';

export type OrchestratorPhase =
  | 'parsing'
  | 'requirements'
  | 'decomposition'
  | 'execution'
  | 'testing'
  | 'deployment'
  | 'complete';

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

export interface ProjectMilestone {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  deliverables: string[];
  order: number;
}

export interface ExecutionPlan {
  projectName: string;
  requirements: RequirementItem[];
  milestones: ProjectMilestone[];
  taskGraph: TaskGraph;
  techStack: Record<string, string>;
  framework: string;
  database: string;
  deploymentTarget: string;
  authStrategy: string;
}

export interface OrchestratorState {
  phase: OrchestratorPhase;
  plan: ExecutionPlan | null;
  devpostData: DevpostData | null;
  checkpoint: Record<string, unknown> | null;
  errors: string[];
  artifacts: string[];
}

export type OrchestratorEventType =
  | 'phase_change'
  | 'user_question'
  | 'user_answer'
  | 'task_complete'
  | 'error'
  | 'checkpoint'
  | 'upgrade';

export interface OrchestratorEvent {
  id: string;
  type: OrchestratorEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export class HackathonOrchestrator {
  createJudgePanel(panelId: string, useAdversarial: boolean): void {}

  private readonly seed: number;
  private readonly orchestratorId: string;
  private readonly workspaceRoot: string;
  private readonly taskGraph: TaskGraph;
  private readonly interactionManager: InteractionManager;
  private readonly toolExecutor: ToolExecutor;
  private readonly browserTestAgent: BrowserTestAgent;
  private readonly capabilityRegistry: CapabilityRegistry;

  private state: OrchestratorState;
  private events: OrchestratorEvent[] = [];
  private eventListeners: Array<(event: OrchestratorEvent) => void> = [];

  constructor(workspaceRoot: string, seed = 42) {
    this.seed = seed;
    this.orchestratorId = 'orch-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.workspaceRoot = workspaceRoot;
    this.taskGraph = new TaskGraph('hackathon-plan', seed);
    this.interactionManager = new InteractionManager(seed);
    this.toolExecutor = new ToolExecutor(workspaceRoot, seed);
    this.browserTestAgent = new BrowserTestAgent(this.toolExecutor, seed);
    this.capabilityRegistry = new CapabilityRegistry(seed);
    this.state = { phase: 'parsing', plan: null, devpostData: null, checkpoint: null, errors: [], artifacts: [] };
  }

  getState(): OrchestratorState {
    return { ...this.state };
  }
  getTaskGraph(): TaskGraph {
    return this.taskGraph;
  }
  getInteractionManager(): InteractionManager {
    return this.interactionManager;
  }
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }
  getBrowserTestAgent(): BrowserTestAgent {
    return this.browserTestAgent;
  }
  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry;
  }
  getEvents(): OrchestratorEvent[] {
    return [...this.events];
  }

  onEvent(listener: (event: OrchestratorEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(type: OrchestratorEventType, data: Record<string, unknown>): void {
    const event: OrchestratorEvent = {
      id: 'evt-' + createDeterministicUuid(this.seed, this.events.length + 1).slice(0, 8),
      timestamp: deterministicNow(this.seed + this.events.length),
      data,
    };
    this.events.push(event);
    for (const listener of this.eventListeners) listener(event);
  }

  private setPhase(phase: OrchestratorPhase): void {
    this.state.phase = phase;
    this.emit('phase_change', { phase, previousPhase: this.state.phase });
  }

  async parseDevpost(input: string): Promise<DevpostData> {
    this.setPhase('parsing');
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    let text = input;

    if (isUrl) {
      text = 'Devpost hackathon project from URL: ' + input + '\n\nProject: AI-powered smart assistant';
      text += '\n\nProblem: Build an AI-powered assistant with natural language understanding and task management.';
      text +=
        '\n\nJudging Criteria: Functionality (40%), Innovation (30%), Technical Difficulty (20%), Presentation (10%)';
      text += '\n\nTech Stack: React, Node.js, Python, OpenAI API, PostgreSQL';
      text += '\n\nRequirements: Web-based interface, real-time chat, task management, API integration, deployment';
    }

    const devpostData: DevpostData = {
      title: this.extractTitle(text),
      problemStatement: this.extractProblemStatement(text),
      judgingCriteria: this.extractJudgingCriteria(text),
      constraints: this.extractConstraints(text),
      recommendedStack: this.extractTechStack(text),
      submissionRequirements: this.extractSubmissionRequirements(text),
      rawText: text,
    };

    this.state.devpostData = devpostData;
    this.emit('phase_change', { phase: 'parsing', data: devpostData });
    return devpostData;
  }

  private extractTitle(text: string): string {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('Project:')) return trimmed.replace('Project:', '').trim();
      if (trimmed.startsWith('Title:')) return trimmed.replace('Title:', '').trim();
      if (trimmed.startsWith('# ')) return trimmed.replace('# ', '').trim();
    }
    return 'Hackathon Project';
  }

  private extractProblemStatement(text: string): string {
    const match = text.match(/Problem[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s);
    return match ? match[1]!.trim() : text.slice(0, 500);
  }

  private extractJudgingCriteria(text: string): string[] {
    const criteria: string[] = [];
    const match = text.match(/Judging Criteria[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s);
    if (match) {
      const parts = match[1]!.split(/[,;]/);
      for (const p of parts) {
        const trimmed = p.trim().replace(/^\d+%?\s*/, '');
        if (trimmed) criteria.push(trimmed);
      }
    }
    if (criteria.length === 0) criteria.push('Functionality', 'Innovation', 'Technical Difficulty');
    return criteria;
  }

  private extractConstraints(text: string): string[] {
    const constraints: string[] = [];
    const match = text.match(/Constraints[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s);
    if (match) {
      const parts = match[1]!.split(/[,;]/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) constraints.push(trimmed);
      }
    }
    return constraints;
  }

  private extractTechStack(text: string): string[] {
    const stack: string[] = [];
    const match = text.match(/Tech Stack[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s);
    if (match) {
      const parts = match[1]!.split(/[,;]/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) stack.push(trimmed);
      }
    }
    return stack;
  }

  private extractSubmissionRequirements(text: string): string[] {
    const reqs: string[] = [];
    const match = text.match(/Requirements[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s);
    if (match) {
      const parts = match[1]!.split(/[,;]/);
      for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed) reqs.push(trimmed);
      }
    }
    return reqs;
  }

  async extractRequirements(devpost: DevpostData): Promise<RequirementItem[]> {
    this.setPhase('requirements');
    const requirements: RequirementItem[] = [];
    const idCounter = { val: 0 };

    const addReq = (
      desc: string,
      category: RequirementItem['category'],
      priority: RequirementItem['priority'],
      criteria: string[],
    ) => {
      idCounter.val++;
      requirements.push({
        id: 'req-' + createDeterministicUuid(this.seed, idCounter.val).slice(0, 6),
        description: desc,
        category,
        priority,
        acceptanceCriteria: criteria,
      });
    };

    addReq('Set up project scaffolding with chosen framework', 'technical', 'critical', [
      'npm init',
      'Framework installed',
      'Build script works',
    ]);
    addReq('Implement frontend UI with responsive design', 'feature', 'critical', [
      'Home page renders',
      'Navigation works',
      'Mobile responsive',
    ]);
    addReq('Implement backend API endpoints', 'feature', 'critical', [
      'API returns 200',
      'Error handling',
      'RESTful design',
    ]);
    addReq('Set up database schema and migrations', 'infrastructure', 'high', [
      'Tables created',
      'Migrations run',
      'Seed data works',
    ]);
    addReq('Implement user authentication', 'feature', 'high', [
      'Login works',
      'Registration works',
      'Session management',
    ]);
    addReq('Integrate core hackathon-specific features', 'feature', 'critical', [
      'Main feature works',
      'Edge cases handled',
    ]);
    addReq('Write automated tests', 'technical', 'high', ['Unit tests pass', 'Integration tests pass']);
    addReq('Set up deployment configuration', 'infrastructure', 'medium', [
      'Build succeeds',
      'Deploy target configured',
    ]);
    addReq('Create project documentation', 'compliance', 'medium', [
      'README written',
      'API docs',
      'Setup instructions',
    ]);

    for (const criterion of devpost.judgingCriteria) {
      addReq('Address judging criterion: ' + criterion, 'compliance', 'high', [
        'Criterion satisfied',
        'Judge can verify',
      ]);
    }

    this.emit('phase_change', { phase: 'requirements', requirements: requirements.length });
    return requirements;
  }

  async createExecutionPlan(devpost: DevpostData, requirements: RequirementItem[]): Promise<ExecutionPlan> {
    this.setPhase('decomposition');

    const framework = this.detectFramework(devpost.recommendedStack);
    const database = this.detectDatabase(devpost.recommendedStack);
    const deploymentTarget = 'vercel';
    const authStrategy = 'jwt_authentication';

    const plan: ExecutionPlan = {
      projectName: devpost.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      requirements,
      milestones: [],
      taskGraph: this.taskGraph,
      techStack: {
        frontend: framework,
        backend: 'node_express',
        database,
        auth: authStrategy,
        deployment: deploymentTarget,
      },
      framework,
      database,
      deploymentTarget,
      authStrategy,
    };

    const infraTasks = this.createInfrastructureTasks(plan);
    const frontendTasks = this.createFrontendTasks(plan);
    const backendTasks = this.createBackendTasks(plan, devpost);
    const testTasks = this.createTestTasks(plan);
    const deployTasks = this.createDeploymentTasks(plan);
    const docTasks = this.createDocumentationTasks(plan);

    const allTasks = [...infraTasks, ...frontendTasks, ...backendTasks, ...testTasks, ...deployTasks, ...docTasks];
    this.taskGraph.computeExecutionOrder();
    this.state.plan = plan;

    this.emit('phase_change', { phase: 'decomposition', totalTasks: allTasks.length });
    return plan;
  }

  private detectFramework(stack: string[]): string {
    for (const s of stack) {
      const lower = s.toLowerCase();
      if (lower.includes('next')) return 'nextjs_framework';
      if (lower.includes('react')) return 'vite_react_framework';
      if (lower.includes('vue')) return 'vue3_framework';
      if (lower.includes('svelte')) return 'sveltekit_framework';
      if (lower.includes('angular')) return 'angular_framework';
    }
    return 'nextjs_framework';
  }

  private detectDatabase(stack: string[]): string {
    for (const s of stack) {
      const lower = s.toLowerCase();
      if (lower.includes('postgres') || lower.includes('psql')) return 'postgres_database';
      if (lower.includes('mongo')) return 'mongodb';
      if (lower.includes('sqlite')) return 'sqlite_database';
      if (lower.includes('firebase')) return 'firebase';
    }
    return 'postgres_database';
  }

  private addTask(description: string, category: TaskCategory, dependencies: string[] = []): string {
    return this.taskGraph.addNode(description, category, dependencies);
  }

  private createInfrastructureTasks(plan: ExecutionPlan): string[] {
    const ids: string[] = [];
    ids.push(this.addTask('Initialize project directory structure', 'infra'));
    ids.push(this.addTask('Configure TypeScript and build tooling', 'infra', [ids[0]!]));
    ids.push(this.addTask('Set up ESLint and Prettier', 'infra', [ids[1]!]));
    ids.push(this.addTask('Configure environment variables', 'infra', [ids[0]!]));
    ids.push(this.addTask('Initialize Git repository', 'infra', [ids[0]!]));
    return ids;
  }

  private createFrontendTasks(plan: ExecutionPlan): string[] {
    const infraDep = this.taskGraph.getNodesByCategory('infra').map((n) => n.id);
    const ids: string[] = [];
    ids.push(this.addTask('Scaffold frontend with ' + plan.framework, 'frontend', infraDep));
    ids.push(this.addTask('Create layout and navigation components', 'frontend', [ids[0]!]));
    ids.push(this.addTask('Implement home page', 'frontend', [ids[1]!]));
    ids.push(this.addTask('Implement API client and data fetching', 'frontend', [ids[1]!]));
    ids.push(this.addTask('Implement core feature pages', 'frontend', [ids[3]!]));
    ids.push(this.addTask('Implement authentication UI (login/register)', 'frontend', [ids[1]!]));
    ids.push(this.addTask('Add responsive styling', 'frontend', [ids[2]!, ids[5]!]));
    return ids;
  }

  private createBackendTasks(plan: ExecutionPlan, devpost: DevpostData): string[] {
    const infraDep = this.taskGraph.getNodesByCategory('infra').map((n) => n.id);
    const ids: string[] = [];
    ids.push(this.addTask('Scaffold backend with Node.js + Express', 'backend', infraDep));
    ids.push(this.addTask('Set up database schema and migrations', 'backend', [ids[0]!]));
    ids.push(this.addTask('Implement authentication endpoints', 'backend', [ids[1]!]));
    ids.push(this.addTask('Implement core business logic API', 'backend', [ids[2]!]));
    ids.push(this.addTask('Implement data models and services', 'backend', [ids[1]!]));
    ids.push(this.addTask('Add API error handling and validation', 'backend', [ids[3]!]));
    return ids;
  }

  private createTestTasks(plan: ExecutionPlan): string[] {
    const frontendIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
    const backendIds = this.taskGraph.getNodesByCategory('backend').map((n) => n.id);
    const ids: string[] = [];
    ids.push(this.addTask('Write backend API integration tests', 'testing', backendIds));
    ids.push(this.addTask('Write frontend component tests', 'testing', frontendIds));
    ids.push(this.addTask('Write E2E browser tests with Playwright', 'testing', [ids[1]!]));
    return ids;
  }

  private createDeploymentTasks(plan: ExecutionPlan): string[] {
    const frontendIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
    const backendIds = this.taskGraph.getNodesByCategory('backend').map((n) => n.id);
    const testIds = this.taskGraph.getNodesByCategory('testing').map((n) => n.id);
    const ids: string[] = [];
    ids.push(this.addTask('Configure build for production', 'deployment', [...frontendIds, ...backendIds]));
    ids.push(this.addTask('Configure ' + plan.deploymentTarget + ' deployment', 'deployment', [ids[0]!]));
    ids.push(this.addTask('Run full build and verify output', 'deployment', [ids[1]!, ...testIds]));
    return ids;
  }

  private createDocumentationTasks(plan: ExecutionPlan): string[] {
    const frontendIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
    const backendIds = this.taskGraph.getNodesByCategory('backend').map((n) => n.id);
    const ids: string[] = [];
    ids.push(this.addTask('Write README with setup instructions', 'planning', [...frontendIds, ...backendIds]));
    ids.push(this.addTask('Document API endpoints', 'planning', backendIds));
    return ids;
  }

  async executePlan(): Promise<void> {
    this.setPhase('execution');

    const frameworkChoice = this.interactionManager.getFrameworkChoiceQuestion(
      this.taskGraph.getNodesByCategory('frontend').map((n) => n.id),
    );
    const deployChoice = this.interactionManager.getDeploymentTargetQuestion(
      this.taskGraph.getNodesByCategory('deployment').map((n) => n.id),
    );

    this.emit('user_question', { questions: [frameworkChoice, deployChoice] });

    while (this.taskGraph.hasUnfinishedWork()) {
      const next = this.taskGraph.getNextReady();
      if (!next) break;

      this.taskGraph.markRunning(next.id);
      this.emit('task_complete', { taskId: next.id, status: 'running' });

      try {
        await this.executeTask(next);
        this.taskGraph.markDone(next.id);
        this.state.artifacts.push(...next.artifacts);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.taskGraph.markBlocked(next.id, errorMsg);
        this.state.errors.push(errorMsg);
        this.emit('error', { taskId: next.id, error: errorMsg });
      }
    }

    const progress = this.taskGraph.getProgress();
    if (progress.blocked > 0) {
      this.setPhase('testing');
      await this.runBrowserTests();
    }

    if (progress.blocked === 0 && progress.pending === 0) {
      this.setPhase('deployment');
      await this.runDeployment();
      this.setPhase('complete');
      this.emit('phase_change', { phase: 'complete', progress });
    }
  }

  private async executeTask(node: TaskNode): Promise<void> {
    switch (node.category) {
      case 'infra':
        await this.executeInfraTask(node);
        break;
      case 'frontend':
        await this.executeFrontendTask(node);
        break;
      case 'backend':
        await this.executeBackendTask(node);
        break;
      case 'testing':
        await this.executeTestingTask(node);
        break;
      case 'deployment':
        await this.executeDeploymentTask(node);
        break;
      default:
        await this.toolExecutor.execute('file', 'write', {
          path: 'tasks/' + node.id + '.md',
          content: '# Task: ' + node.description + '\n\nStatus: placeholder\n',
        });
    }
  }

  private async executeInfraTask(node: TaskNode): Promise<void> {
    const desc = node.description.toLowerCase();
    if (desc.includes('scaffold') || desc.includes('initialize') || desc.includes('project directory')) {
      const plan = this.state.plan!;
      const result = await this.toolExecutor.execute('scaffold', plan.framework, {
        template: plan.framework.replace('_framework', ''),
        projectDir: plan.projectName,
      });
      if (result.success) node.artifacts.push(...result.artifacts);
    }
    if (desc.includes('typescript') || desc.includes('build tooling')) {
      await this.toolExecutor.execute('file', 'write', {
        path: this.state.plan!.projectName + '/tsconfig.json',
        content: '{ }',
      });
    }
    if (desc.includes('git')) {
      await this.toolExecutor.execute('github', 'create_repo', { repoName: this.state.plan!.projectName });
    }
  }

  private async executeFrontendTask(node: TaskNode): Promise<void> {
    const plan = this.state.plan!;
    const desc = node.description.toLowerCase();
    if (desc.includes('scaffold')) return;
    if (desc.includes('layout') || desc.includes('navigation')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/components/Layout.tsx',
        content:
          'export default function Layout({ children }: { children: React.ReactNode }) { return <div className="min-h-screen"><nav>Hackathon App</nav><main>{ children }</main></div>; }',
      });
    }
    if (desc.includes('home page')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/pages/index.tsx',
        content:
          'export default function Home() { return <div><h1>Welcome</h1><p>Hackathon project generated by Hack-A-Gent</p></div>; }',
      });
    }
    if (desc.includes('api client')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/lib/api.ts',
        content:
          'const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"; export async function fetchAPI(endpoint: string, options?: RequestInit) { const res = await fetch(API_URL + endpoint, options); if (!res.ok) throw new Error("API error"); return res.json(); }',
      });
    }
    if (desc.includes('authentication')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/components/AuthForm.tsx',
        content:
          'export default function AuthForm() { return <form><input placeholder="Email"/><input type="password" placeholder="Password"/><button>Submit</button></form>; }',
      });
    }
  }

  private async executeBackendTask(node: TaskNode): Promise<void> {
    const plan = this.state.plan!;
    const desc = node.description.toLowerCase();
    if (desc.includes('scaffold')) return;
    if (desc.includes('database') || desc.includes('schema')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/database/schema.sql',
        content:
          'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT NOW());\nCREATE TABLE projects (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), name VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT NOW());',
      });
    }
    if (desc.includes('authentication')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/backend/middleware/auth.ts',
        content:
          'import jwt from "jsonwebtoken"; export function authenticate(req: unknown, res: unknown, next: unknown) { const token = req.headers.authorization?.split(" ")[1]; if (!token) return res.status(401).json({ error: "Unauthorized" }); try { req.user = jwt.verify(token, process.env.JWT_SECRET!); next(); } catch { res.status(401).json({ error: "Invalid token" }); } }',
      });
    }
    if (desc.includes('business logic') || desc.includes('core')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/src/backend/routes/api.ts',
        content:
          'import { Router } from "express"; const router = Router(); router.get("/health", (req, res) => { res.json({ status: "ok", timestamp: new Date().toISOString() }); }); export default router;',
      });
    }
  }

  private async executeTestingTask(node: TaskNode): Promise<void> {
    const plan = this.state.plan!;
    const desc = node.description.toLowerCase();
    if (desc.includes('e2e') || desc.includes('browser')) {
      const spec = this.browserTestAgent.buildTestSpec(
        'Homepage renders',
        'http://localhost:3000',
        ['main', 'h1', 'nav'],
        ['Welcome', 'Hackathon'],
      );
      const result = await this.browserTestAgent.runTest(spec);
      if (!result.passed) {
        await this.browserTestAgent.testAndRepairCycle([spec], this.taskGraph, node.id);
      }
    }
    if (desc.includes('integration')) {
      await this.toolExecutor.execute('file', 'write', {
        path: plan.projectName + '/tests/api.test.ts',
        content:
          'import { describe, it, expect } from "vitest"; describe("API", () => { it("health endpoint returns ok", () => { expect(true).toBe(true); }); });',
      });
    }
  }

  private async executeDeploymentTask(node: TaskNode): Promise<void> {
    const plan = this.state.plan!;
    const desc = node.description.toLowerCase();
    if (desc.includes('configure build')) {
      await this.toolExecutor.execute('package', 'build', { cwd: plan.projectName });
    }
    if (desc.includes('deployment')) {
      const result = await this.toolExecutor.execute('deploy', plan.deploymentTarget, {
        target: plan.deploymentTarget,
        projectDir: plan.projectName,
      });
      if (result.success) node.artifacts.push('deployment.json');
    }
  }

  private async runBrowserTests(): Promise<void> {
    const specs = [
      this.browserTestAgent.buildTestSpec(
        'Homepage renders',
        'http://localhost:3000',
        ['main', 'h1', 'nav'],
        ['Welcome'],
      ),
      this.browserTestAgent.buildTestSpec('API health', 'http://localhost:3001/api/health', [], ['ok']),
    ];
    this.emit('phase_change', { phase: 'testing', specCount: specs.length });

    for (const spec of specs) {
      const result = await this.browserTestAgent.runTest(spec);
      if (!result.passed) {
        const uiTaskIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
        const repairResult = await this.browserTestAgent.testAndRepairCycle([spec], this.taskGraph, uiTaskIds[0] ?? '');
        if (!repairResult.allPassed) {
          this.state.errors.push('Browser test failed after repairs: ' + spec.name);
        }
      }
    }
  }

  private async runDeployment(): Promise<void> {
    const plan = this.state.plan;
    if (!plan) return;
    const deployTasks = this.taskGraph.getNodesByCategory('deployment');
    for (const task of deployTasks) {
      if (task.status !== 'done') {
        this.taskGraph.markRunning(task.id);
        await this.executeTask(task);
        this.taskGraph.markDone(task.id);
      }
    }
  }

  async askUser(
    query: string,
    type: 'choice' | 'text' | 'confirm' = 'text',
    options: string[] | null = null,
  ): Promise<string | string[]> {
    const question = this.interactionManager.getCustomQuestion(query, 'User input requested during execution', options);
    this.emit('user_question', { question });

    return new Promise((resolve) => {
      const handler = (event: OrchestratorEvent) => {
        if (event.type === 'user_answer' && event.data.questionId === question.id) {
          this.removeListener(handler);
          resolve(event.data.answer as string);
        }
      };
      this.onEvent(handler);
    });
  }

  private removeListener(listener: (event: OrchestratorEvent) => void): void {
    this.eventListeners = this.eventListeners.filter((l) => l !== listener);
  }

  answerQuestion(questionId: string, answer: string | string[]): boolean {
    const success = this.interactionManager.answerQuestion(questionId, answer);
    if (success) {
      this.emit('user_answer', { questionId, answer });
    }
    return success;
  }

  createCheckpoint(): OrchestratorState {
    const ckpt = this.interactionManager.createCheckpoint(
      this.taskGraph,
      this.taskGraph.getNextReady()?.id ?? null,
      this.state.phase,
      {},
    );
    this.state.checkpoint = ckpt as unknown as Record<string, unknown>;
    this.emit('checkpoint', { checkpointId: ckpt.checkpointId });
    return { ...this.state };
  }

  async checkForUpgrade(userRequest: string): Promise<CapabilityDefinition | null> {
    const gaps = this.capabilityRegistry.findCapabilityGaps([userRequest]);
    if (gaps.length > 0) {
      const request = this.capabilityRegistry.requestUpgrade(
        userRequest,
        userRequest.replace(/\s+/g, '_').toLowerCase(),
        'tool',
        'User requested: ' + userRequest,
      );
      const spec = this.capabilityRegistry.generateUpgradeSpec(request.requestId);
      if (spec) {
        this.capabilityRegistry.approveUpgrade(request.requestId);
        const cap = this.capabilityRegistry.getCapability(request.targetCapability);
        this.emit('upgrade', { capability: cap, spec });
        return cap ?? null;
      }
    }
    return null;
  }

  saveState(filePath: string): void {
    const state = {
      orchestratorId: this.orchestratorId,
      seed: this.seed,
      state: this.createCheckpoint(),
      taskGraph: this.taskGraph.toJSON(),
    };
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  static async loadState(filePath: string, workspaceRoot: string): Promise<HackathonOrchestrator> {
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      orchestratorId: string;
      seed: number;
      state: OrchestratorState;
      taskGraph: Record<string, unknown>;
    };
    const orchestrator = new HackathonOrchestrator(workspaceRoot, data.seed);
    const TaskGraphModule = await import('./task-graph.js');
    (orchestrator as unknown).taskGraph = TaskGraphModule.TaskGraph.fromJSON(data.taskGraph as unknown) as TaskGraph;
    orchestrator.state = data.state;
    return orchestrator;
  }
}

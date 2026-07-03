import type { CapabilityDefinition } from './capability-registry.js';
import { createDeterministicUuid } from './determinism-kernel.js';
import type { TaskNode, TaskCategory } from './task-graph.js';

export type EnvironmentType =
  | 'local_node'
  | 'local_browser'
  | 'cloud_github'
  | 'cloud_deploy'
  | 'cloud_browser_test'
  | 'git_only';

export interface EnvironmentCapability {
  envType: EnvironmentType;
  label: string;
  maxConcurrency: number;
  supportedTaskCategories: TaskCategory[];
  tools: string[];
  networkAccess: boolean;
  persistentStorage: boolean;
}

export interface RoutingDecision {
  taskId: string;
  taskDescription: string;
  assignedEnvironment: EnvironmentType;
  reason: string;
  estimatedDuration: number;
  prerequisites: string[];
}

export class ExecutionEnvironmentRouter {
  private readonly seed: number;
  private readonly routerId: string;
  private readonly environments: EnvironmentCapability[];
  private routingHistory: RoutingDecision[] = [];
  private tokenAvailability: Record<string, boolean> = {};

  constructor(seed = 42) {
    this.seed = seed;
    this.routerId = 'router-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.environments = [
      {
        envType: 'local_node',
        label: 'Local Node.js',
        maxConcurrency: 4,
        supportedTaskCategories: ['frontend', 'backend', 'infra', 'planning', 'integration'],
        tools: ['file_system', 'npm', 'node', 'shell'],
        networkAccess: false,
        persistentStorage: true,
      },
      {
        envType: 'local_browser',
        label: 'Local Browser (Playwright)',
        maxConcurrency: 1,
        supportedTaskCategories: ['testing', 'frontend'],
        tools: ['playwright', 'browser', 'screenshot'],
        networkAccess: true,
        persistentStorage: false,
      },
      {
        envType: 'cloud_github',
        label: 'GitHub Cloud',
        maxConcurrency: 1,
        supportedTaskCategories: ['infra', 'deployment', 'planning'],
        tools: ['github_api', 'git', 'actions'],
        networkAccess: true,
        persistentStorage: true,
      },
      {
        envType: 'cloud_deploy',
        label: 'Cloud Deploy (Vercel/Netlify)',
        maxConcurrency: 1,
        supportedTaskCategories: ['deployment', 'testing'],
        tools: ['deploy_api', 'build_system', 'env_manager'],
        networkAccess: true,
        persistentStorage: false,
      },
      {
        envType: 'cloud_browser_test',
        label: 'Cloud Browser Test',
        maxConcurrency: 1,
        supportedTaskCategories: ['testing', 'integration'],
        tools: ['playwright', 'network_monitor', 'dom_inspector'],
        networkAccess: true,
        persistentStorage: false,
      },
      {
        envType: 'git_only',
        label: 'Git Version Control',
        maxConcurrency: 1,
        supportedTaskCategories: ['infra', 'planning'],
        tools: ['git', 'github_api'],
        networkAccess: true,
        persistentStorage: true,
      },
    ];
    this.detectTokenAvailability();
  }

  getEnvironments(): EnvironmentCapability[] {
    return [...this.environments];
  }
  getRoutingHistory(): RoutingDecision[] {
    return [...this.routingHistory];
  }

  private detectTokenAvailability(): void {
    this.tokenAvailability = {
      github: !!process.env.GITHUB_TOKEN,
      vercel: !!process.env.VERCEL_TOKEN,
      netlify: !!process.env.NETLIFY_AUTH_TOKEN,
    };
  }

  setTokenAvailability(tokens: Record<string, boolean>): void {
    Object.assign(this.tokenAvailability, tokens);
  }

  private hasNetworkForCategory(category: TaskCategory): boolean {
    if (category === 'deployment')
      return (
        (this.tokenAvailability.github ?? false) ||
        (this.tokenAvailability.vercel ?? false) ||
        (this.tokenAvailability.netlify ?? false)
      );
    if (category === 'infra') return this.tokenAvailability.github ?? false;
    return true;
  }

  routeTask(task: TaskNode, availableTokens: Record<string, boolean> = {}): RoutingDecision {
    Object.assign(this.tokenAvailability, availableTokens);

    const categoryRouting: Partial<Record<TaskCategory, EnvironmentType>> = {
      frontend: 'local_node',
      backend: 'local_node',
      infra: this.tokenAvailability.github ? 'cloud_github' : 'local_node',
      testing: this.tokenAvailability.github ? 'cloud_browser_test' : 'local_browser',
      deployment: this.hasNetworkForCategory('deployment') ? 'cloud_deploy' : 'local_node',
      planning: 'local_node',
      integration: 'local_browser',
    };

    const env = categoryRouting[task.category] ?? 'local_node';
    const reasons: Record<string, string> = {
      frontend: 'Frontend build requires Node.js and file system',
      backend: 'Backend build requires Node.js and file system',
      infra: this.tokenAvailability.github ? 'Infrastructure requires GitHub API' : 'Infrastructure can run locally',
      testing: this.tokenAvailability.github
        ? 'Browser testing on cloud with live URL'
        : 'Browser testing on local Playwright',
      deployment: this.hasNetworkForCategory('deployment')
        ? 'Deployment requires cloud API tokens'
        : 'Deployment simulated locally',
      planning: 'Planning is a local reasoning task',
      integration: 'Integration testing needs browser environment',
    };

    const decision: RoutingDecision = {
      taskId: task.id,
      taskDescription: task.description,
      assignedEnvironment: env,
      reason: reasons[task.category] ?? 'Default local execution',
      estimatedDuration: this.estimateDuration(task),
      prerequisites: this.getPrerequisites(task, env),
    };

    this.routingHistory.push(decision);
    return decision;
  }

  private estimateDuration(task: TaskNode): number {
    const estimates: Record<TaskCategory, number> = {
      frontend: 120000,
      backend: 180000,
      infra: 60000,
      testing: 90000,
      deployment: 120000,
      planning: 30000,
      integration: 120000,
    };
    return estimates[task.category] ?? 60000;
  }

  private getPrerequisites(task: TaskNode, env: EnvironmentType): string[] {
    const prereqs: string[] = [];
    if (env === 'cloud_github' || env === 'cloud_deploy') prereqs.push('github_token');
    if (env === 'cloud_deploy') {
      if (this.tokenAvailability.vercel) prereqs.push('vercel_token');
      if (this.tokenAvailability.netlify) prereqs.push('netlify_token');
    }
    if (env === 'local_browser' || env === 'cloud_browser_test') prereqs.push('playwright_browsers');
    return prereqs;
  }

  decideExecutionOrder(tasks: TaskNode[], parallelBudget = 2): Map<EnvironmentType, TaskNode[]> {
    const assignment = new Map<EnvironmentType, TaskNode[]>();
    const envCounts = new Map<EnvironmentType, number>();

    for (const task of tasks) {
      if (task.status !== 'pending') continue;
      const decision = this.routeTask(task);
      const env = decision.assignedEnvironment;
      const currentCount = envCounts.get(env) ?? 0;

      if (currentCount >= parallelBudget) {
        const fallbackEnv: EnvironmentType = 'local_node';
        if (!assignment.has(fallbackEnv)) assignment.set(fallbackEnv, []);
        assignment.get(fallbackEnv)!.push(task);
        envCounts.set(fallbackEnv, (envCounts.get(fallbackEnv) ?? 0) + 1);
      } else {
        if (!assignment.has(env)) assignment.set(env, []);
        assignment.get(env)!.push(task);
        envCounts.set(env, currentCount + 1);
      }
    }

    return assignment;
  }
}

import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export type CapabilityCategory =
  | 'framework'
  | 'deployment'
  | 'testing'
  | 'database'
  | 'authentication'
  | 'ai'
  | 'infrastructure'
  | 'tool'
  | 'agent_role';

export interface CapabilityDefinition {
  id: string;
  name: string;
  version: string;
  category: CapabilityCategory;
  description: string;
  dependencies: string[];
  moduleSpec: CapabilityModuleSpec | null;
  enabled: boolean;
  registeredAt: string;
  metadata: Record<string, string>;
}

export interface CapabilityModuleSpec {
  moduleName: string;
  filePath: string;
  exports: string[];
  interfaces: string[];
  requiredImports: string[];
}

export interface UpgradeRequest {
  requestId: string;
  description: string;
  targetCapability: string;
  category: CapabilityCategory;
  context: string;
  generatedSpec: CapabilityModuleSpec | null;
  status: 'pending' | 'approved' | 'rejected' | 'generated';
  createdAt: string;
}

export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private upgradeRequests: UpgradeRequest[] = [];
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.register({
      name: 'nextjs_framework',
      version: '1.0.0',
      category: 'framework',
      description: 'Next.js React framework with SSR, API routes, and file-system routing',
      dependencies: ['node_18', 'react_18'],
      moduleSpec: null,
      metadata: { scaffoldingTemplate: 'nextjs', defaultPort: '3000' },
    });

    this.register({
      name: 'vite_react_framework',
      version: '1.0.0',
      category: 'framework',
      description: 'Vite + React with fast HMR and ESBuild bundling',
      dependencies: ['node_18', 'react_18'],
      moduleSpec: null,
      metadata: { scaffoldingTemplate: 'vite-react', defaultPort: '5173' },
    });

    this.register({
      name: 'postgres_database',
      version: '1.0.0',
      category: 'database',
      description: 'PostgreSQL database with schema migration support',
      dependencies: ['node_postgres'],
      moduleSpec: null,
      metadata: { defaultPort: '5432', ormSupport: 'prisma,knex' },
    });

    this.register({
      name: 'sqlite_database',
      version: '1.0.0',
      category: 'database',
      description: 'SQLite lightweight database for development and testing',
      dependencies: [],
      moduleSpec: null,
      metadata: { ormSupport: 'better-sqlite3,prisma' },
    });

    this.register({
      name: 'vercel_deployment',
      version: '1.0.0',
      category: 'deployment',
      description: 'Vercel deployment with automatic CI/CD from GitHub',
      dependencies: ['github_repo', 'nextjs_framework'],
      moduleSpec: null,
      metadata: { provider: 'vercel', configFile: 'vercel.json' },
    });

    this.register({
      name: 'docker_deployment',
      version: '1.0.0',
      category: 'deployment',
      description: 'Docker containerization with Dockerfile and docker-compose',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { configFiles: 'Dockerfile,docker-compose.yml,.dockerignore' },
    });

    this.register({
      name: 'playwright_testing',
      version: '1.0.0',
      category: 'testing',
      description: 'Playwright browser-based E2E testing with MCP integration',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { browserSupport: 'chromium,firefox,webkit' },
    });

    this.register({
      name: 'vitest_testing',
      version: '1.0.0',
      category: 'testing',
      description: 'Vitest unit and integration testing framework',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { configFile: 'vitest.config.ts' },
    });

    this.register({
      name: 'jwt_authentication',
      version: '1.0.0',
      category: 'authentication',
      description: 'JWT-based authentication with access and refresh tokens',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { library: 'jsonwebtoken', tokenExpiry: '15m' },
    });

    this.register({
      name: 'github_repo',
      version: '1.0.0',
      category: 'infrastructure',
      description: 'GitHub repository creation and management',
      dependencies: [],
      moduleSpec: null,
      metadata: { apiVersion: '2022-11-28' },
    });

    this.register({
      name: 'builder_agent_role',
      version: '1.0.0',
      category: 'agent_role',
      description: 'Agent role for building project source code from architecture specs',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { roleType: 'builder' },
    });

    this.register({
      name: 'tester_agent_role',
      version: '1.0.0',
      category: 'agent_role',
      description: 'Agent role for writing and running tests',
      dependencies: ['node_18'],
      moduleSpec: null,
      metadata: { roleType: 'tester' },
    });

    this.register({
      name: 'deployer_agent_role',
      version: '1.0.0',
      category: 'agent_role',
      description: 'Agent role for deploying projects to production',
      dependencies: ['github_repo'],
      moduleSpec: null,
      metadata: { roleType: 'deployer' },
    });
  }

  register(def: Omit<CapabilityDefinition, 'id' | 'enabled' | 'registeredAt'>): CapabilityDefinition {
    const existing = Array.from(this.capabilities.values()).find((c) => c.name === def.name);
    if (existing) return existing;

    const capability: CapabilityDefinition = {
      id: `cap-${createDeterministicUuid(this.seed, this.capabilities.size + 1).slice(0, 8)}`,
      name: def.name,
      version: def.version,
      category: def.category,
      description: def.description,
      dependencies: def.dependencies,
      moduleSpec: def.moduleSpec,
      enabled: true,
      registeredAt: deterministicNow(this.seed + this.capabilities.size),
      metadata: { ...def.metadata },
    };
    this.capabilities.set(capability.id, capability);
    return capability;
  }

  getCapability(name: string): CapabilityDefinition | undefined {
    return Array.from(this.capabilities.values()).find((c) => c.name === name);
  }

  getCapabilityById(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  getAllCapabilities(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  getCapabilitiesByCategory(category: CapabilityCategory): CapabilityDefinition[] {
    return this.getAllCapabilities().filter((c) => c.category === category);
  }

  getEnabledCapabilities(): CapabilityDefinition[] {
    return this.getAllCapabilities().filter((c) => c.enabled);
  }

  enableCapability(name: string): boolean {
    const cap = this.getCapability(name);
    if (!cap) return false;
    cap.enabled = true;
    return true;
  }

  disableCapability(name: string): boolean {
    const cap = this.getCapability(name);
    if (!cap) return false;
    cap.enabled = false;
    return true;
  }

  hasCapability(name: string): boolean {
    return this.getCapability(name) !== undefined;
  }

  getMissingDependencies(name: string): string[] {
    const cap = this.getCapability(name);
    if (!cap) return [];
    return cap.dependencies.filter((dep) => !this.hasCapability(dep));
  }

  requestUpgrade(
    description: string,
    targetCapability: string,
    category: CapabilityCategory,
    context: string,
  ): UpgradeRequest {
    const request: UpgradeRequest = {
      requestId: `upgrade-${createDeterministicUuid(this.seed, this.upgradeRequests.length + 1).slice(0, 8)}`,
      description,
      targetCapability,
      category,
      context,
      generatedSpec: null,
      status: 'pending',
      createdAt: deterministicNow(this.seed + this.upgradeRequests.length),
    };
    this.upgradeRequests.push(request);
    return request;
  }

  generateUpgradeSpec(requestId: string): CapabilityModuleSpec | null {
    const request = this.upgradeRequests.find((r) => r.requestId === requestId);
    if (!request) return null;

    const spec: CapabilityModuleSpec = {
      moduleName: `${request.targetCapability.replace(/[^a-zA-Z0-9]/g, '_')}_module`,
      filePath: `kernel/capabilities/${request.targetCapability.replace(/[^a-zA-Z0-9]/g, '-')}.ts`,
      exports: [`create${toPascalCase(request.targetCapability)}`, `${toPascalCase(request.targetCapability)}Config`],
      interfaces: [
        `${toPascalCase(request.targetCapability)}Config`,
        `${toPascalCase(request.targetCapability)}Result`,
      ],
      requiredImports: request.category === 'framework' ? ['Repository', 'Module'] : [],
    };

    request.generatedSpec = spec;
    request.status = 'generated';
    return spec;
  }

  approveUpgrade(requestId: string): boolean {
    const request = this.upgradeRequests.find((r) => r.requestId === requestId);
    if (!request || request.status !== 'generated') return false;
    request.status = 'approved';

    this.register({
      name: request.targetCapability,
      version: '1.0.0',
      category: request.category,
      description: request.description,
      dependencies: [],
      moduleSpec: request.generatedSpec ?? null,
      metadata: { generatedFrom: requestId, context: request.context },
    });

    return true;
  }

  getUpgradeRequests(status?: UpgradeRequest['status']): UpgradeRequest[] {
    if (status) return this.upgradeRequests.filter((r) => r.status === status);
    return [...this.upgradeRequests];
  }

  findCapabilityGaps(requiredCapabilities: string[]): string[] {
    return requiredCapabilities.filter((c) => !this.hasCapability(c));
  }

  resolveCapabilityByAlias(alias: string): CapabilityDefinition | undefined {
    const aliasMap: Record<string, string> = {
      react: 'nextjs_framework',
      vue: 'vue3_framework',
      svelte: 'sveltekit_framework',
      angular: 'angular_framework',
      postgres: 'postgres_database',
      sqlite: 'sqlite_database',
      vercel: 'vercel_deployment',
      docker: 'docker_deployment',
      playwright: 'playwright_testing',
      vitest: 'vitest_testing',
      jwt: 'jwt_authentication',
      github: 'github_repo',
    };
    const resolved = aliasMap[alias.toLowerCase()];
    if (!resolved) return undefined;
    return this.getCapability(resolved);
  }
}

function toPascalCase(s: string): string {
  return s.replace(/(^|_|-|\s)(\w)/g, (_, __, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
}

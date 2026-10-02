import type {
  ArchitectureBlueprint,
  RecommendedStack,
  FolderStructure,
  Table,
  RequestSchema,
  Component,
  ExecutionNode,
  SkillRequirement,
  HumanCheckpoint,
} from './architect-types.js';
import type { PlannerOutput } from './planner-types.js';

// ── Architect Provider Interface ───────────────────────────────────────────

export interface ArchitectProvider {
  selectStack(plan: PlannerOutput): Promise<RecommendedStack>;
  designFolderStructure(plan: PlannerOutput, stack: RecommendedStack): Promise<FolderStructure>;
  designDatabaseSchema(plan: PlannerOutput, stack: RecommendedStack): Promise<{ engine: string; tables: Table[] }>;
  defineApiContracts(plan: PlannerOutput, stack: RecommendedStack): Promise<RequestSchema[]>;
  defineFrontendModules(plan: PlannerOutput, stack: RecommendedStack): Promise<Component[]>;
  defineBackendModules(
    plan: PlannerOutput,
    stack: RecommendedStack,
    endpoints: RequestSchema[],
  ): Promise<
    Array<{
      name: string;
      description: string;
      endpoints: string[];
      dependencies: string[];
      environment_variables: Array<{ name: string; description: string; required: boolean }>;
    }>
  >;
  planMilestones(plan: PlannerOutput): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      due_offset_hours: number;
      tasks: Array<{ id: string; description: string; estimated_hours: number; depends_on: string[] }>;
      deliverables: string[];
      verification?: string;
    }>
  >;
  buildExecutionGraph(
    plan: PlannerOutput,
    milestones: Array<unknown>,
  ): Promise<{ nodes: ExecutionNode[]; entryPoint: string }>;
  identifySkills(plan: PlannerOutput, stack: RecommendedStack): Promise<SkillRequirement[]>;
  assessArchitectureRisks(plan: PlannerOutput): Promise<ArchitectureBlueprint['risks']>;
  identifyCheckpoints(plan: PlannerOutput, milestones: Array<unknown>): Promise<HumanCheckpoint[]>;
}

// ── Mock Architect Provider ─────────────────────────────────────────────────

export class MockArchitectProvider implements ArchitectProvider {
  async selectStack(plan: PlannerOutput): Promise<RecommendedStack> {
    const theme = plan.hackathon_data.theme?.toLowerCase() ?? '';
    const isAi = theme.includes('ai') || theme.includes('ml') || theme.includes('intelligence');

    return {
      frontend: [
        {
          name: 'React',
          version: '18.x',
          purpose: 'UI framework',
          alternatives: ['Vue', 'Svelte'],
          rationale: 'Widely adopted with strong ecosystem.',
        },
        {
          name: 'TypeScript',
          version: '5.x',
          purpose: 'Type-safe language',
          alternatives: ['JavaScript'],
          rationale: 'Catch errors at compile time.',
        },
        {
          name: 'Tailwind CSS',
          version: '3.x',
          purpose: 'Utility-first styling',
          alternatives: ['CSS Modules', 'Styled Components'],
          rationale: 'Rapid prototyping with consistent design.',
        },
      ],
      backend: [
        {
          name: isAi ? 'Python (FastAPI)' : 'Node.js (Express)',
          version: isAi ? '0.110.x' : '4.x',
          purpose: 'API server',
          alternatives: ['Go', 'Rust'],
          rationale: isAi ? 'Best ML/AI library support.' : 'Fast development with shared types.',
        },
        {
          name: 'TypeScript',
          version: '5.x',
          purpose: 'Type-safe language',
          alternatives: ['JavaScript'],
          rationale: 'Shared types between frontend and backend.',
        },
      ],
      database: [
        {
          name: 'PostgreSQL',
          version: '16.x',
          purpose: 'Primary data store',
          alternatives: ['MySQL', 'SQLite'],
          rationale: 'Reliable ACID-compliant RDBMS with JSON support.',
        },
        {
          name: isAi ? 'Redis' : 'SQLite',
          version: isAi ? '7.x' : '3.x',
          purpose: isAi ? 'Caching & session store' : 'Development & testing',
          alternatives: ['Memcached'],
          rationale: isAi ? 'Fast in-memory cache for AI workloads.' : 'Zero-config local database for dev.',
        },
      ],
      infrastructure: [
        {
          name: 'Docker',
          version: '24.x',
          purpose: 'Containerization',
          alternatives: ['Podman'],
          rationale: 'Consistent development and deployment environments.',
        },
        {
          name: 'GitHub Actions',
          version: '',
          purpose: 'CI/CD pipeline',
          alternatives: ['GitLab CI', 'CircleCI'],
          rationale: 'Free for open-source, tight GitHub integration.',
        },
      ],
      tooling: [
        {
          name: 'Vitest',
          version: '1.x',
          purpose: 'Testing framework',
          alternatives: ['Jest', 'Mocha'],
          rationale: 'Fast, native TypeScript support.',
        },
        {
          name: 'ESLint',
          version: '8.x',
          purpose: 'Code linting',
          alternatives: ['Prettier', 'Biome'],
          rationale: 'Enforce code quality standards.',
        },
      ],
    };
  }

  async designFolderStructure(plan: PlannerOutput, stack: RecommendedStack): Promise<FolderStructure> {
    return {
      root: '/project',
      entries: [
        {
          path: 'src/',
          type: 'dir',
          description: 'Source code root',
          children: [
            {
              path: 'src/frontend/',
              type: 'dir',
              description: 'Frontend application',
              children: [
                {
                  path: 'src/frontend/components/',
                  type: 'dir',
                  description: 'Reusable UI components',
                  children: [
                    {
                      path: 'src/frontend/components/common/',
                      type: 'dir',
                      description: 'Shared components',
                      children: [],
                    },
                    {
                      path: 'src/frontend/components/features/',
                      type: 'dir',
                      description: 'Feature-specific components',
                      children: [],
                    },
                  ],
                },
                { path: 'src/frontend/pages/', type: 'dir', description: 'Route pages', children: [] },
                { path: 'src/frontend/services/', type: 'dir', description: 'API client services', children: [] },
                { path: 'src/frontend/hooks/', type: 'dir', description: 'Custom React hooks', children: [] },
                { path: 'src/frontend/styles/', type: 'dir', description: 'Global styles', children: [] },
                { path: 'src/frontend/types/', type: 'dir', description: 'TypeScript type definitions', children: [] },
              ],
            },
            {
              path: 'src/backend/',
              type: 'dir',
              description: 'Backend application',
              children: [
                { path: 'src/backend/routes/', type: 'dir', description: 'API route handlers', children: [] },
                { path: 'src/backend/services/', type: 'dir', description: 'Business logic services', children: [] },
                { path: 'src/backend/models/', type: 'dir', description: 'Data models', children: [] },
                { path: 'src/backend/middleware/', type: 'dir', description: 'Middleware', children: [] },
                { path: 'src/backend/validators/', type: 'dir', description: 'Input validation schemas', children: [] },
              ],
            },
            {
              path: 'src/shared/',
              type: 'dir',
              description: 'Shared types between frontend and backend',
              children: [],
            },
          ],
        },
        {
          path: 'database/',
          type: 'dir',
          description: 'Database migrations and seeds',
          children: [
            { path: 'database/migrations/', type: 'dir', description: 'Schema migration files', children: [] },
            { path: 'database/seeds/', type: 'dir', description: 'Seed data scripts', children: [] },
          ],
        },
        {
          path: 'tests/',
          type: 'dir',
          description: 'Test suites',
          children: [
            { path: 'tests/unit/', type: 'dir', description: 'Unit tests', children: [] },
            { path: 'tests/integration/', type: 'dir', description: 'Integration tests', children: [] },
            { path: 'tests/e2e/', type: 'dir', description: 'End-to-end tests', children: [] },
          ],
        },
        {
          path: 'infra/',
          type: 'dir',
          description: 'Infrastructure configuration',
          children: [
            { path: 'infra/docker/', type: 'dir', description: 'Docker configuration', children: [] },
            { path: 'infra/ci/', type: 'dir', description: 'CI pipeline configuration', children: [] },
          ],
        },
        { path: 'docs/', type: 'dir', description: 'Documentation', children: [] },
        { path: '.env.example', type: 'file', description: 'Environment variable template', children: [] },
        { path: 'docker-compose.yml', type: 'file', description: 'Docker Compose configuration', children: [] },
        { path: 'README.md', type: 'file', description: 'Project overview', children: [] },
      ],
    };
  }

  async designDatabaseSchema(
    plan: PlannerOutput,
    stack: RecommendedStack,
  ): Promise<{ engine: string; tables: Table[] }> {
    return {
      engine: 'PostgreSQL',
      tables: [
        {
          name: 'users',
          columns: [
            {
              name: 'id',
              type: 'UUID',
              nullable: false,
              primary_key: true,
              unique: true,
              default: 'gen_random_uuid()',
            },
            { name: 'email', type: 'VARCHAR(255)', nullable: false, primary_key: false, unique: true },
            { name: 'name', type: 'VARCHAR(255)', nullable: false, primary_key: false, unique: false },
            { name: 'avatar_url', type: 'TEXT', nullable: true, primary_key: false, unique: false },
            {
              name: 'created_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
            {
              name: 'updated_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
          ],
          indexes: [{ name: 'idx_users_email', columns: ['email'], unique: true }],
          description: 'Application users',
        },
        {
          name: 'projects',
          columns: [
            {
              name: 'id',
              type: 'UUID',
              nullable: false,
              primary_key: true,
              unique: true,
              default: 'gen_random_uuid()',
            },
            { name: 'name', type: 'VARCHAR(255)', nullable: false, primary_key: false, unique: false },
            { name: 'description', type: 'TEXT', nullable: true, primary_key: false, unique: false },
            {
              name: 'owner_id',
              type: 'UUID',
              nullable: false,
              primary_key: false,
              unique: false,
              references: 'users(id)',
            },
            {
              name: 'status',
              type: 'VARCHAR(50)',
              nullable: false,
              primary_key: false,
              unique: false,
              default: "'active'",
            },
            {
              name: 'created_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
            {
              name: 'updated_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
          ],
          indexes: [{ name: 'idx_projects_owner', columns: ['owner_id'], unique: false }],
          description: 'Hackathon projects',
        },
        {
          name: 'tasks',
          columns: [
            {
              name: 'id',
              type: 'UUID',
              nullable: false,
              primary_key: true,
              unique: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'project_id',
              type: 'UUID',
              nullable: false,
              primary_key: false,
              unique: false,
              references: 'projects(id)',
            },
            { name: 'title', type: 'VARCHAR(255)', nullable: false, primary_key: false, unique: false },
            { name: 'description', type: 'TEXT', nullable: true, primary_key: false, unique: false },
            {
              name: 'status',
              type: 'VARCHAR(50)',
              nullable: false,
              primary_key: false,
              unique: false,
              default: "'pending'",
            },
            {
              name: 'assignee_id',
              type: 'UUID',
              nullable: true,
              primary_key: false,
              unique: false,
              references: 'users(id)',
            },
            { name: 'due_date', type: 'TIMESTAMPTZ', nullable: true, primary_key: false, unique: false },
            {
              name: 'created_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
          ],
          indexes: [
            { name: 'idx_tasks_project', columns: ['project_id'], unique: false },
            { name: 'idx_tasks_assignee', columns: ['assignee_id'], unique: false },
          ],
          description: 'Project tasks',
        },
        {
          name: 'events',
          columns: [
            {
              name: 'id',
              type: 'UUID',
              nullable: false,
              primary_key: true,
              unique: true,
              default: 'gen_random_uuid()',
            },
            { name: 'type', type: 'VARCHAR(100)', nullable: false, primary_key: false, unique: false },
            { name: 'payload', type: 'JSONB', nullable: true, primary_key: false, unique: false },
            { name: 'source', type: 'VARCHAR(100)', nullable: false, primary_key: false, unique: false },
            {
              name: 'created_at',
              type: 'TIMESTAMPTZ',
              nullable: false,
              primary_key: false,
              unique: false,
              default: 'NOW()',
            },
          ],
          indexes: [{ name: 'idx_events_type', columns: ['type'], unique: false }],
          description: 'Event store for audit and replay',
        },
      ],
    };
  }

  async defineApiContracts(plan: PlannerOutput, stack: RecommendedStack): Promise<RequestSchema[]> {
    return [
      {
        method: 'POST',
        path: '/api/auth/register',
        description: 'Register a new user',
        auth_required: false,
        request_body: '{ email, name, password }',
        response_body: '{ user, token }',
        query_params: [],
        path_params: [],
        error_responses: [{ status_code: 409, description: 'Email already exists' }],
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Authenticate user',
        auth_required: false,
        request_body: '{ email, password }',
        response_body: '{ token }',
        query_params: [],
        path_params: [],
        error_responses: [{ status_code: 401, description: 'Invalid credentials' }],
      },
      {
        method: 'GET',
        path: '/api/projects',
        description: 'List user projects',
        auth_required: true,
        response_body: '{ projects: Project[] }',
        query_params: [],
        path_params: [],
        error_responses: [],
      },
      {
        method: 'POST',
        path: '/api/projects',
        description: 'Create a project',
        auth_required: true,
        request_body: '{ name, description }',
        response_body: '{ project }',
        query_params: [],
        path_params: [],
        error_responses: [],
      },
      {
        method: 'GET',
        path: '/api/projects/:id',
        description: 'Get project details',
        auth_required: true,
        path_params: [{ name: 'id', type: 'string', description: 'Project UUID' }],
        query_params: [],
        error_responses: [{ status_code: 404, description: 'Project not found' }],
      },
      {
        method: 'PUT',
        path: '/api/projects/:id',
        description: 'Update project',
        auth_required: true,
        path_params: [{ name: 'id', type: 'string' }],
        request_body: '{ name?, description?, status? }',
        query_params: [],
        error_responses: [],
      },
      {
        method: 'DELETE',
        path: '/api/projects/:id',
        description: 'Delete project',
        auth_required: true,
        path_params: [{ name: 'id', type: 'string' }],
        query_params: [],
        error_responses: [{ status_code: 404, description: 'Project not found' }],
      },
      {
        method: 'GET',
        path: '/api/projects/:id/tasks',
        description: 'List project tasks',
        auth_required: true,
        path_params: [{ name: 'id', type: 'string' }],
        query_params: [{ name: 'status', type: 'string', required: false, description: 'Filter by status' }],
        error_responses: [],
      },
      {
        method: 'POST',
        path: '/api/projects/:id/tasks',
        description: 'Create task',
        auth_required: true,
        path_params: [{ name: 'id', type: 'string' }],
        request_body: '{ title, description, assignee_id?, due_date? }',
        query_params: [],
        error_responses: [],
      },
      {
        method: 'GET',
        path: '/api/health',
        description: 'Health check',
        auth_required: false,
        response_body: '{ status, timestamp }',
        query_params: [],
        path_params: [],
        error_responses: [],
      },
    ];
  }

  async defineFrontendModules(plan: PlannerOutput, stack: RecommendedStack): Promise<Component[]> {
    return [
      {
        name: 'AuthModule',
        description: 'Authentication (login, register, password reset)',
        props: [],
        state_management: 'React Context',
        dependencies: ['react-router-dom'],
      },
      {
        name: 'ProjectList',
        description: 'List and search user projects',
        props: [{ name: 'projects', type: 'Project[]', required: true }],
        dependencies: ['ProjectCard'],
      },
      {
        name: 'ProjectDetail',
        description: 'View and edit project details',
        props: [{ name: 'projectId', type: 'string', required: true }],
        dependencies: ['TaskList', 'ProjectForm'],
      },
      {
        name: 'TaskList',
        description: 'Kanban-style task board',
        props: [
          { name: 'tasks', type: 'Task[]', required: true },
          { name: 'onUpdate', type: '(task: Task) => void', required: true },
        ],
        dependencies: ['TaskCard', 'dnd-kit'],
      },
      {
        name: 'Dashboard',
        description: 'Main dashboard with project overview',
        props: [],
        state_management: 'React Context',
        dependencies: ['ProjectList', 'ActivityFeed'],
      },
    ];
  }

  async defineBackendModules(
    plan: PlannerOutput,
    stack: RecommendedStack,
    endpoints: RequestSchema[],
  ): Promise<
    Array<{
      name: string;
      description: string;
      endpoints: string[];
      dependencies: string[];
      environment_variables: Array<{ name: string; description: string; required: boolean }>;
    }>
  > {
    return [
      {
        name: 'AuthService',
        description: 'User authentication and authorization',
        endpoints: ['POST /api/auth/register', 'POST /api/auth/login'],
        dependencies: ['UserService', 'JWT'],
        environment_variables: [
          { name: 'JWT_SECRET', description: 'Secret key for JWT signing', required: true },
          { name: 'JWT_EXPIRY', description: 'Token expiration time', required: false },
        ],
      },
      {
        name: 'ProjectService',
        description: 'Project CRUD operations',
        endpoints: [
          'GET /api/projects',
          'POST /api/projects',
          'GET /api/projects/:id',
          'PUT /api/projects/:id',
          'DELETE /api/projects/:id',
        ],
        dependencies: ['AuthService', 'Database'],
        environment_variables: [],
      },
      {
        name: 'TaskService',
        description: 'Task management within projects',
        endpoints: ['GET /api/projects/:id/tasks', 'POST /api/projects/:id/tasks'],
        dependencies: ['ProjectService', 'Database'],
        environment_variables: [],
      },
      {
        name: 'HealthService',
        description: 'System health check endpoint',
        endpoints: ['GET /api/health'],
        dependencies: [],
        environment_variables: [],
      },
    ];
  }

  async planMilestones(plan: PlannerOutput): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      due_offset_hours: number;
      tasks: Array<{ id: string; description: string; estimated_hours: number; depends_on: string[] }>;
      deliverables: string[];
      verification?: string;
    }>
  > {
    const maxHours = Math.max(...plan.project_ideas.map((i) => i.estimated_build_time_hours));
    const totalHours = maxHours;

    return [
      {
        id: 'ms-1',
        name: 'Foundation',
        description: 'Project scaffolding, CI/CD, database setup',
        due_offset_hours: Math.round(totalHours * 0.15),
        tasks: [
          { id: 'ms1-t1', description: 'Initialize monorepo with TypeScript', estimated_hours: 2, depends_on: [] },
          { id: 'ms1-t2', description: 'Set up Docker and Docker Compose', estimated_hours: 2, depends_on: [] },
          { id: 'ms1-t3', description: 'Configure CI/CD pipeline', estimated_hours: 2, depends_on: [] },
          { id: 'ms1-t4', description: 'Set up database schema and migrations', estimated_hours: 3, depends_on: [] },
        ],
        deliverables: ['Running dev environment', 'CI passing on main branch', 'Database tables created'],
        verification: 'Run `docker-compose up` and confirm API responds at /api/health',
      },
      {
        id: 'ms-2',
        name: 'Core Backend',
        description: 'Authentication, project CRUD, task management APIs',
        due_offset_hours: Math.round(totalHours * 0.4),
        tasks: [
          {
            id: 'ms2-t1',
            description: 'Implement AuthService (register/login/JWT)',
            estimated_hours: 4,
            depends_on: [],
          },
          { id: 'ms2-t2', description: 'Implement ProjectService CRUD', estimated_hours: 3, depends_on: [] },
          {
            id: 'ms2-t3',
            description: 'Implement TaskService with status management',
            estimated_hours: 3,
            depends_on: [],
          },
          { id: 'ms2-t4', description: 'Write API integration tests', estimated_hours: 3, depends_on: [] },
        ],
        deliverables: ['All API endpoints functional', 'Postman collection or test suite'],
        verification: 'All integration tests pass',
      },
      {
        id: 'ms-3',
        name: 'Frontend Shell',
        description: 'Authentication pages, project list, dashboard layout',
        due_offset_hours: Math.round(totalHours * 0.65),
        tasks: [
          { id: 'ms3-t1', description: 'Set up React app with routing', estimated_hours: 2, depends_on: [] },
          {
            id: 'ms3-t2',
            description: 'Implement AuthModule (login/register pages)',
            estimated_hours: 4,
            depends_on: [],
          },
          { id: 'ms3-t3', description: 'Build ProjectList component', estimated_hours: 3, depends_on: [] },
          { id: 'ms3-t4', description: 'Build Dashboard layout with navigation', estimated_hours: 3, depends_on: [] },
        ],
        deliverables: ['Working login flow', 'Project list page', 'Dashboard navigation'],
        verification: 'User can register, login, and see project list',
      },
      {
        id: 'ms-4',
        name: 'Feature Completion',
        description: 'Project detail, task board, polish',
        due_offset_hours: Math.round(totalHours * 0.9),
        tasks: [
          { id: 'ms4-t1', description: 'Build ProjectDetail page with edit', estimated_hours: 4, depends_on: [] },
          { id: 'ms4-t2', description: 'Build TaskList with drag-and-drop kanban', estimated_hours: 6, depends_on: [] },
          { id: 'ms4-t3', description: 'Add error handling and loading states', estimated_hours: 3, depends_on: [] },
          { id: 'ms4-t4', description: 'Responsive design polish', estimated_hours: 3, depends_on: [] },
        ],
        deliverables: ['Kanban board functional', 'Project details editable', 'Responsive UI'],
        verification: 'E2E tests pass for all user flows',
      },
      {
        id: 'ms-5',
        name: 'Deployment & Polish',
        description: 'Final testing, deployment, documentation',
        due_offset_hours: totalHours,
        tasks: [
          { id: 'ms5-t1', description: 'Write E2E tests', estimated_hours: 4, depends_on: [] },
          { id: 'ms5-t2', description: 'Set up production deployment', estimated_hours: 3, depends_on: [] },
          { id: 'ms5-t3', description: 'Write project documentation and README', estimated_hours: 2, depends_on: [] },
          { id: 'ms5-t4', description: 'Final QA and bug fixes', estimated_hours: 4, depends_on: [] },
        ],
        deliverables: ['Deployed application', 'README with setup instructions', 'Test suite passing'],
        verification: 'Final demo walkthrough passes all acceptance criteria',
      },
    ];
  }

  async buildExecutionGraph(
    plan: PlannerOutput,
    milestones: Array<unknown>,
  ): Promise<{ nodes: ExecutionNode[]; entryPoint: string }> {
    const nodes: ExecutionNode[] = [
      { id: 'setup-env', label: 'Setup Environment', type: 'task', estimated_duration_minutes: 30, depends_on: [] },
      {
        id: 'init-repo',
        label: 'Initialize Repository',
        type: 'task',
        estimated_duration_minutes: 60,
        depends_on: ['setup-env'],
      },
      {
        id: 'choose-stack',
        label: 'Select Stack',
        type: 'decision',
        estimated_duration_minutes: 15,
        depends_on: ['init-repo'],
      },
      {
        id: 'setup-db',
        label: 'Setup Database',
        type: 'task',
        estimated_duration_minutes: 120,
        depends_on: ['choose-stack'],
      },
      {
        id: 'build-api',
        label: 'Build API',
        type: 'subprocess',
        estimated_duration_minutes: 240,
        depends_on: ['setup-db'],
      },
      {
        id: 'build-frontend',
        label: 'Build Frontend',
        type: 'subprocess',
        estimated_duration_minutes: 360,
        depends_on: ['setup-db'],
      },
      {
        id: 'integrate',
        label: 'Integration',
        type: 'task',
        estimated_duration_minutes: 120,
        depends_on: ['build-api', 'build-frontend'],
      },
      {
        id: 'human-review',
        label: 'Human Review',
        type: 'checkpoint',
        estimated_duration_minutes: 30,
        depends_on: ['integrate'],
      },
      {
        id: 'parallel-tasks',
        label: 'Parallel Tasks',
        type: 'parallel',
        estimated_duration_minutes: 180,
        depends_on: ['human-review'],
      },
      {
        id: 'final-test',
        label: 'Final Testing',
        type: 'task',
        estimated_duration_minutes: 120,
        depends_on: ['parallel-tasks'],
      },
      { id: 'deploy', label: 'Deploy', type: 'task', estimated_duration_minutes: 60, depends_on: ['final-test'] },
    ];

    return { nodes, entryPoint: 'setup-env' };
  }

  async identifySkills(plan: PlannerOutput, stack: RecommendedStack): Promise<SkillRequirement[]> {
    return [
      { skill: 'TypeScript', level: 'intermediate', required: true, notes: 'Used across frontend and backend' },
      { skill: 'React', level: 'intermediate', required: true, notes: 'Frontend framework' },
      {
        skill: 'Node.js',
        level: 'intermediate',
        required: !stack.backend.some((b) => b.name.toLowerCase().includes('python')),
        notes: 'Backend runtime if using Express',
      },
      { skill: 'PostgreSQL', level: 'intermediate', required: true, notes: 'Primary database' },
      { skill: 'Docker', level: 'beginner', required: true, notes: 'Containerization for local dev and deployment' },
      { skill: 'Git', level: 'intermediate', required: true, notes: 'Version control and collaboration' },
      { skill: 'Tailwind CSS', level: 'beginner', required: false, notes: 'Utility-first CSS framework' },
      { skill: 'CI/CD', level: 'beginner', required: false, notes: 'Automated testing and deployment' },
      {
        skill: 'REST API Design',
        level: 'intermediate',
        required: true,
        notes: 'API contract design and implementation',
      },
    ];
  }

  async assessArchitectureRisks(plan: PlannerOutput): Promise<ArchitectureBlueprint['risks']> {
    return [
      {
        category: 'technical',
        description: 'Full-stack TypeScript requires strong type management across the entire codebase.',
        severity: 'medium',
        mitigation: 'Use shared types package and enforce strict TypeScript configuration.',
      },
      {
        category: 'scope',
        description: 'Feature creep may occur during the frontend phase, especially around drag-and-drop kanban.',
        severity: 'high',
        mitigation: 'Implement MVP kanban first (no drag-and-drop), enhance if time permits.',
      },
      {
        category: 'time',
        description: 'Estimated build time is tight; any delays in backend will cascade to frontend.',
        severity: 'high',
        mitigation: 'Start frontend shell with mock data in parallel with backend development.',
      },
      {
        category: 'team',
        description: 'Skill levels may vary, particularly with TypeScript and Docker.',
        severity: 'medium',
        mitigation: 'Pair program on complex features and provide documentation references.',
      },
      {
        category: 'external',
        description: 'Third-party API availability and rate limits may impact development.',
        severity: 'low',
        mitigation: 'Cache API responses and implement graceful degradation.',
      },
    ];
  }

  async identifyCheckpoints(plan: PlannerOutput, milestones: Array<unknown>): Promise<HumanCheckpoint[]> {
    return [
      {
        id: 'cp-1',
        phase: 'Planning',
        question: "Does the recommended tech stack match your team's expertise?",
        options: ['Yes, proceed', 'Modify stack'],
        required: true,
        description: 'Confirm stack selection before scaffolding begins.',
      },
      {
        id: 'cp-2',
        phase: 'Development',
        question: 'Have you completed the core backend APIs?',
        options: ['Yes, proceed to frontend', 'Need more time'],
        required: true,
        description: 'Gate between Milestone 2 and Milestone 3.',
      },
      {
        id: 'cp-3',
        phase: 'Development',
        question: 'Is the kanban board functional with the current feature set?',
        options: ['Yes, ready for polish', 'Need additional features'],
        required: false,
        description: 'Checkpoint before entering polish phase.',
      },
      {
        id: 'cp-4',
        phase: 'Deployment',
        question: 'Ready to deploy to production?',
        options: ['Yes, deploy', 'Run additional tests'],
        required: true,
        description: 'Final go/no-go before deployment.',
      },
    ];
  }
}

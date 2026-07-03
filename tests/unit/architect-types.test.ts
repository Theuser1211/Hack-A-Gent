import { describe, it, expect } from 'vitest';

import {
  TechnologySchema,
  RecommendedStackSchema,
  FolderStructureSchema,
  ColumnSchema,
  TableSchema,
  DatabaseSchema,
  RequestSchemaSchema,
  ApiContractSchema,
  ComponentSchema,
  FrontendModuleSchema,
  BackendModuleSchema,
  MilestoneTaskSchema,
  MilestoneSchema,
  ExecutionNodeSchema,
  ExecutionGraphSchema,
  SkillRequirementSchema,
  HumanCheckpointSchema,
  ArchitectureBlueprintSchema,
} from '../../kernel/planning/architect-types.js';

describe('Architect Types', () => {
  describe('TechnologySchema', () => {
    it('accepts valid technology', () => {
      const tech = TechnologySchema.parse({
        name: 'React',
        version: '18.x',
        purpose: 'UI framework',
        alternatives: ['Vue'],
        rationale: 'Popular framework',
      });
      expect(tech.name).toBe('React');
      expect(tech.alternatives).toEqual(['Vue']);
    });

    it('accepts minimal technology', () => {
      const tech = TechnologySchema.parse({ name: 'Node.js', purpose: 'Runtime' });
      expect(tech.name).toBe('Node.js');
      expect(tech.alternatives).toEqual([]);
    });
  });

  describe('RecommendedStackSchema', () => {
    it('accepts empty stack', () => {
      const stack = RecommendedStackSchema.parse({});
      expect(stack.frontend).toEqual([]);
      expect(stack.backend).toEqual([]);
      expect(stack.database).toEqual([]);
    });

    it('accepts full stack', () => {
      const stack = RecommendedStackSchema.parse({
        frontend: [{ name: 'React', purpose: 'UI' }],
        backend: [{ name: 'Node.js', purpose: 'API' }],
        database: [{ name: 'PostgreSQL', purpose: 'Data' }],
        infrastructure: [{ name: 'Docker', purpose: 'Container' }],
        tooling: [{ name: 'Vitest', purpose: 'Testing' }],
      });
      expect(stack.frontend).toHaveLength(1);
      expect(stack.backend).toHaveLength(1);
      expect(stack.database).toHaveLength(1);
      expect(stack.infrastructure).toHaveLength(1);
      expect(stack.tooling).toHaveLength(1);
    });
  });

  describe('FolderStructureSchema', () => {
    it('accepts folder entries', () => {
      const structure = FolderStructureSchema.parse({
        root: '/project',
        entries: [{ path: 'src/', type: 'dir', children: [{ path: 'src/index.ts', type: 'file' }] }],
      });
      expect(structure.root).toBe('/project');
      expect(structure.entries).toHaveLength(1);
    });
  });

  describe('ColumnSchema', () => {
    it('accepts valid column', () => {
      const col = ColumnSchema.parse({
        name: 'id',
        type: 'UUID',
        primary_key: true,
      });
      expect(col.name).toBe('id');
      expect(col.primary_key).toBe(true);
      expect(col.nullable).toBe(false);
    });
  });

  describe('TableSchema', () => {
    it('accepts valid table', () => {
      const table = TableSchema.parse({
        name: 'users',
        columns: [{ name: 'id', type: 'UUID', primary_key: true }],
        indexes: [{ name: 'idx_email', columns: ['email'], unique: true }],
      });
      expect(table.name).toBe('users');
      expect(table.columns).toHaveLength(1);
      expect(table.indexes).toHaveLength(1);
    });
  });

  describe('DatabaseSchema', () => {
    it('accepts valid database schema', () => {
      const db = DatabaseSchema.parse({
        engine: 'PostgreSQL',
        tables: [{ name: 'users', columns: [{ name: 'id', type: 'UUID', primary_key: true }] }],
        relationships: [{ from: 'users.id', to: 'projects.owner_id', type: 'one-to-many' }],
      });
      expect(db.engine).toBe('PostgreSQL');
      expect(db.tables).toHaveLength(1);
      expect(db.relationships).toHaveLength(1);
    });
  });

  describe('RequestSchemaSchema', () => {
    it('accepts valid request schema', () => {
      const req = RequestSchemaSchema.parse({
        method: 'GET',
        path: '/api/health',
        description: 'Health check',
        auth_required: false,
        error_responses: [{ status_code: 500, description: 'Server error' }],
      });
      expect(req.method).toBe('GET');
      expect(req.path).toBe('/api/health');
    });

    it('rejects invalid HTTP method', () => {
      expect(() =>
        RequestSchemaSchema.parse({
          method: 'OPTIONS',
          path: '/api/test',
          description: 'Invalid',
        }),
      ).toThrow();
    });
  });

  describe('ApiContractSchema', () => {
    it('accepts valid API contract', () => {
      const api = ApiContractSchema.parse({
        endpoints: [{ method: 'GET', path: '/api/health', description: 'Health' }],
        base_url: '/api',
        auth_scheme: 'JWT',
      });
      expect(api.endpoints).toHaveLength(1);
      expect(api.auth_scheme).toBe('JWT');
    });
  });

  describe('ComponentSchema', () => {
    it('accepts valid component', () => {
      const comp = ComponentSchema.parse({
        name: 'ProjectList',
        description: 'List projects',
        props: [{ name: 'projects', type: 'Project[]', required: true }],
        dependencies: ['ProjectCard'],
      });
      expect(comp.name).toBe('ProjectList');
      expect(comp.props).toHaveLength(1);
    });
  });

  describe('FrontendModuleSchema', () => {
    it('accepts valid frontend module', () => {
      const mod = FrontendModuleSchema.parse({
        name: 'Auth',
        description: 'Authentication module',
        route: '/auth',
        components: [{ name: 'LoginForm', description: 'Login form' }],
        services: ['api-client'],
      });
      expect(mod.name).toBe('Auth');
      expect(mod.components).toHaveLength(1);
    });
  });

  describe('BackendModuleSchema', () => {
    it('accepts valid backend module', () => {
      const mod = BackendModuleSchema.parse({
        name: 'AuthService',
        description: 'Auth service',
        endpoints: ['POST /api/auth/login'],
        environment_variables: [{ name: 'JWT_SECRET', description: 'Secret', required: true }],
      });
      expect(mod.name).toBe('AuthService');
      expect(mod.environment_variables).toHaveLength(1);
    });
  });

  describe('MilestoneTaskSchema', () => {
    it('accepts valid milestone task', () => {
      const task = MilestoneTaskSchema.parse({
        id: 't1',
        description: 'Setup project',
        estimated_hours: 2,
        depends_on: ['t0'],
      });
      expect(task.estimated_hours).toBe(2);
      expect(task.depends_on).toEqual(['t0']);
    });
  });

  describe('MilestoneSchema', () => {
    it('accepts valid milestone', () => {
      const ms = MilestoneSchema.parse({
        id: 'ms-1',
        name: 'Foundation',
        description: 'Initial setup',
        due_offset_hours: 4,
        tasks: [{ id: 't1', description: 'Setup', estimated_hours: 2 }],
        deliverables: ['Running app'],
        verification: 'Check /api/health',
      });
      expect(ms.name).toBe('Foundation');
      expect(ms.tasks).toHaveLength(1);
    });
  });

  describe('ExecutionNodeSchema', () => {
    it('accepts valid execution node', () => {
      const node = ExecutionNodeSchema.parse({
        id: 'setup',
        label: 'Setup Environment',
        type: 'task',
        estimated_duration_minutes: 30,
        depends_on: [],
      });
      expect(node.type).toBe('task');
      expect(node.depends_on).toEqual([]);
    });

    it('rejects invalid node type', () => {
      expect(() =>
        ExecutionNodeSchema.parse({
          id: 'bad',
          label: 'Bad',
          type: 'invalid',
          depends_on: [],
        }),
      ).toThrow();
    });
  });

  describe('ExecutionGraphSchema', () => {
    it('accepts valid execution graph', () => {
      const graph = ExecutionGraphSchema.parse({
        nodes: [{ id: 'a', label: 'A', type: 'task', depends_on: [] }],
        edges: [{ from: 'a', to: 'b' }],
        entry_point: 'a',
      });
      expect(graph.nodes).toHaveLength(1);
      expect(graph.entry_point).toBe('a');
    });
  });

  describe('SkillRequirementSchema', () => {
    it('accepts valid skill requirement', () => {
      const skill = SkillRequirementSchema.parse({
        skill: 'TypeScript',
        level: 'intermediate',
        required: true,
      });
      expect(skill.level).toBe('intermediate');
      expect(skill.required).toBe(true);
    });
  });

  describe('HumanCheckpointSchema', () => {
    it('accepts valid checkpoint', () => {
      const cp = HumanCheckpointSchema.parse({
        id: 'cp-1',
        phase: 'Planning',
        question: 'Ready to proceed?',
        options: ['Yes', 'No'],
        required: true,
      });
      expect(cp.phase).toBe('Planning');
      expect(cp.options).toEqual(['Yes', 'No']);
    });
  });

  describe('ArchitectureBlueprintSchema', () => {
    it('accepts complete blueprint', () => {
      const blueprint = ArchitectureBlueprintSchema.parse({
        project_name: 'Test Project',
        summary: 'Architecture summary',
        recommended_stack: {},
        folder_structure: { root: '/project', entries: [] },
        database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
        api_contracts: { endpoints: [] },
        frontend_modules: [],
        backend_modules: [],
        milestones: [],
        execution_graph: { nodes: [], edges: [], entry_point: 'start' },
        required_skills: [],
        risks: [],
        human_checkpoints: [],
        generated_at: new Date().toISOString(),
      });
      expect(blueprint.project_name).toBe('Test Project');
      expect(blueprint.summary).toBe('Architecture summary');
    });
  });
});

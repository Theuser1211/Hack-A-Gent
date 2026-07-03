import { describe, it, expect } from 'vitest';

import { MockBuilderProvider } from '../../kernel/builders/mock-builder-provider.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';

function createSampleBlueprint(overrides?: Partial<ArchitectureBlueprint>): ArchitectureBlueprint {
  return {
    project_name: 'TestApp',
    summary: 'A test application',
    recommended_stack: {
      frontend: [{ name: 'React', version: '18', purpose: 'UI framework', alternatives: ['Vue'] }],
      backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: ['Python'] }],
      database: [{ name: 'PostgreSQL', version: '16', purpose: 'Primary DB', alternatives: ['MySQL'] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: {
      engine: 'PostgreSQL',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'SERIAL', primary_key: true, nullable: false, unique: true },
            { name: 'email', type: 'VARCHAR(255)', primary_key: false, nullable: false, unique: true },
          ],
          indexes: [],
        },
      ],
      relationships: [],
    },
    api_contracts: {
      base_url: '/api',
      endpoints: [
        {
          method: 'GET',
          path: '/health',
          description: 'Health check',
          request_body: 'none',
          response_body: 'json',
          auth_required: false,
          query_params: [],
          path_params: [],
          error_responses: [],
        },
      ],
    },
    frontend_modules: [],
    backend_modules: [],
    milestones: [],
    execution_graph: { nodes: [], edges: [], entry_point: 'milestone-1' },
    required_skills: [],
    human_checkpoints: [],
    risks: [],
    generated_at: new Date().toISOString(),
    ...overrides,
  } as ArchitectureBlueprint;
}

describe('MockBuilderProvider', () => {
  const provider = new MockBuilderProvider();

  describe('generateFrontend', () => {
    it('generates frontend module', async () => {
      const module = await provider.generateFrontend(createSampleBlueprint());
      expect(module.name).toBe('frontend');
      expect(module.type).toBe('frontend');
      expect(module.files.length).toBeGreaterThan(0);
    });

    it('includes App.tsx in frontend files', async () => {
      const module = await provider.generateFrontend(createSampleBlueprint());
      const paths = module.files.map((f) => f.path);
      expect(paths).toContain('src/frontend/App.tsx');
    });
  });

  describe('generateBackend', () => {
    it('generates Node.js backend when stack says Node.js', async () => {
      const module = await provider.generateBackend(createSampleBlueprint());
      expect(module.name).toBe('backend');
      expect(module.files.some((f) => f.path.includes('index.ts'))).toBe(true);
    });

    it('generates Python backend when stack says Python', async () => {
      const blueprint = createSampleBlueprint({
        recommended_stack: {
          ...createSampleBlueprint().recommended_stack,
          backend: [{ name: 'Python', version: '3.12', purpose: 'Runtime', alternatives: [], rationale: 'Fast' }],
        },
      });
      const module = await provider.generateBackend(blueprint);
      expect(module.files.some((f) => f.path.endsWith('.py'))).toBe(true);
    });
  });

  describe('generateDatabase', () => {
    it('generates database module with migration', async () => {
      const module = await provider.generateDatabase(createSampleBlueprint());
      expect(module.name).toBe('database');
      expect(module.files.some((f) => f.path.includes('migrations'))).toBe(true);
    });

    it('includes CREATE TABLE for each table', async () => {
      const module = await provider.generateDatabase(createSampleBlueprint());
      const migration = module.files.find((f) => f.path.includes('migrations'));
      expect(migration).toBeDefined();
      expect(migration!.content).toContain('CREATE TABLE');
      expect(migration!.content).toContain('users');
    });
  });

  describe('generateConfig', () => {
    it('generates config files', async () => {
      const module = await provider.generateConfig(createSampleBlueprint());
      expect(module.name).toBe('config');
      expect(module.files).toHaveLength(5);
    });

    it('includes .env.example', async () => {
      const module = await provider.generateConfig(createSampleBlueprint());
      expect(module.files.some((f) => f.path === '.env.example')).toBe(true);
    });
  });

  describe('generateDocumentation', () => {
    it('generates README with project name', async () => {
      const module = await provider.generateDocumentation(createSampleBlueprint());
      const readme = module.files.find((f) => f.path === 'README.md');
      expect(readme).toBeDefined();
      expect(readme!.content).toContain('TestApp');
    });

    it('includes API documentation with endpoints', async () => {
      const module = await provider.generateDocumentation(createSampleBlueprint());
      const apiDoc = module.files.find((f) => f.path === 'docs/api.md');
      expect(apiDoc).toBeDefined();
      expect(apiDoc!.content).toContain('GET');
    });
  });

  describe('generateTests', () => {
    it('generates test files', async () => {
      const module = await provider.generateTests(createSampleBlueprint());
      expect(module.name).toBe('tests');
      expect(module.files).toHaveLength(2);
    });
  });
});

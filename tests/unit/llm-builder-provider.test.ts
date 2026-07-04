import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LLMBuilderProvider } from '../../kernel/generation/llm-builder-provider.js';
import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';

function createMockLLMProvider(): LLMProvider {
  return {
    providerId: 'local',
    getModels: () => [
      {
        model_id: 'mock-model',
        provider: 'local' as const,
        capabilities: ['code_generation'],
        context_window: 128000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 100,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
      {
        model_id: 'fallback-model',
        provider: 'local' as const,
        capabilities: ['code_generation'],
        context_window: 64000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 200,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
    ],
    getHealth: () => ({
      provider_id: 'local' as const,
      status: 'healthy' as const,
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 10,
      failed_requests: 0,
      avg_latency_ms: 100,
    }),
    checkHealth: async () => ({
      provider_id: 'local' as const,
      status: 'healthy' as const,
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 10,
      failed_requests: 0,
      avg_latency_ms: 100,
    }),
    execute: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        path: 'src/frontend/App.tsx',
        content: 'export function App() { return <div>Hello</div>; }',
        language: 'typescript',
        dependencies: [],
        exports: [{ name: 'App', type: 'function' }],
        imports: [],
      }),
      model_id: 'mock-model',
      provider: 'local' as const,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finish_reason: 'stop',
      latency_ms: 200,
    }),
  };
}

function createSampleBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'TestApp',
    version: '1.0.0',
    summary: 'A test app',
    recommended_stack: {
      frontend: [{ name: 'React', purpose: 'UI', alternatives: [] }],
      backend: [{ name: 'Node.js', purpose: 'Runtime', alternatives: [] }],
      database: [{ name: 'PostgreSQL', purpose: 'DB', alternatives: [] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
    api_contracts: { base_url: '/api', endpoints: [] },
    frontend_modules: [],
    backend_modules: [],
    milestones: [],
    execution_graph: { nodes: [], edges: [], entry_point: 'm1' },
    required_skills: [],
    risks: [],
    human_checkpoints: [],
    generated_at: new Date().toISOString(),
    architect_version: '1.0.0',
  };
}

describe('LLMBuilderProvider', () => {
  let provider: LLMBuilderProvider;
  let router: RouterEngine;

  beforeEach(() => {
    const mockProvider = createMockLLMProvider();
    router = new RouterEngine(
      [mockProvider],
      {},
      { coding: { preferred: 'mock-model', fallback: 'fallback-model', emergency: 'mock-model' } },
    );
    provider = new LLMBuilderProvider({ router, taskType: 'coding', selfRepairConfig: { max_attempts: 1 } });
  });

  it('generates frontend module with files', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateFrontend(blueprint);
    expect(result.name).toBe('frontend');
    expect(result.type).toBe('frontend');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('generates backend module', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateBackend(blueprint);
    expect(result.name).toBe('backend');
    expect(result.type).toBe('backend');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('generates database module', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateDatabase(blueprint);
    expect(result.name).toBe('database');
    expect(result.type).toBe('database');
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('generates config module', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateConfig(blueprint);
    expect(result.name).toBe('config');
    expect(result.type).toBe('config');
  });

  it('generates docs module', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateDocumentation(blueprint);
    expect(result.name).toBe('docs');
    expect(result.type).toBe('docs');
  });

  it('generates tests module', async () => {
    const blueprint = createSampleBlueprint();
    const result = await provider.generateTests(blueprint);
    expect(result.name).toBe('tests');
    expect(result.type).toBe('tests');
  });

  it('handles LLM failure gracefully', async () => {
    const mockProvider = createMockLLMProvider();
    mockProvider.execute = vi.fn().mockRejectedValue(new Error('LLM unavailable'));
    const badRouter = new RouterEngine(
      [mockProvider],
      {},
      { coding: { preferred: 'mock-model', fallback: 'fallback-model', emergency: 'mock-model' } },
    );
    const badProvider = new LLMBuilderProvider({
      router: badRouter,
      taskType: 'coding',
      selfRepairConfig: { max_attempts: 1 },
    });

    const blueprint = createSampleBlueprint();
    const result = await badProvider.generateFrontend(blueprint);
    expect(result.files.length).toBe(0);
  });

  it('generates files with correct paths based on blueprint', async () => {
    const blueprint = createSampleBlueprint();
    blueprint.frontend_modules = [
      {
        name: 'Dashboard',
        description: 'Dashboard module',
        components: [{ name: 'Dashboard', description: 'Main dashboard', props: [], dependencies: [] }],
        services: ['api'],
      },
    ];

    const result = await provider.generateFrontend(blueprint);
    expect(result.files.some((f) => f.path.includes('Dashboard'))).toBe(true);
  });

  it('generates backend with Python paths when Python is specified', async () => {
    const blueprint = createSampleBlueprint();
    blueprint.recommended_stack.backend = [{ name: 'Python FastAPI', purpose: 'API', alternatives: [] }];

    const result = await provider.generateBackend(blueprint);
    expect(result.description?.toLowerCase()).toContain('python');
  });
});

import { describe, it, expect } from 'vitest';

import {
  generateBenchmarkReport,
  generateCategoryBreakdown,
  generateBenchmarkSummaryMarkdown,
} from '../../benchmarks/benchmark-report.js';
import {
  HackathonBenchmarkDefinitionSchema,
  BenchmarkRunResultSchema,
  BenchmarkSuiteResultSchema,
} from '../../benchmarks/benchmark-types.js';
import type { PartialBenchmarkRunResult } from '../../benchmarks/benchmark-types.js';
import type { BenchmarkRunResult } from '../../benchmarks/benchmark-types.js';
import {
  analyzeFailurePatterns,
  generateFailurePatternsMarkdown,
  getTopFailurePatterns,
} from '../../benchmarks/failure-patterns.js';
import { HackathonBenchmarkRunner } from '../../benchmarks/hackathon-benchmark-runner.js';
import {
  ALL_BENCHMARKS,
  AI_HACKATHON,
  SAAS_HACKATHON,
  WEBAPP_HACKATHON,
  HEALTHCARE_HACKATHON,
  EDUCATION_HACKATHON,
  getBenchmarkById,
  getBenchmarksByCategory,
} from '../../benchmarks/hackathon-benchmarks.js';
import type { GeneratedModule } from '../../kernel/builders/builder-types.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';

function createMockRunResult(overrides: Partial<BenchmarkRunResult> = {}): BenchmarkRunResult {
  return {
    agent_id: '',
    benchmark_id: 'bench-test-001',
    benchmark_name: 'Test Benchmark',
    category: 'webapp',
    run_id: 'run-test-123',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    total_duration_ms: 5000,
    phases: [
      { phase: 'planning', success: true, duration_ms: 500, error: null, token_count: 100, artifacts: [] },
      { phase: 'architecture', success: true, duration_ms: 800, error: null, token_count: 200, artifacts: [] },
      { phase: 'building', success: true, duration_ms: 1500, error: null, token_count: 300, artifacts: [] },
      { phase: 'materialization', success: true, duration_ms: 300, error: null, token_count: 0, artifacts: [] },
      { phase: 'build_verification', success: true, duration_ms: 1000, error: null, token_count: 0, artifacts: [] },
      { phase: 'testing', success: true, duration_ms: 500, error: null, token_count: 0, artifacts: [] },
      { phase: 'judging', success: true, duration_ms: 300, error: null, token_count: 0, artifacts: [] },
      { phase: 'repair', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
    ],
    overall_success: true,
    judge_score: 85,
    judge_verdict: 'pass',
    build_success: true,
    test_success: true,
    total_tokens: 900,
    total_cost: 0.018,
    repair_iterations: 1,
    errors: [],
    artifacts_dir: '/tmp/bench-test',
    adversarial_mode: false,
    mutations_applied: 0,
    mutations_detected: 0,
    mutations_repaired: 0,
    detection_rate: 0,
    repair_success_rate: 0,
    survived_mutation: false,
    robustness_score: 0,
    benchmark_difficulty_index: 50,
    curriculum_state: 'balanced',
    global_difficulty: 0.5,
    repair_strategies_used: [],
    per_mutation_type_stats: {},
    ...overrides,
  };
}

describe('Hackathon Benchmark Definitions', () => {
  it('has 5 benchmark definitions', () => {
    expect(ALL_BENCHMARKS).toHaveLength(5);
  });

  it('all benchmarks have valid IDs', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.id).toMatch(/^bench-/);
    }
  });

  it('all benchmarks have valid Devpost URLs', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.devpost_url).toMatch(/^https:\/\/devpost\.com\//);
    }
  });

  it('all benchmarks have at least 3 deliverables', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.expected_deliverables.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all benchmarks have at least 3 success criteria', () => {
    for (const b of ALL_BENCHMARKS) {
      expect(b.success_criteria.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all benchmarks validate against schema', () => {
    for (const b of ALL_BENCHMARKS) {
      const parsed = HackathonBenchmarkDefinitionSchema.safeParse(b);
      expect(parsed.success).toBe(true);
    }
  });

  it('getBenchmarkById returns correct benchmark', () => {
    const ai = getBenchmarkById('bench-ai-001');
    expect(ai?.name).toBe('AI Hackathon — Smart Assistant');
    const missing = getBenchmarkById('nonexistent');
    expect(missing).toBeUndefined();
  });

  it('getBenchmarksByCategory returns correct count', () => {
    expect(getBenchmarksByCategory('ai')).toHaveLength(1);
    expect(getBenchmarksByCategory('saas')).toHaveLength(1);
    expect(getBenchmarksByCategory('nonexistent')).toHaveLength(0);
  });

  it('each benchmark has unique id', () => {
    const ids = ALL_BENCHMARKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each benchmark has unique name', () => {
    const names = ALL_BENCHMARKS.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('BenchmarkRunResultSchema', () => {
  it('validates a complete run result', () => {
    const result = createMockRunResult();
    const parsed = BenchmarkRunResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('validates a failed run result', () => {
    const result = createMockRunResult({
      overall_success: false,
      build_success: false,
      errors: ['Build failed: tsc compilation error'],
      phases: [
        { phase: 'planning', success: true, duration_ms: 100, error: null, token_count: 50, artifacts: [] },
        { phase: 'architecture', success: true, duration_ms: 200, error: null, token_count: 100, artifacts: [] },
        {
          phase: 'building',
          success: false,
          duration_ms: 500,
          error: 'Build failed: tsc compilation error',
          token_count: 200,
          artifacts: [],
        },
        { phase: 'materialization', success: false, duration_ms: 0, error: null, token_count: 0, artifacts: [] },
        { phase: 'build_verification', success: false, duration_ms: 0, error: null, token_count: 0, artifacts: [] },
        { phase: 'testing', success: false, duration_ms: 0, error: null, token_count: 0, artifacts: [] },
        { phase: 'judging', success: false, duration_ms: 0, error: null, token_count: 0, artifacts: [] },
        { phase: 'repair', success: false, duration_ms: 0, error: null, token_count: 0, artifacts: [] },
      ],
    });
    const parsed = BenchmarkRunResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('validates with null judge score', () => {
    const result = createMockRunResult({ judge_score: null, judge_verdict: null });
    const parsed = BenchmarkRunResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('validates with null test success', () => {
    const result = createMockRunResult({ test_success: null });
    const parsed = BenchmarkRunResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('BenchmarkReport', () => {
  it('generates correct summary from multiple results', () => {
    const results = [
      createMockRunResult({ benchmark_id: 'b1', judge_score: 90, total_tokens: 1000, total_cost: 0.02 }),
      createMockRunResult({ benchmark_id: 'b2', judge_score: 80, total_tokens: 2000, total_cost: 0.04 }),
      createMockRunResult({
        benchmark_id: 'b3',
        overall_success: false,
        build_success: false,
        judge_score: 50,
        total_tokens: 500,
        total_cost: 0.01,
      }),
    ];

    const report = generateBenchmarkReport(results);
    expect(report.summary.total_benchmarks).toBe(3);
    expect(report.summary.passed).toBe(2);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.average_judge_score).toBe(73);
    expect(report.summary.average_build_pass_rate).toBe(67);
    expect(report.summary.average_token_consumption).toBe(1167);
  });

  it('generates category breakdown', () => {
    const results = [
      createMockRunResult({ benchmark_id: 'b1', category: 'ai', judge_score: 90 }),
      createMockRunResult({ benchmark_id: 'b2', category: 'saas', judge_score: 80 }),
      createMockRunResult({ benchmark_id: 'b3', category: 'ai', overall_success: false, judge_score: 50 }),
    ];

    const breakdown = generateCategoryBreakdown(results);
    expect(breakdown.ai).toBeDefined();
    expect(breakdown.ai!.count).toBe(2);
    expect(breakdown.ai!.passRate).toBe(50);
    expect(breakdown.saas).toBeDefined();
    expect(breakdown.saas!.count).toBe(1);
  });

  it('generates markdown report', () => {
    const results = [createMockRunResult()];
    const markdown = generateBenchmarkSummaryMarkdown(results);
    expect(markdown).toContain('Hack-A-Gent Benchmark Suite Report');
    expect(markdown).toContain('Build Pass Rate');
    expect(markdown).toContain('Judge Score');
    expect(markdown).toContain('Phase Success Rates');
  });

  it('benchmark suite result validates', () => {
    const results = [createMockRunResult()];
    const report = generateBenchmarkReport(results);
    const parsed = BenchmarkSuiteResultSchema.safeParse(report);
    expect(parsed.success).toBe(true);
  });

  it('handles empty results', () => {
    const results: BenchmarkRunResult[] = [];
    const report = generateBenchmarkReport(results);
    expect(report.summary.total_benchmarks).toBe(0);
    expect(report.summary.average_judge_score).toBe(0);
    expect(report.summary.average_build_pass_rate).toBe(0);
  });
});

describe('FailurePatterns', () => {
  it('analyzes failure patterns from results', () => {
    const results = [
      createMockRunResult({
        phases: [
          {
            phase: 'planning',
            success: false,
            duration_ms: 100,
            error: 'Rate limit exceeded: too many requests',
            token_count: 50,
            artifacts: [],
          },
          {
            phase: 'architecture',
            success: false,
            duration_ms: 200,
            error: 'Rate limit exceeded: too many requests',
            token_count: 100,
            artifacts: [],
          },
          {
            phase: 'building',
            success: false,
            duration_ms: 300,
            error: 'Operation timed out after 30000ms',
            token_count: 200,
            artifacts: [],
          },
          { phase: 'materialization', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'build_verification', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'testing', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'judging', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'repair', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
        ],
        overall_success: false,
        errors: ['Rate limit exceeded: too many requests', 'Operation timed out after 30000ms'],
      }),
      createMockRunResult({
        phases: [
          {
            phase: 'planning',
            success: false,
            duration_ms: 100,
            error: 'Rate limit exceeded',
            token_count: 50,
            artifacts: [],
          },
          { phase: 'architecture', success: true, duration_ms: 200, error: null, token_count: 100, artifacts: [] },
          {
            phase: 'building',
            success: false,
            duration_ms: 300,
            error: 'Network error: ECONNREFUSED',
            token_count: 200,
            artifacts: [],
          },
          { phase: 'materialization', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'build_verification', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'testing', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'judging', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'repair', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
        ],
        overall_success: false,
        errors: ['Rate limit exceeded', 'Network error: ECONNREFUSED'],
      }),
    ];

    const patterns = analyzeFailurePatterns(results);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.pattern.includes('Rate limit'))).toBe(true);
    expect(patterns.some((p) => p.pattern.includes('Operation timed out'))).toBe(true);
  });

  it('handles no failures gracefully', () => {
    const results = [createMockRunResult()];
    const patterns = analyzeFailurePatterns(results);
    expect(patterns).toHaveLength(0);
  });

  it('generates failure patterns markdown', () => {
    const results = [
      createMockRunResult({
        phases: [
          {
            phase: 'planning',
            success: false,
            duration_ms: 100,
            error: 'Rate limit exceeded',
            token_count: 50,
            artifacts: [],
          },
          { phase: 'architecture', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'building', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'materialization', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'build_verification', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'testing', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'judging', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'repair', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
        ],
        overall_success: false,
        errors: ['Rate limit exceeded'],
      }),
    ];

    const patterns = analyzeFailurePatterns(results);
    const markdown = generateFailurePatternsMarkdown(patterns);
    expect(markdown).toContain('Failure Patterns Analysis');
    expect(markdown).toContain('Rate limit');
    expect(markdown).toContain('Recommendation');
  });

  it('generates empty markdown for no patterns', () => {
    const markdown = generateFailurePatternsMarkdown([]);
    expect(markdown).toContain('No failure patterns detected');
  });

  it('getTopFailurePatterns returns correct count', () => {
    const results = [
      createMockRunResult({
        phases: [
          {
            phase: 'planning',
            success: false,
            duration_ms: 100,
            error: 'Rate limit exceeded',
            token_count: 50,
            artifacts: [],
          },
          { phase: 'architecture', success: false, duration_ms: 100, error: 'Timeout', token_count: 50, artifacts: [] },
          {
            phase: 'building',
            success: false,
            duration_ms: 100,
            error: 'Network error',
            token_count: 50,
            artifacts: [],
          },
          {
            phase: 'materialization',
            success: false,
            duration_ms: 100,
            error: 'Missing file',
            token_count: 50,
            artifacts: [],
          },
          {
            phase: 'build_verification',
            success: false,
            duration_ms: 100,
            error: 'Build failed',
            token_count: 50,
            artifacts: [],
          },
          { phase: 'testing', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'judging', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
          { phase: 'repair', success: true, duration_ms: 100, error: null, token_count: 0, artifacts: [] },
        ],
        overall_success: false,
      }),
    ];

    const patterns = analyzeFailurePatterns(results);
    const top5 = getTopFailurePatterns(patterns, 5);
    expect(top5.length).toBeLessThanOrEqual(5);
  });
});

describe('HackathonBenchmarkRunner', () => {
  it('can be instantiated with mock agents', () => {
    const planner = {
      execute: async () => ({
        output: { project_ideas: [{ name: 'Test', description: 'Test idea' }] } as unknown as PlannerOutput,
      }),
    };
    const architect = {
      execute: async () => ({ output: { project_name: 'Test' } as ArchitectureBlueprint }),
    };
    const builderProvider = {
      generateFrontend: async () => ({
        name: 'frontend',
        type: 'frontend' as const,
        files: [{ path: 'test.tsx', content: 'export function App() {}', language: 'tsx' }],
      }),
      generateBackend: async () => ({
        name: 'backend',
        type: 'backend' as const,
        files: [{ path: 'api.ts', content: 'export const api = {};', language: 'ts' }],
      }),
      generateDatabase: async () => ({
        name: 'database',
        type: 'database' as const,
        files: [{ path: 'schema.sql', content: 'CREATE TABLE test;', language: 'sql' }],
      }),
      generateConfig: async () => ({
        name: 'config',
        type: 'config' as const,
        files: [{ path: '.env', content: 'KEY=val', language: 'text' }],
      }),
      generateDocumentation: async () => ({
        name: 'docs',
        type: 'docs' as const,
        files: [{ path: 'README.md', content: '# Test', language: 'markdown' }],
      }),
      generateTests: async () => ({
        name: 'tests',
        type: 'tests' as const,
        files: [{ path: 'test.spec.ts', content: 'it("works", () => {});', language: 'ts' }],
      }),
    };

    const runner = new HackathonBenchmarkRunner({ planner, architect, builderProvider });
    expect(runner).toBeDefined();
  });

  it('runs benchmark and returns result', async () => {
    const planner = {
      execute: async () => ({
        output: {
          project_ideas: [
            { name: 'TestIdea', description: 'A test project', difficulty_score: 5, innovation_score: 7 },
          ],
        } as unknown as PlannerOutput,
      }),
    };
    const architect = {
      execute: async () => ({
        output: {
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
        } as ArchitectureBlueprint,
      }),
    };
    const builderProvider = {
      generateFrontend: async () => ({
        name: 'frontend',
        type: 'frontend' as const,
        files: [{ path: 'App.tsx', content: 'export function App() { return null; }', language: 'tsx' }],
      }),
      generateBackend: async () => ({
        name: 'backend',
        type: 'backend' as const,
        files: [{ path: 'server.ts', content: 'console.log("ok");', language: 'ts' }],
      }),
      generateDatabase: async () => ({
        name: 'database',
        type: 'database' as const,
        files: [{ path: 'schema.sql', content: '-- schema', language: 'sql' }],
      }),
      generateConfig: async () => ({
        name: 'config',
        type: 'config' as const,
        files: [{ path: '.env', content: 'PORT=3000', language: 'text' }],
      }),
      generateDocumentation: async () => ({
        name: 'docs',
        type: 'docs' as const,
        files: [{ path: 'README.md', content: '# Docs', language: 'markdown' }],
      }),
      generateTests: async () => ({
        name: 'tests',
        type: 'tests' as const,
        files: [{ path: 'test.ts', content: 'it("works", () => {});', language: 'ts' }],
      }),
    };

    const runner = new HackathonBenchmarkRunner({ planner, architect, builderProvider });
    const result = await runner.runBenchmark(AI_HACKATHON);
    expect(result.benchmark_id).toBe('bench-ai-001');
    expect(result.phases.length).toBe(8);
    expect(result.phases.filter((p) => p.phase === 'planning').length).toBe(1);
    expect(result.phases.filter((p) => p.phase === 'architecture').length).toBe(1);
    expect(result.phases.filter((p) => p.phase === 'building').length).toBe(1);
  });

  it('handles phase failures gracefully', async () => {
    const planner = {
      execute: async () => {
        throw new Error('Planner crashed');
      },
    };
    const architect = { execute: async () => ({ output: {} as ArchitectureBlueprint }) };
    const builderProvider = {
      generateFrontend: async () => ({ name: 'frontend', type: 'frontend' as const, files: [] }),
      generateBackend: async () => ({ name: 'backend', type: 'backend' as const, files: [] }),
      generateDatabase: async () => ({ name: 'database', type: 'database' as const, files: [] }),
      generateConfig: async () => ({ name: 'config', type: 'config' as const, files: [] }),
      generateDocumentation: async () => ({ name: 'docs', type: 'docs' as const, files: [] }),
      generateTests: async () => ({ name: 'tests', type: 'tests' as const, files: [] }),
    };

    const runner = new HackathonBenchmarkRunner({ planner, architect, builderProvider });
    const result = await runner.runBenchmark(AI_HACKATHON);
    expect(result.overall_success).toBe(false);
    expect(result.phases[0]?.success).toBe(false);
    expect(result.phases[0]?.error).toContain('Planner crashed');
  });
});

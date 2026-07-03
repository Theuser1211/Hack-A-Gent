import { describe, it, expect } from 'vitest';

import type { GeneratedRepository } from '../../kernel/builders/builder-types.js';
import {
  MockJudgeProvider,
  ProductJudge,
  CodeJudge,
  UXJudge,
  HackathonJudge,
} from '../../kernel/judge/judge-provider.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';

function sampleBlueprint(overrides?: Partial<ArchitectureBlueprint>): ArchitectureBlueprint {
  return {
    project_name: 'TestApp',
    version: '1.0.0',
    summary: 'A test app',
    recommended_stack: {
      frontend: [{ name: 'React', version: '18', purpose: 'UI', alternatives: [] }],
      backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: [] }],
      database: [{ name: 'PostgreSQL', version: '16', purpose: 'DB', alternatives: [] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
    api_contracts: { base_url: '/api', endpoints: [] },
    frontend_modules: [{ name: 'App', description: 'Main app', components: [], services: [] }],
    backend_modules: [
      { name: 'API', description: 'API server', endpoints: [], dependencies: [], environment_variables: [] },
    ],
    milestones: [{ id: 'm1', name: 'MVP', description: 'MVP', due_offset_hours: 24, tasks: [], deliverables: [] }],
    execution_graph: { nodes: [], edges: [], entry_point: 'm1' },
    required_skills: [],
    risks: [],
    human_checkpoints: [],
    architect_version: '1.0.0',
    generated_at: new Date().toISOString(),
    ...overrides,
  };
}

function sampleRepository(overrides?: Partial<GeneratedRepository>): GeneratedRepository {
  return {
    project_name: 'TestApp',
    blueprint_version: '1.0.0',
    modules: [],
    total_files: 10,
    total_lines: 500,
    generated_at: new Date().toISOString(),
    build_results: [],
    ...overrides,
  };
}

describe('MockJudgeProvider', () => {
  const judge = new MockJudgeProvider();

  it('has correct identity', () => {
    expect(judge.judgeId).toBe('judge.mock.v1');
    expect(judge.judgeName).toBe('Mock Judge V1');
  });

  it('evaluateArchitecture returns pass', async () => {
    const report = await judge.evaluateArchitecture(sampleBlueprint());
    expect(report.verdict).toBe('pass');
    expect(report.score.percentage).toBe(85);
  });

  it('evaluateCode returns pass', async () => {
    const report = await judge.evaluateCode(sampleRepository());
    expect(report.verdict).toBe('pass');
    expect(report.score.percentage).toBe(80);
  });

  it('evaluateUX returns pass_with_concerns', async () => {
    const report = await judge.evaluateUX();
    expect(report.verdict).toBe('pass_with_concerns');
    expect(report.score.percentage).toBe(70);
  });

  it('evaluateHackathon returns pass', async () => {
    const report = await judge.evaluateHackathon();
    expect(report.verdict).toBe('pass');
    expect(report.score.percentage).toBe(85);
  });
});

describe('ProductJudge', () => {
  const judge = new ProductJudge();

  it('has correct identity', () => {
    expect(judge.judgeId).toBe('judge.product.v1');
    expect(judge.judgeName).toBe('Product Judge V1');
  });

  it('evaluates architecture with score and issues', async () => {
    const blueprint = sampleBlueprint({ milestones: [], frontend_modules: [], backend_modules: [] });
    const report = await judge.evaluateArchitecture(blueprint);
    expect(report.score.percentage).toBeGreaterThan(0);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.category === 'completeness')).toBe(true);
  });

  it('evaluates architecture without issues for complete blueprint', async () => {
    const report = await judge.evaluateArchitecture(sampleBlueprint());
    expect(report.issues.length).toBe(0);
  });

  it('evaluateCode returns valid report', async () => {
    const report = await judge.evaluateCode(sampleRepository());
    expect(report.judge_id).toBe('judge.product.v1');
    expect(report.score.percentage).toBeGreaterThan(0);
  });

  it('evaluateHackathon returns valid report', async () => {
    const report = await judge.evaluateHackathon(sampleBlueprint());
    expect(report.verdict).toBeDefined();
    expect(report.score.criteria).toHaveLength(4);
  });
});

describe('CodeJudge', () => {
  const judge = new CodeJudge();

  it('evaluates code with build errors', async () => {
    const repo = sampleRepository({
      build_results: [
        {
          success: false,
          modules: [],
          issues: [{ type: 'error', message: 'Syntax error', file: 'src/app.ts' }],
          summary: 'Build failed',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        },
      ],
    });
    const report = await judge.evaluateCode(repo);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.category === 'code_quality')).toBe(true);
  });

  it('evaluates architecture with missing stack', async () => {
    const blueprint = sampleBlueprint({
      recommended_stack: { frontend: [], backend: [], database: [], infrastructure: [], tooling: [] },
    });
    const report = await judge.evaluateArchitecture(blueprint);
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('evaluates code with empty repository', async () => {
    const repo = sampleRepository({ total_files: 0 });
    const report = await judge.evaluateCode(repo);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.severity === 'critical')).toBe(true);
  });

  it('evaluateUX returns valid report', async () => {
    const report = await judge.evaluateUX();
    expect(report.verdict).toBe('pass');
  });
});

describe('UXJudge', () => {
  const judge = new UXJudge();

  it('evaluates UX with test failures', async () => {
    const report = await judge.evaluateUX(sampleBlueprint(), undefined, {
      project_name: 'TestApp',
      test_plan: { name: 'Plan', base_url: '/', steps: [], screenshots: [], timeout_ms: 30000 },
      browser_results: [],
      summary: 'Test',
      total_tests: 1,
      passed: 0,
      failed: 1,
      total_screenshots: 0,
      total_console_errors: 0,
      total_network_errors: 0,
      bugs_filed: 0,
      generated_at: new Date().toISOString(),
      test_runner_version: '1.0.0',
    });
    expect(report.issues.length).toBeGreaterThan(0);
  });

  it('evaluates UX without issues for well-formed blueprint', async () => {
    const report = await judge.evaluateUX(sampleBlueprint());
    expect(report.judge_id).toBe('judge.ux.v1');
    expect(report.score.percentage).toBeGreaterThan(0);
  });
});

describe('HackathonJudge', () => {
  const judge = new HackathonJudge();

  it('evaluates hackathon with all data', async () => {
    const report = await judge.evaluateHackathon(sampleBlueprint(), sampleRepository(), {
      project_name: 'TestApp',
      test_plan: { name: 'Plan', base_url: '/', steps: [], screenshots: [], timeout_ms: 30000 },
      browser_results: [],
      summary: 'Test',
      total_tests: 1,
      passed: 1,
      failed: 0,
      total_screenshots: 0,
      total_console_errors: 0,
      total_network_errors: 0,
      bugs_filed: 0,
      generated_at: new Date().toISOString(),
      test_runner_version: '1.0.0',
    });
    expect(report.score.criteria).toHaveLength(6);
    expect(report.issues.length).toBe(0);
  });

  it('flags failed tests as issues', async () => {
    const report = await judge.evaluateHackathon(sampleBlueprint(), sampleRepository(), {
      project_name: 'TestApp',
      test_plan: { name: 'Plan', base_url: '/', steps: [], screenshots: [], timeout_ms: 30000 },
      browser_results: [],
      summary: 'Test',
      total_tests: 2,
      passed: 0,
      failed: 2,
      total_screenshots: 0,
      total_console_errors: 0,
      total_network_errors: 0,
      bugs_filed: 0,
      generated_at: new Date().toISOString(),
      test_runner_version: '1.0.0',
    });
    expect(report.issues.some((i) => i.category === 'functionality')).toBe(true);
  });
});

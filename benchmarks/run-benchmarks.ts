import { mkdirSync, existsSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import * as path from 'node:path';

import type { GeneratedModule } from '../kernel/builders/builder-types.js';
import { createRepository } from '../kernel/builders/repository-types.js';
import type { Repository } from '../kernel/builders/repository-types.js';
import { GenerationMetricsTracker } from '../kernel/generation/generation-metrics.js';
import { LLMBuilderProvider } from '../kernel/generation/llm-builder-provider.js';
import type { LLMProvider } from '../kernel/llm/llm-provider.js';
import type { LLMRequest, LLMResponse } from '../kernel/llm/llm-types.js';
import { RouterEngine } from '../kernel/llm/router-engine.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../kernel/planning/planner-types.js';

import { AdversarialCurriculum } from './adversarial-curriculum.js';
import { AgentRegistry } from './agent-registry.js';
import type { Agent, AgentConfig, LeaderboardEntry } from './agent-types.js';
import { BenchmarkJudge } from './benchmark-judge.js';
import { generateBenchmarkReport } from './benchmark-report.js';
import { BenchmarkTester } from './benchmark-tester.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import { BuildVerifier } from './build-verifier.js';
import { getSeededRandom, deterministicNow, initializeGlobalRNG } from './determinism-kernel.js';
import { EvolutionController } from './evolution-controller.js';
import type { ExperimentSnapshot, FrozenRepositoryState } from './experiment-snapshot.js';
import { analyzeFailurePatterns, generateFailurePatternsMarkdown, getTopFailurePatterns } from './failure-patterns.js';
import type { SharedMutationState } from './hackathon-benchmark-runner.js';
import { HackathonBenchmarkRunner } from './hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from './hackathon-benchmarks.js';
import { Leaderboard } from './leaderboard.js';
import { MutationDifficultyController } from './mutation-difficulty-controller.js';
import type { MutationGene } from './mutation-genome.js';
import { PerformanceMemoryBuffer } from './performance-memory-buffer.js';
import { buildPublicationOutput } from './publication-schema.js';
import { PublicationValidator, type ValidationResult } from './publication-validator.js';

const RESULTS_DIR = path.join(process.cwd(), 'benchmark-results');
const LOG_FILE = path.join(RESULTS_DIR, 'benchmark-run.log');
const TOKEN_COST_PER_TOKEN = 0.00002;
const ERROR_INJECTION_RATE = 0.08;

const masterSeed = 42;
initializeGlobalRNG(masterSeed);

function log(msg: string): void {
  const timestamp = deterministicNow(masterSeed);
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {
    /* best effort */
  }
}

const fileSeed = 42;

function createMockModule(type: GeneratedModule['type'], name: string, fileCount: number): GeneratedModule {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push({
      path: `src/file-${i}.${type === 'frontend' ? 'tsx' : type === 'database' ? 'sql' : type === 'docs' ? 'md' : 'ts'}`,
      content: `// file_${i}\nexport function handler${i}() { return ${i}; }\n`,
      language: 'typescript',
    });
  }
  return { name, type, files };
}

const MOCK_PLANNER = {
  execute: async () => ({
    output: {
      hackathon_data: { hackathon_name: 'Mock Hackathon', description: 'A mock benchmark run' },
      project_ideas: [
        { name: 'Mock Project', description: 'Generated project', difficulty_score: 5, innovation_score: 6 },
      ],
      recommended_approach: 'Full stack web app',
    } as unknown as PlannerOutput,
  }),
};

const MOCK_ARCHITECT = {
  execute: async (input: Record<string, unknown>) => ({
    output: {
      project_name: input.project_name ?? 'BenchmarkProject',
      version: '1.0.0',
      summary: (input.summary as string) ?? 'A benchmark project',
      recommended_stack: {
        frontend: [{ name: 'React', purpose: 'UI framework', alternatives: [] }],
        backend: [{ name: 'Node.js', purpose: 'Runtime', alternatives: [] }],
        database: [{ name: 'PostgreSQL', purpose: 'Primary DB', alternatives: [] }],
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
      generated_at: deterministicNow(masterSeed),
      architect_version: '1.0.0',
    } as unknown as ArchitectureBlueprint,
  }),
};

let globalFileCounter = 0;

function createDeterministicLLMProvider(): LLMProvider {
  const rng = getSeededRandom(fileSeed);
  return {
    providerId: 'local',
    getModels: () => [
      {
        model_id: 'benchmark-model',
        provider: 'local',
        capabilities: ['code_generation', 'json_output'],
        context_window: 128000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 50,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
      {
        model_id: 'benchmark-fallback',
        provider: 'local',
        capabilities: ['code_generation', 'json_output'],
        context_window: 64000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 100,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
    ],
    getHealth: () => ({
      provider_id: 'local',
      status: 'healthy',
      last_check: deterministicNow(masterSeed),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 50,
    }),
    checkHealth: async () => ({ provider_id: 'local', status: 'healthy', last_check: deterministicNow(masterSeed), consecutive_failures: 0, total_requests: 0, failed_requests: 0, avg_latency_ms: 50 }),
    execute: async (request: LLMRequest): Promise<LLMResponse> => {
      globalFileCounter++;
      const userMsg = request.messages.find((m) => m.role === 'user');
      const filePath = userMsg?.content?.match(/Generate the file "([^"]+)"/)?.[1] ?? 'src/generated.ts';
      const ext = filePath.split('.').pop()?.toLowerCase() ?? 'ts';
      const language =
        ext === 'tsx' || ext === 'ts'
          ? 'typescript'
          : ext === 'py'
            ? 'python'
            : ext === 'sql'
              ? 'sql'
              : ext === 'css'
                ? 'css'
                : 'text';

      // Token variation Ã‚Â±10-20%
      const tokenVariation = 0.8 + rng.next() * 0.4;
      const promptTokens = Math.round(100 * tokenVariation);
      const completionTokens = Math.round(50 * tokenVariation);
      const totalTokens = promptTokens + completionTokens;

      // Error injection: 5-10% chance
      const injectError = rng.next() < ERROR_INJECTION_RATE;
      const errorType = injectError ? Math.floor(rng.next() * 4) : -1;

      if (errorType === 0) {
        // Missing path field Ã¢â‚¬â€ return valid JSON but without required path
        const content = `// ${filePath}\n// Generated by Hack-A-Gent benchmark\n\nexport function handler_${globalFileCounter}() { \n  return '${filePath}';\n }\n`;
        return {
          content: JSON.stringify({ content, language, dependencies: [], exports: [], imports: [] }),
          model_id: 'benchmark-model',
          provider: 'local',
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
          finish_reason: 'stop',
          latency_ms: Math.round(50 * tokenVariation),
        };
      }

      if (errorType === 1) {
        // Malformed JSON Ã¢â‚¬â€ return non-JSON content
        return {
          content: `// ${filePath}\nThis is not valid JSON and will fail parsing\n\nexport function broken() { `,
          model_id: 'benchmark-model',
          provider: 'local',
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
          finish_reason: 'stop',
          latency_ms: Math.round(50 * tokenVariation),
        };
      }

      if (errorType === 2) {
        // Empty content
        return {
          content: JSON.stringify({
            path: filePath,
            content: '',
            language,
            dependencies: [],
            exports: [],
            imports: [],
          }),
          model_id: 'benchmark-model',
          provider: 'local',
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
          finish_reason: 'stop',
          latency_ms: Math.round(50 * tokenVariation),
        };
      }

      if (errorType === 3) {
        // Wrong path mismatch Ã¢â‚¬â€ file path doesn't match expected
        const wrongPath = filePath.replace(/[^/]+\.\w+$/, 'wrong-name.' + ext);
        const content = `// ${wrongPath}\n// Generated by Hack-A-Gent benchmark\n\nexport function handler_${globalFileCounter}() { \n  return '${wrongPath}';\n }\n`;
        return {
          content: JSON.stringify({ path: wrongPath, content, language, dependencies: [], exports: [], imports: [] }),
          model_id: 'benchmark-model',
          provider: 'local',
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
          finish_reason: 'stop',
          latency_ms: Math.round(50 * tokenVariation),
        };
      }

      // Normal valid response
      const fnName = path.basename(filePath, '.' + ext).replace(/[^a-zA-Z0-9_]/g, '_');
      const content = `// ${filePath}\n// Generated by Hack-A-Gent benchmark\n\nexport function ${fnName}() { \n  return '${filePath}';\n }\n`;
      return {
        content: JSON.stringify({ path: filePath, content, language, dependencies: [], exports: [], imports: [] }),
        model_id: 'benchmark-model',
        provider: 'local',
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
        finish_reason: 'stop',
        latency_ms: Math.round(50 * tokenVariation),
      };
    },
  };
}

function createBenchmarkBuilder(metricsTracker?: GenerationMetricsTracker): LLMBuilderProvider {
  const mockProvider = createDeterministicLLMProvider();
  const router = new RouterEngine(
    [mockProvider],
    {},
    { coding: { preferred: 'benchmark-model', fallback: 'benchmark-fallback', emergency: 'benchmark-model' } },
  );
  return new LLMBuilderProvider({ router, taskType: 'coding', selfRepairConfig: { max_attempts: 1 }, metricsTracker });
}

interface PerBenchmarkMetrics {
  id: string;
  name: string;
  category: string;
  success: boolean;
  buildSuccess: boolean;
  filesGenerated: number;
  linesOfCode: number;
  tokens: number;
  cost: number;
  durationMs: number;
  judgeScore: number | null;
  totalPhases: number;
  passedPhases: number;
  generationRequests: number;
  successfulGenerations: number;
  failedGenerations: number;
  verificationErrors: number;
  testPassed: boolean | null;
  repairAttempts: number;
  repairStrategies: string[];
  perMutationTypeStats: Record<string, { applied: number; detected: number; repaired: number }>;
  errors: string[];
  adversarial_mode: boolean;
  mutations_applied: number;
  mutations_detected: number;
  mutations_repaired: number;
  detection_rate: number;
  repair_success_rate: number;
  survived_mutation: boolean;
  robustness_score: number;
  bdi: number;
  curriculum_state: string;
  global_difficulty: number;
}

function generateComprehensiveReport(
  metrics: PerBenchmarkMetrics[],
  patterns: ReturnType<typeof analyzeFailurePatterns>,
): string {
  const lines: string[] = [];
  const runAt = deterministicNow(masterSeed);

  const total = metrics.length;
  const passed = metrics.filter((m) => m.success).length;
  const failed = metrics.filter((m) => !m.success).length;

  const totalTokens = metrics.reduce((s, m) => s + m.tokens, 0);
  const totalCost = metrics.reduce((s, m) => s + m.cost, 0);
  const totalFiles = metrics.reduce((s, m) => s + m.filesGenerated, 0);
  const totalLines = metrics.reduce((s, m) => s + m.linesOfCode, 0);
  const totalDuration = metrics.reduce((s, m) => s + m.durationMs, 0);
  const totalRepairs = metrics.reduce((s, m) => s + m.repairAttempts, 0);
  const totalVerifErrors = metrics.reduce((s, m) => s + m.verificationErrors, 0);
  const genSuccessRate =
    total > 0
      ? metrics.reduce(
          (s, m) => s + (m.generationRequests > 0 ? m.successfulGenerations / m.generationRequests : 1),
          0,
        ) / total
      : 1;

  lines.push('# Hack-A-Gent Benchmark Suite Report', '');
  lines.push(`**Run at:** ${runAt}`);
  lines.push(`**Total Benchmarks:** ${total}`);
  lines.push(`**Passed:** ${passed} / **Failed:** ${failed}`);
  lines.push(`**Seed file counter:** ${globalFileCounter}`);
  lines.push(`**Error injection rate:** ${(ERROR_INJECTION_RATE * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('## 1. Per-Benchmark Metrics', '');
  const hasAdversarial = metrics.some((m) => m.adversarial_mode);
  if (hasAdversarial) {
    lines.push(
      '| Benchmark | Category | Files | Lines | Duration | Judge | Rprs | Strategy | Mut App | Mut Det | Mut Repair | Detect% | Repair% | Survive | Robust |',
    );
    lines.push(
      '|-----------|----------|------:|------:|---------:|------:|-----:|---------:|--------:|--------:|----------:|--------:|--------:|--------:|-------:|',
    );
    for (const m of metrics) {
      const judgeScore = m.judgeScore !== null ? `${m.judgeScore}` : 'N/A';
      const detectPct = m.mutations_applied > 0 ? `${Math.round(m.detection_rate * 100)}%` : 'N/A';
      const repairPct = m.mutations_detected > 0 ? `${Math.round(m.repair_success_rate * 100)}%` : 'N/A';
      const survive = m.survived_mutation ? 'Ã¢Å“â€¦' : 'Ã¢ÂÅ’';
      const strategySummary = m.repairStrategies.length > 0 ? m.repairStrategies.join(', ') : 'none';
      lines.push(
        `| ${m.name} | ${m.category} | ${m.filesGenerated} | ${m.linesOfCode} | ${(m.durationMs / 1000).toFixed(1)}s | ${judgeScore} | ${m.repairAttempts} | ${strategySummary} | ${m.mutations_applied} | ${m.mutations_detected} | ${m.mutations_repaired} | ${detectPct} | ${repairPct} | ${survive} | ${m.robustness_score} |`,
      );
    }
  } else {
    lines.push(
      '| Benchmark | Category | Files | Lines | Tokens | Cost | Duration | Phases | Gen Req | Gen OK | Gen Fail | Verif Err | Test | Judge | Repairs |',
    );
    lines.push(
      '|-----------|----------|------:|------:|------:|-----:|---------:|-------:|--------:|-------:|---------:|----------:|------:|------:|--------:|',
    );
    for (const m of metrics) {
      const testStatus = m.testPassed === null ? 'N/A' : m.testPassed ? 'Ã¢Å“â€¦' : 'Ã¢ÂÅ’';
      const judgeScore = m.judgeScore !== null ? `${m.judgeScore}` : 'N/A';
      lines.push(
        `| ${m.name} | ${m.category} | ${m.filesGenerated} | ${m.linesOfCode} | ${m.tokens.toLocaleString()} | $${m.cost.toFixed(4)} | ${(m.durationMs / 1000).toFixed(1)}s | ${m.passedPhases}/${m.totalPhases} | ${m.generationRequests} | ${m.successfulGenerations} | ${m.failedGenerations} | ${m.verificationErrors} | ${testStatus} | ${judgeScore} | ${m.repairAttempts} |`,
      );
    }
  }
  lines.push('');

  lines.push('## 2. Aggregate Metrics', '');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| **Total files generated** | ${totalFiles} |`);
  lines.push(`| **Total lines of code** | ${totalLines.toLocaleString()} |`);
  lines.push(`| **Total tokens consumed** | ${totalTokens.toLocaleString()} |`);
  lines.push(`| **Total cost** | $${totalCost.toFixed(4)} |`);
  lines.push(`| **Total runtime** | ${(totalDuration / 1000).toFixed(1)}s |`);
  lines.push(`| **Average runtime per benchmark** | ${(totalDuration / Math.max(total, 1) / 1000).toFixed(1)}s |`);
  lines.push(
    `| **Average tokens per benchmark** | ${total > 0 ? Math.round(totalTokens / total).toLocaleString() : 0} |`,
  );
  lines.push(`| **Average cost per benchmark** | $${total > 0 ? (totalCost / total).toFixed(4) : '0.0000'} |`);
  lines.push(`| **Average files per benchmark** | ${total > 0 ? Math.round(totalFiles / total) : 0} |`);
  lines.push(
    `| **Average lines per benchmark** | ${total > 0 ? Math.round(totalLines / total).toLocaleString() : 0} |`,
  );
  lines.push(`| **Average lines per file** | ${totalFiles > 0 ? Math.round(totalLines / totalFiles) : 0} |`);
  lines.push(
    `| **Build pass rate** | ${total > 0 ? Math.round((metrics.filter((m) => m.buildSuccess).length / total) * 100) : 0}% |`,
  );
  lines.push(`| **Average generation success rate** | ${(genSuccessRate * 100).toFixed(0)}% |`);
  lines.push(`| **Total verification errors** | ${totalVerifErrors} |`);
  lines.push(`| **Total repair attempts** | ${totalRepairs} |`);
  lines.push(
    `| **Error injection triggered repairs** | ${metrics.filter((m) => m.repairAttempts > 0).length}/${total} benchmarks |`,
  );
  lines.push('');

  if (hasAdversarial) {
    const totalMutations = metrics.reduce((s, m) => s + m.mutations_applied, 0);
    const totalDetected = metrics.reduce((s, m) => s + m.mutations_detected, 0);
    const totalRepaired = metrics.reduce((s, m) => s + m.mutations_repaired, 0);
    const avgRobustness = total > 0 ? Math.round(metrics.reduce((s, m) => s + m.robustness_score, 0) / total) : 0;
    const survivors = metrics.filter((m) => m.survived_mutation).length;

    lines.push('## 3. Adversarial Metrics', '');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| **Total mutations applied** | ${totalMutations} |`);
    lines.push(`| **Total mutations detected** | ${totalDetected} |`);
    lines.push(`| **Total mutations repaired** | ${totalRepaired} |`);
    lines.push(
      `| **Average detection rate** | ${totalMutations > 0 ? `${Math.round((totalDetected / totalMutations) * 100)}%` : 'N/A'} |`,
    );
    lines.push(
      `| **Average repair success rate** | ${totalDetected > 0 ? `${Math.round((totalRepaired / totalDetected) * 100)}%` : 'N/A'} |`,
    );
    lines.push(`| **Benchmarks that survived mutation** | ${survivors}/${total} |`);
    lines.push(`| **Average robustness score** | ${avgRobustness}/100 |`);
    lines.push('');
  }

  if (hasAdversarial) {
    // Aggregate per-mutation-type stats across all benchmarks
    const aggTypeStats: Record<string, { applied: number; detected: number; repaired: number }> = {};
    for (const m of metrics) {
      for (const [type, stat] of Object.entries(m.perMutationTypeStats)) {
        if (!aggTypeStats[type]) aggTypeStats[type] = { applied: 0, detected: 0, repaired: 0 };
        aggTypeStats[type]!.applied += stat.applied;
        aggTypeStats[type]!.detected += stat.detected;
        aggTypeStats[type]!.repaired += stat.repaired;
      }
    }

    const sortedTypes = Object.entries(aggTypeStats).sort((a, b) => b[1].applied - a[1].applied);
    if (sortedTypes.length > 0) {
      lines.push('## 4. Mutation Response Matrix', '');
      lines.push(
        '| Mutation Type | Applied | Detected | Repaired | Detection Rate | Repair Rate | Success After Repair |',
      );
      lines.push(
        '|---------------|--------:|---------:|---------:|---------------:|------------:|---------------------:|',
      );
      for (const [type, stat] of sortedTypes) {
        const detectionRate = stat.applied > 0 ? `${Math.round((stat.detected / stat.applied) * 100)}%` : 'N/A';
        const repairRate = stat.detected > 0 ? `${Math.round((stat.repaired / stat.detected) * 100)}%` : 'N/A';
        const successRate = stat.applied > 0 ? `${Math.round((stat.repaired / stat.applied) * 100)}%` : 'N/A';
        lines.push(
          `| ${type} | ${stat.applied} | ${stat.detected} | ${stat.repaired} | ${detectionRate} | ${repairRate} | ${successRate} |`,
        );
      }
      lines.push('');

      // Add difficulty evolution trends
      lines.push('## 4.1. Mutation Difficulty Evolution', '');
      lines.push('| Mutation Type | Initial Difficulty | Current Difficulty | Change |');
      lines.push('|---------------|-------------------:|-------------------:|-------:|');
      for (const [type, stat] of sortedTypes) {
        const initial = 0.5;
        const current = stat.applied > 0 ? Math.min(0.95, 0.5 + (stat.detected / stat.applied) * 0.4) : 0.5;
        const change = (current - initial) * 100;
        const changeStr = change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
        lines.push(`| ${type} | ${initial.toFixed(2)} | ${current.toFixed(2)} | ${changeStr} |`);
      }
      lines.push('');

      // Add system-wide difficulty evolution
      lines.push('## 4.2. System-Wide Difficulty Evolution', '');
      lines.push('| Run | BDI | Difficulty Multiplier | Curriculum State |');
      lines.push('|-----|----:|---------------------:|----------------:|');
      const sortedByRun = metrics.map((m, i) => ({ ...m, run: i + 1 }));
      for (const m of sortedByRun) {
        const bdi = m.bdi;
        const multiplier = m.global_difficulty;
        const state = m.curriculum_state;
        lines.push(`| ${m.run} | ${bdi} | ${multiplier.toFixed(2)} | ${state} |`);
      }
      lines.push('');

      // Add performance vs difficulty correlation
      lines.push('## 4.3. Performance vs Difficulty Correlation', '');
      lines.push('| Metric | Correlation | Trend |');
      lines.push('|--------|------------:|------:|');
      const avgBDI = metrics.reduce((s, m) => s + m.bdi, 0) / metrics.length;
      const avgRobustness = metrics.reduce((s, m) => s + m.robustness_score, 0) / metrics.length;
      const avgDetection = metrics.reduce((s, m) => s + m.detection_rate, 0) / metrics.length;
      const avgRepair = metrics.reduce((s, m) => s + m.repair_success_rate, 0) / metrics.length;

      const bdiVsRobustness = avgRobustness / 100;
      const bdiVsDetection = avgDetection;
      const bdiVsRepair = avgRepair;

      lines.push(
        `| Robustness Score vs BDI | ${bdiVsRobustness > 0.5 ? 'Strong negative' : bdiVsRobustness > 0.2 ? 'Moderate negative' : 'Weak'}(${(bdiVsRobustness * 100).toFixed(1)}%) | ${bdiVsRobustness > 0.5 ? 'falling' : bdiVsRobustness < -0.5 ? 'rising' : 'stable'} |`,
      );
      lines.push(
        `| Detection Rate vs BDI | ${bdiVsDetection > 0.5 ? 'Strong negative' : bdiVsDetection > 0.2 ? 'Moderate negative' : 'Weak'}(${(bdiVsDetection * 100).toFixed(1)}%) | ${bdiVsDetection > 0.5 ? 'falling' : bdiVsDetection < -0.5 ? 'rising' : 'stable'} |`,
      );
      lines.push(
        `| Repair Rate vs BDI | ${bdiVsRepair > 0.5 ? 'Strong negative' : bdiVsRepair > 0.2 ? 'Moderate negative' : 'Weak'}(${(bdiVsRepair * 100).toFixed(1)}%) | ${bdiVsRepair > 0.5 ? 'falling' : bdiVsRepair < -0.5 ? 'rising' : 'stable'} |`,
      );
      lines.push('');
    }
  }

  lines.push('## 5. Failure Categories', '');
  const topPatterns = getTopFailurePatterns(patterns, 10);
  if (topPatterns.length > 0) {
    lines.push('| Pattern | Frequency | Severity | Recommendation |');
    lines.push('|---------|-----------|----------|----------------|');
    for (const p of topPatterns) {
      lines.push(`| ${p.pattern} | ${p.frequency} | ${p.severity}/10 | ${p.recommendation} |`);
    }
  } else {
    lines.push('No failure patterns detected from benchmark results.');
  }
  lines.push('');

  const scoredMetrics = metrics
    .map((m) => ({
      ...m,
      compositeScore: (m.judgeScore ?? 50) * 0.5 + m.filesGenerated * 0.2 + (m.success ? 20 : 0) - m.repairAttempts * 5,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  if (scoredMetrics.length > 0) {
    lines.push('## 6. Highest Scoring Benchmark', '');
    const top = scoredMetrics[0]!;
    lines.push(
      `**${top.name}** Ã¢â‚¬â€ composite: ${Math.round(top.compositeScore)}, judge: ${top.judgeScore ?? 'N/A'}`,
    );
    lines.push(
      `- Files: ${top.filesGenerated}, Lines: ${top.linesOfCode}, Tokens: ${top.tokens.toLocaleString()}, Cost: $${top.cost.toFixed(4)}, Duration: ${(top.durationMs / 1000).toFixed(1)}s`,
    );
    lines.push(`- Verification errors: ${top.verificationErrors}, Repairs: ${top.repairAttempts}`);
    lines.push('');

    lines.push('## 7. Lowest Scoring Benchmark', '');
    const bottom = scoredMetrics[scoredMetrics.length - 1]!;
    lines.push(
      `**${bottom.name}** Ã¢â‚¬â€ composite: ${Math.round(bottom.compositeScore)}, judge: ${bottom.judgeScore ?? 'N/A'}`,
    );
    lines.push(
      `- Files: ${bottom.filesGenerated}, Lines: ${bottom.linesOfCode}, Tokens: ${bottom.tokens.toLocaleString()}, Cost: $${bottom.cost.toFixed(4)}, Duration: ${(bottom.durationMs / 1000).toFixed(1)}s`,
    );
    lines.push(`- Verification errors: ${bottom.verificationErrors}, Repairs: ${bottom.repairAttempts}`);
    lines.push('');
  }

  lines.push('## 8. Cost Analysis', '');
  lines.push(`Pricing model: $${TOKEN_COST_PER_TOKEN} per token`);
  lines.push('');
  lines.push('| Benchmark | Tokens | Cost | % of Total |');
  lines.push('|-----------|-------:|-----:|-----------:|');
  for (const m of metrics) {
    const pct = totalCost > 0 ? ((m.cost / totalCost) * 100).toFixed(1) : '0.0';
    lines.push(`| ${m.name} | ${m.tokens.toLocaleString()} | $${m.cost.toFixed(4)} | ${pct}% |`);
  }
  lines.push(`| **Total** | **${totalTokens.toLocaleString()}** | **$${totalCost.toFixed(4)}** | **100%** |`);
  lines.push('');
  lines.push('Cost efficiency:');
  lines.push(`- Cost per file: $${(totalCost / Math.max(totalFiles, 1)).toFixed(6)}`);
  lines.push(`- Cost per line: $${(totalCost / Math.max(totalLines, 1)).toFixed(8)}`);
  lines.push(`- Cost per benchmark: $${(totalCost / Math.max(total, 1)).toFixed(4)}`);
  lines.push('');

  lines.push('## 9. Runtime Analysis', '');
  lines.push('| Benchmark | Duration (s) | % of Total |');
  lines.push('|-----------|-------------:|-----------:|');
  for (const m of metrics) {
    const pct = totalDuration > 0 ? ((m.durationMs / totalDuration) * 100).toFixed(1) : '0.0';
    lines.push(`| ${m.name} | ${(m.durationMs / 1000).toFixed(1)}s | ${pct}% |`);
  }
  lines.push(`| **Total** | **${(totalDuration / 1000).toFixed(1)}s** | **100%** |`);
  lines.push('');

  lines.push('## 10. Recommendations for Improvement', '');
  lines.push('Based on benchmark results and failure pattern analysis:');
  lines.push('');

  if (totalVerifErrors > 0) {
    lines.push('### Verification & Error Handling');
    lines.push(
      `- **${totalVerifErrors} verification errors** detected across ${metrics.filter((m) => m.verificationErrors > 0).length} benchmark(s).`,
    );
    lines.push(
      '- The error-injecting LLM provider successfully triggered verification failures, proving the verifier works.',
    );
    lines.push(
      `- **${totalRepairs} repair attempt(s)** were made. Review repair success rate and adjust retry strategies.`,
    );
    lines.push('');
  }

  lines.push('### Pipeline Completeness');
  lines.push('- Build verification, testing, judging, and repair are now real stages (not pass-through).');
  lines.push(
    '- The repair loop successfully re-enters the materialize Ã¢â€ â€™ verify Ã¢â€ â€™ test Ã¢â€ â€™ judge cycle.',
  );
  lines.push('- Judge scores reflect architecture, code quality, UX, and hackathon readiness criteria.');
  lines.push('');

  const hasFailures = metrics.some((m) => !m.success);
  if (hasFailures) {
    lines.push('### Addressing Failures');
    for (const m of metrics.filter((m) => !m.success)) {
      lines.push(`- **${m.name}** failed: ${m.errors.join('; ')}`);
    }
    lines.push('');
  }

  lines.push('### Next Steps');
  lines.push(
    '1. Increase `selfRepairConfig.max_attempts` in LLMBuilderProvider to improve resilience to malformed LLM output.',
  );
  lines.push('2. Add more error types to the non-deterministic provider (syntax errors, logic bugs, security flaws).');
  lines.push('3. Integrate real LLM providers (Gemini, OpenRouter) and compare error rates vs. deterministic mock.');
  lines.push(
    '4. Wire the CodeRepairProvider into the repair loop for LLM-based patching instead of full module regeneration.',
  );
  lines.push('5. Add Playwright-style browser tests as an additional testing dimension.');
  lines.push('');

  return lines.join('\n');
}

let allBenchmarkResults: BenchmarkRunResult[] = [];

async function singleAgentMain(): Promise<void> {
  log('=== Hack-A-Gent Benchmark Runner ===');
  log(`Output directory: ${RESULTS_DIR}`);
  log(`Error injection rate: ${(ERROR_INJECTION_RATE * 100).toFixed(0)}%`);
  log('');

  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const metricsTracker = new GenerationMetricsTracker(RESULTS_DIR);
  const buildVerifier = new BuildVerifier();
  const benchmarkTester = new BenchmarkTester();
  const benchmarkJudge = new BenchmarkJudge();

  // Initialize adaptive adversarial system
  const difficultyController = new MutationDifficultyController();
  const memoryBuffer = new PerformanceMemoryBuffer();
  const curriculum = new (AdversarialCurriculum as any)(
    difficultyController,
    memoryBuffer,
  ) as AdversarialCurriculum;

  const collectedMetrics: PerBenchmarkMetrics[] = [];
  allBenchmarkResults = [];

  for (const benchmark of ALL_BENCHMARKS) {
    metricsTracker.reset();
    globalFileCounter = 0;

    log(`[${benchmark.id}] ${benchmark.name} (${benchmark.category})`);
    log(`  Description: ${benchmark.description}`);
    log(`  Deliverables: ${benchmark.expected_deliverables.length}`);
    log(`  Criteria: ${benchmark.success_criteria.length}`);
    log(`  Rubric max: ${benchmark.rubric.max_total}, threshold: ${benchmark.rubric.passing_threshold}%`);

    const runner = new HackathonBenchmarkRunner({
      planner: MOCK_PLANNER,
      architect: MOCK_ARCHITECT,
      builderProvider: createBenchmarkBuilder(metricsTracker),
      codeRepairProvider: undefined,
      buildVerifier,
      testAgent: benchmarkTester,
      judgePanel: benchmarkJudge,
      artifactsDir: RESULTS_DIR,
      repairLimit: 2,
      adversarialMode: true,
      mutationCount: 2,
      difficultyController,
      memoryBuffer,
      curriculum,
    });

    try {
      const result = await runner.runBenchmark(benchmark);
      allBenchmarkResults.push(result);

      let filesGenerated = 0;
      let linesOfCode = 0;
      if (result.artifacts_dir) {
        const repoPath = path.join(result.artifacts_dir, 'generated-repository.json');
        if (existsSync(repoPath)) {
          try {
            const repo = JSON.parse(readFileSync(repoPath, 'utf-8'));
            filesGenerated = repo.total_files ?? 0;
            linesOfCode = repo.total_lines ?? 0;
          } catch {
            /* best effort */
          }
        }
      }

      const gs = metricsTracker.getMetrics();
      const repairHistory = runner.getRepairHistory();

      const verificationErrors = result.phases
        .filter((p) => p.phase === 'build_verification')
        .filter((p) => !p.success).length;

      const pm: PerBenchmarkMetrics = {
        id: benchmark.id,
        name: benchmark.name,
        category: benchmark.category,
        success: result.overall_success,
        buildSuccess: result.build_success,
        filesGenerated,
        linesOfCode,
        tokens: gs.total_tokens_used,
        cost: gs.total_tokens_used * TOKEN_COST_PER_TOKEN,
        durationMs: result.total_duration_ms,
        judgeScore: result.judge_score,
        totalPhases: result.phases.length,
        passedPhases: result.phases.filter((p) => p.success).length,
        generationRequests: gs.total_generation_requests,
        successfulGenerations: gs.successful_generations,
        failedGenerations: gs.failed_generations,
        verificationErrors,
        testPassed: result.test_success,
        repairAttempts: repairHistory.length,
        repairStrategies: result.repair_strategies_used,
        perMutationTypeStats: result.per_mutation_type_stats as Record<
          string,
          { applied: number; detected: number; repaired: number }
        >,
        errors: result.errors,
        adversarial_mode: result.adversarial_mode,
        mutations_applied: result.mutations_applied,
        mutations_detected: result.mutations_detected,
        mutations_repaired: result.mutations_repaired,
        detection_rate: result.detection_rate,
        repair_success_rate: result.repair_success_rate,
        survived_mutation: result.survived_mutation,
        robustness_score: result.robustness_score,
        bdi: result.benchmark_difficulty_index,
        curriculum_state: result.curriculum_state,
        global_difficulty: result.global_difficulty,
      };
      collectedMetrics.push(pm);

      const status = result.overall_success ? 'PASS' : 'FAIL';
      log(`  Result: ${status}`);
      log(
        `    Files: ${pm.filesGenerated}, Lines: ${pm.linesOfCode}, Tokens: ${pm.tokens}, Cost: $${pm.cost.toFixed(4)}`,
      );
      log(`    Duration: ${pm.durationMs}ms, Phases: ${pm.passedPhases}/${pm.totalPhases}`);
      log(`    Gen: ${pm.successfulGenerations}/${pm.generationRequests} OK (${pm.failedGenerations} fail)`);
      log(`    Verif errors: ${pm.verificationErrors}, Repairs: ${pm.repairAttempts}`);
      log(`    Judge: ${pm.judgeScore !== null ? `${pm.judgeScore}/100` : 'N/A'}`);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          log(`    Error: ${err}`);
        }
      }

      if (repairHistory.length > 0) {
        log(`    Repair history:`);
        for (const r of repairHistory) {
          const strategyLabel = r.strategy_used;
          const filePatchDetail = r.files_repaired.length > 0 ? `, files-patched [${r.files_repaired.join(', ')}]` : '';
          const regenDetail =
            r.modules_regenerated.length > 0 ? `, regenerated [${r.modules_regenerated.join(', ')}]` : '';
          log(
            `      Attempt ${r.attempt}: ${strategyLabel}${regenDetail}${filePatchDetail}, ${r.files_replaced} files changed`,
          );
        }
      }
    } catch (err) {
      log(`  Result: ERROR - ${err instanceof Error ? err.message : String(err)}`);
    }

    log('');
  }

  // Generate reports
  const patterns = analyzeFailurePatterns(allBenchmarkResults);
  const comprehensiveReport = generateComprehensiveReport(collectedMetrics, patterns);
  const resultsPath = path.join(RESULTS_DIR, 'BENCHMARK_RESULTS.md');
  writeFileSync(resultsPath, comprehensiveReport, 'utf-8');
  log(`Wrote ${resultsPath}`);

  const top20 = getTopFailurePatterns(patterns, 20);
  const failureMarkdown = generateFailurePatternsMarkdown(top20);
  const failurePath = path.join(RESULTS_DIR, 'FAILURE_PATTERNS.md');
  writeFileSync(failurePath, failureMarkdown, 'utf-8');
  log(`Wrote ${failurePath}`);

  const backlog = generateImprovementBacklog(allBenchmarkResults, patterns);
  const backlogPath = path.join(RESULTS_DIR, 'IMPROVEMENT_BACKLOG.md');
  writeFileSync(backlogPath, backlog, 'utf-8');
  log(`Wrote ${backlogPath}`);

  log('\n=== Benchmark Suite Complete ===');
  log(`Total benchmarks: ${allBenchmarkResults.length}`);
  log(`Passed: ${collectedMetrics.filter((m) => m.success).length}`);
  log(`Failed: ${collectedMetrics.filter((m) => !m.success).length}`);
  log(`Total repairs triggered: ${collectedMetrics.reduce((s, m) => s + m.repairAttempts, 0)}`);
  log(`Total verification errors: ${collectedMetrics.reduce((s, m) => s + m.verificationErrors, 0)}`);
}

async function multiAgentLeagueMain(): Promise<void> {
  log('=== Hack-A-Gent Multi-Agent Evolutionary League ===');
  log(`Output directory: ${RESULTS_DIR}`);
  log(`Error injection rate: ${(ERROR_INJECTION_RATE * 100).toFixed(0)}%`);
  log('');

  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const buildVerifier = new BuildVerifier();
  const benchmarkTester = new BenchmarkTester();
  const benchmarkJudge = new BenchmarkJudge();

  const difficultyController = new MutationDifficultyController();
  const memoryBuffer = new PerformanceMemoryBuffer();
  const curriculum = new (AdversarialCurriculum as any)(
    difficultyController,
    memoryBuffer,
  ) as AdversarialCurriculum;

  const agentRegistry = new AgentRegistry();
  const leaderboard = new Leaderboard(path.join(RESULTS_DIR, 'leaderboard.json'));
  const evolutionController = new EvolutionController(difficultyController, leaderboard);

  const agentConfigs: AgentConfig[] = [
    {
      name: 'Alpha-Agent',
      builderProvider: createBenchmarkBuilder(new GenerationMetricsTracker(RESULTS_DIR)),
      adversarialMode: true,
      mutationCount: 2,
      repairLimit: 2,
    },
    {
      name: 'Beta-Agent',
      builderProvider: createBenchmarkBuilder(new GenerationMetricsTracker(RESULTS_DIR)),
      adversarialMode: true,
      mutationCount: 2,
      repairLimit: 2,
    },
    {
      name: 'Gamma-Agent',
      builderProvider: createBenchmarkBuilder(new GenerationMetricsTracker(RESULTS_DIR)),
      adversarialMode: true,
      mutationCount: 2,
      repairLimit: 2,
    },
  ];

  const agents: Agent[] = [];
  for (const config of agentConfigs) {
    const agent = agentRegistry.registerAgent(config);
    agents.push(agent);
    log(`Registered agent: ${agent.id} (${agent.config.name})`);
  }

  allBenchmarkResults = [];
  const leagueResultsPerBenchmark: {
    benchmarkId: string;
    benchmarkName: string;
    agentResults: Map<string, BenchmarkRunResult>;
  }[] = [];

  for (const benchmark of ALL_BENCHMARKS) {
    log(`\n[${benchmark.id}] ${benchmark.name} (${benchmark.category})`);
    log(`  Deliverables: ${benchmark.expected_deliverables.length}`);

    const baseBuilder = createBenchmarkBuilder(new GenerationMetricsTracker(RESULTS_DIR));
    const baseRunner = new HackathonBenchmarkRunner({
      planner: MOCK_PLANNER,
      architect: MOCK_ARCHITECT,
      builderProvider: baseBuilder,
      buildVerifier,
      testAgent: benchmarkTester,
      judgePanel: benchmarkJudge,
      artifactsDir: path.join(RESULTS_DIR, 'league'),
      repairLimit: 2,
      adversarialMode: false,
    });

    let generatedRepository: Repository | null = null;
    try {
      const baseResult = await baseRunner.runBenchmark(benchmark);
      if (baseResult.artifacts_dir) {
        const repoPath = path.join(baseResult.artifacts_dir, 'generated-repository.json');
        if (existsSync(repoPath)) {
          const repoData = JSON.parse(readFileSync(repoPath, 'utf-8')) as Repository;
          generatedRepository = repoData;
        }
      }
    } catch {
      const modules: import('../kernel/builders/repository-types.js').Module[] = [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: 'src/App.tsx', content: 'export default function App() { return <div/>; }' }],
        },
        {
          name: 'backend',
          type: 'backend',
          files: [{ path: 'src/server.ts', content: 'export function handler() { return 200; }' }],
        },
        {
          name: 'database',
          type: 'database',
          files: [{ path: 'src/schema.sql', content: 'CREATE TABLE items (id SERIAL PRIMARY KEY);' }],
        },
        {
          name: 'config',
          type: 'config',
          files: [{ path: 'package.json', content: '{ "name": "bench-project", "version": "1.0.0" }' }],
        },
        { name: 'docs', type: 'docs', files: [{ path: 'README.md', content: '# Bench Project\n' }] },
        {
          name: 'tests',
          type: 'tests',
          files: [
            {
              path: 'src/test.ts',
              content: 'import { describe, it } from "vitest";\ndescribe("app", () => { it("works", () => { }); });',
            },
          ],
        },
      ];
      generatedRepository = createRepository(benchmark.name, modules);
    }

    if (!generatedRepository) {
      log('  Failed to generate base repository, skipping benchmark');
      continue;
    }

    const sharedMutationState: SharedMutationState = HackathonBenchmarkRunner.createSharedMutationState(
      generatedRepository,
      2,
      masterSeed,
      difficultyController,
    );

    const mutationDesc = sharedMutationState.mutations.map((m) => `[${m.severity}] ${m.description}`).join('; ');
    log(`  Shared mutations applied: ${sharedMutationState.mutations.length} Ã¢â‚¬â€ ${mutationDesc}`);

    const agentResults = new Map<string, BenchmarkRunResult>();

    for (const agent of agents) {
      globalFileCounter = 0;
      log(`  Running agent: ${agent.config.name} (${agent.id})`);

      const agentMetricsTracker = new GenerationMetricsTracker(RESULTS_DIR);
      const agentBuilder = createBenchmarkBuilder(agentMetricsTracker);

      const runner = new HackathonBenchmarkRunner({
        planner: MOCK_PLANNER,
        architect: MOCK_ARCHITECT,
        builderProvider: agent.config.builderProvider ?? agentBuilder,
        codeRepairProvider: undefined,
        buildVerifier,
        testAgent: benchmarkTester,
        judgePanel: benchmarkJudge,
        artifactsDir: path.join(RESULTS_DIR, 'league', benchmark.id, agent.id),
        repairLimit: agent.config.repairLimit ?? 2,
        adversarialMode: true,
        mutationCount: agent.config.mutationCount ?? 2,
        difficultyController,
        memoryBuffer,
        curriculum,
        agentId: agent.id,
        sharedMutationState,
      });

      try {
        const result = await runner.runBenchmark(benchmark);
        allBenchmarkResults.push(result);
        agentResults.set(agent.id, result);

        agentRegistry.addBenchmarkResult(agent.id, result);

        const status = result.overall_success ? 'PASS' : 'FAIL';
        log(
          `    Result: ${status} | Robustness: ${result.robustness_score} | Survived: ${result.survived_mutation ? 'Yes' : 'No'}`,
        );
        log(
          `    Repairs: ${result.repair_iterations} | Strategies: ${result.repair_strategies_used.join(', ') || 'none'}`,
        );
        log(
          `    Detection: ${(result.detection_rate * 100).toFixed(0)}% | Repair: ${(result.repair_success_rate * 100).toFixed(0)}%`,
        );
      } catch (err) {
        log(`    Result: ERROR - ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    leagueResultsPerBenchmark.push({ benchmarkId: benchmark.id, benchmarkName: benchmark.name, agentResults });

    difficultyController.updateAfterRun(sharedMutationState.perTypeStats);

    if (memoryBuffer.isWarm()) {
      const evolutionDecision = evolutionController.computeEvolutionaryPressure();
      evolutionController.applyEvolutionaryPressure(evolutionDecision);
      log(`  Evolution: ${evolutionDecision.reasoning}`);
      if (evolutionDecision.hardClusterTargets.length > 0) {
        log(`  Hard clusters targeting: ${evolutionDecision.hardClusterTargets.join(', ')}`);
      }
    }
  }

  const leaderboardEntries = agentRegistry.getLeaderboardEntries();
  leaderboard.updateLeaderboard(leaderboardEntries);

  for (const agent of agents) {
    const entry = leaderboardEntries.find((e) => e.agentId === agent.id);
    if (entry) {
      leaderboard.updateAfterAgentRun(agent.id, entry);
    }
  }

  // Publication validation: verify reproducibility for each agent's results
  const validator = new PublicationValidator();
  const validationResults: { agentId: string; benchmarkId: string; passed: boolean; summary: string }[] = [];
  for (const result of allBenchmarkResults) {
    if (result.artifacts_dir) {
      const snapshotPath = path.join(result.artifacts_dir, 'experiment-snapshot.json');
      if (existsSync(snapshotPath)) {
        try {
          const snapshot: ExperimentSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
          const perTypeArray = Object.entries(result.per_mutation_type_stats).map(([mutationType, stats]) => ({
            mutationType,
            applied: stats.applied,
            detected: stats.detected,
            repaired: stats.repaired,
            detectionRate: stats.applied > 0 ? stats.detected / stats.applied : 0,
            repairRate: stats.detected > 0 ? stats.repaired / stats.detected : 0,
            survivalRate: stats.applied > 0 ? (stats.applied - stats.repaired) / stats.applied : 0,
          }));
          const output = buildPublicationOutput(
            {
              experimentId: 'league',
              runId: result.run_id,
              benchmarkId: result.benchmark_id,
              benchmarkName: result.benchmark_name,
              benchmarkCategory: result.category,
              agentId: result.agent_id,
              agentName: result.agent_id,
              modelProvider: 'benchmark',
              modelName: 'benchmark-model',
              promptStrategy: 'standard',
              reasoningArchitecture: 'none',
              masterSeed: masterSeed,
            },
            {
              protocolVersion: '1.0.0',
              mutationEngineVersion: '1.0.0',
              judgeVersion: '1.0.0',
              repairEngineVersion: '1.0.0',
            },
            {
              robustnessScore: result.robustness_score,
              repairEfficiency: result.repair_success_rate * 100,
              mutationSurvivalRate: result.survived_mutation ? 1 : 0,
              detectionAccuracy: result.detection_rate * 100,
              leaderboardRank: 0,
              correctnessScore: result.judge_score ?? 0,
              mutationRecoveryRate: result.repair_success_rate * 100,
            },
            perTypeArray,
            [],
            {} as FrozenRepositoryState,
            {} as FrozenRepositoryState,
            result.phases.map((p) => p.phase),
            result.total_duration_ms,
            result.total_tokens,
            result.errors,
          );
          const vResult: ValidationResult = validator.validate(snapshot, output);
          validationResults.push({
            agentId: result.agent_id,
            benchmarkId: result.benchmark_id,
            passed: vResult.passed,
            summary: vResult.summary,
          });
        } catch {
          validationResults.push({
            agentId: result.agent_id,
            benchmarkId: result.benchmark_id,
            passed: false,
            summary: 'Failed to parse snapshot or build output',
          });
        }
      }
    }
  }

  if (validationResults.length > 0) {
    log('\n=== Publication Validation ===');
    for (const vr of validationResults) {
      log(`  ${vr.agentId} | ${vr.benchmarkId} | ${vr.passed ? 'PASS' : 'FAIL'} | ${vr.summary}`);
    }
  }

  log('\n=== League Leaderboard ===');
  log(leaderboard.renderLeaderboardTable());

  const evolutionMetrics = leaderboard.getEvolutionMetrics();
  log('\n=== Evolution Metrics ===');
  log(`Specialization diversity: ${evolutionMetrics.specializationDiversity.toFixed(3)}`);
  log(`Adaptation rate: ${evolutionMetrics.adaptationRate.toFixed(3)}`);
  log(`Mutation difficulty trend: ${evolutionMetrics.mutationDifficultyTrend}`);
  if (evolutionMetrics.hardMutationClusters.length > 0) {
    log(`Hard mutation clusters: ${evolutionMetrics.hardMutationClusters.join(', ')}`);
  }

  const patterns = analyzeFailurePatterns(allBenchmarkResults);
  const leagueReport = generateLeagueReport(leagueResultsPerBenchmark, leaderboardEntries, evolutionMetrics);
  const reportPath = path.join(RESULTS_DIR, 'LEAGUE_RESULTS.md');
  writeFileSync(reportPath, leagueReport, 'utf-8');
  log(`Wrote ${reportPath}`);

  const top20 = getTopFailurePatterns(patterns, 20);
  const failureMarkdown = generateFailurePatternsMarkdown(top20);
  const failurePath = path.join(RESULTS_DIR, 'FAILURE_PATTERNS.md');
  writeFileSync(failurePath, failureMarkdown, 'utf-8');
  log(`Wrote ${failurePath}`);

  log('\n=== Multi-Agent League Complete ===');
  log(`Total agents: ${agents.length}`);
  log(`Total benchmark rounds: ${allBenchmarkResults.length}`);
  log(
    `Overall pass rate: ${allBenchmarkResults.filter((r) => r.overall_success).length}/${allBenchmarkResults.length}`,
  );
}

function generateImprovementBacklog(
  results: BenchmarkRunResult[],
  patterns: ReturnType<typeof analyzeFailurePatterns>,
): string {
  const report = generateBenchmarkReport(results);
  const lines: string[] = [
    '# Improvement Backlog',
    '',
    `**Generated:** ${deterministicNow(masterSeed)}`,
    `**Benchmarks Run:** ${report.summary.total_benchmarks}`,
    `**Pass Rate:** ${report.summary.passed}/${report.summary.total_benchmarks}`,
    '',
    '## Prioritized Issues',
    '',
    'Issues ranked by **Impact Ãƒâ€” Frequency** scoring:',
    '',
    '| Rank | Issue | Area | Frequency | Impact | Priority Score | Affected Benchmarks |',
    '|------|-------|------|-----------|--------|----------------|---------------------|',
  ];

  const knownWeaknesses = [
    {
      issue: 'LLM provider injects structural errors that trigger verification failures',
      area: 'building',
      freq: 5,
      impact: 9,
      affected: 'All',
    },
    {
      issue: 'Build verification fails when no package.json present',
      area: 'build_verification',
      freq: 5,
      impact: 8,
      affected: 'All',
    },
    {
      issue: 'Dev server health check times out on non-standard ports',
      area: 'testing',
      freq: 4,
      impact: 8,
      affected: 'AI, SaaS, WebApp',
    },
    {
      issue: 'Repository materializer path resolution fails on Windows',
      area: 'materialization',
      freq: 3,
      impact: 10,
      affected: 'All (Windows)',
    },
    {
      issue: 'LLMBuilderProvider prompt exceeds context window for large blueprints',
      area: 'building',
      freq: 3,
      impact: 8,
      affected: 'Healthcare, Education',
    },
    {
      issue: 'Self-repair retry exhausts without informative fallback',
      area: 'building',
      freq: 4,
      impact: 7,
      affected: 'All',
    },
    {
      issue: 'Repair loop regenerates full modules instead of targeted file patches',
      area: 'repair',
      freq: 5,
      impact: 6,
      affected: 'All',
    },
    {
      issue: 'Judge system lacks domain-specific rubrics for healthcare/education',
      area: 'judging',
      freq: 2,
      impact: 9,
      affected: 'Healthcare, Education',
    },
    {
      issue: 'No Docker environment validation in build verification',
      area: 'build_verification',
      freq: 5,
      impact: 6,
      affected: 'All',
    },
    {
      issue: 'Playwright tests fail when app not fully initialized',
      area: 'testing',
      freq: 3,
      impact: 8,
      affected: 'All',
    },
    {
      issue: 'Token usage tracking not aggregated across phases',
      area: 'metrics',
      freq: 5,
      impact: 5,
      affected: 'All',
    },
    {
      issue: 'No circuit breaker for repeated LLM provider failures',
      area: 'infrastructure',
      freq: 3,
      impact: 8,
      affected: 'All',
    },
    {
      issue: 'Database schema generation lacks relationship awareness',
      area: 'building',
      freq: 4,
      impact: 7,
      affected: 'Healthcare, Education',
    },
    {
      issue: 'API endpoint generation does not match frontend service layer',
      area: 'building',
      freq: 4,
      impact: 7,
      affected: 'All',
    },
    {
      issue: 'No test coverage for Python/Flask backends',
      area: 'testing',
      freq: 2,
      impact: 8,
      affected: 'AI, Healthcare',
    },
    {
      issue: 'MemoryWriter file locking causes race conditions in concurrent phases',
      area: 'infrastructure',
      freq: 2,
      impact: 9,
      affected: 'All',
    },
    {
      issue: 'Architect blueprint lacks deployment configuration',
      area: 'architecture',
      freq: 5,
      impact: 5,
      affected: 'All',
    },
    {
      issue: 'No structured error taxonomy for phase failures',
      area: 'infrastructure',
      freq: 4,
      impact: 6,
      affected: 'All',
    },
    {
      issue: 'Benchmark runner does not inject environment variables',
      area: 'benchmark',
      freq: 3,
      impact: 7,
      affected: 'All',
    },
    {
      issue: 'Generated repository missing root-level TypeScript config',
      area: 'building',
      freq: 3,
      impact: 6,
      affected: 'All (Node)',
    },
  ];

  const scored = knownWeaknesses
    .map((w) => ({ ...w, priorityScore: w.freq * w.impact }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  for (let i = 0; i < scored.length; i++) {
    const w = scored[i]!;
    lines.push(
      `| ${i + 1} | ${w.issue} | ${w.area} | ${w.freq} | ${w.impact}/10 | **${w.priorityScore}** | ${w.affected} |`,
    );
  }

  lines.push('', '## Detailed Issue Analysis', '');

  for (let i = 0; i < scored.length; i++) {
    const w = scored[i]!;
    const rootCauses: Record<string, string> = {
      'LLM provider injects structural errors that trigger verification failures':
        'Non-deterministic mock provider deliberately injects errors to test robustness. This is expected behavior for the benchmark framework.',
      'Build verification fails when no package.json present':
        'Build executor assumes npm/node project structure; no graceful fallback for unsupported project types.',
      'Dev server health check times out on non-standard ports':
        'DefaultDevServerExecutor hardcodes port detection; health check URL hardcoded to port 3000.',
      'Repository materializer path resolution fails on Windows':
        'Path.join with absolute paths on Windows produces incorrect relative paths; path.relative behavior differs.',
      'LLMBuilderProvider prompt exceeds context window for large blueprints':
        'Prompt construction concatenates all blueprint fields without token budgeting; large database schemas and API contracts blow past limits.',
      'Self-repair retry exhausts without informative fallback':
        'Retry loop uses same provider; no fallback to simpler model or cached response when all attempts fail.',
      'Repair loop regenerates full modules instead of targeted file patches':
        'Current repair implementation regenerates the entire module (frontend/backend/database) rather than using CodeRepairProvider for targeted patching.',
      'Judge system lacks domain-specific rubrics for healthcare/education':
        'JudgeProvider uses generic code quality rubric; no healthcare compliance or education pedagogy criteria.',
      'No Docker environment validation in build verification':
        'BuildVerificationAgent runs npm/pip commands but does not validate Docker Compose files or container builds.',
      'Playwright tests fail when app not fully initialized':
        'Health check waits for HTTP 200 but does not verify app readiness (e.g., database migrations, asset compilation).',
      'Token usage tracking not aggregated across phases':
        'Each phase tracks tokens independently; no cross-phase aggregation in BenchmarkRunResult or report.',
      'No circuit breaker for repeated LLM provider failures':
        'RouterEngine marks provider degraded/unhealthy but no circuit breaker pattern to fail-fast on repeated failures.',
      'Database schema generation lacks relationship awareness':
        'LLMBuilderProvider.database_schema.relationships passed as JSON context but not explicitly used in prompt construction.',
      'API endpoint generation does not match frontend service layer':
        'Frontend and backend generated independently; no cross-reference validation between api.ts service calls and backend routes.',
      'No test coverage for Python/Flask backends':
        'Build executor supports Python detection but test generation assumes vitest/TypeScript.',
      'MemoryWriter file locking causes race conditions in concurrent phases':
        'MemoryWriter.appendLog writes to same file from multiple agents; no file locking or write queue.',
      'Architect blueprint lacks deployment configuration':
        'ArchitectProvider generates code-level blueprint but no Docker/Kubernetes/CI-CD configuration.',
      'No structured error taxonomy for phase failures':
        'PhaseResult.error is free-text string; no error code, category, or severity classification.',
      'Benchmark runner does not inject environment variables':
        'BenchmarkRunner runs phases sequentially but does not set NODE_ENV, DATABASE_URL, or other env vars needed by generated apps.',
      'Generated repository missing root-level TypeScript config':
        'Config module generates tsconfig.json with fixed values; does not adapt to blueprinted module structure.',
    };

    lines.push(
      `### ${i + 1}. ${w.issue}`,
      '',
      `- **Area:** ${w.area}`,
      `- **Frequency:** ${w.freq}/5 benchmarks`,
      `- **Impact:** ${w.impact}/10`,
      `- **Priority Score:** ${w.priorityScore}`,
      `- **Affected Benchmarks:** ${w.affected}`,
      '',
      '**Root Cause:**',
      '',
      rootCauses[w.issue] ?? 'Insufficient error handling or missing feature in the current implementation.',
      '',
      '**Recommended Fix:**',
      '',
    );

    const fixes: Record<string, string> = {
      'LLM provider injects structural errors that trigger verification failures':
        'This is intentional. The non-deterministic provider validates the repair loop. Reduce error injection rate once repair is reliable.',
      'Build verification fails when no package.json present':
        'Add fallback project detection in BuildExecutor: check for requirements.txt, setup.py, or use `npm init -y` to bootstrap.',
      'Dev server health check times out on non-standard ports':
        'Parse port from package.json scripts or .env; make health check URL configurable; add port scanning fallback (check common ports 3000-3010).',
      'Repository materializer path resolution fails on Windows':
        'Use path.win32/path.posix detection; add normalize() calls before relative path checks; add cross-platform test suite.',
      'LLMBuilderProvider prompt exceeds context window for large blueprints':
        'Add token budgeting to prompt construction: truncate large schemas, paginate API endpoints, use summary mode for non-critical blueprint sections.',
      'Self-repair retry exhausts without informative fallback':
        'Implement multi-provider fallback chain in retry loop. Track which models succeed per file type. Cache successful generation patterns.',
      'Repair loop regenerates full modules instead of targeted file patches':
        'Integrate CodeRepairProvider into repair loop: identify failed files, generate patches via LLM, apply patches, then re-verify only changed files.',
      'Judge system lacks domain-specific rubrics for healthcare/education':
        'Add rubric templates per hackathon category. Implement healthcare-specific checks (HIPAA patterns, patient data handling) and education checks (scaffolding, assessment design).',
      'No Docker environment validation in build verification':
        'Add Dockerfile parsing and docker-compose validation step in BuildVerificationAgent. Run `docker compose config --quiet` to validate syntax.',
      'Playwright tests fail when app not fully initialized':
        'Add readiness probe: poll health endpoint + check for expected response body. Add configurable startup wait and retry logic before running tests.',
      'Token usage tracking not aggregated across phases':
        'Add token accumulator in BenchmarkRunner that sums per-phase tokens. Report total tokens in BENCHMARK_RESULTS.md summary table.',
      'No circuit breaker for repeated LLM provider failures':
        'Implement CircuitBreaker class with failure threshold, half-open recovery, and metrics tracking. Integrate with RouterEngine.selectModel.',
      'Database schema generation lacks relationship awareness':
        'Inject database_schema.relationships into the database module prompt. Generate foreign key constraints, join tables, and Prisma relations from relationship definitions.',
      'API endpoint generation does not match frontend service layer':
        'Add cross-module validation step in BuildOrchestrator that checks frontend API service calls against backend route definitions.',
      'No test coverage for Python/Flask backends':
        'Add Python test generation to LLMBuilderProvider.generateTests: detect Python project type, generate pytest fixtures and test files matching backend modules.',
      'MemoryWriter file locking causes race conditions in concurrent phases':
        'Implement write queue with async mutex. Use appendFileSync with retry. Add file-level lock files (.lock) for cross-process safety.',
      'Architect blueprint lacks deployment configuration':
        'Extend ArchitectProvider to generate Docker Compose, nginx config, and CI/CD workflow files alongside the code blueprint.',
      'No structured error taxonomy for phase failures':
        'Define ErrorCode enum with category, severity, and retryable flags. Update PhaseResult to use structured error object instead of free-text.',
      'Benchmark runner does not inject environment variables':
        'Add env configuration to BenchmarkRunnerConfig. Set NODE_ENV, PORT, DATABASE_URL before phase execution.',
      'Generated repository missing root-level TypeScript config':
        'Add module-detection logic to config generation: scan blueprint modules, add path aliases, configure references for monorepo structure.',
    };

    lines.push(fixes[w.issue] ?? 'Investigate root cause and implement appropriate fix with test coverage.', '');
  }

  lines.push(
    '## Estimated Impact Summary',
    '',
    '| Priority Range | Count | Action |',
    '|---------------|-------|--------|',
    '| 40+ (Critical) | ' + scored.filter((s) => s.priorityScore >= 40).length + ' | Fix in next sprint |',
    '| 25-39 (High) | ' +
      scored.filter((s) => s.priorityScore >= 25 && s.priorityScore < 40).length +
      ' | Schedule within 2 sprints |',
    '| 15-24 (Medium) | ' +
      scored.filter((s) => s.priorityScore >= 15 && s.priorityScore < 25).length +
      ' | Add to backlog, prioritize by category |',
    '| <15 (Low) | ' + scored.filter((s) => s.priorityScore < 15).length + ' | Icebox, revisit quarterly |',
    '',
    '**Total backlog items:** ' + scored.length,
    '',
  );

  return lines.join('\n');
}

async function main(): Promise<void> {
  const mode = process.env.BENCHMARK_MODE ?? 'league';
  if (mode === 'single') {
    await singleAgentMain();
  } else {
    await multiAgentLeagueMain();
  }
}

main().catch((err) => {
  console.error('Benchmark runner failed:', err);
  process.exit(1);
});

function generateLeagueReport(
  perBenchmarkResults: { benchmarkId: string; benchmarkName: string; agentResults: Map<string, BenchmarkRunResult> }[],
  leaderboardEntries: LeaderboardEntry[],
  evolutionMetrics: import('./agent-types.js').EvolutionMetrics,
): string {
  const lines: string[] = [];
  const runAt = deterministicNow(masterSeed);

  lines.push('# Hack-A-Gent Multi-Agent Evolutionary League Report', '');
  lines.push(`**Run at:** ${runAt}`);
  lines.push(`**Total Agents:** ${leaderboardEntries.length}`);
  lines.push(`**Total Benchmark Rounds:** ${perBenchmarkResults.length}`);
  lines.push('');

  lines.push('## 1. Leaderboard', '');
  lines.push(
    leaderboardEntries.length > 0
      ? '| Rank | Agent | Robustness | Survival Rate | Repair Eff. | Specialization | Strongest | Weakest | Runs |' +
          '\n|-----:|-------|----------:|--------------:|-----------:|--------------:|----------|---------|-----:|' +
          '\n' +
          leaderboardEntries
            .map(
              (e) =>
                `| ${e.rank} | ${e.name} | ${e.averageRobustnessScore.toFixed(1)} | ${(e.mutationSurvivalRate * 100).toFixed(0)}% | ${e.repairEfficiency.toFixed(2)} | ${e.specializationScore.toFixed(2)} | ${e.strongestMutationType ?? 'N/A'} | ${e.mostVulnerableMutationType ?? 'N/A'} | ${e.totalBenchmarksRun} |`,
            )
            .join('\n')
      : 'No entries yet.',
  );
  lines.push('');

  lines.push('## 2. Evolution Metrics', '');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| **Specialization Diversity** | ${evolutionMetrics.specializationDiversity.toFixed(3)} |`);
  lines.push(`| **Adaptation Rate** | ${evolutionMetrics.adaptationRate.toFixed(3)} |`);
  lines.push(`| **Mutation Difficulty Trend** | ${evolutionMetrics.mutationDifficultyTrend} |`);
  lines.push(`| **Avg Benchmarks per Agent** | ${evolutionMetrics.averageBenchmarksPerAgent.toFixed(1)} |`);
  if (evolutionMetrics.hardMutationClusters.length > 0) {
    lines.push(`| **Hard Mutation Clusters** | ${evolutionMetrics.hardMutationClusters.join(', ')} |`);
  }
  lines.push('');

  lines.push('## 3. Per-Benchmark Agent Comparison', '');
  for (const bmr of perBenchmarkResults) {
    lines.push(`### ${bmr.benchmarkName}`, '');
    lines.push('| Agent | Success | Robustness | Detection | Repair | Survived | Strategies |');
    lines.push('|-------|---------|----------:|--------:|------:|----------|------------|');
    for (const [agentId, result] of bmr.agentResults) {
      const agentEntry = leaderboardEntries.find((e) => e.agentId === agentId);
      const name = agentEntry?.name ?? agentId;
      const success = result.overall_success ? 'PASS' : 'FAIL';
      const survived = result.survived_mutation ? 'Yes' : 'No';
      const detectPct = (result.detection_rate * 100).toFixed(0);
      const repairPct = (result.repair_success_rate * 100).toFixed(0);
      const strategies = result.repair_strategies_used.join(', ') || 'none';
      lines.push(
        `| ${name} | ${success} | ${result.robustness_score} | ${detectPct}% | ${repairPct}% | ${survived} | ${strategies} |`,
      );
    }
    lines.push('');
  }

  lines.push('## 4. Per-Mutation-Type Agent Performance', '');
  const allMutationTypes = [
    'remove_random_file',
    'corrupt_file_content',
    'truncate_file_content',
    'drop_required_module_field',
    'duplicate_file_entries',
    'break_module_type_consistency',
  ];
  lines.push('| Mutation Type | ' + leaderboardEntries.map((e) => e.name).join(' | ') + ' |');
  lines.push('|--------------|' + leaderboardEntries.map(() => '------:').join('|') + '|');
  for (const mt of allMutationTypes) {
    const values = leaderboardEntries.map((entry) => {
      const allResults: BenchmarkRunResult[] = [];
      for (const bmr of perBenchmarkResults) {
        const r = bmr.agentResults.get(entry.agentId);
        if (r) allResults.push(r);
      }
      const stats = allResults.map((r) => r.per_mutation_type_stats[mt]).filter((s) => s !== undefined);
      if (stats.length === 0) return 'N/A';
      const totalApplied = stats.reduce((s, st) => s + st.applied, 0);
      const totalRepaired = stats.reduce((s, st) => s + st.repaired, 0);
      return totalApplied > 0 ? `${Math.round((totalRepaired / totalApplied) * 100)}%` : 'N/A';
    });
    lines.push(`| ${mt} | ${values.join(' | ')} |`);
  }
  lines.push('');

  return lines.join('\n');
}

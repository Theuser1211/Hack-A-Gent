import { describe, it, expect } from 'vitest';

import { ExecutionPolicyOptimizer } from '../../benchmarks/execution-policy-optimizer.js';
import { HackathonRewardModel } from '../../benchmarks/hackathon-reward-model.js';
import { MultiAgentCompetition } from '../../benchmarks/multi-agent-competition.js';
import { OrganizationalMemoryBank } from '../../benchmarks/organizational-memory-bank.js';
import { Phase12Orchestrator } from '../../benchmarks/phase-12-orchestrator.js';
import { PostProjectLearningCycle } from '../../benchmarks/post-project-learning-cycle.js';
import { SkillGraph } from '../../benchmarks/skill-graph.js';
import { StrategicPlanner } from '../../benchmarks/strategic-planner.js';
import { StrategySimulationEngine } from '../../benchmarks/strategy-simulation-engine.js';

describe('OrganizationalMemoryBank', () => {
  it('stores and retrieves project snapshots', () => {
    const mem = new OrganizationalMemoryBank(42);
    expect(mem.getSnapshotCount()).toBe(0);
    mem.addProjectSnapshot({
      snapshotId: 'snap-1',
      projectName: 'test',
      projectDescription: 'A test',
      strategy: {
        id: 'p1',
        projectName: 'test',
        winningStrategy: 'MVP',
        mvpScope: ['feat1'],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.8,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React'],
      judgeCriteria: ['Innovation'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.85,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: ['web'],
    });
    expect(mem.getSnapshotCount()).toBe(1);
  });

  it('queries similar projects by context', () => {
    const mem = new OrganizationalMemoryBank(42);
    mem.addProjectSnapshot({
      snapshotId: 'snap-2',
      projectName: 'AI Dashboard',
      projectDescription: 'ML dashboard',
      strategy: {
        id: 'p2',
        projectName: 'ai-dash',
        winningStrategy: 'AI first',
        mvpScope: ['chart'],
        wowFactors: ['ML'],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.7,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React', 'Python', 'TensorFlow'],
      judgeCriteria: ['Technical'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.9,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: ['ai'],
    });
    const result = mem.querySimilarProjects('AI Dashboard with Python', 2);
    expect(result.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(result.similarity).toBeGreaterThan(0);
  });

  it('aggregates failure patterns across projects', () => {
    const mem = new OrganizationalMemoryBank(42);
    mem.addProjectSnapshot({
      snapshotId: 's1',
      projectName: 'p1',
      projectDescription: 'p1',
      strategy: {
        id: 'p1',
        projectName: 'p1',
        winningStrategy: 'x',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.5,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: [],
      judgeCriteria: [],
      constraints: [],
      uxResults: [],
      deploySuccess: false,
      overallScore: 0.3,
      errors: ['err1'],
      failurePatterns: [
        {
          patternId: 'fp1',
          category: 'deploy',
          description: 'Deploy timeout',
          frequency: 2,
          lastOccurrence: 'now',
          suggestedFix: 'Fix',
          fixedByMutation: null,
        },
      ],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: [],
    });
    const patterns = mem.getFailurePatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(1);
    expect(patterns[0]!.frequency).toBeGreaterThanOrEqual(2);
  });

  it('identifies winning patterns from high-scoring projects', () => {
    const mem = new OrganizationalMemoryBank(42);
    mem.addProjectSnapshot({
      snapshotId: 's2',
      projectName: 'Winner',
      projectDescription: 'A winner',
      strategy: {
        id: 'p2',
        projectName: 'winner',
        winningStrategy: 'UX first',
        mvpScope: ['ui'],
        wowFactors: ['polish'],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.9,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React', 'Vercel'],
      judgeCriteria: ['UX'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.95,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: [],
    });
    const wins = mem.getWinningPatterns();
    expect(wins.length).toBeGreaterThanOrEqual(1);
    expect(wins[0]!.avgScore).toBeGreaterThan(0.8);
  });
});

describe('HackathonRewardModel', () => {
  it('computes reward with weighted breakdown', () => {
    const model = new HackathonRewardModel(42);
    const reward = model.computeReward({
      companyId: 'comp1',
      companyName: 'Comp1',
      strategyType: 'balanced',
      finalScore: 0,
      breakdown: { score: 0, reliability: 0, wowFactor: 0, innovation: 0 },
      strengths: [],
      failureReasons: [],
      deployUrl: null,
      repairCycles: 0,
      deployAttempts: 1,
      totalFailures: 0,
      toolCallsUsed: 5,
      simulationScore: 10,
      rankScore: 0,
      rank: 0,
      pruned: false,
    });
    expect(reward.totalScore).toBeGreaterThan(0);
    expect(reward.totalScore).toBeLessThanOrEqual(1);
  });

  it('predicts success based on historical data', () => {
    const model = new HackathonRewardModel(42);
    model.recordOutcome('proj1', { strategyId: 'proj1', score: 0.8, success: true });
    model.recordOutcome('proj2', { strategyId: 'proj2', score: 0.9, success: true });
    const prediction = model.predictSuccess('MVP-first', ['React'], 'test');
    expect(prediction.totalScore).toBeGreaterThan(0);
  });

  it('finds best strategy from history', () => {
    const model = new HackathonRewardModel(42);
    model.recordOutcome('Strategy A', { strategyId: 'Strategy A', score: 0.9, success: true });
    model.recordOutcome('Strategy B', { strategyId: 'Strategy B', score: 0.5, success: false });
    const best = model.getBestStrategy();
    expect(best).not.toBeNull();
    expect(best!).toBe('Strategy A');
  });

  it('provides reward summary', () => {
    const model = new HackathonRewardModel(42);
    model.recordOutcome('S1', { strategyId: 'S1', score: 0.7, success: true });
    const summary = model.getRewardSummary();
    expect(summary.totalRewards).toBe(1);
    expect(summary.bestStrategy).toBe('S1');
  });
});

describe('StrategySimulationEngine', () => {
  it('generates strategy candidates', () => {
    const engine = new StrategySimulationEngine(42);
    const mem = new OrganizationalMemoryBank(42);
    const reward = new HackathonRewardModel(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'A test', ['Innovation'], [], ['React']);
    const candidates = engine.generateCandidates(plan, mem, reward, undefined, 3);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0]!.name).toBeTruthy();
    expect(candidates[0]!.expectedReward).toBeGreaterThan(0);
  });

  it('selects winner from candidates', () => {
    const engine = new StrategySimulationEngine(42);
    const mem = new OrganizationalMemoryBank(42);
    const reward = new HackathonRewardModel(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'A test', ['Impact'], [], ['React']);
    const candidates = engine.generateCandidates(plan, mem, reward, undefined, 3);
    const result = engine.selectWinner(candidates, 0.5);
    expect(result.winner).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.selectionReason).toBeTruthy();
  });

  it('runs full competition end-to-end', () => {
    const engine = new StrategySimulationEngine(42);
    const mem = new OrganizationalMemoryBank(42);
    const reward = new HackathonRewardModel(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent(
      'Hack',
      'Build something',
      ['Technical'],
      [],
      ['Python'],
    );
    const result = engine.runCompetition(plan, mem, reward, undefined, 4, 0.5);
    expect(result.winner).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ExecutionPolicyOptimizer', () => {
  it('has default policy with all fields', () => {
    const opt = new ExecutionPolicyOptimizer(42);
    const policy = opt.getPolicy();
    expect(policy.toolRetryPolicy).toBeTruthy();
    expect(policy.repairHeuristics.maxRepairAttempts).toBe(3);
    expect(policy.browserTesting.depth).toBe('standard');
    expect(policy.version).toBe(1);
  });

  it('updates policy based on metric results', () => {
    const opt = new ExecutionPolicyOptimizer(42);
    const change = opt.updatePolicy('deploy_success', 0.3);
    expect(change).not.toBeNull();
    expect(change!.metric).toBe('deploymentSafety.healthCheckRetries');
    expect(change!.reason).toContain('Low');
  });

  it('tracks metric trends', () => {
    const opt = new ExecutionPolicyOptimizer(42);
    opt.updatePolicy('deploy_success', 0.3);
    opt.updatePolicy('ux_score', 0.9);
    const trends = opt.getMetricTrends();
    expect(trends.length).toBeGreaterThanOrEqual(1);
  });
});

describe('SkillGraph', () => {
  it('initializes with default skills', () => {
    const sg = new SkillGraph(42);
    const skills = sg.getAllSkills();
    expect(skills.length).toBeGreaterThanOrEqual(15);
  });

  it('recommends stack based on project context', () => {
    const sg = new SkillGraph(42);
    const rec = sg.recommendStack('Build a web app with React', ['React']);
    expect(rec.technologies.length).toBeGreaterThanOrEqual(4);
    expect(rec.predictedSuccess).toBeGreaterThan(0);
    expect(rec.rationale).toBeTruthy();
  });

  it('records project outcomes and updates strengths', () => {
    const sg = new SkillGraph(42);
    sg.recordProjectOutcome(['React', 'Vercel', 'Node.js'], 0.85, true, true);
    const strength = sg.getSkillStrength('React');
    expect(strength).toBeGreaterThan(0);
  });

  it('provides skill summary sorted by strength', () => {
    const sg = new SkillGraph(42);
    const summary = sg.getSkillSummary();
    expect(summary.length).toBeGreaterThanOrEqual(15);
    for (let i = 1; i < summary.length; i++) {
      expect(summary[i - 1]!.strength).toBeGreaterThanOrEqual(summary[i]!.strength);
    }
  });
});

describe('MultiAgentCompetition', () => {
  it('initializes with 5 internal agents', () => {
    const comp = new MultiAgentCompetition(42);
    const agents = comp.getAgents();
    expect(agents.length).toBe(5);
    const variants = agents.map((a) => a.variant);
    expect(variants).toContain('conservative');
    expect(variants).toContain('aggressive');
    expect(variants).toContain('balanced');
    expect(variants).toContain('memory_driven');
    expect(variants).toContain('innovation_focused');
  });

  it('runs a competition round and selects winner', () => {
    const comp = new MultiAgentCompetition(42);
    const mem = new OrganizationalMemoryBank(42);
    const reward = new HackathonRewardModel(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent(
      'Test',
      'Build a test',
      ['Innovation'],
      [],
      ['React'],
    );

    const round = comp.runCompetitionRound(plan, mem, reward);
    expect(round.winner).toBeTruthy();
    expect(round.candidates.length).toBeGreaterThanOrEqual(2);
    expect(round.agentScores.length).toBe(5);
  });

  it('produces leaderboard after competition', () => {
    const comp = new MultiAgentCompetition(42);
    const mem = new OrganizationalMemoryBank(42);
    const reward = new HackathonRewardModel(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'Build', ['Technical'], [], []);
    comp.runCompetitionRound(plan, mem, reward);
    const board = comp.getLeaderboard();
    expect(board.length).toBe(5);
    expect(board[0]!.score).toBeGreaterThanOrEqual(0);
  });
});

describe('PostProjectLearningCycle', () => {
  it('runs full learning cycle and stores snapshot', async () => {
    const cycle = new PostProjectLearningCycle(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'A project', ['Innovation'], [], ['React']);
    const result = await cycle.runPostProjectLearning({
      projectName: 'test-project',
      projectDescription: 'A test project',
      strategy: plan,
      techStack: ['React', 'Node.js'],
      judgeCriteria: ['Innovation'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      taskCompletionRate: 0.9,
      errors: [],
      failurePatterns: [],
      judgeScore: 0.8,
      demoAvailable: true,
    });
    expect(result.snapshotStored).toBe(true);
    expect(result.rewardRecorded).toBe(true);
    expect(result.memorySummary.totalProjects).toBe(1);
    expect(result.memorySummary.averageScore).toBeGreaterThan(0);
  });

  it('proposes mutations for frequent failure patterns', async () => {
    const cycle = new PostProjectLearningCycle(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'Project', ['A'], [], []);
    const result = await cycle.runPostProjectLearning({
      projectName: 'fail-project',
      projectDescription: 'A failing project',
      strategy: plan,
      techStack: [],
      judgeCriteria: [],
      constraints: [],
      uxResults: [],
      deploySuccess: false,
      taskCompletionRate: 0.4,
      errors: ['Deploy failed', 'Build failed'],
      failurePatterns: [
        { category: 'deploy', description: 'Deploy timeout', frequency: 3, suggestedFix: 'Increase timeout' },
        { category: 'build', description: 'Build error', frequency: 2, suggestedFix: 'Pin deps' },
      ],
    });
    expect(result.mutationsProposed.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase12Orchestrator — Integration', () => {
  it('creates orchestrator with all subsystems', () => {
    const orch = new Phase12Orchestrator(42);
    expect(orch.memory).toBeTruthy();
    expect(orch.rewardModel).toBeTruthy();
    expect(orch.simulationEngine).toBeTruthy();
    expect(orch.policyOptimizer).toBeTruthy();
    expect(orch.skillGraph).toBeTruthy();
    expect(orch.competition).toBeTruthy();
    expect(orch.learningCycle).toBeTruthy();
  });

  it('runs full project lifecycle with memory consultation and competition', async () => {
    const orch = new Phase12Orchestrator(42);
    const report = await orch.runProject({
      title: 'AI Health Dashboard',
      problemStatement: 'Build a health data visualization dashboard with ML predictions',
      judgingCriteria: ['Innovation', 'Technical Complexity', 'UX'],
      constraints: ['12 hour limit'],
      techStack: ['React', 'Python', 'TensorFlow'],
      preferredStack: ['React'],
    });

    expect(report.strategyCompetition.winner).toBeTruthy();
    expect(report.strategyCompetition.candidates.length).toBeGreaterThanOrEqual(2);
    expect(report.strategyCompetition.agentLeaderboard.length).toBe(5);
    expect(report.rewardPrediction.predicted).toBeGreaterThan(0);
    expect(report.skillGraphUpdate.length).toBeGreaterThanOrEqual(15);
    expect(report.failurePatternReport).toBeDefined();
    expect(report.executionPolicyChanges).toBeDefined();
    expect(report.memoryUpdateSummary.totalProjects).toBeGreaterThanOrEqual(0);
    expect(report.decisionTraces.length).toBeGreaterThan(0);
  });

  it('runs post-project learning cycle', async () => {
    const orch = new Phase12Orchestrator(42);
    const plan = new StrategicPlanner(42).analyzeCompetitionIntent('Test', 'Project', ['A'], [], []);
    const output = await orch.runPostProject({
      projectName: 'post-project',
      projectDescription: 'After run learning',
      strategy: plan,
      techStack: ['React'],
      judgeCriteria: ['UX'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      taskCompletionRate: 0.95,
      errors: [],
      failurePatterns: [],
      judgeScore: 0.85,
      demoAvailable: true,
    });
    expect(output.snapshotStored).toBe(true);
    expect(output.rewardRecorded).toBe(true);
  });

  it('reports memory summary after multiple operations', () => {
    const orch = new Phase12Orchestrator(42);
    const summary = orch.getMemorySummary();
    expect(summary.totalProjects).toBeGreaterThanOrEqual(0);
    expect(summary.averageScore).toBeGreaterThanOrEqual(0);
  });
});

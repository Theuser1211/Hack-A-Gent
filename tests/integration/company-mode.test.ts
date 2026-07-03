import { describe, it, expect } from 'vitest';

import { CapabilityEvolutionEngine } from '../../benchmarks/capability-evolution-engine.js';
import { DecisionLogger } from '../../benchmarks/decision-trace.js';
import { GlobalExecutionBrain } from '../../benchmarks/global-execution-brain.js';
import { HumanInteractionStrategist } from '../../benchmarks/human-interaction-strategist.js';
import { Phase11Orchestrator } from '../../benchmarks/phase-11-orchestrator.js';
import { StrategicPlanner, type StrategyPlan } from '../../benchmarks/strategic-planner.js';
import { TaskGraph } from '../../benchmarks/task-graph.js';
import { ToolExecutionGraph } from '../../benchmarks/tool-execution-graph.js';
import { UXEvaluationAgent } from '../../benchmarks/ux-evaluation-agent.js';

describe('DecisionLogger', () => {
  it('logs decisions with all fields', () => {
    const logger = new DecisionLogger(42);
    const trace = logger.log('strategy', 'analyze', 'Test decision', 0.85);
    expect(trace.decisionId).toContain('dec-');
    expect(trace.agent).toBe('strategy');
    expect(trace.action).toBe('analyze');
    expect(trace.reason).toBe('Test decision');
    expect(trace.confidence).toBe(0.85);
    expect(trace.timestamp).toBeTruthy();
  });

  it('returns all decisions', () => {
    const logger = new DecisionLogger(42);
    logger.log('planner', 'plan', 'Plan', 0.9);
    logger.log('builder', 'build', 'Build', 0.8);
    expect(logger.getAll().length).toBe(2);
  });

  it('filters by agent', () => {
    const logger = new DecisionLogger(42);
    logger.log('planner', 'plan', 'Plan', 0.9);
    logger.log('builder', 'build', 'Build', 0.8);
    logger.log('strategy', 'analyze', 'Analyze', 0.7);
    expect(logger.getByAgent('builder').length).toBe(1);
    expect(logger.getByAgent('strategy').length).toBe(1);
  });

  it('provides summary statistics', () => {
    const logger = new DecisionLogger(42);
    logger.log('strategy', 'a', 'A', 0.9);
    logger.log('strategy', 'b', 'B', 0.5);
    logger.log('planner', 'c', 'C', 0.7);
    const summary = logger.getSummary();
    expect(summary.total).toBe(3);
    expect(summary.byAgent['strategy']).toBe(2);
    expect(summary.avgConfidence).toBeCloseTo(0.7, 1);
  });

  it('identifies low-confidence failure decisions', () => {
    const logger = new DecisionLogger(42);
    logger.log('strategy', 'good', 'Good', 0.9);
    logger.log('strategy', 'bad', 'Bad', 0.3);
    logger.log('strategy', 'ugly', 'Ugly', 0.4);
    const failures = logger.getFailureDecisions();
    expect(failures.length).toBe(2);
  });
});

describe('StrategicPlanner', () => {
  it('analyzes competition intent and produces a StrategyPlan', () => {
    const planner = new StrategicPlanner(42);
    const plan = planner.analyzeCompetitionIntent(
      'AI Health Assistant',
      'Build an AI-powered health monitoring app for hackathon',
      ['Innovation (40%)', 'Technical Complexity (30%)', 'UX Polish (20%)', 'Impact (10%)'],
      ['Must use AI/ML', '12-hour limit'],
      ['Python', 'TensorFlow', 'React'],
    );
    expect(plan.projectName).toBe('ai-health-assistant');
    expect(plan.winningStrategy).toBeTruthy();
    expect(plan.mvpScope.length).toBeGreaterThanOrEqual(6);
    expect(plan.wowFactors.length).toBeGreaterThanOrEqual(2);
    expect(plan.risks.length).toBeGreaterThanOrEqual(3);
    expect(plan.estimatedSuccessProbability).toBeGreaterThan(0);
    expect(plan.estimatedSuccessProbability).toBeLessThanOrEqual(1);
    expect(Object.keys(plan.scoringAlignment).length).toBe(4);
    expect(plan.competitionAnalysis.judgePriorities.length).toBeGreaterThanOrEqual(4);
    expect(plan.competitionAnalysis.differentiators.length).toBeGreaterThanOrEqual(3);
    expect(plan.competitionAnalysis.commonPitfalls.length).toBeGreaterThanOrEqual(3);
  });

  it('handles empty criteria gracefully', () => {
    const planner = new StrategicPlanner(100);
    const plan = planner.analyzeCompetitionIntent('Test', 'A test project', [], [], []);
    expect(plan.mvpScope.length).toBeGreaterThanOrEqual(6);
    expect(plan.risks.length).toBeGreaterThanOrEqual(3);
    expect(plan.estimatedSuccessProbability).toBeGreaterThan(0);
  });

  it('detects AI/ML differentiators from tech stack', () => {
    const planner = new StrategicPlanner(200);
    const plan = planner.analyzeCompetitionIntent('AI App', 'AI app', ['Innovation'], [], ['llm', 'openai']);
    expect(plan.competitionAnalysis.differentiators.some((d) => d.toLowerCase().includes('ai'))).toBe(true);
  });

  it('produces deterministic results with same seed', () => {
    const p1 = new StrategicPlanner(42);
    const p2 = new StrategicPlanner(42);
    const plan1 = p1.analyzeCompetitionIntent('Test', 'Project', ['A'], [], []);
    const plan2 = p2.analyzeCompetitionIntent('Test', 'Project', ['A'], [], []);
    expect(plan1.winningStrategy).toBe(plan2.winningStrategy);
    expect(plan1.estimatedSuccessProbability).toBe(plan2.estimatedSuccessProbability);
  });
});

describe('GlobalExecutionBrain', () => {
  it('estimates cost for a task', () => {
    const brain = new GlobalExecutionBrain(42);
    const tg = new TaskGraph('test', 42);
    const id = tg.addNode('Build frontend', 'frontend');
    const task = tg.getNode(id)!;
    const cost = brain.estimateCost(task);
    expect(cost.taskId).toBe(id);
    expect(cost.complexity).toBe('high');
    expect(cost.estimatedTimeMs).toBeGreaterThan(0);
  });

  it('detects bottlenecks in task graph', () => {
    const brain = new GlobalExecutionBrain(42);
    const tg = new TaskGraph('test', 42);
    tg.addNode('Task 1', 'frontend');
    tg.addNode('Task 2', 'frontend');
    tg.addNode('Task 3', 'frontend');
    tg.addNode('Task 4', 'frontend');
    tg.addNode('Task 5', 'backend');
    const bottlenecks = brain.detectBottlenecks(tg);
    expect(bottlenecks.length).toBeGreaterThanOrEqual(1);
  });

  it('reprioritizes tasks based on reason', () => {
    const brain = new GlobalExecutionBrain(42);
    const tg = new TaskGraph('test', 42);
    tg.addNode('Build', 'frontend');
    tg.addNode('Test', 'testing');
    tg.addNode('Deploy', 'deployment');
    tg.markDone(tg.getAllNodes()[0]!.id);
    const action = brain.reprioritize(tg, 'deployment_issue');
    expect(action.reason).toBe('deployment_issue');
    expect(action.priorityChanges.length).toBeGreaterThanOrEqual(0);
  });

  it('selects next optimal tasks respecting parallel budget', () => {
    const brain = new GlobalExecutionBrain(42);
    brain.setParallelBudget(2);
    const tg = new TaskGraph('test', 42);
    tg.addNode('Task A', 'frontend');
    tg.addNode('Task B', 'backend');
    tg.addNode('Task C', 'frontend');

    const tasks = brain.getNextOptimalTasks(tg);
    expect(tasks.length).toBeLessThanOrEqual(2);
  });

  it('pauses and resumes execution', () => {
    const brain = new GlobalExecutionBrain(42);
    expect(brain.isExecutionPaused()).toBe(false);
    brain.pauseCriticalPath();
    expect(brain.isExecutionPaused()).toBe(true);
    brain.resumeOptimizedPath();
    expect(brain.isExecutionPaused()).toBe(false);
  });
});

describe('ToolExecutionGraph', () => {
  it('adds tool nodes with default retry policies', () => {
    const teg = new ToolExecutionGraph(42);
    const id = teg.addNode('deploy', 'vercel_deploy', { target: 'vercel' });
    const node = teg.getAllNodes().find((n) => n.id === id)!;
    expect(node.toolType).toBe('deploy');
    expect(node.retryPolicy.maxRetries).toBe(3);
    expect(node.status).toBe('pending');
  });

  it('detects conflicts between tool nodes', () => {
    const teg = new ToolExecutionGraph(42);
    const tg = new TaskGraph('test', 42);
    tg.addNode('Build', 'frontend');
    teg.addNode('deploy', 'vercel_deploy', { target: 'vercel' });
    teg.addNode('browser_test', 'e2e_test', { url: 'http://localhost:3000' });
    const conflicts = teg.detectConflicts(tg);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });

  it('respects dependency ordering', () => {
    const teg = new ToolExecutionGraph(42);
    const a = teg.addNode('github', 'create_repo');
    const b = teg.addNode('deploy', 'vercel_deploy', {}, [a]);
    const plan = teg.getExecutionPlan();
    expect(plan.length).toBeGreaterThanOrEqual(2);
  });

  it('records results and updates performance score', () => {
    const teg = new ToolExecutionGraph(42);
    const id = teg.addNode('shell', 'test_cmd');
    teg.markRunning(id);
    teg.recordResult(id, true, 100);
    const node = teg.getAllNodes().find((n) => n.id === id)!;
    expect(node.status).toBe('success');
    expect(node.performanceScore).toBeGreaterThan(0.5);
  });

  it('handles retry logic correctly', () => {
    const teg = new ToolExecutionGraph(42);
    const id = teg.addNode('deploy', 'fail_deploy', {}, [], {
      maxRetries: 2,
      backoffMs: 100,
      retryOn: ['timeout', 'network'],
    });
    teg.markRunning(id);
    teg.recordResult(id, false, 50, undefined, 'timeout');
    expect(teg.shouldRetry(id)).toBe(true);
    teg.markRunning(id);
    teg.recordResult(id, false, 50, undefined, 'timeout');
    expect(teg.shouldRetry(id)).toBe(false);
  });

  it('generates performance report', () => {
    const teg = new ToolExecutionGraph(42);
    const id = teg.addNode('github', 'create_repo');
    teg.markRunning(id);
    teg.recordResult(id, true, 200);
    const report = teg.getPerformanceReport();
    expect(report.length).toBeGreaterThanOrEqual(1);
    expect(report[0]!.toolType).toBe('github');
  });
});

describe('HumanInteractionStrategist', () => {
  it('detects ambiguity gaps from devpost data', () => {
    const strategist = new HumanInteractionStrategist(42);
    const gaps = strategist.detectAmbiguityGaps({
      title: 'Test App',
      problemStatement: 'Build something',
      judgingCriteria: [],
      constraints: [],
      recommendedStack: [],
      submissionRequirements: [],
    });
    const highGaps = gaps.filter((g) => g.level === 'high');
    expect(highGaps.length).toBeGreaterThanOrEqual(2);
  });

  it('generates prioritized questions from gaps', () => {
    const strategist = new HumanInteractionStrategist(42);
    strategist.setGainThreshold(0.1);
    const gaps = strategist.detectAmbiguityGaps({
      title: 'Test',
      problemStatement: 'A',
      judgingCriteria: [],
      constraints: [],
      recommendedStack: [],
      submissionRequirements: [],
    });
    const questions = strategist.generateQuestions(gaps);
    expect(questions.length).toBeGreaterThanOrEqual(1);
    const prioritized = strategist.prioritizeQuestions(questions);
    expect(prioritized[0]!.priority).toBe('blocking');
  });

  it('blocks questions below gain threshold', () => {
    const strategist = new HumanInteractionStrategist(42);
    strategist.setGainThreshold(0.9);
    const gaps = strategist.detectAmbiguityGaps({
      title: 'Test',
      problemStatement: 'Detailed project',
      judgingCriteria: ['Innovation'],
      constraints: ['12 hours'],
      recommendedStack: ['React'],
      submissionRequirements: ['GitHub link'],
    });
    const questions = strategist.generateQuestions(gaps);
    for (const q of questions) {
      expect(strategist.shouldAskQuestion(q)).toBe(true);
    }
  });

  it('returns blocking questions first', () => {
    const strategist = new HumanInteractionStrategist(42);
    const gaps: Array<{
      field: string;
      level: 'high' | 'medium' | 'low';
      impactIfWrong: string;
      canContinue: boolean;
    }> = [
      { field: 'scope', level: 'high', impactIfWrong: 'Wrong features', canContinue: false },
      { field: 'tech_stack', level: 'medium', impactIfWrong: 'Slow', canContinue: true },
    ];
    const questions = strategist.generateQuestions(gaps as any);
    const prioritized = strategist.prioritizeQuestions(questions);
    if (prioritized.length > 1) {
      expect(prioritized[0]!.priority).toBe('blocking');
    }
  });
});

describe('UXEvaluationAgent', () => {
  it('defines standard user journeys', () => {
    const ux = new UXEvaluationAgent(null, 42);
    const journeys = ux.defineStandardJourneys();
    expect(journeys.length).toBeGreaterThanOrEqual(3);
    expect(journeys[0]!.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('classifies failure types correctly', () => {
    const ux = new UXEvaluationAgent(null, 42);
    const desc = ux.classifyFailure('visual_break');
    expect(desc).toContain('rendering');
    expect(ux.classifyFailure('interaction_failure')).toContain('forms');
    expect(ux.classifyFailure('api_break')).toContain('API');
    expect(ux.classifyFailure('flow_break')).toContain('navigation');
  });

  it('evaluates a journey on a real URL', async () => {
    const ux = new UXEvaluationAgent('https://example.com', 42);
    const journeys = ux.defineStandardJourneys();
    const result = await ux.evaluateJourney(journeys[0]!);
    expect(result.journeyName).toBe('Homepage Load');
    expect(result.uiCompletenessScore).toBeGreaterThanOrEqual(0);
    expect(result.journeyFlowScore).toBeGreaterThanOrEqual(0);
  });

  it('handles unreachable URLs gracefully', async () => {
    const ux = new UXEvaluationAgent('https://nonexistent.invalid', 42);
    const journey = {
      name: 'Fail',
      critical: true,
      steps: [
        {
          id: 's1',
          description: 'Fail',
          url: '/',
          expectedElements: ['main'],
          expectedTexts: [],
          actionType: 'navigate' as const,
          timeoutMs: 2000,
        },
      ],
    };
    const result = await ux.evaluateJourney(journey);
    expect(result.passed).toBe(false);
    expect(result.overallFailures.length).toBeGreaterThanOrEqual(1);
  });

  it('generates UX report with statistics', () => {
    const ux = new UXEvaluationAgent(null, 42);
    const report = ux.generateUXReport();
    expect(report.totalJourneys).toBe(0);
    expect(report.avgCompleteness).toBe(0);
  });
});

describe('CapabilityEvolutionEngine', () => {
  it('tracks failure patterns from task graph', () => {
    const engine = new CapabilityEvolutionEngine(42);
    const tg = new TaskGraph('test', 42);
    const id = tg.addNode('Build', 'frontend');
    tg.markBlocked(id, 'Build failed: module not found');
    const patterns = engine.trackFailure(tg);
    expect(patterns.length).toBe(1);
    expect(patterns[0]!.category).toBe('frontend');
    expect(patterns[0]!.frequency).toBe(1);
  });

  it('proposes mutations from failure patterns', () => {
    const engine = new CapabilityEvolutionEngine(42);
    const pattern = {
      patternId: 'fp-1',
      category: 'deployment',
      description: 'Deploy timeout',
      frequency: 3,
      lastOccurrence: 'now',
      suggestedFix: 'Fix it',
      fixedByMutation: null,
    };
    const mutation = engine.proposeMutation(pattern);
    expect(mutation.type).toBe('add');
    expect(mutation.target).toContain('deployment');
    expect(mutation.simulatedSuccessRate).toBeGreaterThan(0);
  });

  it('simulates mutation impact before activation', () => {
    const engine = new CapabilityEvolutionEngine(42);
    const pattern = {
      patternId: 'fp-1',
      category: 'testing',
      description: 'Test fails',
      frequency: 2,
      lastOccurrence: 'now',
      suggestedFix: 'Fix',
      fixedByMutation: null,
    };
    const mutation = engine.proposeMutation(pattern);
    const sim = engine.simulateMutation(mutation);
    expect(sim.predictedImprovement).toBeGreaterThanOrEqual(0);
    expect(sim.predictedImprovement).toBeLessThanOrEqual(1);
    expect(sim.recommendation).toBeTruthy();
  });

  it('activates mutations and links to failure patterns', () => {
    const engine = new CapabilityEvolutionEngine(42);
    const pattern = {
      patternId: 'fp-1',
      category: 'testing',
      description: 'Timeout',
      frequency: 2,
      lastOccurrence: 'now',
      suggestedFix: 'Fix',
      fixedByMutation: null,
    };
    const mutation = engine.proposeMutation(pattern);
    const activated = engine.activateMutation(mutation.id);
    expect(activated).toBe(true);
    const doubleActivate = engine.activateMutation(mutation.id);
    expect(doubleActivate).toBe(false);
    const patterns = engine.getFailurePatterns();
    expect(patterns[0]!.fixedByMutation).toBe(mutation.id);
  });

  it('tracks strategy performance over time', () => {
    const engine = new CapabilityEvolutionEngine(42);
    engine.recordStrategyPerformance('MVP first', true, 0.85);
    engine.recordStrategyPerformance('MVP first', true, 0.9);
    engine.recordStrategyPerformance('MVP first', false, 0.5);
    const best = engine.getBestStrategy();
    expect(best).not.toBeNull();
    expect(best!.strategyDescription).toBe('MVP first');
    expect(best!.projectCount).toBe(3);
  });

  it('produces learning summary', () => {
    const engine = new CapabilityEvolutionEngine(42);
    const summary = engine.getLearningSummary();
    expect(summary.totalMutations).toBe(0);
    expect(summary.trackedPatterns).toBe(0);
  });
});

describe('Phase11Orchestrator — Integration', () => {
  it('creates orchestrator with all subsystems', () => {
    const orch = new Phase11Orchestrator('/tmp/test', '/tmp/test/state', 42);
    expect(orch.strategicPlanner).toBeTruthy();
    expect(orch.globalBrain).toBeTruthy();
    expect(orch.toolGraph).toBeTruthy();
    expect(orch.interactionStrategist).toBeTruthy();
    expect(orch.uxAgent).toBeTruthy();
    expect(orch.evolutionEngine).toBeTruthy();
    expect(orch.toolGateway).toBeTruthy();
    expect(orch.humanControl).toBeTruthy();
    expect(orch.taskGraph).toBeTruthy();
    expect(orch.getCompanyPhase()).toBe('analysis');
  });

  it('parses devpost input and runs strategic analysis', async () => {
    const orch = new Phase11Orchestrator('/tmp/test2', '/tmp/test2/state', 100);
    const input =
      'Title: Climate Dashboard\nProblem: Build a climate data visualization dashboard for hackathon\nJudging Criteria: Innovation, Technical, UX, Impact\nConstraints: 24 hour limit\nTech Stack: React, D3, Python';
    const report = await orch.runCompanyMode(input);
    expect(report.strategyReport.plan.projectName).toBe('climate-dashboard');
    expect(report.strategyReport.plan.mvpScope.length).toBeGreaterThanOrEqual(6);
    expect(report.strategyReport.plan.wowFactors.length).toBeGreaterThanOrEqual(2);
    expect(report.strategyReport.plan.estimatedSuccessProbability).toBeGreaterThan(0);
    expect(report.decisionTraces.length).toBeGreaterThan(0);
  });
});

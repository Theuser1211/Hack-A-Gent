import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { createDeterministicUuid } from './determinism-kernel.js';
import { ExecutionPolicyOptimizer, type PolicyChange } from './execution-policy-optimizer.js';
import { HackathonRewardModel, type RewardSignal } from './hackathon-reward-model.js';
import { MultiAgentCompetition, type CompetitionRound } from './multi-agent-competition.js';
import { OrganizationalMemoryBank, type MemoryQueryResult } from './organizational-memory-bank.js';
import { PostProjectLearningCycle, type LearningCycleOutput } from './post-project-learning-cycle.js';
import { SkillGraph, type SkillRecord } from './skill-graph.js';
import type { StrategyPlan } from './strategic-planner.js';
import { StrategicPlanner } from './strategic-planner.js';
import {
  StrategySimulationEngine,
  type StrategyCandidate,
  type CompetitionResult,
} from './strategy-simulation-engine.js';
import type { UXEvaluationResult } from './ux-evaluation-agent.js';

export interface Phase12Report {
  strategyCompetition: {
    candidates: StrategyCandidate[];
    winner: StrategyCandidate;
    selectionReason: string;
    agentLeaderboard: Array<{ variant: string; score: number; wins: number }>;
  };
  rewardPrediction: { predicted: number; actual: number; error: number; signal: RewardSignal };
  skillGraphUpdate: Array<{ technology: string; strength: number; successRate: number; category: string }>;
  failurePatternReport: Array<{ category: string; description: string; frequency: number }>;
  executionPolicyChanges: PolicyChange[];
  memoryUpdateSummary: { totalProjects: number; newSnapshot: string; topTechnologies: string[]; averageScore: number };
  learningCycle: LearningCycleOutput | null;
  decisionTraces: DecisionTrace[];
}

export class Phase12Orchestrator {
  private readonly seed: number;
  private readonly orchestratorId: string;
  private readonly decisionLogger: DecisionLogger;
  private previousReport: Phase12Report | null = null;

  readonly memory: OrganizationalMemoryBank;
  readonly rewardModel: HackathonRewardModel;
  readonly simulationEngine: StrategySimulationEngine;
  readonly policyOptimizer: ExecutionPolicyOptimizer;
  readonly skillGraph: SkillGraph;
  readonly competition: MultiAgentCompetition;
  readonly learningCycle: PostProjectLearningCycle;

  constructor(seed = 42) {
    this.seed = seed;
    this.orchestratorId = 'p12-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 9000);

    this.memory = new OrganizationalMemoryBank(seed + 100);
    this.rewardModel = new HackathonRewardModel(seed + 200);
    this.simulationEngine = new StrategySimulationEngine(seed + 300);
    this.policyOptimizer = new ExecutionPolicyOptimizer(seed + 400);
    this.skillGraph = new SkillGraph(seed + 500);
    this.competition = new MultiAgentCompetition(seed + 600);
    this.learningCycle = new PostProjectLearningCycle(seed + 700);
  }

  async runProject(input: {
    title: string;
    problemStatement: string;
    judgingCriteria: string[];
    constraints: string[];
    techStack: string[];
    preferredStack?: string[];
  }): Promise<Phase12Report> {
    const projectName = input.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

    // Phase 1: Consult organizational memory
    this.decisionLogger.log('planner', 'consult_memory', `Consulting memory for "${input.title}"`, 0.9, [], {
      projectName,
      memorySize: this.memory.getSnapshotCount(),
    });
    const memoryContext = this.memory.querySimilarProjects(input.title + ' ' + input.problemStatement, 3);

    // Phase 2: Generate base strategy plan
    const planner = new StrategicPlanner(this.seed + 800);
    const basePlan = planner.analyzeCompetitionIntent(
      input.title,
      input.problemStatement,
      input.judgingCriteria,
      input.constraints,
      input.techStack,
    );

    // Phase 3: Run multi-agent competition
    this.decisionLogger.log('strategy', 'start_competition', 'Starting multi-agent strategy competition', 0.85);
    const policy = this.policyOptimizer.getPolicy();
    const competitionRound = this.competition.runCompetitionRound(basePlan, this.memory, this.rewardModel, policy);
    const winner = competitionRound.winner;
    const agentLeaderboard = this.competition.getLeaderboard();

    // Phase 4: Predict reward for winning strategy
    const predictedReward = this.rewardModel.predictSuccess(winner.name, input.techStack, input.problemStatement);

    // Phase 5: Recommend stack
    const stackRec = this.skillGraph.recommendStack(input.problemStatement, input.preferredStack);

    // Phase 6: Simulate and select
    const finalPolicy = this.policyOptimizer.getOptimizedPolicy();

    // Phase 7: Get memory summary
    const memSummary = this.memory.getMemorySummary();
    const failurePatterns = this.memory.getFailurePatterns();
    const skillSummary = this.skillGraph.getSkillSummary();

    // Phase 8: Generate report
    const report: Phase12Report = {
      strategyCompetition: {
        candidates: competitionRound.candidates,
        winner: competitionRound.winner,
        selectionReason: competitionRound.selectionReason,
        agentLeaderboard,
      },
      rewardPrediction: { predicted: predictedReward.totalScore, actual: 0, error: 0, signal: predictedReward },
      skillGraphUpdate: skillSummary,
      failurePatternReport: failurePatterns
        .slice(0, 10)
        .map((fp) => ({ category: fp.category, description: fp.description, frequency: fp.frequency })),
      executionPolicyChanges: this.policyOptimizer.getChangeLog(),
      memoryUpdateSummary: {
        totalProjects: memSummary.totalProjects,
        newSnapshot: projectName,
        topTechnologies: memSummary.topTechnologies,
        averageScore: memSummary.averageScore,
      },
      learningCycle: null,
      decisionTraces: this.getAllDecisionTraces(),
    };

    this.previousReport = report;
    return report;
  }

  async runPostProject(actualResults: {
    projectName: string;
    projectDescription: string;
    strategy: StrategyPlan;
    techStack: string[];
    judgeCriteria: string[];
    constraints: string[];
    uxResults: UXEvaluationResult[];
    deploySuccess: boolean;
    taskCompletionRate: number;
    errors: string[];
    failurePatterns: Array<{ category: string; description: string; frequency: number; suggestedFix: string }>;
    judgeScore?: number;
    demoAvailable?: boolean;
    tags?: string[];
  }): Promise<LearningCycleOutput> {
    const output = await this.learningCycle.runPostProjectLearning(actualResults);

    if (this.previousReport) {
      this.previousReport.rewardPrediction.actual = output.memorySummary.averageScore;
      this.previousReport.rewardPrediction.error =
        Math.round(Math.abs(this.previousReport.rewardPrediction.predicted - output.memorySummary.averageScore) * 100) /
        100;
      this.previousReport.learningCycle = output;
      this.previousReport.executionPolicyChanges = this.policyOptimizer.getChangeLog();
      this.previousReport.decisionTraces = this.getAllDecisionTraces();
    }

    return output;
  }

  getMemorySummary() {
    return this.memory.getMemorySummary();
  }
  getMemory() {
    return this.memory;
  }
  getRewardModel() {
    return this.rewardModel;
  }
  getPolicyOptimizer() {
    return this.policyOptimizer;
  }
  getSkillGraph() {
    return this.skillGraph;
  }
  getCompetition() {
    return this.competition;
  }
  getLastReport(): Phase12Report | null {
    return this.previousReport;
  }

  private getAllDecisionTraces(): DecisionTrace[] {
    const loggers = [
      this.decisionLogger,
      this.memory.getDecisionLogger(),
      this.rewardModel.getDecisionLogger(),
      this.simulationEngine.getDecisionLogger(),
      this.policyOptimizer.getDecisionLogger(),
      this.skillGraph.getDecisionLogger(),
      this.competition.getDecisionLogger(),
      this.learningCycle.getDecisionLogger(),
    ];
    return loggers.flatMap((l) => l.getAll());
  }
}

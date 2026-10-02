import { CapabilityEvolutionEngine, type CapabilityMutation } from './capability-evolution-engine.js';
import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import { ExecutionPolicyOptimizer, type PolicyChange } from './execution-policy-optimizer.js';
import { HackathonRewardModel, type RewardSignal } from './hackathon-reward-model.js';
import { OrganizationalMemoryBank, type ProjectSnapshot } from './organizational-memory-bank.js';
import { SkillGraph } from './skill-graph.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { UXEvaluationResult } from './ux-evaluation-agent.js';

export interface LearningCycleOutput {
  cycleId: string;
  snapshotStored: boolean;
  rewardRecorded: boolean;
  policiesUpdated: PolicyChange[];
  skillsUpdated: string[];
  mutationsProposed: CapabilityMutation[];
  memorySummary: { totalProjects: number; averageScore: number };
  timestamp: string;
}

export class PostProjectLearningCycle {
  private readonly seed: number;
  private readonly cycleId: string;
  private readonly decisionLogger: DecisionLogger;
  readonly memory: OrganizationalMemoryBank;
  readonly rewardModel: HackathonRewardModel;
  readonly policyOptimizer: ExecutionPolicyOptimizer;
  readonly skillGraph: SkillGraph;
  readonly evolutionEngine: CapabilityEvolutionEngine;

  constructor(seed = 42, memory?: OrganizationalMemoryBank) {
    this.seed = seed;
    this.cycleId = 'learn-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8600);
    this.memory = memory ?? new OrganizationalMemoryBank(seed + 1);
    this.rewardModel = new HackathonRewardModel(seed + 2);
    this.policyOptimizer = new ExecutionPolicyOptimizer(seed + 3);
    this.skillGraph = new SkillGraph(seed + 4);
    this.evolutionEngine = new CapabilityEvolutionEngine(seed + 5);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }

  async runPostProjectLearning(params: {
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
    const rng = getSeededRandom(this.seed + params.projectName.length);
    const policiesUpdated: PolicyChange[] = [];

    const score = params.judgeScore ?? params.strategy.estimatedSuccessProbability;
    const reward: RewardSignal = { totalScore: score };

    this.rewardModel.recordOutcome(params.projectName, {
      strategyId: params.projectName,
      score: reward.totalScore,
      success: params.deploySuccess,
    });

    const snapshot: ProjectSnapshot = {
      snapshotId: 'snap-' + createDeterministicUuid(this.seed, this.memory.getSnapshotCount()).slice(0, 8),
      projectName: params.projectName,
      projectDescription: params.projectDescription,
      strategy: params.strategy,
      techStack: params.techStack,
      judgeCriteria: params.judgeCriteria,
      constraints: params.constraints,
      uxResults: params.uxResults,
      deploySuccess: params.deploySuccess,
      overallScore: reward.totalScore,
      errors: params.errors,
      failurePatterns: params.failurePatterns.map((fp) => ({
        patternId: 'fp-learn-' + createDeterministicUuid(this.seed, fp.description.length).slice(0, 6),
        category: fp.category,
        description: fp.description,
        frequency: fp.frequency,
        lastOccurrence: deterministicNow(this.seed),
        suggestedFix: fp.suggestedFix,
        fixedByMutation: null,
      })),
      mutations: this.evolutionEngine.getMutations(),
      startedAt: deterministicNow(this.seed),
      completedAt: deterministicNow(this.seed + 1),
      tags: params.tags ?? [],
    };

    this.memory.addProjectSnapshot(snapshot);

    if (reward.totalScore < 0.4) {
      const deployChange = this.policyOptimizer.updatePolicy('deploy_success', params.deploySuccess ? 0.8 : 0.2);
      if (deployChange) policiesUpdated.push(deployChange);
      const rewardChange = this.policyOptimizer.updatePolicy('reward_score', reward.totalScore);
      if (rewardChange) policiesUpdated.push(rewardChange);
    }
    if (reward.totalScore > 0.7) {
      const uxChange = this.policyOptimizer.updatePolicy('ux_score', reward.totalScore);
      if (uxChange) policiesUpdated.push(uxChange);
    }

    const avgUx =
      params.uxResults.length > 0
        ? params.uxResults.reduce((s, r) => s + r.uiCompletenessScore, 0) / params.uxResults.length
        : 0;
    this.skillGraph.recordProjectOutcome(params.techStack, avgUx, params.deploySuccess, params.errors.length === 0);

    const mutations: CapabilityMutation[] = [];
    for (const fp of params.failurePatterns) {
      if (fp.frequency >= 2) {
        const fpRecord = {
          patternId: 'fp-' + createDeterministicUuid(this.seed, fp.description.length).slice(0, 6),
          category: fp.category,
          description: fp.description,
          frequency: fp.frequency,
          lastOccurrence: deterministicNow(this.seed),
          suggestedFix: fp.suggestedFix,
          fixedByMutation: null,
        };
        const mutation = this.evolutionEngine.proposeMutation(fpRecord as any);
        const sim = this.evolutionEngine.simulateMutation(mutation);
        if (sim.predictedImprovement > 0.5) {
          this.evolutionEngine.activateMutation(mutation.id);
        }
        mutations.push(mutation);
      }
    }

    const memSummary = this.memory.getMemorySummary();
    this.decisionLogger.log(
      'strategy',
      'post_project_learning',
      `Learning cycle complete for "${params.projectName}" (reward: ${reward.totalScore})`,
      reward.totalScore,
      [],
      {
        policiesUpdated: policiesUpdated.length,
        mutationsProposed: mutations.length,
        totalProjects: memSummary.totalProjects,
      },
    );

    return {
      cycleId: 'cycle-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      snapshotStored: true,
      rewardRecorded: true,
      policiesUpdated,
      skillsUpdated: params.techStack,
      mutationsProposed: mutations,
      memorySummary: { totalProjects: memSummary.totalProjects, averageScore: memSummary.averageScore },
      timestamp: deterministicNow(this.seed),
    };
  }
}

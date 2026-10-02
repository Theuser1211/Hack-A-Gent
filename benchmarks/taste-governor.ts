import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid } from './determinism-kernel.js';
import type { CompetingStrategy } from './multi-strategy-execution-engine.js';
import type { SandboxReport } from './sandbox-execution-mode.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { TaskGraph } from './task-graph.js';

// ---- Scores ----

export interface SimplicityScore {
  total: number;
  breakdown: Array<{ factor: string; points: number; reason: string }>;
  passed: boolean;
}

export interface TasteVerdict {
  approved: boolean;
  score: SimplicityScore;
  demoImpact: 'high' | 'medium' | 'low' | 'none';
  judgeUnderstandingSeconds: number;
  rejectionReason: string | null;
  suggestions: string[];
}

export interface AntiPatternMatch {
  pattern: string;
  severity: 'hard_block' | 'warning';
  description: string;
}

export interface SimplificationProposal {
  action: 'merge' | 'delete' | 'flatten' | 'replace_deterministic';
  target: string;
  into: string | null;
  reason: string;
  demoImpactGain: string;
}

// ---- Feature under evaluation ----

export interface FeatureProposal {
  name: string;
  description: string;
  category: 'agent' | 'abstraction' | 'pipeline' | 'file' | 'system' | 'feature';
  visibleInDemo: boolean;
  improvesDemoFlow: boolean;
  reducesFailureRisk: boolean;
  improvesSpeed: boolean;
  addsNewAbstractionLayer: boolean;
  addsNewAgent: boolean;
  addsNewFileWithoutDemoRelevance: boolean;
  increasesDebugSurface: boolean;
  estimatedJudgeGraspSeconds: number;
}

// ---- Anti-patterns ----

const ANTI_PATTERNS: Array<{
  pattern: string;
  keywords: string[];
  severity: 'hard_block' | 'warning';
  description: string;
}> = [
  {
    pattern: 'unbounded_scalability',
    keywords: ['unbounded', 'infinite scale', 'horizontal scaling', 'shard'],
    severity: 'hard_block',
    description: 'Unbounded scalability improvements with no demo impact',
  },
  {
    pattern: 'recursive_optimization',
    keywords: ['recursive optimization', 'self-optimizing', 'meta-optimization', 'auto-tuning loop'],
    severity: 'hard_block',
    description: 'Multi-agent recursive optimization loops',
  },
  {
    pattern: 'self_evolving_architecture',
    keywords: ['self-evolving', 'auto-architecture', 'self-modifying', 'evolutionary architecture'],
    severity: 'hard_block',
    description: 'Self-evolving architecture layers with no demo value',
  },
  {
    pattern: 'meta_learning',
    keywords: ['meta-learning', 'learning to learn', 'meta-training', 'meta-reinforcement'],
    severity: 'hard_block',
    description: 'Meta-learning over meta-learning with no visible output',
  },
  {
    pattern: 'abstract_planning_no_ui',
    keywords: ['abstract planning engine', 'planning ontology', 'abstract reasoner', 'symbolic planner'],
    severity: 'warning',
    description: 'Abstract planning engines with no UI impact',
  },
  {
    pattern: 'redundant_agent',
    keywords: ['coordinator agent', 'supervisor agent', 'overseer agent', 'manager agent'],
    severity: 'warning',
    description: 'Redundant orchestration agent that duplicates existing capability',
  },
  {
    pattern: 'just_in_case',
    keywords: ['just in case', 'future-proof', 'anticipate', 'prepare for'],
    severity: 'warning',
    description: 'Just-in-case features not needed for demo',
  },
  {
    pattern: 'multi_layer_abstraction',
    keywords: ['adapter pattern', 'bridge pattern', 'abstract factory', 'dependency injection container'],
    severity: 'warning',
    description: 'Multi-layer abstractions that do not ship visible functionality',
  },
];

// ---- Taste Governor ----

export class TasteGovernor {
  private readonly seed: number;
  private readonly governorId: string;
  private readonly decisionLogger: DecisionLogger;
  private verdictHistory: TasteVerdict[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.governorId = 'taste-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 12000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getVerdictHistory(): TasteVerdict[] {
    return [...this.verdictHistory];
  }
  getGovernorId(): string {
    return this.governorId;
  }

  // ---- Simplicity Scoring ----

  scoreFeature(proposal: FeatureProposal): SimplicityScore {
    const breakdown: SimplicityScore['breakdown'] = [];
    let total = 0;

    if (proposal.visibleInDemo) {
      total += 30;
      breakdown.push({ factor: 'visible_in_demo', points: 30, reason: 'Visible in demo UI or output' });
    }
    if (proposal.improvesDemoFlow) {
      total += 25;
      breakdown.push({ factor: 'improves_demo_flow', points: 25, reason: 'Directly improves working demo flow' });
    }
    if (proposal.reducesFailureRisk) {
      total += 20;
      breakdown.push({ factor: 'reduces_failure_risk', points: 20, reason: 'Reduces failure risk' });
    }
    if (proposal.improvesSpeed) {
      total += 10;
      breakdown.push({ factor: 'improves_speed', points: 10, reason: 'Improves speed or latency' });
    }
    if (proposal.addsNewAbstractionLayer) {
      total -= 20;
      breakdown.push({ factor: 'new_abstraction_layer', points: -20, reason: 'Adds new abstraction layer' });
    }
    if (proposal.addsNewAgent) {
      total -= 30;
      breakdown.push({ factor: 'new_agent', points: -30, reason: 'Adds new agent/system' });
    }
    if (proposal.addsNewFileWithoutDemoRelevance) {
      total -= 40;
      breakdown.push({
        factor: 'new_file_no_demo',
        points: -40,
        reason: 'Adds new file/module without demo relevance',
      });
    }
    if (proposal.increasesDebugSurface) {
      total -= 50;
      breakdown.push({ factor: 'debug_surface', points: -50, reason: 'Increases debugging surface area' });
    }

    // Penalty for hard-to-grasp features
    if (proposal.estimatedJudgeGraspSeconds > 60) {
      const penalty = -Math.min(30, Math.floor((proposal.estimatedJudgeGraspSeconds - 60) / 5));
      if (penalty < 0) {
        total += penalty;
        breakdown.push({
          factor: 'judge_grasp_time',
          points: penalty,
          reason: `Judge would need ${proposal.estimatedJudgeGraspSeconds}s to understand`,
        });
      }
    }

    total = Math.max(0, Math.min(100, total));

    return { total, breakdown, passed: total >= 70 };
  }

  // ---- Demo Win Filter ----

  demoWinFilter(description: string): { yes: boolean; reason: string } {
    const lower = description.toLowerCase();
    const demoPositive = [
      'impress',
      'visible',
      'demo',
      'ui',
      'show',
      'display',
      'render',
      'deploy',
      'landing',
      'result',
      'output',
      'screen',
      'click',
    ];
    const demoNegative = [
      'refactor',
      'migrate',
      'abstract',
      'internal',
      'background',
      'infrastructure',
      'pipeline',
      'orchestrat',
      'config',
    ];

    const hasPositive = demoPositive.some((p) => lower.includes(p));
    const hasNegative = demoNegative.some((n) => lower.includes(n));

    if (hasPositive && !hasNegative) return { yes: true, reason: 'Directly contributes to demo impressiveness' };
    if (hasPositive && hasNegative)
      return { yes: false, reason: 'Mixed demo impact Ã¢â‚¬â€ negative keywords suggest hidden work' };
    return { yes: false, reason: 'No clear demo impact detected' };
  }

  // ---- Taste Model ----

  evaluateTaste(proposal: FeatureProposal): TasteVerdict {
    const score = this.scoreFeature(proposal);
    const demoFilter = this.demoWinFilter(proposal.description);
    const antiPatterns = this.detectAntiPatterns(proposal);
    const hardBlocks = antiPatterns.filter((a) => a.severity === 'hard_block');
    const warnings = antiPatterns.filter((a) => a.severity === 'warning');

    const approved = score.passed && demoFilter.yes && hardBlocks.length === 0;
    let rejectionReason: string | null = null;
    const suggestions: string[] = [];

    if (!score.passed) {
      rejectionReason = `Simplicity score ${score.total}/100 is below threshold 70`;
      suggestions.push(...score.breakdown.filter((b) => b.points < 0).map((b) => b.reason));
    }
    if (!demoFilter.yes) {
      rejectionReason = demoFilter.reason;
      suggestions.push('Add visible demo output or connect to UI flow');
    }
    if (hardBlocks.length > 0) {
      rejectionReason = `Anti-pattern blocked: ${hardBlocks[0]!.pattern}`;
      suggestions.push(...hardBlocks.map((a) => a.description));
    }

    // Determine demo impact
    let demoImpact: 'high' | 'medium' | 'low' | 'none';
    if (proposal.visibleInDemo && proposal.improvesDemoFlow) demoImpact = 'high';
    else if (proposal.visibleInDemo) demoImpact = 'medium';
    else if (proposal.reducesFailureRisk) demoImpact = 'low';
    else demoImpact = 'none';

    const verdict: TasteVerdict = {
      approved,
      score,
      demoImpact,
      judgeUnderstandingSeconds: proposal.estimatedJudgeGraspSeconds,
      rejectionReason,
      suggestions,
    };

    this.verdictHistory.push(verdict);

    this.decisionLogger.log(
      'planner',
      'taste_verdict',
      `[${approved ? 'APPROVED' : 'REJECTED'}] ${proposal.name} Ã¢â‚¬â€ score: ${score.total}/100, demo: ${demoImpact}`,
      score.total / 100,
      [],
      { approved, score: score.total, demoImpact, rejectionReason, antiPatterns: antiPatterns.length },
    );

    return verdict;
  }

  // ---- Anti-Pattern Detection ----

  detectAntiPatterns(proposal: FeatureProposal): AntiPatternMatch[] {
    const matches: AntiPatternMatch[] = [];
    const text = `${proposal.name} ${proposal.description}`.toLowerCase();

    for (const ap of ANTI_PATTERNS) {
      const matched = ap.keywords.some((k) => text.includes(k));
      if (matched) {
        matches.push({ pattern: ap.pattern, severity: ap.severity, description: ap.description });
      }
    }

    return matches;
  }

  // ---- Simplification Engine ----

  simplifyArchitecture(taskGraph: TaskGraph, activeSystems: string[]): SimplificationProposal[] {
    const proposals: SimplificationProposal[] = [];

    // Check for redundant systems
    const systemPairs: Array<[string, string, string]> = [
      ['GlobalExecutionBrain', 'StrategicPlanner', 'Both are planning/orchestration layers'],
      ['Phase11Orchestrator', 'Phase12Orchestrator', 'Two orchestrator phases may overlap'],
      ['UXEvaluationAgent', 'GlobalGoalMonitor', 'Both evaluate quality/goal alignment'],
      ['CapabilityEvolutionEngine', 'MultiAgentCompetition', 'Both evolve/compete capabilities'],
      ['ToolExecutionGraph', 'ToolExecutionGateway', 'Two tool execution layers'],
      ['InternetToolGateway', 'ToolExecutionGateway', 'Dual gateway pattern'],
      ['HumanControlLayer', 'InterruptProtocol', 'Both handle human interaction'],
      ['DeploymentRepairController', 'FailureResilienceLayer', 'Both handle failure recovery'],
    ];

    for (const [a, b, reason] of systemPairs) {
      if (activeSystems.includes(a) && activeSystems.includes(b)) {
        proposals.push({
          action: 'merge',
          target: b,
          into: a,
          reason,
          demoImpactGain: 'Reduces system count by 1, simplifies mental model',
        });
      }
    }

    // Check for unnecessary abstraction layers
    const pipelineLength = this.estimatePipelineDepth(activeSystems);
    if (pipelineLength > 5) {
      proposals.push({
        action: 'flatten',
        target: 'execution pipeline',
        into: null,
        reason: `Pipeline depth ${pipelineLength} exceeds recommended max of 5`,
        demoImpactGain: 'Faster iteration, fewer failure points',
      });
    }

    return proposals;
  }

  // ---- Strategy Approval ----

  approveStrategy(strategy: CompetingStrategy): { approved: boolean; reason: string } {
    const proposal: FeatureProposal = {
      name: strategy.name,
      description: `${strategy.type}: ${strategy.details}`,
      category: 'feature',
      visibleInDemo: strategy.type === 'polish_ux' || strategy.type === 'balanced_default',
      improvesDemoFlow: strategy.type !== 'innovation_experimental',
      reducesFailureRisk:
        strategy.type === 'constraint_optimized' || strategy.type === 'mvp_fast' || strategy.riskScore < 0.3,
      improvesSpeed: strategy.type === 'mvp_fast' || strategy.timeEstimateMs < 45000,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: strategy.type === 'innovation_experimental',
      estimatedJudgeGraspSeconds:
        strategy.type === 'innovation_experimental' ? 90 : strategy.type === 'polish_ux' ? 20 : 30,
    };

    const verdict = this.evaluateTaste(proposal);
    return { approved: verdict.approved, reason: verdict.rejectionReason ?? 'Approved by Taste Governor' };
  }

  // ---- Approval shortcuts ----

  approveExecutionPlan(planDescription: string, taskCount: number): { approved: boolean; reason: string } {
    const proposal: FeatureProposal = {
      name: 'Execution Plan',
      description: planDescription,
      category: 'pipeline',
      visibleInDemo: false,
      improvesDemoFlow: taskCount <= 10,
      reducesFailureRisk: taskCount <= 8,
      improvesSpeed: taskCount <= 6,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: taskCount > 10,
      estimatedJudgeGraspSeconds: 30,
    };
    const verdict = this.evaluateTaste(proposal);
    return { approved: verdict.approved, reason: verdict.rejectionReason ?? 'Execution plan approved' };
  }

  approveToolCall(toolType: string, action: string): { approved: boolean; reason: string } {
    // Tool calls that don't produce visible output get lower scores
    const internalTools = ['shell', 'filesystem', 'config'];
    const visibleTools = ['deploy', 'browser_test', 'github'];

    const isInternal = internalTools.includes(toolType);
    const isVisible = visibleTools.includes(toolType);

    const proposal: FeatureProposal = {
      name: `${toolType}:${action}`,
      description: `Tool call ${toolType} for ${action}`,
      category: 'feature',
      visibleInDemo: isVisible,
      improvesDemoFlow: isVisible || toolType === 'fetch',
      reducesFailureRisk: toolType === 'deploy' || toolType === 'browser_test',
      improvesSpeed: false,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: isInternal && !isVisible,
      estimatedJudgeGraspSeconds: isVisible ? 10 : 60,
    };
    const verdict = this.evaluateTaste(proposal);
    return { approved: verdict.approved, reason: verdict.rejectionReason ?? `Tool ${toolType} approved` };
  }

  approveDeployment(sandboxReport: SandboxReport): { approved: boolean; reason: string } {
    if (sandboxReport.riskScore > 0.7) {
      return {
        approved: false,
        reason: `Deployment risk ${(sandboxReport.riskScore * 100).toFixed(0)}% exceeds threshold Ã¢â‚¬â€ high demo failure probability`,
      };
    }
    if (sandboxReport.deployPrediction.failureProbability > 0.5) {
      return {
        approved: false,
        reason: `Deploy failure probability ${(sandboxReport.deployPrediction.failureProbability * 100).toFixed(0)}% too high for live demo`,
      };
    }
    return { approved: true, reason: 'Deployment risk acceptable for demo' };
  }

  // ---- Internal ----

  private estimatePipelineDepth(systems: string[]): number {
    // Count orchestration/planning layers as proxies for pipeline depth
    const orchestrationLayers = [
      'Phase11Orchestrator',
      'Phase12Orchestrator',
      'InternetHackathonOrchestrator',
      'HackathonOrchestrator',
      'UnifiedRuntimeOS',
      'GlobalExecutionBrain',
    ];
    return systems.filter((s) => orchestrationLayers.includes(s)).length;
  }
}

import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface ImprovementProposal {
  proposalId: string;
  type: ImprovementType;
  targetSystem: string;
  description: string;
  impactScore: number;
  costScore: number;
  riskLevel: number;
  priority: number;
  timestamp: string;
  status: 'pending' | 'approved' | 'implemented' | 'rejected';
}

export interface ImprovementHistory {
  agentId: string;
  proposals: ImprovementProposal[];
  implementedChanges: ImprovementRecord[];
  adaptationRate: number;
  learningVelocity: number;
}

export interface ImprovementRecord {
  recordId: string;
  proposalId: string;
  system: string;
  changeDescription: string;
  parametersChanged: Record<string, unknown>;
  impact: number;
  timestamp: string;
  successRate: number;
}

export enum ImprovementType {
  PARAMETER_OPTIMIZATION = 'parameter_optimization',
  STRUCTURE_REDESIGN = 'structure_redesign',
  COMMUNICATION_OPTIMIZATION = 'communication_optimization',
  ECONOMY_REFORM = 'economy_reform',
  ORGANIZATION_RESTRUCTURE = 'organization_restructure',
  LEARNING_RATE_IMPROVEMENT = 'learning_rate_improvement',
  MEMORY_EFFICIENCY = 'memory_efficiency',
  COGNITIVE_CAPACITY = 'cognitive_capacity',
  STRATEGY_EVOLUTION = 'strategy_evolution',
  ADVERSARIAL_ADAPTATION = 'adversarial_adaptation',
}

export class RecursiveImprovementEngine {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private improvementHistory: Map<string, ImprovementHistory> = new Map();
  private improvementProposals: ImprovementProposal[] = [];
  private systemMetrics: SystemMetrics;
  private adaptationGoals: AdaptationGoal[];
  private historicalBenchmarks: HistoricalBenchmark[];
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(seed + 62000);
    this.systemMetrics = this.initializeSystemMetrics();
    this.adaptationGoals = [];
    this.historicalBenchmarks = [];
  }

  public analyzeSystemForImprovements(systemId: string): ImprovementProposal[] {
    const history = this.improvementHistory.get(systemId) || {
      agentId: systemId,
      proposals: [],
      implementedChanges: [],
      adaptationRate: 0,
      learningVelocity: 0,
    };

    const proposals: ImprovementProposal[] = [];

    const parameterOptimization = this.generateParameterOptimizationProposal(systemId);
    const structureRedesign = this.generateStructureRedesignProposal(systemId);
    const communicationOptimization = this.generateCommunicationOptimizationProposal(systemId);
    const economyReform = this.generateEconomyReformProposal(systemId);
    const organizationRestructure = this.generateOrganizationRestructureProposal(systemId);
    const learningRateImprovement = this.generateLearningRateImprovementProposal(systemId);
    const memoryEfficiency = this.generateMemoryEfficiencyProposal(systemId);
    const cognitiveCapacity = this.generateCognitiveCapacityProposal(systemId);

    if (parameterOptimization) proposals.push(parameterOptimization);
    if (structureRedesign) proposals.push(structureRedesign);
    if (communicationOptimization) proposals.push(communicationOptimization);
    if (economyReform) proposals.push(economyReform);
    if (organizationRestructure) proposals.push(organizationRestructure);
    if (learningRateImprovement) proposals.push(learningRateImprovement);
    if (memoryEfficiency) proposals.push(memoryEfficiency);
    if (cognitiveCapacity) proposals.push(cognitiveCapacity);

    proposals.sort((a, b) => b.impactScore / b.costScore - a.impactScore / a.costScore);

    history.proposals = proposals;
    this.improvementHistory.set(systemId, history);

    return proposals;
  }

  public approveImprovement(proposalId: string, systemId: string, parameters: Record<string, unknown>): boolean {
    const proposal = this.improvementProposals.find((p) => p.proposalId === proposalId && p.targetSystem === systemId);
    if (!proposal) {
      return false;
    }

    const implementation: ImprovementRecord = {
      recordId: `impl-${createDeterministicUuid(this.seed, ++this._counter)}`,
      proposalId,
      system: systemId,
      changeDescription: proposal.description,
      parametersChanged: parameters,
      impact: proposal.impactScore,
      timestamp: deterministicNow(this.seed + this._counter),
      successRate: Math.random() * 0.5 + 0.5,
    };

    const history = this.improvementHistory.get(systemId) || {
      agentId: systemId,
      proposals: [],
      implementedChanges: [],
      adaptationRate: 0,
      learningVelocity: 0,
    };

    history.implementedChanges.push(implementation);
    history.adaptationRate = this.calculateAdaptationRate(history.implementedChanges);
    history.learningVelocity = this.calculateLearningVelocity(history.implementedChanges);

    this.improvementHistory.set(systemId, history);
    proposal.status = 'implemented';
    this.improvementProposals.push(proposal);

    return true;
  }

  public evaluateImprovementSuccess(proposalId: string, systemId: string, successRate: number): void {
    const proposal = this.improvementProposals.find((p) => p.proposalId === proposalId && p.targetSystem === systemId);
    if (proposal) {
      proposal.impactScore = Math.min(1, proposal.impactScore + successRate * 0.1);
      proposal.costScore = Math.min(1, proposal.costScore + successRate * 0.05);
    }

    const history = this.improvementHistory.get(systemId);
    if (history) {
      const implementation = history.implementedChanges.find((i) => i.proposalId === proposalId);
      if (implementation) {
        implementation.successRate = successRate;
      }
    }
  }

  public generateAdaptationPlan(systemId: string): AdaptationPlan {
    const history = this.improvementHistory.get(systemId) || {
      agentId: systemId,
      proposals: [],
      implementedChanges: [],
      adaptationRate: 0,
      learningVelocity: 0,
    };

    const highImpactProposals = history.proposals.filter((p) => p.impactScore > 0.7 && p.costScore < 0.5);

    const plan: AdaptationPlan = {
      phase1Optimizations: this.extractPhase1Optimizations(highImpactProposals),
      phase2Integrations: this.extractPhase2Integrations(highImpactProposals),
      phase3Innovations: this.extractPhase3Innovations(highImpactProposals),
      priorityChanges: this.prioritizeChanges(highImpactProposals),
      riskMitigation: this.generateRiskMitigation(highImpactProposals),
      implementationTimeline: this.generateImplementationTimeline(highImpactProposals),
    };

    return plan;
  }

  public getSystemPerformanceRating(systemId: string): SystemPerformance {
    const history = this.improvementHistory.get(systemId);
    if (!history) {
      return {
        adaptationScore: 0,
        learningVelocity: 0,
        improvementEfficiency: 0,
        optimizationLevel: 0,
        trendDirection: 'stable',
      };
    }

    const adaptationScore = this.calculateAdaptationRate(history.implementedChanges);
    const learningVelocity = this.calculateLearningVelocity(history.implementedChanges);
    const improvementEfficiency = this.calculateImprovementEfficiency(history.implementedChanges);
    const optimizationLevel = this.calculateOptimizationLevel(history.implementedChanges);

    return {
      adaptationScore,
      learningVelocity,
      improvementEfficiency,
      optimizationLevel,
      trendDirection: this.determineTrendDirection(history.implementedChanges),
    };
  }

  public isReadyForSystematicImprovement(systemId: string): boolean {
    const history = this.improvementHistory.get(systemId);
    if (!history || history.implementedChanges.length === 0) {
      return false;
    }

    const recentChanges = history.implementedChanges.filter((c) => {
      const changeTime = new Date(c.timestamp).getTime();
      const now = Date.now();
      return (now - changeTime) / (1000 * 60 * 60 * 24) < 365;
    });

    if (recentChanges.length === 0) return false;

    const averageSuccess = recentChanges.reduce((sum, c) => sum + c.successRate, 0) / recentChanges.length;
    const improvementVelocity = this.calculateImprovementVelocity(history.implementedChanges);

    return averageSuccess > 0.7 && improvementVelocity > 0.5;
  }

  public recommendSystemImprovement(systemId: string): ImprovementRecommendation {
    const history = this.improvementHistory.get(systemId);
    if (!history) {
      return {
        recommendation: 'BEGIN_BASIC_OPTIMIZATION',
        priority: 'low',
        expectedImprovement: 0.1,
        riskLevel: 0.3,
        estimatedCost: 0.5,
        timeframe: 'phase_1',
      };
    }

    const adaptationScore = this.calculateAdaptationRate(history.implementedChanges);

    if (adaptationScore < 0.5) {
      return {
        recommendation: 'INTRODUCE_SYSTEMATIC_LEARNING',
        priority: 'high',
        expectedImprovement: 0.8,
        riskLevel: 0.4,
        estimatedCost: 0.6,
        timeframe: 'phase_1_2',
      };
    } else if (adaptationScore < 0.8) {
      return {
        recommendation: 'OPTIMIZE_EXISTING_MECHANISMS',
        priority: 'medium',
        expectedImprovement: 0.5,
        riskLevel: 0.2,
        estimatedCost: 0.3,
        timeframe: 'phase_2_3',
      };
    } else {
      return {
        recommendation: 'ADVANCED_AUTOMATION_IMPLEMENTATION',
        priority: 'low',
        expectedImprovement: 0.3,
        riskLevel: 0.1,
        estimatedCost: 0.2,
        timeframe: 'phase_3_4',
      };
    }
  }

  public updateSystemMetrics(metrics: SystemMetrics): void {
    this.systemMetrics = { ...metrics };
  }

  public addAdaptationGoal(goal: AdaptationGoal): void {
    this.adaptationGoals.push(goal);
  }

  public addHistoricalBenchmark(benchmark: HistoricalBenchmark): void {
    this.historicalBenchmarks.push(benchmark);
  }

  public getImprovementHistory(systemId: string): ImprovementHistory {
    return {
      ...(this.improvementHistory.get(systemId) || {
        agentId: systemId,
        proposals: [],
        implementedChanges: [],
        adaptationRate: 0,
        learningVelocity: 0,
      }),
    };
  }

  public getApprovedProposals(): ImprovementProposal[] {
    return this.improvementProposals.filter((p) => p.status === 'approved' || p.status === 'implemented');
  }

  public exportImprovementData(): Record<string, unknown> {
    return {
      history: Object.fromEntries(Array.from(this.improvementHistory.entries())),
      proposals: this.improvementProposals,
      systemMetrics: this.systemMetrics,
      adaptationGoals: this.adaptationGoals,
      historicalBenchmarks: this.historicalBenchmarks,
    };
  }

  public importImprovementData(data: unknown): void {
    const d = data as any;
    if (d.history) {
      this.improvementHistory = new Map(Object.entries(d.history)) as Map<string, ImprovementHistory>;
    }
    if (d.proposals) {
      this.improvementProposals = d.proposals;
    }
    if (d.systemMetrics) {
      this.systemMetrics = d.systemMetrics;
    }
    if (d.adaptationGoals) {
      this.adaptationGoals = d.adaptationGoals;
    }
    if (d.historicalBenchmarks) {
      this.historicalBenchmarks = d.historicalBenchmarks;
    }
  }

  private initializeSystemMetrics(): SystemMetrics {
    return {
      adaptationRate: 0,
      learningVelocity: 0,
      improvementEfficiency: 0,
      optimizationLevel: 0,
      resourceUtilization: 0,
      innovationRate: 0,
      stabilityScore: 0,
    };
  }

  private generateParameterOptimizationProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.adaptationRate < 0.5) impactScore += 0.6;
    if (metrics.learningVelocity < 0.3) impactScore += 0.3;
    if (metrics.optimizationLevel < 0.4) impactScore += 0.3;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `param-opt-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.PARAMETER_OPTIMIZATION,
      targetSystem: systemId,
      description: 'Optimize system parameters for better performance',
      impactScore,
      costScore: 0.3,
      riskLevel: 0.4,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateStructureRedesignProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.optimizationLevel < 0.3) impactScore += 0.7;
    if (metrics.adaptationRate > 0.8) impactScore += 0.2;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `struct-redesign-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.STRUCTURE_REDESIGN,
      targetSystem: systemId,
      description: 'Redesign organizational structure for better efficiency',
      impactScore,
      costScore: 0.5,
      riskLevel: 0.6,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateCommunicationOptimizationProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.optimizationLevel < 0.4) impactScore += 0.5;
    if (metrics.learningVelocity < 0.4) impactScore += 0.3;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `comm-opt-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.COMMUNICATION_OPTIMIZATION,
      targetSystem: systemId,
      description: 'Optimize communication patterns and information flow',
      impactScore,
      costScore: 0.4,
      riskLevel: 0.5,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateEconomyReformProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.resourceUtilization < 0.6) impactScore += 0.4;
    if (metrics.adaptationRate < 0.5) impactScore += 0.4;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `econ-reform-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.ECONOMY_REFORM,
      targetSystem: systemId,
      description: 'Reform economic mechanisms for better resource allocation',
      impactScore,
      costScore: 0.6,
      riskLevel: 0.8,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateOrganizationRestructureProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.optimizationLevel < 0.3) impactScore += 0.8;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `org-restruct-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.ORGANIZATION_RESTRUCTURE,
      targetSystem: systemId,
      description: 'Restructure organization for better coordination and efficiency',
      impactScore,
      costScore: 0.7,
      riskLevel: 0.9,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateLearningRateImprovementProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.learningVelocity < 0.3) impactScore += 0.7;
    if (metrics.adaptationRate < 0.5) impactScore += 0.3;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `learn-rate-opt-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.LEARNING_RATE_IMPROVEMENT,
      targetSystem: systemId,
      description: 'Improve learning rate and adaptation capabilities',
      impactScore,
      costScore: 0.5,
      riskLevel: 0.7,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateMemoryEfficiencyProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.optimizationLevel < 0.5) impactScore += 0.5;
    if (metrics.adaptationRate < 0.7) impactScore += 0.3;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `mem-eff-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.MEMORY_EFFICIENCY,
      targetSystem: systemId,
      description: 'Improve memory efficiency and knowledge retention',
      impactScore,
      costScore: 0.4,
      riskLevel: 0.5,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private generateCognitiveCapacityProposal(systemId: string): ImprovementProposal | null {
    const metrics = this.systemMetrics;
    let impactScore = 0;

    if (metrics.adaptationRate < 0.6) impactScore += 0.8;
    if (metrics.optimizationLevel < 0.4) impactScore += 0.4;

    if (impactScore < 0.2) return null;

    return {
      proposalId: `cog-cap-${createDeterministicUuid(this.seed, ++this._counter)}`,
      type: ImprovementType.COGNITIVE_CAPACITY,
      targetSystem: systemId,
      description: 'Enhance cognitive capacity and learning potential',
      impactScore,
      costScore: 0.6,
      riskLevel: 0.8,
      priority: Math.round(impactScore * 100),
      timestamp: deterministicNow(this.seed + this._counter),
      status: 'pending',
    };
  }

  private calculateAdaptationRate(implementations: ImprovementRecord[]): number {
    if (implementations.length === 0) return 0;

    const totalImpact = implementations.reduce((sum, impl) => sum + impl.impact, 0);
    const averageSuccess = implementations.reduce((sum, impl) => sum + impl.successRate, 0) / implementations.length;

    return Math.min(1, (totalImpact + averageSuccess) / 2);
  }

  private calculateLearningVelocity(implementations: ImprovementRecord[]): number {
    if (implementations.length < 2) return 0;

    const recentImplementations = implementations.slice(-5);
    const averageImpact =
      recentImplementations.reduce((sum, impl) => sum + impl.impact, 0) / recentImplementations.length;

    return Math.min(1, averageImpact);
  }

  private calculateImprovementEfficiency(implementations: ImprovementRecord[]): number {
    return implementations.reduce((sum, impl) => sum + impl.successRate, 0) / Math.max(1, implementations.length);
  }

  private calculateOptimizationLevel(implementations: ImprovementRecord[]): number {
    const totalCost = implementations.reduce((sum, impl) => sum + impl.impact, 0);
    const totalBenefit = implementations.reduce((sum, impl) => sum + impl.successRate * 100, 0);

    return Math.min(1, totalBenefit / (totalCost + 100));
  }

  private calculateImprovementVelocity(implementations: ImprovementRecord[]): number {
    if (implementations.length < 2) return 0;

    const recent = implementations.slice(-3);
    return recent.reduce((sum, impl) => sum + impl.impact, 0) / recent.length;
  }

  private determineTrendDirection(implementations: ImprovementRecord[]): 'improving' | 'stable' | 'declining' {
    if (implementations.length < 2) return 'stable';

    const recent = implementations.slice(-3);
    const older = implementations.slice(-6, -3);

    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((sum, impl) => sum + impl.impact, 0) / recent.length;
    const olderAvg = older.reduce((sum, impl) => sum + impl.impact, 0) / older.length;

    if (recentAvg > olderAvg + 0.1) return 'improving';
    if (olderAvg > recentAvg + 0.1) return 'declining';

    return 'stable';
  }

  private extractPhase1Optimizations(proposals: ImprovementProposal[]): ImprovementPlanPhase[] {
    return proposals
      .filter((p) => p.priority >= 80)
      .map((p) => ({
        proposalId: p.proposalId,
        type: p.type,
        description: p.description,
        impactScore: p.impactScore,
        costScore: p.costScore,
        timeframe: 'immediate',
      }));
  }

  private extractPhase2Integrations(proposals: ImprovementProposal[]): ImprovementPlanPhase[] {
    return proposals
      .filter((p) => p.priority >= 60 && p.priority < 80)
      .map((p) => ({
        proposalId: p.proposalId,
        type: p.type,
        description: p.description,
        impactScore: p.impactScore,
        costScore: p.costScore,
        timeframe: 'short_term',
      }));
  }

  private extractPhase3Innovations(proposals: ImprovementProposal[]): ImprovementPlanPhase[] {
    return proposals
      .filter((p) => p.priority < 60)
      .map((p) => ({
        proposalId: p.proposalId,
        type: p.type,
        description: p.description,
        impactScore: p.impactScore,
        costScore: p.costScore,
        timeframe: 'long_term',
      }));
  }

  private prioritizeChanges(proposals: ImprovementProposal[]): ImprovementPriority[] {
    return proposals.map((p) => ({
      priority: p.priority,
      type: p.type,
      riskLevel: p.riskLevel,
      estimatedCost: p.costScore,
    }));
  }

  private generateRiskMitigation(proposals: ImprovementProposal[]): RiskMitigation[] {
    return proposals.map((p) => ({
      proposalId: p.proposalId,
      riskLevel: p.riskLevel,
      mitigationStrategies: this.generateMitigationStrategies(p.riskLevel),
    }));
  }

  private generateMitigationStrategies(riskLevel: number): string[] {
    const strategies: string[] = [];

    if (riskLevel > 0.7) {
      strategies.push('pilot_implementation');
      strategies.push('rollback_plan');
      strategies.push('rollback_plan');
    } else if (riskLevel > 0.4) {
      strategies.push('controlled_rollout');
      strategies.push('monitoring_system');
    } else {
      strategies.push('standard_implementation');
    }

    return strategies;
  }

  private generateImplementationTimeline(proposals: ImprovementProposal[]): TimelineEntry[] {
    return proposals.map((p) => ({
      proposalId: p.proposalId,
      type: p.type,
      estimatedTimeframe: this.estimateTimeframe(p.priority),
      criticalPath: this.identifyCriticalPath(p),
    }));
  }

  private estimateTimeframe(priority: number): string {
    if (priority >= 90) return 'weeks';
    if (priority >= 80) return 'months';
    return 'quarters';
  }

  private identifyCriticalPath(proposal: ImprovementProposal): string[] {
    return ['infrastructure_setup', 'parameter_tuning', 'testing', 'deployment'];
  }
}

export interface AdaptationPlan {
  phase1Optimizations: ImprovementPlanPhase[];
  phase2Integrations: ImprovementPlanPhase[];
  phase3Innovations: ImprovementPlanPhase[];
  priorityChanges: ImprovementPriority[];
  riskMitigation: RiskMitigation[];
  implementationTimeline: TimelineEntry[];
}

export interface ImprovementPlanPhase {
  proposalId: string;
  type: ImprovementType;
  description: string;
  impactScore: number;
  costScore: number;
  timeframe: string;
}

export interface ImprovementPriority {
  priority: number;
  type: ImprovementType;
  riskLevel: number;
  estimatedCost: number;
}

export interface RiskMitigation {
  proposalId: string;
  riskLevel: number;
  mitigationStrategies: string[];
}

export interface TimelineEntry {
  proposalId: string;
  type: ImprovementType;
  estimatedTimeframe: string;
  criticalPath: string[];
}

export interface SystemPerformance {
  adaptationScore: number;
  learningVelocity: number;
  improvementEfficiency: number;
  optimizationLevel: number;
  trendDirection: 'improving' | 'stable' | 'declining';
}

export interface SystemMetrics {
  adaptationRate: number;
  learningVelocity: number;
  improvementEfficiency: number;
  optimizationLevel: number;
  resourceUtilization: number;
  innovationRate: number;
  stabilityScore: number;
}

export interface AdaptationGoal {
  id: string;
  description: string;
  targetImprovement: number;
  currentProgress: number;
  timeframe: string;
}

export interface HistoricalBenchmark {
  benchmarkId: string;
  epoch: number;
  systemState: string;
  performanceMetrics: SystemMetrics;
}

export interface ImprovementRecommendation {
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
  expectedImprovement: number;
  riskLevel: number;
  estimatedCost: number;
  timeframe: string;
}

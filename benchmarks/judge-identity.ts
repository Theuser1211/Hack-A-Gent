import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';

export interface EvaluationData {
  companyId: string;
  technicalDepth?: number;
  architectureQuality?: number;
  performanceMetrics?: number;
  securityScore?: number;
  userExperience?: number;
  accessibility?: number;
  designQuality?: number;
  interactionQuality?: number;
  novelty?: number;
  researchImpact?: number;
  innovationPotential?: number;
  creativity?: number;
  businessValue?: number;
  marketImpact?: number;
  implementationQuality?: number;
  utilitiescore?: number;
  riskiness?: number;
  explorationScore?: number;
  analyticalDepth?: number;
}

export interface EvaluationContext {
  [key: string]: unknown;
}

export interface ScoreBreakdown {
  innovationScore: number;
  functionalityScore: number;
  uxScore: number;
  technicalScore: number;
  businessScore: number;
  researchImpactScore?: number;
  marketscore?: number;
  implementationScore?: number;
}

export interface JudgeEvaluation {
  evaluationId: string;
  judgeId: string;
  companyId: string;
  score: number;
  breakdown: ScoreBreakdown;
  confidence: number;
  fatigueMultiplier: number;
  calibrationMultiplier: number;
  timestamp: string;
  memoryInfluencedFactors: string[];
}

export interface MetaJudgeEvaluation {
  score: number;
  biasVector: Record<string, number>;
  calibration: Record<string, number>;
}

export interface JudgeIdentity {
  id: string;
  seed: number;
  name: string;
  specialization: JudgeSpecialization;
  personality: JudgePersonality;
  calibration: JudgeCalibration;
  confidence: number;
  strictness: number;
  consistency: number;
  creativityPreference: number;
  innovationBias: number;
  engineeringBias: number;
  speedBias: number;
  riskTolerance: number;
  reputation: number;
  experience: number;
  lifetimeEvaluations: number;
  accuracyScore: number;
  auditScore: number;
  retirementScore: number;
  memory: JudgeMemory;
  specializationTraits: SpecializationTraits;
  biasVector: BiasVector;
  lastUpdateTimestamp: string;
}

export interface JudgeMemory {
  evaluatedCompanies: string[];
  strategyOutcomes: Map<string, StrategyOutcome>;
  failures: FailureRecord[];
  innovationPatterns: InnovationPattern[];
  fraudAttempts: FraudAttempt[];
  hallucinationPatterns: HallucinationPattern[];
  exploitAttempts: ExploitAttempt[];
  rewardHistory: RewardHistoryRecord[];
  confidenceHistory: ConfidenceHistoryRecord[];
  lastCompetitorMemoryRefresh: string;
}

export interface StrategyOutcome {
  strategyType: string;
  strategyName: string;
  score: number;
  companyId: string;
  timestamp: string;
  expectedVsActual: number;
}

export interface FailureRecord {
  companyId: string;
  failureType:
    | 'score_too_high'
    | 'score_too_low'
    | 'missed_innovation'
    | 'over_technical'
    | 'too_complex'
    | 'hallucination'
    | 'exploit_attempted';
  magnitude: number;
  detectedAt: string;
  correctedAt?: string;
  severity: number;
}

export interface InnovationPattern {
  patternId: string;
  pattern: string;
  frequency: number;
  companyId: string;
  successRate: number;
  lastObserved: string;
}

export interface FraudAttempt {
  companyId: string;
  fraudType: 'false_metrics' | 'false_achievements' | 'false_history' | 'fake_demo' | 'stolen_code' | 'plagiarism';
  detected: boolean;
  severity: number;
  timestamp: string;
  handlerId?: string;
}

export interface HallucinationPattern {
  hallucinationId: string;
  hallucinationContent: string;
  frequency: number;
  companiesAffected: string[];
  impactScore: number;
  lastHappened: string;
}

export interface ExploitAttempt {
  companyId: string;
  exploitType: 'judging_bias' | 'system_manipulation' | 'data_corruption' | 'social_engineering';
  success: boolean;
  timestamp: string;
  response?: string;
}

export interface RewardHistoryRecord {
  companyId: string;
  score: number;
  rewardType: 'bonus' | 'penalty' | 'neutral';
  timestamp: string;
}

export interface ConfidenceHistoryRecord {
  evaluationId: string;
  confidenceLevel: number;
  accuracy: number;
  timestamp: string;
}

export enum JudgeSpecialization {
  ENGINEERING = 'engineering',
  UX = 'ux',
  RESEARCH = 'research',
  BUSINESS = 'business',
  ARCHITECTURE = 'architecture',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  INNOVATION = 'innovation',
  EXECUTION = 'execution',
  GENERAL = 'general',
}

export interface JudgePersonality {
  riskTaking: number;
  exploration: number;
  analyticalDepth: number;
  socialAwareness: number;
  patternRecognition: number;
}

export interface JudgeCalibration {
  systematicBias: Record<string, number>;
  calibrationAccuracy: number;
  consistencyScore: number;
  varianceScore: number;
  precisionScore: number;
  lastCalibrationTimestamp: string;
  comparisonJudges: string[];
}

export interface SpecializationTraits {
  [JudgeSpecialization.ENGINEERING]: EngineeringTraits;
  [JudgeSpecialization.UX]: UxTraits;
  [JudgeSpecialization.RESEARCH]: ResearchTraits;
  [JudgeSpecialization.BUSINESS]: BusinessTraits;
  [JudgeSpecialization.ARCHITECTURE]: ArchitectureTraits;
  [JudgeSpecialization.PERFORMANCE]: PerformanceTraits;
  [JudgeSpecialization.SECURITY]: SecurityTraits;
  [JudgeSpecialization.INNOVATION]: InnovationTraits;
  [JudgeSpecialization.EXECUTION]: ExecutionTraits;
  [JudgeSpecialization.GENERAL]: GeneralTraits;
}

export interface BaseTraits {
  scoreWeight: number;
  focusArea: string;
  riskThreshold: number;
  rewardSensitivity: number;
  penaltySensitivity: number;
}

export interface EngineeringTraits extends BaseTraits {
  technicalDepthFocus: number;
  architectureEmphasis: number;
  performanceBenchmark: number;
  scalabilityWeight: number;
}

export interface UxTraits extends BaseTraits {
  userExperienceFocus: number;
  accessibilityEmphasis: number;
  visualDesignWeight: number;
  interactionFlowImportance: number;
}

export interface ResearchTraits extends BaseTraits {
  noveltyEmphasis: number;
  academicRigourWeight: number;
  researchImpactFocus: number;
  innovationPotentialImportance: number;
}

export interface BusinessTraits extends BaseTraits {
  businessValueFocus: number;
  marketImpactWeight: number;
  profitabilityEmphasis: number;
  scalabilityImportance: number;
}

export interface ArchitectureTraits extends BaseTraits {
  systemDesignFocus: number;
  patternRecognitionWeight: number;
  modularityEmphasis: number;
  maintainabilityImportance: number;
}

export interface PerformanceTraits extends BaseTraits {
  speedFocus: number;
  efficiencyWeight: number;
  resourceUsageEmphasis: number;
  performanceMetricsImportance: number;
}

export interface SecurityTraits extends BaseTraits {
  vulnerabilityFocus: number;
  threatAnalysisWeight: number;
  complianceEmphasis: number;
  riskManagementImportance: number;
}

export interface InnovationTraits extends BaseTraits {
  creativityFocus: number;
  novelSolutionsWeight: number;
  disruptionEmphasis: number;
  experimentationImportance: number;
}

export interface ExecutionTraits extends BaseTraits {
  deliveryFocus: number;
  reliabilityWeight: number;
  timelineEmphasis: number;
  implementationImportance: number;
}

export interface GeneralTraits extends BaseTraits {
  balanceScore: number;
  versatilityWeight: number;
  adaptabilityEmphasis: number;
  wellRoundednessImportance: number;
}

export interface BiasVector {
  leniencyBias: number;
  harshnessBias: number;
  noveltyBias: number;
  technicalBias: number;
  complexityBias: number;
  riskBias: number;
  innovationBias: number;
  businessBias: number;
}

export interface JudgeBuilder {
  name: string;
  specialization: JudgeSpecialization;
  personality?: Partial<JudgePersonality>;
  baseCalibrationAccuracy?: number;
  baseConsistencyScore?: number;
  baseStrictness?: number;
  baseCreativityPreference?: number;
  baseInnovationBias?: number;
  baseEngineeringBias?: number;
  baseSpeedBias?: number;
  baseRiskTolerance?: number;
  baseReputation?: number;
  baseExperience?: number;
  biasIncrements?: Partial<Record<keyof BiasVector, number>>;
}

export class Judge {
  private readonly seed: number;
  private readonly rng: RNG;
  private identity: JudgeIdentity;
  private _counter = 0;

  constructor(identity: JudgeIdentity) {
    this.identity = identity;
    this.seed = identity.seed;
    this.rng = getSeededRandom(identity.seed);
  }

  evaluateCompany(companyId: string, evaluationData: EvaluationData, context: EvaluationContext): JudgeEvaluation {
    const evaluationId = `eval-${createDeterministicUuid(this.identity.seed, ++this._counter)}`;

    this.identity.memory.evaluatedCompanies.push(companyId);

    const baseScore = this.calculateBaseScore(evaluationData, context);
    const calibratedScore = this.applyCalibration(baseScore, evaluationData, context);
    const fatigueAdjustedScore = this.applyFatigueAdjustment(calibratedScore);
    const finalScore = Math.max(0, Math.min(100, Math.round(fatigueAdjustedScore * 100) / 100));

    const evaluation: JudgeEvaluation = {
      evaluationId,
      judgeId: this.identity.id,
      companyId,
      score: finalScore,
      breakdown: this.generateScoreBreakdown(evaluationData, context),
      confidence: this.calculateConfidence(evaluationData, context, finalScore),
      fatigueMultiplier: this.getCurrentFatigueMultiplier(),
      calibrationMultiplier: this.identity.calibration.calibrationAccuracy,
      timestamp: deterministicNow(this.identity.seed + this._counter),
      memoryInfluencedFactors: this.identifyMemoryInfluencedFactors(evaluationData, context),
    };

    this.recordEvaluationResult(evaluation);
    this.updateJudgeState(evaluation);

    return evaluation;
  }

  updateFromMetaJudge(metaEvaluation: MetaJudgeEvaluation): void {
    this.identity.auditScore =
      (this.identity.auditScore * this.identity.lifetimeEvaluations + metaEvaluation.score) /
      (this.identity.lifetimeEvaluations + 1);

    this.identity.reputation = Math.max(0, this.identity.reputation + (metaEvaluation.score - 50) * 0.01);

    this.identity.biasVector = this.updateBiasVectorFromMeta(metaEvaluation);

    this.identity.calibration.systematicBias = this.updateCalibrationFromMeta(metaEvaluation);

    this.identity.lastUpdateTimestamp = deterministicNow(this.identity.seed + ++this._counter);
  }

  recordFailure(failure: FailureRecord): void {
    this.identity.memory.failures.push(failure);

    this.identity.accuracyScore = this.calculateAccuracyScore();

    if (failure.severity > 0.7) {
      this.identity.reputation = Math.max(0, this.identity.reputation - failure.severity * 0.05);
    }
  }

  recordFraud(fraud: FraudAttempt): void {
    this.identity.memory.fraudAttempts.push(fraud);

    if (fraud.detected) {
      this.identity.reputation = Math.max(0, this.identity.reputation - 0.1);
    }

    this.identity.accuracyScore = this.calculateAccuracyScore();
  }

  recordHallucination(hallucination: HallucinationPattern): void {
    this.identity.memory.hallucinationPatterns.push(hallucination);

    this.identity.accuracyScore = this.calculateAccuracyScore();
  }

  recordExploit(exploit: ExploitAttempt): void {
    this.identity.memory.exploitAttempts.push(exploit);

    if (exploit.success) {
      this.identity.reputation = Math.max(0, this.identity.reputation - 0.05);
    }

    this.identity.accuracyScore = this.calculateAccuracyScore();
    this.updatePersonalityFromExploit(exploit);
  }

  getIdentity(): JudgeIdentity {
    return { ...this.identity };
  }

  getCurrentFatigueMultiplier(): number {
    const activeFatigue = this.identity.memory.failures.filter((f) => this.isFailureRecent(f.detectedAt, 7));
    const fatigueMultiplier = 1 - Math.min(0.3, activeFatigue.length * 0.05);
    return Math.max(0.7, fatigueMultiplier);
  }

  getIsRetired(): boolean {
    return (
      this.identity.retirementScore > 0.8 ||
      (this.identity.accuracyScore < 0.4 && this.identity.lifetimeEvaluations > 10) ||
      (this.identity.reputation < 0.2 && this.identity.lifetimeEvaluations > 5)
    );
  }

  getSpecializationWeight(specialization: JudgeSpecialization): number {
    return this.identity.specializationTraits[specialization].scoreWeight;
  }

  private isFailureRecent(detectedAt: string, days: number): boolean {
    const detected = new Date(detectedAt);
    const now = new Date();
    const diffDays = (now.getTime() - detected.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  }

  private calculateBaseScore(evaluationData: EvaluationData, context: EvaluationContext): number {
    let score = 50;

    if (this.identity.specialization === JudgeSpecialization.ENGINEERING) {
      score += (evaluationData.technicalDepth || 0) * 0.3;
      score += (evaluationData.architectureQuality || 0) * 0.25;
      score += (evaluationData.performanceMetrics || 0) * 0.25;
      score += (evaluationData.securityScore || 0) * 0.2;
    } else if (this.identity.specialization === JudgeSpecialization.UX) {
      score += (evaluationData.userExperience || 0) * 0.4;
      score += (evaluationData.accessibility || 0) * 0.25;
      score += (evaluationData.designQuality || 0) * 0.25;
      score += (evaluationData.interactionQuality || 0) * 0.1;
    } else if (this.identity.specialization === JudgeSpecialization.INNOVATION) {
      score += (evaluationData.novelty || 0) * 0.4;
      score += (evaluationData.researchImpact || 0) * 0.25;
      score += (evaluationData.innovationPotential || 0) * 0.25;
      score += (evaluationData.creativity || 0) * 0.1;
    } else {
      score += (evaluationData.businessValue || 0) * 0.3;
      score += (evaluationData.marketImpact || 0) * 0.25;
      score += (evaluationData.implementationQuality || 0) * 0.25;
      score += (evaluationData.utilitiescore || 0) * 0.2;
    }

    if (this.identity.personality.riskTaking > 0.5) {
      score += (evaluationData.riskiness || 0) * 0.1;
    }

    if (this.identity.personality.exploration > 0.5) {
      score += (evaluationData.explorationScore || 0) * 0.1;
    }

    if (this.identity.personality.analyticalDepth > 0.5) {
      score += (evaluationData.analyticalDepth || 0) * 0.1;
    }

    return Math.max(0, Math.min(100, score));
  }

  private applyCalibration(baseScore: number, evaluationData: EvaluationData, context: EvaluationContext): number {
    const calibrationMultiplier = this.identity.calibration.calibrationAccuracy;

    for (const [biasKey, biasValue] of Object.entries(this.identity.biasVector)) {
      if (biasValue > 0.1 || biasValue < -0.1) {
        baseScore += biasValue * 10;
      }
    }

    const calibrated = baseScore * calibrationMultiplier;

    return Math.max(0, Math.min(100, calibrated));
  }

  private applyFatigueAdjustment(score: number): number {
    const fatigueMultiplier = this.getCurrentFatigueMultiplier();
    return score * fatigueMultiplier;
  }

  private generateScoreBreakdown(evaluationData: EvaluationData, context: EvaluationContext): ScoreBreakdown {
    const breakdown: ScoreBreakdown = {
      innovationScore: 0,
      functionalityScore: 0,
      uxScore: 0,
      technicalScore: 0,
      businessScore: 0,
    };

    if (this.identity.specialization === JudgeSpecialization.ENGINEERING) {
      breakdown.technicalScore = Math.round(evaluationData.technicalDepth || 0);
      breakdown.functionalityScore = Math.round(evaluationData.performanceMetrics || 0);
      breakdown.innovationScore = Math.round(evaluationData.architectureQuality || 0);
      breakdown.uxScore = Math.round(evaluationData.securityScore || 0);
      breakdown.businessScore = 50;
    } else if (this.identity.specialization === JudgeSpecialization.UX) {
      breakdown.uxScore = Math.round(evaluationData.userExperience || 0);
      breakdown.innovationScore = Math.round(evaluationData.accessibility || 0);
      breakdown.functionalityScore = Math.round(evaluationData.designQuality || 0);
      breakdown.technicalScore = 50;
      breakdown.businessScore = Math.round(evaluationData.interactionQuality || 0);
    } else if (this.identity.specialization === JudgeSpecialization.INNOVATION) {
      breakdown.innovationScore = Math.round(evaluationData.novelty || 0);
      breakdown.researchImpactScore = Math.round(evaluationData.researchImpact || 0);
      breakdown.technicalScore = Math.round(evaluationData.innovationPotential || 0);
      breakdown.uxScore = Math.round(evaluationData.creativity || 0);
      breakdown.functionalityScore = 50;
    } else {
      breakdown.businessScore = Math.round(evaluationData.businessValue || 0);
      breakdown.marketscore = Math.round(evaluationData.marketImpact || 0);
      breakdown.implementationScore = Math.round(evaluationData.implementationQuality || 0);
      breakdown.innovationScore = 50;
      breakdown.functionalityScore = Math.round(evaluationData.utilitiescore || 0);
    }

    return breakdown;
  }

  private calculateConfidence(evaluationData: EvaluationData, context: EvaluationContext, finalScore: number): number {
    let baseConfidence = 0.5;

    if (this.identity.memory.evaluatedCompanies.length > 10) {
      baseConfidence += 0.1;
    }

    const variance = this.calculateScoreVariance(evaluationData);
    baseConfidence -= variance * 0.1;

    const recentFailures = this.identity.memory.failures.filter((f) => this.isFailureRecent(f.detectedAt, 3));
    baseConfidence -= recentFailures.length * 0.05;

    const fraudAttempts = this.identity.memory.fraudAttempts.filter((f) => !f.detected);
    baseConfidence -= fraudAttempts.length * 0.02;

    return Math.max(0.1, Math.min(0.95, baseConfidence));
  }

  private calculateScoreVariance(evaluationData: EvaluationData): number {
    let variance = 0;

    const scores = [
      evaluationData.technicalDepth || 0,
      evaluationData.userExperience || 0,
      evaluationData.novelty || 0,
      evaluationData.businessValue || 0,
      evaluationData.performanceMetrics || 0,
    ];

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

    return Math.sqrt(variance) / 100;
  }

  private identifyMemoryInfluencedFactors(evaluationData: EvaluationData, context: EvaluationContext): string[] {
    const influencedFactors: string[] = [];

    const recentCompanies = this.getRecentEvaluatedCompanies(5);
    if (recentCompanies.length > 0 && recentCompanies.includes(evaluationData.companyId)) {
      influencedFactors.push('recency_bias');
    }

    const similarStrategies = this.identity.memory.strategyOutcomes;
    if (Object.keys(similarStrategies).length > 0) {
      influencedFactors.push('strategy_pattern_matching');
    }

    const recentFailures = this.identity.memory.failures.filter((f) => this.isFailureRecent(f.detectedAt, 7));
    if (recentFailures.length > 0) {
      influencedFactors.push('fatigue');
    }

    const recentFraudAttempts = this.identity.memory.fraudAttempts.filter(
      (f) => !f.detected && this.isTimeRecent(f.timestamp, 5),
    );
    if (recentFraudAttempts.length > 0) {
      influencedFactors.push('suspiciousness');
    }

    const recentHallucinations = this.identity.memory.hallucinationPatterns.filter((h) =>
      this.isTimeRecent(h.lastHappened, 10),
    );
    if (recentHallucinations.length > 0) {
      influencedFactors.push('skepticism');
    }

    return influencedFactors;
  }

  private getRecentEvaluatedCompanies(days: number): string[] {
    const companies: string[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    for (const companyId of this.identity.memory.evaluatedCompanies) {
      for (const outcome of Object.values(this.identity.memory.strategyOutcomes)) {
        if (outcome.companyId === companyId) {
          const outcomeDate = new Date(outcome.timestamp);
          if (outcomeDate >= cutoffDate) {
            companies.push(companyId);
          }
        }
      }
    }

    return [...new Set(companies)];
  }

  private isTimeRecent(timestamp: string, days: number): boolean {
    const eventDate = new Date(timestamp);
    const now = new Date();
    const diffDays = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  }

  private recordEvaluationResult(evaluation: JudgeEvaluation): void {
    this.identity.lifetimeEvaluations++;
    this.identity.experience = Math.sqrt(this.identity.lifetimeEvaluations);

    const rewardRecord: RewardHistoryRecord = {
      companyId: evaluation.companyId,
      score: evaluation.score,
      rewardType: evaluation.score >= 70 ? 'bonus' : evaluation.score >= 30 ? 'neutral' : 'penalty',
      timestamp: evaluation.timestamp,
    };

    this.identity.memory.rewardHistory.push(rewardRecord);

    const confidenceRecord: ConfidenceHistoryRecord = {
      evaluationId: evaluation.evaluationId,
      confidenceLevel: evaluation.confidence,
      accuracy: Math.abs(evaluation.score - 50) / 50,
      timestamp: evaluation.timestamp,
    };

    this.identity.memory.confidenceHistory.push(confidenceRecord);

    if (this.identity.lifetimeEvaluations % 10 === 0) {
      this.identity.reputation = Math.min(1, this.identity.reputation + 0.02);
    }
  }

  private updateJudgeState(evaluation: JudgeEvaluation): void {
    const oldScore = this.identity.accuracyScore || 0.5;

    const scoreProximityToIdeal = Math.abs(evaluation.score - 50) / 50;
    const newAccuracyScore = 1 - scoreProximityToIdeal;

    this.identity.accuracyScore = oldScore * 0.9 + newAccuracyScore * 0.1;

    const performanceChange = evaluation.score > 50 ? 0.01 : -0.01;
    this.identity.strictness = Math.max(0, Math.min(1, this.identity.strictness + performanceChange));

    this.identity.confidence = Math.max(0.1, Math.min(0.95, evaluation.confidence));

    this.identity.innovationBias = this.clampValue(
      this.identity.innovationBias + (evaluation.score > 70 ? 0.01 : -0.005),
      0,
      1,
    );
    this.identity.engineeringBias = this.clampValue(
      this.identity.engineeringBias + (evaluation.score > 60 ? 0.01 : -0.005),
      0,
      1,
    );
    this.identity.speedBias = this.clampValue(this.identity.speedBias + (evaluation.score > 80 ? 0.01 : -0.005), 0, 1);
    this.identity.riskTolerance = this.clampValue(
      this.identity.riskTolerance + (evaluation.score > 75 ? 0.01 : -0.005),
      0,
      1,
    );

    this.identity.lastUpdateTimestamp = evaluation.timestamp;

    this.updatePersonalityFromEvaluation(evaluation);
  }

  private updatePersonalityFromEvaluation(evaluation: JudgeEvaluation): void {
    const personalityChangeRate = 0.05;

    if (evaluation.score > 80) {
      this.identity.personality.riskTaking = Math.min(
        1,
        this.identity.personality.riskTaking + personalityChangeRate * 0.5,
      );
      this.identity.personality.exploration = Math.min(
        1,
        this.identity.personality.exploration + personalityChangeRate * 0.3,
      );
    } else if (evaluation.score < 30) {
      this.identity.personality.riskTaking = Math.max(
        0,
        this.identity.personality.riskTaking - personalityChangeRate * 0.5,
      );
      this.identity.personality.exploration = Math.max(
        0,
        this.identity.personality.exploration - personalityChangeRate * 0.2,
      );
    }

    if (evaluation.score > 90) {
      this.identity.personality.analyticalDepth = Math.min(
        1,
        this.identity.personality.analyticalDepth + personalityChangeRate * 0.3,
      );
      this.identity.personality.socialAwareness = Math.min(
        1,
        this.identity.personality.socialAwareness + personalityChangeRate * 0.2,
      );
    }

    if (evaluation.score < 20) {
      this.identity.personality.analyticalDepth = Math.max(
        0,
        this.identity.personality.analyticalDepth - personalityChangeRate * 0.3,
      );
      this.identity.personality.socialAwareness = Math.max(
        0,
        this.identity.personality.socialAwareness - personalityChangeRate * 0.2,
      );
    }
  }

  private updatePersonalityFromExploit(exploit: ExploitAttempt): void {
    const personalityChangeRate = 0.03;

    if (exploit.exploitType === 'judging_bias') {
      this.identity.personality.riskTaking = Math.min(
        1,
        this.identity.personality.riskTaking + personalityChangeRate * 0.5,
      );
      this.identity.personality.analyticalDepth = Math.min(
        1,
        this.identity.personality.analyticalDepth + personalityChangeRate * 0.4,
      );
    } else if (exploit.exploitType === 'system_manipulation') {
      this.identity.personality.socialAwareness = Math.min(
        1,
        this.identity.personality.socialAwareness + personalityChangeRate * 0.6,
      );
      this.identity.personality.patternRecognition = Math.min(
        1,
        this.identity.personality.patternRecognition + personalityChangeRate * 0.4,
      );
    } else if (exploit.exploitType === 'data_corruption') {
      this.identity.personality.analyticalDepth = Math.min(
        1,
        this.identity.personality.analyticalDepth + personalityChangeRate * 0.5,
      );
      this.identity.personality.socialAwareness = Math.min(
        1,
        this.identity.personality.socialAwareness + personalityChangeRate * 0.3,
      );
    }

    this.identity.personality.patternRecognition = Math.min(
      1,
      this.identity.personality.patternRecognition + personalityChangeRate * 0.2,
    );
  }

  private clampValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private calculateAccuracyScore(): number {
    let accuracy = 0;

    if (this.identity.memory.rewardHistory.length === 0) return 0.5;

    const recentRewards = this.identity.memory.rewardHistory.filter((r) => {
      const rewardDate = new Date(r.timestamp);
      const now = new Date();
      const diffDays = (now.getTime() - rewardDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    });

    if (recentRewards.length === 0) return 0.5;

    const positiveRewards = recentRewards.filter((r) => r.rewardType === 'bonus');
    accuracy = positiveRewards.length / recentRewards.length;

    const failuresWeight = this.identity.memory.failures.length > 0 ? 0.1 : 0;
    accuracy = Math.max(0, accuracy - failuresWeight);

    const fraudWeight = this.identity.memory.fraudAttempts.filter((f) => f.detected).length > 0 ? 0.2 : 0;
    accuracy = Math.max(0, accuracy - fraudWeight);

    const hallucinationsWeight = this.identity.memory.hallucinationPatterns.length > 0 ? 0.1 : 0;
    accuracy = Math.max(0, accuracy - hallucinationsWeight);

    return accuracy;
  }

  private updateBiasVectorFromMeta(metaEvaluation: MetaJudgeEvaluation): BiasVector {
    const biasVector: BiasVector = { ...this.identity.biasVector };

    for (const [key, value] of Object.entries(metaEvaluation.biasVector)) {
      const biasKey = key as keyof BiasVector;
      if (biasKey in biasVector) {
        biasVector[biasKey] = (biasVector[biasKey] + value * 0.3) / 1.3;
      }
    }

    return biasVector;
  }

  private updateCalibrationFromMeta(metaEvaluation: MetaJudgeEvaluation): Record<string, number> {
    const systematicBias: Record<string, number> = { ...this.identity.calibration.systematicBias };

    for (const [key, value] of Object.entries(metaEvaluation.calibration)) {
      systematicBias[key] = (systematicBias[key] || 0) * 0.8 + value * 0.2;
    }

    return systematicBias;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.identity.id,
      seed: this.identity.seed,
      name: this.identity.name,
      specialization: this.identity.specialization,
      personality: this.identity.personality,
      calibration: this.identity.calibration,
      confidence: this.identity.confidence,
      strictness: this.identity.strictness,
      consistency: this.identity.consistency,
      creativityPreference: this.identity.creativityPreference,
      innovationBias: this.identity.innovationBias,
      engineeringBias: this.identity.engineeringBias,
      speedBias: this.identity.speedBias,
      riskTolerance: this.identity.riskTolerance,
      reputation: this.identity.reputation,
      experience: this.identity.experience,
      lifetimeEvaluations: this.identity.lifetimeEvaluations,
      accuracyScore: this.identity.accuracyScore,
      auditScore: this.identity.auditScore,
      retirementScore: this.identity.retirementScore,
      memory: {
        evaluatedCompanies: this.identity.memory.evaluatedCompanies,
        strategyOutcomes: Object.fromEntries(Array.from(this.identity.memory.strategyOutcomes.entries())),
        failures: this.identity.memory.failures,
        innovationPatterns: this.identity.memory.innovationPatterns,
        fraudAttempts: this.identity.memory.fraudAttempts,
        hallucinationPatterns: this.identity.memory.hallucinationPatterns,
        exploitAttempts: this.identity.memory.exploitAttempts,
        rewardHistory: this.identity.memory.rewardHistory,
        confidenceHistory: this.identity.memory.confidenceHistory,
        lastCompetitorMemoryRefresh: this.identity.memory.lastCompetitorMemoryRefresh,
      },
      specializationTraits: {
        engineering: this.identity.specializationTraits.engineering,
        ux: this.identity.specializationTraits.ux,
        research: this.identity.specializationTraits.research,
        business: this.identity.specializationTraits.business,
        architecture: this.identity.specializationTraits.architecture,
        performance: this.identity.specializationTraits.performance,
        security: this.identity.specializationTraits.security,
        innovation: this.identity.specializationTraits.innovation,
        execution: this.identity.specializationTraits.execution,
        general: this.identity.specializationTraits.general,
      },
      biasVector: this.identity.biasVector,
      lastUpdateTimestamp: this.identity.lastUpdateTimestamp,
    };
  }
}

export function createJudge(builder: JudgeBuilder): Judge {
  const specialization = builder.specialization || JudgeSpecialization.GENERAL;

  const specializationTraits = {
    engineering: {
      scoreWeight: 0.8,
      focusArea: 'technical',
      riskThreshold: 0.3,
      rewardSensitivity: 1.2,
      penaltySensitivity: 0.8,
      technicalDepthFocus: 0.9,
      architectureEmphasis: 0.7,
      performanceBenchmark: 0.8,
      scalabilityWeight: 0.6,
    },
    ux: {
      scoreWeight: 0.8,
      focusArea: 'user_experience',
      riskThreshold: 0.4,
      rewardSensitivity: 1.0,
      penaltySensitivity: 0.9,
      userExperienceFocus: 0.9,
      accessibilityEmphasis: 0.7,
      visualDesignWeight: 0.6,
      interactionFlowImportance: 0.8,
    },
    research: {
      scoreWeight: 0.8,
      focusArea: 'innovation',
      riskThreshold: 0.5,
      rewardSensitivity: 1.3,
      penaltySensitivity: 0.7,
      noveltyEmphasis: 0.9,
      academicRigourWeight: 0.7,
      researchImpactFocus: 0.8,
      innovationPotentialImportance: 0.7,
    },
    business: {
      scoreWeight: 0.8,
      focusArea: 'business_value',
      riskThreshold: 0.3,
      rewardSensitivity: 1.1,
      penaltySensitivity: 0.9,
      businessValueFocus: 0.9,
      marketImpactWeight: 0.7,
      profitabilityEmphasis: 0.8,
      scalabilityImportance: 0.7,
    },
    architecture: {
      scoreWeight: 0.8,
      focusArea: 'system_design',
      riskThreshold: 0.3,
      rewardSensitivity: 1.0,
      penaltySensitivity: 0.9,
      systemDesignFocus: 0.9,
      patternRecognitionWeight: 0.7,
      modularityEmphasis: 0.8,
      maintainabilityImportance: 0.6,
    },
    performance: {
      scoreWeight: 0.8,
      focusArea: 'performance',
      riskThreshold: 0.4,
      rewardSensitivity: 1.1,
      penaltySensitivity: 0.8,
      speedFocus: 0.8,
      efficiencyWeight: 0.7,
      resourceUsageEmphasis: 0.6,
      performanceMetricsImportance: 0.7,
    },
    security: {
      scoreWeight: 0.8,
      focusArea: 'security',
      riskThreshold: 0.2,
      rewardSensitivity: 1.2,
      penaltySensitivity: 0.6,
      vulnerabilityFocus: 0.9,
      threatAnalysisWeight: 0.8,
      complianceEmphasis: 0.7,
      riskManagementImportance: 0.6,
    },
    innovation: {
      scoreWeight: 0.8,
      focusArea: 'creativity',
      riskThreshold: 0.6,
      rewardSensitivity: 1.4,
      penaltySensitivity: 0.5,
      creativityFocus: 0.9,
      novelSolutionsWeight: 0.8,
      disruptionEmphasis: 0.7,
      experimentationImportance: 0.6,
    },
    execution: {
      scoreWeight: 0.8,
      focusArea: 'delivery',
      riskThreshold: 0.4,
      rewardSensitivity: 1.0,
      penaltySensitivity: 0.9,
      deliveryFocus: 0.9,
      reliabilityWeight: 0.8,
      timelineEmphasis: 0.6,
      implementationImportance: 0.7,
    },
    general: {
      scoreWeight: 0.7,
      focusArea: 'balance',
      riskThreshold: 0.5,
      rewardSensitivity: 1.0,
      penaltySensitivity: 1.0,
      balanceScore: 0.7,
      versatilityWeight: 0.7,
      adaptabilityEmphasis: 0.7,
      wellRoundednessImportance: 0.7,
    },
  };

  const initialPersonality: JudgePersonality = {
    riskTaking: builder.personality?.riskTaking ?? 0.5,
    exploration: builder.personality?.exploration ?? 0.5,
    analyticalDepth: builder.personality?.analyticalDepth ?? 0.5,
    socialAwareness: builder.personality?.socialAwareness ?? 0.5,
    patternRecognition: builder.personality?.patternRecognition ?? 0.5,
  };

  const initialBiasVector: BiasVector = {
    leniencyBias: 0,
    harshnessBias: 0,
    noveltyBias: 0,
    technicalBias: 0,
    complexityBias: 0,
    riskBias: 0,
    innovationBias: 0.2,
    businessBias: 0.2,
  };

  if (builder.biasIncrements) {
    for (const [key, increment] of Object.entries(builder.biasIncrements)) {
      const biasKey = key as keyof BiasVector;
      if (biasKey in initialBiasVector) {
        initialBiasVector[biasKey] = Math.max(-1, Math.min(1, (initialBiasVector[biasKey] || 0) + increment));
      }
    }
  }

  const judgeId = `judge-${createDeterministicUuid(42, builder.name.length)}`;

  const initialCalibration: JudgeCalibration = {
    systematicBias: {},
    calibrationAccuracy: builder.baseCalibrationAccuracy ?? 0.5,
    consistencyScore: builder.baseConsistencyScore ?? 0.5,
    varianceScore: 0.5,
    precisionScore: 0.5,
    lastCalibrationTimestamp: deterministicNow(42),
    comparisonJudges: [],
  };

  const judgeIdentity: JudgeIdentity = {
    id: judgeId,
    seed: 42,
    name: builder.name,
    specialization,
    personality: initialPersonality,
    calibration: initialCalibration,
    confidence: 0.5,
    strictness: builder.baseStrictness ?? 0.5,
    consistency: 0.5,
    creativityPreference: builder.baseCreativityPreference ?? 0.5,
    innovationBias: builder.baseInnovationBias ?? 0.2,
    engineeringBias: builder.baseEngineeringBias ?? 0.2,
    speedBias: builder.baseSpeedBias ?? 0.2,
    riskTolerance: builder.baseRiskTolerance ?? 0.5,
    reputation: builder.baseReputation ?? 0.5,
    experience: builder.baseExperience ?? 0.5,
    lifetimeEvaluations: 0,
    accuracyScore: 0.5,
    auditScore: 0.5,
    retirementScore: 0,
    memory: {
      evaluatedCompanies: [],
      strategyOutcomes: new Map(),
      failures: [],
      innovationPatterns: [],
      fraudAttempts: [],
      hallucinationPatterns: [],
      exploitAttempts: [],
      rewardHistory: [],
      confidenceHistory: [],
      lastCompetitorMemoryRefresh: '',
    },
    specializationTraits: specializationTraits as SpecializationTraits,
    biasVector: initialBiasVector,
    lastUpdateTimestamp: deterministicNow(42),
  };

  return new Judge(judgeIdentity);
}

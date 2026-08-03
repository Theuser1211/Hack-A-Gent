import type { IdeationResult, ScoredIdea } from '../ideation/types.js';

/**
 * Types for the Product Intelligence engine — the "think like a hackathon
 * winner" layer that runs BEFORE any code is generated.
 *
 * Pipeline:
 *   Understand Challenge → Extract Judging Priorities → Extract Sponsor
 *   Opportunities → Brainstorm 20 ideas → Self-evaluate → Expand top 5 →
 *   Business viability → Technical feasibility → Judge simulation → Select
 *   winner → Product Vision → Architecture Plan
 */

/** How a judging criterion is best won. */
export type FocusDimension =
  | 'wow'
  | 'technical'
  | 'impact'
  | 'design'
  | 'feasibility'
  | 'completeness';

export interface JudgingPriority {
  name: string;
  weight: number;
  weightRaw: string;
  focus: FocusDimension;
  approach: string;
}

export interface SponsorOpportunity {
  name: string;
  provider: string;
  strategicValue: 'must_use' | 'should_use' | 'nice_to_have';
  description: string;
  opportunity: string;
  risk: string;
}

/** Business viability analysis (YC lens: problem, market, model, moat). */
export interface ViabilityAnalysis {
  marketSize: number; // 1-10
  urgency: number; // 1-10 — the "hair on fire" test
  monetization: number; // 1-10
  moat: number; // 1-10
  acquisition: number; // 1-10 — cost/friction to reach first users
  total: number; // 0-100
  businessModel: string;
  monetizationPath: string;
  summary: string;
}

/** Technical feasibility analysis for the hackathon window. */
export interface FeasibilityAnalysis {
  buildability: number; // 1-10
  dependencyRisk: number; // 1-10 (10 = low risk)
  scopeRisk: number; // 1-10 (10 = low risk)
  dataComplexity: number; // 1-10
  estimateHours: number;
  total: number; // 0-100
  summary: string;
}

export interface JudgeCriterionScore {
  criterion: string;
  weight: number;
  score: number; // 1-10
  note: string;
}

export interface SimulatedJudge {
  name: string;
  lens: string;
  scores: JudgeCriterionScore[];
  overall: number; // 0-100
  verdict: string;
}

/** A simulated panel of judges scoring the idea against the real criteria. */
export interface JudgeSimulation {
  judges: SimulatedJudge[];
  total: number; // 0-100 (criterion-weight average)
  topCriterion: string;
  weakestCriterion: string;
  summary: string;
}

/** A top-5 idea after the deep evaluation passes. */
export interface EvaluatedIdea extends ScoredIdea {
  viability: ViabilityAnalysis;
  /** Deep technical feasibility analysis — note: `feasibility` (the 1-10 idea dimension) stays inherited. */
  feasibilityAnalysis: FeasibilityAnalysis;
  judgeSimulation: JudgeSimulation;
  /** Honest weaknesses the planner found in its own pick. */
  selfCritique: string[];
  /** Combined 0-100: idea + judge sim + viability + feasibility. */
  finalScore: number;
}

/** The full product definition generated before code starts. */
export interface ProductVision {
  visionStatement: string;
  oneLiner: string;
  tagline: string;
  targetUser: string;
  problem: string;
  whyNow: string;
  coreUserJourney: string[];
  mvpScope: string[];
  wowMoment: string;
  differentiator: string;
  /** High-level stack/pattern — a one-liner summary of the architecture plan. */
  architectureSummary: string;
  demoStrategy: string;
  successMetrics: string[];
  risks: Array<{ risk: string; mitigation: string }>;
}

export interface ArchitectureModule {
  name: string;
  responsibility: string;
}

export interface ArchitecturePlan {
  summary: string;
  recommendedStack: string[];
  modules: ArchitectureModule[];
  dataModel: string[];
  apiSurfaces: string[];
  deployment: string;
  sponsorIntegrations: string[];
}

export interface ProductIntelligenceResult {
  challengeTitle: string;
  theme: string;
  judgingPriorities: JudgingPriority[];
  sponsorOpportunities: SponsorOpportunity[];
  /** The raw 20 → ranked → top 5 brainstorm from the ideation engine. */
  brainstorm: IdeationResult;
  /** Top 5, each deepened with viability + feasibility + judge simulation. */
  evaluatedShortlist: EvaluatedIdea[];
  winner: EvaluatedIdea;
  vision: ProductVision;
  architecture: ArchitecturePlan;
  /** Why this idea beat the other four. */
  selectionRationale: string;
}

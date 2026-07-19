/**
 * Hackathon Intelligence Engine — Type Definitions
 * =================================================
 *
 * The engine produces a single, structured `HackathonIntelligence` object
 * that powers the `hag analyze | inspect | compare | opportunities |
 * sponsors | timeline | strategy` commands.
 *
 * Design principles:
 *  - Reuses the existing `DevpostAnalysis` from `features/analyze` for the
 *    20 structural dimensions (parsing, difficulty, stack, milestones, …).
 *  - Adds the dimensions the brief asked for that were NOT already covered:
 *    competition estimate, probability-of-completion, judges analysis,
 *    requirements analysis, winners analysis, and deep API/sponsor breakdowns.
 *  - EVERY recommendation carries a `why` string so the CLI can always
 *    explain the reasoning (terminal, JSON, and future web UI).
 *  - Deterministic: same input + seed ⇒ same output. No LLM required, but an
 *    optional `llmCall` hook may enrich free-text fields.
 */

import type { DevpostAnalysis, SponsorAPI, JudgingCriterion, FeatureRecommendation, RiskItem, Milestone } from '../analyze/types.js';

/** A recommendation that always explains itself. */
export interface ExplainedRecommendation {
  title: string;
  /** Why this is recommended — surfaced verbatim in every output mode. */
  why: string;
  priority: 'must' | 'should' | 'nice';
  /** Optional quantified confidence in the recommendation (0..1). */
  confidence?: number;
}

/** Estimate how fierce the competition is likely to be. */
export interface CompetitionEstimate {
  level: 'low' | 'moderate' | 'high' | 'fierce';
  /** 0..100. */
  score: number;
  why: string;
  signals: string[];
}

export interface ProbabilityEstimate {
  /** 0..100 chance the team finishes a demonstrable submission in time. */
  completion: number;
  /** 0..100 chance the result is competitive (places / wins). */
  competitiveness: number;
  why: string;
  /** Levers most likely to move the number. */
  levers: string[];
}

export interface JudgesAnalysis {
  count: number;
  /** Criteria with their weight and the specific reason they matter. */
  criteria: Array<JudgingCriterion & { whyItMatters: string }>;
  /** The single axis to optimize first, with reasoning. */
  primaryFocus: { name: string; why: string };
  antiPatterns: string[];
}

export interface RequirementsAnalysis {
  hard: Array<{ requirement: string; why: string }>;
  soft: Array<{ requirement: string; why: string }>;
  gaps: string[];
  deliverables: string[];
  /** Earliest meaningful deadline detected. */
  submissionDeadline: string | null;
}

export interface WinnersAnalysis {
  /** Patterns shared by past winners of similar hackathons. */
  commonTraits: Array<{ trait: string; why: string }>;
  /** What typically loses. */
  losingTraits: string[];
  /** Concrete playbook derived from the above. */
  playbook: string[];
  /** Confidence in this analysis (no live winner data ⇒ 'low'). */
  confidence: 'low' | 'medium' | 'high';
}

export interface ApiBreakdown {
  name: string;
  category: SponsorAPI['category'];
  strategicValue: number;
  mustUse: boolean;
  /** Concrete reason to use (or skip) this API for THIS hackathon. */
  why: string;
  integrationEffort: 'low' | 'medium' | 'high';
}

export interface SponsorBreakdown {
  name: string;
  strategicValue: number;
  mustUse: boolean;
  notes: string;
  /** Why this sponsor matters to judging for THIS hackathon. */
  judgingImpact: string;
}

export interface IntelligenceEngineOutput {
  /** Stable id for caching / comparison. */
  analysisId: string;
  source: string;
  seed: number;
  confidence: 'low' | 'medium' | 'high';
  generatedAt: string;

  /** The 20-dimension structural analysis (reused, not re-implemented). */
  core: DevpostAnalysis;

  // ── New dimensions the brief asked for ──────────────────────────────
  competition: CompetitionEstimate;
  probability: ProbabilityEstimate;
  judges: JudgesAnalysis;
  requirements: RequirementsAnalysis;
  winners: WinnersAnalysis;
  apis: ApiBreakdown[];
  sponsors: SponsorBreakdown[];

  // ── The "recommend" family, each explained ──────────────────────────
  recommendTechnology: ExplainedRecommendation[];
  recommendArchitecture: ExplainedRecommendation[];
  recommendMilestones: ExplainedRecommendation[];
  recommendMvp: ExplainedRecommendation[];
  recommendDifferentiators: ExplainedRecommendation[];
}

/** Shared input options for the engine. */
export interface IntelligenceInput {
  /** A Devpost URL, a path to a local .html/.txt file, or raw text. */
  source: string;
  seed?: number;
  /** Optional deterministic LLM hook (never required). */
  llmCall?: (system: string, user: string) => Promise<string | null>;
  /** Pre-validated HTML (skips network). Used by tests and `compare`. */
  htmlOverride?: string;
}

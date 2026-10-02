/**
 * Devpost Intelligence — Type Definitions
 * ======================================
 *
 * Types for the `hag analyze` / `hag inspect` capability. The analyzer
 * produces a fully deterministic analysis (no LLM required) covering 20
 * strategic dimensions, plus an optional LLM-enriched `extras` block.
 */

export interface SponsorAPI {
  name: string;
  category: 'ai' | 'payments' | 'comms' | 'data' | 'hosting' | 'auth' | 'ml' | 'other';
  mustUse: boolean;
  strategicValue: 1 | 2 | 3 | 4 | 5;
  notes: string;
}

export interface JudgingCriterion {
  name: string;
  /** Normalized weight, 0-100, all criteria sum to 100. */
  weight: number;
  inferred: boolean;
}

export interface ParsedDevpost {
  url: string;
  title: string;
  tagline: string;
  description: string;
  themes: string[];
  organizer: string;
  sponsorAPIs: SponsorAPI[];
  judgingCriteria: JudgingCriterion[];
  prizes: string[];
  deadlines: string[];
  rules: string[];
  rawHtmlLength: number;
}

export type Difficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'extreme';

export interface FeatureRecommendation {
  title: string;
  rationale: string;
  priority: 'must' | 'should' | 'nice';
}

export interface RiskItem {
  category: 'technical' | 'time' | 'scope' | 'team' | 'integration';
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface Milestone {
  name: string;
  durationHours: number;
  goals: string[];
}

export interface DevpostAnalysis {
  /** 1. Project overview */
  projectOverview: string;
  /** 2. Technology stack (recommended) */
  technologyStack: string[];
  /** 3. Sponsor APIs (detected + recommended) */
  sponsorAPIs: SponsorAPI[];
  /** 4. Required integrations */
  requiredIntegrations: string[];
  /** 5. Difficulty estimate */
  difficulty: Difficulty;
  difficultyScore: number; // 1-10
  /** 6. Expected judging priorities (sorted by weight desc) */
  judgingPriorities: JudgingCriterion[];
  /** 7. Winning strategy */
  winningStrategy: string;
  /** 8. Feature recommendations */
  featureRecommendations: FeatureRecommendation[];
  /** 9. Timeline */
  timeline: string;
  /** 10. Architecture recommendation */
  architectureRecommendation: string;
  /** 11. Risk analysis */
  riskAnalysis: RiskItem[];
  /** 12. Recommended AI models */
  recommendedModels: string[];
  /** 13. Suggested folder structure */
  suggestedFolderStructure: string;
  /** 14. Suggested milestones */
  suggestedMilestones: Milestone[];
  /** 15. Complexity estimate */
  complexityEstimate: string;
  /** 16. Estimated completion time */
  estimatedCompletionTime: string;
  /** 17. Recommended team size */
  recommendedTeamSize: number;
  /** 18. Scoring opportunities */
  scoringOpportunities: string[];
  /** 19. Common mistakes */
  commonMistakes: string[];
  /** 20. Potential differentiators */
  potentialDifferentiators: string[];

  /** Provenance for traceability / determinism. */
  meta: {
    source: string;
    seed: number;
    generatedAt: string; // ISO, injected by caller (deterministic-safe)
    confidence: 'low' | 'medium' | 'high';
    analysisId: string;
  };
}

export interface AnalyzeOptions {
  url?: string;
  html?: string;
  seed?: number;
  /** Enrich with an LLM using the prompt-template library (optional). */
  enrich?: boolean;
}

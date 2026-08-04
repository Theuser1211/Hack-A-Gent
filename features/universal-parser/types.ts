/**
 * Hack-A-Gent Universal Hackathon Specification
 * =============================================
 *
 * Canonical schema for ANY hackathon webpage.
 * All downstream consumers (pipeline, generation, evaluation) depend on this.
 */

export interface HackathonSpec {
  /** Unique identifier for this parse */
  parseId: string;

  /** Source URL */
  url: string;

  /** Platform detected (devpost, mlh, unstop, luma, hack2skill, hackerearth, generic) */
  platform: PlatformType;

  /** Confidence score 0-1 that this is a hackathon page */
  confidence: number;

  /** Raw HTML length for debugging */
  rawHtmlLength: number;

  // ─── Core Identity ──────────────────────────────────────────────
  /** Official event title */
  title: string;

  /** Tagline / short description (1-2 sentences) */
  tagline: string;

  /** Full description / problem statement */
  description: string;

  /** Organizer / host organization */
  organizer: string;

  // ─── Themes & Tracks ────────────────────────────────────────────
  /** Theme tags (e.g., "AI/ML", "Fintech", "Climate", "Web3") */
  themes: string[];

  /** Track names if multi-track (e.g., "Best AI App", "Student Track") */
  tracks: string[];

  // ─── Judging & Scoring ─────────────────────────────────────────
  /** Judging criteria with weights */
  judgingCriteria: JudgingCriterion[];

  /** Scoring methodology notes */
  scoringMethodology: string;

  // ─── Judging Intelligence (NEW) ─────────────────────────────────
  /** Deep understanding of what judges actually value */
  judgingIntelligence: JudgingIntelligence;

  // ─── Sponsor Intelligence (NEW) ─────────────────────────────────
  /** Detailed sponsor analysis with strategic recommendations */
  sponsorIntelligence: SponsorIntelligence;

  // ─── Opportunity Analysis (NEW) ─────────────────────────────────
  /** Strategic opportunity assessment */
  opportunityAnalysis: OpportunityAnalysis;

  // ─── Prizes & Sponsors ──────────────────────────────────────────
  /** Prize descriptions (cash and non-cash) */
  prizes: Prize[];

  /** Sponsor APIs with strategic metadata */
  sponsorAPIs: SponsorAPI[];

  // ─── Eligibility & Rules ───────────────────────────────────────
  /** Who can participate */
  eligibility: EligibilityRule[];

  /** Restrictions (what you CANNOT do) */
  restrictions: Restriction[];

  /** Detailed constraints with categorization (time, tech, license, AI, hardware, etc.) */
  constraints: DetailedConstraint[];

  /** Submission requirements (deliverables) */
  deliverables: Deliverable[];

  // ─── Challenge Understanding (NEW) ──────────────────────────────
  /** Deep understanding of the actual challenge */
  challengeUnderstanding: ChallengeUnderstanding;

  // ─── Timeline ──────────────────────────────────────────────────
  /** Key dates and deadlines */
  timeline: TimelineEvent[];

  // ─── Links ─────────────────────────────────────────────────────
  /** Important URLs (registration, rules, API docs, etc.) */
  importantLinks: ImportantLink[];

  // ─── Per-Field Confidence Tracking ─────────────────────────────
  /** Confidence and source for each top-level field */
  fieldConfidence: Record<string, FieldConfidence>;

  // ─── Metadata ──────────────────────────────────────────────────
  /** Extraction metadata for debugging */
  meta: ExtractionMeta;

  /** Parser performance and quality metrics */
  qualityMetrics: ParserQualityMetrics;

  /** Detailed diagnostic report for this parse */
  diagnostics: ParserDiagnostics;

  /** Master winning strategy report — primary output for downstream intelligence */
  winningStrategyReport?: WinningStrategyReport;
}

/** Master winning strategy report — primary intelligence output */
export interface WinningStrategyReport {
  /** Easiest path to a winning submission */
  easiestPath: string;
  /** Highest ROI track to enter */
  highestRoiTrack: string;
  /** Recommended technology stack */
  recommendedTechStack: string[];
  /** Recommended MVP scope and approach */
  recommendedMvpScope: string;
  /** Recommended demo and presentation strategy */
  demoStrategy: string;
  /** Biggest risks to avoid */
  biggestRisks: string[];
  /** Biggest opportunities to exploit */
  biggestOpportunities: string[];
  /** Sponsor integration opportunities */
  sponsorOpportunities: string[];
  /** Summary of judging priorities */
  judgingPrioritiesSummary: string;
  /** Overall confidence in this report */
  overallConfidence: FieldConfidence;
}

export interface ParserQualityMetrics {
  /** Overall parse confidence (0-1) */
  confidence: number;

  /** Time taken to parse (milliseconds) */
  parseTimeMs: number;

  /** Time spent on AI normalization (if any) */
  aiTimeMs: number;

  /** Number of AI retries performed */
  aiRetryCount: number;

  /** Number of repair actions performed */
  repairActionsCount: number;

  /** Number of fields that were inferred */
  inferredFieldsCount: number;

  /** Number of fields that were AI-interpreted */
  aiInterpretedFieldsCount: number;

  /** Number of low-confidence fields (<0.5) */
  lowConfidenceFieldsCount: number;

  /** Number of missing required sections */
  missingSectionsCount: number;

  /** Number of sponsor APIs extracted */
  sponsorAPIsCount: number;

  /** Number of judging criteria extracted */
  judgingCriteriaCount: number;

  /** Platform detected */
  platform: PlatformType;

  /** Confidence in platform detection (0-1) */
  platformConfidence: number;

  /** Number of warnings during parsing */
  warningCount: number;

  /** Whether parsing succeeded */
  success: boolean;
}

export interface ParserDiagnostics {
  /** What was extracted directly from HTML */
  extractedFields: string[];

  /** What was inferred from context */
  inferredFields: string[];

  /** What was generated by AI */
  aiGeneratedFields: string[];

  /** Fields that are missing or incomplete */
  missingFields: string[];

  /** Fields with low confidence (<0.5) */
  lowConfidenceFields: string[];

  /** Repair actions that were performed */
  repairActions: string[];

  /** Fallbacks that were used */
  fallbacksUsed: string[];

  /** Warnings generated during parsing */
  warnings: string[];

  /** Strategies attempted during multi-strategy parsing */
  strategiesAttempted: string[];

  /** Best strategy used */
  bestStrategy: string;

  /** Performance metrics */
  performance: {
    htmlParseTimeMs: number;
    sectionExtractionTimeMs: number;
    aiNormalizationTimeMs: number;
    validationTimeMs: number;
    repairTimeMs: number;
  };
}

export type PlatformType =
  | 'devpost'
  | 'mlh'
  | 'unstop'
  | 'luma'
  | 'hack2skill'
  | 'hackerearth'
  | 'generic';

export interface JudgingCriterion {
  name: string;
  /** Weight 0-100, all criteria should sum to 100 */
  weight: number;
  /** Description of what this criterion evaluates */
  description: string;
  /** Whether weight was inferred vs explicit */
  inferred: boolean;
  /** Priority tier based on weight */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface Prize {
  /** Description (e.g., "$10,000 Grand Prize", "AWS Credits $5,000") */
  description: string;
  /** Cash amount in USD if applicable */
  cashValueUsd?: number;
  /** Prize tier */
  tier: 'grand' | 'first' | 'second' | 'third' | 'track' | 'special' | 'non-cash' | 'unknown';
  /** Sponsor name if associated */
  sponsor?: string;
  /** Raw text for debugging */
  rawText: string;
}

export interface SponsorAPI {
  name: string;
  category: SponsorCategory;
  /** Whether the hackathon requires using this API */
  mustUse: boolean;
  /** Strategic value 1-5 for winning */
  strategicValue: 1 | 2 | 3 | 4 | 5;
  /** Description of what the API provides */
  description: string;
  /** Confidence this is a real sponsor */
  confidence: 'confirmed' | 'inferred' | 'unknown';
}

export type SponsorCategory =
  | 'ai'
  | 'payments'
  | 'comms'
  | 'data'
  | 'hosting'
  | 'auth'
  | 'ml'
  | 'social'
  | 'blockchain'
  | 'ecommerce'
  | 'other';

export interface EligibilityRule {
  /** Rule text (e.g., "Open to students only", "Must be 18+") */
  rule: string;
  /** Rule type */
  type: 'age' | 'student' | 'professional' | 'team-size' | 'geography' | 'skill-level' | 'other';
  /** Whether this is a hard requirement */
  required: boolean;
}

export interface Restriction {
  /** Restriction text (e.g., "No external APIs", "Must use sponsor APIs") */
  rule: string;
  /** Restriction type */
  type: 'api' | 'tech-stack' | 'team' | 'submission' | 'ip' | 'commercial' | 'other';
  /** Severity */
  severity: 'hard' | 'soft' | 'advisory';
}

export interface Deliverable {
  /** What to submit (e.g., "GitHub repo", "Live demo URL", "3-min video") */
  description: string;
  /** Expected format */
  format: 'url' | 'file' | 'repo' | 'video' | 'document' | 'other';
  /** Whether required for submission */
  required: boolean;
  /** Associated track if track-specific */
  track?: string;
}

export interface TimelineEvent {
  /** Event label (e.g., "Registration opens", "Submission deadline") */
  label: string;
  /** ISO date string or human-readable date */
  date: string;
  /** Event type */
  type: 'registration' | 'submission' | 'judging' | 'demo' | 'winner-announcement' | 'other';
  /** Timezone if known */
  timezone?: string;
}

export interface ImportantLink {
  /** Link label */
  label: string;
  /** Absolute URL */
  url: string;
  /** Link purpose */
  purpose: 'registration' | 'rules' | 'api-docs' | 'submission' | 'discord' | 'schedule' | 'faq' | 'other';
}

/** Confidence and provenance for any extracted field */
export interface FieldConfidence {
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** How this was determined */
  source: 'extracted' | 'inferred' | 'ai_interpreted';
  /** Source location in HTML (e.g., "h2#judging-criteria", "meta og:description") */
  location?: string;
  /** Additional notes */
  notes?: string;
  /** Parser strategy that produced this field */
  strategy?: 'dom_heading' | 'readable_content' | 'semantic_ai' | 'meta_tag' | 'json_ld' | 'regex' | 'fallback';
  /** Extraction method used */
  extractionMethod?: 'section_extractor' | 'ai_normalizer' | 'validator_repair' | 'inference';
  /** Parser version that produced this field */
  parserVersion?: string;
  /** Repair actions applied to this field (if any) */
  repairHistory?: string[];
  /** Timestamp when this field was extracted */
  extractedAt?: string;
}

/** Deep understanding of what judges actually value */
export interface JudgingIntelligence {
  /** What judges actually prioritize (beyond stated weights) */
  actualPriorities: string[];
  /** Likely winning strategies based on judging patterns */
  likelyWinningStrategies: WinningStrategyHint[];
  /** Expected technical depth (1-10) */
  expectedTechnicalDepth: number;
  /** Innovation expectations (1-10) */
  expectedInnovation: number;
  /** Presentation/polish expectations (1-10) */
  expectedPresentation: number;
  /** Business/impact expectations (1-10) */
  expectedBusinessImpact: number;
  /** Common judge biases observed in similar hackathons */
  knownBiases: string[];
  /** Confidence for this intelligence */
  confidence: FieldConfidence;
}

/** A specific winning strategy hint */
export interface WinningStrategyHint {
  /** Strategy name */
  name: string;
  /** Why this works */
  rationale: string;
  /** Which criteria this targets */
  targetsCriteria: string[];
  /** Difficulty to execute (1-10) */
  difficulty: number;
  /** Estimated score boost if executed well (0-100) */
  scoreBoost: number;
}

/** Detailed sponsor analysis with strategic recommendations */
export interface SponsorIntelligence {
  /** Sponsors ranked by expected value for winning */
  sponsorsByValue: SponsorValueRanking[];
  /** Sponsors that MUST be used (explicit requirement) */
  requiredSponsors: string[];
  /** Sponsors with bonus prizes for using their tech */
  bonusPrizeSponsors: BonusPrizeSponsor[];
  /** Cross-sponsor synergy opportunities */
  synergyOpportunities: SponsorSynergy[];
  /** Overall sponsor strategy recommendation */
  overallStrategy: string;
  /** Confidence for this intelligence */
  confidence: FieldConfidence;
}

/** Sponsor ranked by strategic value */
export interface SponsorValueRanking {
  sponsorName: string;
  /** Overall strategic value 1-10 */
  strategicValue: number;
  /** Why this sponsor is valuable */
  rationale: string[];
  /** Specific APIs/SDKs/datasets to use */
  recommendedResources: SponsorResource[];
  /** Track-specific value if applicable */
  trackValue?: Record<string, number>;
}

/** A specific sponsor resource (API, SDK, dataset, hardware) */
export interface SponsorResource {
  name: string;
  type: 'api' | 'sdk' | 'dataset' | 'hardware' | 'credits' | 'mentorship' | 'other';
  /** How to access */
  accessMethod: string;
  /** Documentation URL */
  docsUrl?: string;
  /** Strategic value of this specific resource (1-10) */
  value: number;
  /** Example use cases */
  useCases: string[];
}

/** Sponsor with bonus prizes */
export interface BonusPrizeSponsor {
  sponsorName: string;
  /** Bonus prize description */
  bonusPrize: string;
  /** What you must do to qualify */
  qualification: string;
  /** Additional value beyond main prize (1-10) */
  extraValue: number;
}

/** Cross-sponsor synergy opportunity */
export interface SponsorSynergy {
  sponsors: string[];
  /** Description of the synergy */
  description: string;
  /** Combined value (1-10) */
  combinedValue: number;
  /** Example project idea leveraging this synergy */
  exampleIdea: string;
}

/** Strategic opportunity assessment */
export interface OpportunityAnalysis {
  /** Easiest path to a winning submission */
  easiestPathToWin: string;
  /** Highest ROI category/track */
  highestRoiTrack: string;
  /** Strongest project direction */
  strongestDirection: ProjectDirection;
  /** Risky directions to avoid */
  riskyDirections: RiskyDirection[];
  /** Overused/oversaturated ideas */
  overusedIdeas: string[];
  /** Underserved opportunities */
  underservedOpportunities: string[];
  /** Confidence for this analysis */
  confidence: FieldConfidence;
}

/** A recommended project direction */
export interface ProjectDirection {
  /** Direction name */
  name: string;
  /** Why this direction is strong */
  rationale: string;
  /** Target track if applicable */
  targetTrack?: string;
  /** Key sponsors to leverage */
  keySponsors: string[];
  /** Estimated effort (1-10) */
  effort: number;
  /** Estimated score potential (0-100) */
  scorePotential: number;
  /** Required capabilities */
  requiredCapabilities: string[];
}

/** A direction to avoid */
export interface RiskyDirection {
  /** Direction name */
  name: string;
  /** Why this is risky */
  rationale: string;
  /** Risk level (1-10) */
  riskLevel: number;
  /** Common failure modes */
  failureModes: string[];
}

/** Deep understanding of the actual challenge */
export interface ChallengeUnderstanding {
  /** The actual problem being solved (1-2 sentences) */
  coreProblem: string;
  /** Target users/beneficiaries */
  targetUsers: string[];
  /** Expected real-world impact */
  expectedImpact: string;
  /** Why this hackathon exists (organizer's motivation) */
  organizerMotivation: string;
  /** Success looks like... */
  successCriteria: string[];
  /** Domain knowledge required */
  domainKnowledge: string[];
  /** Confidence for this understanding */
  confidence: FieldConfidence;
}

/** Constraints with detailed categorization */
export interface DetailedConstraint {
  /** Constraint text */
  rule: string;
  /** Constraint category */
  category: ConstraintCategory;
  /** Severity */
  severity: 'hard' | 'soft' | 'advisory';
  /** Whether explicitly stated or inferred */
  explicit: boolean;
  /** Confidence */
  confidence: FieldConfidence;
}

export type ConstraintCategory =
  | 'time'
  | 'technology'
  | 'submission'
  | 'license'
  | 'open-source'
  | 'team'
  | 'ai-usage'
  | 'hardware'
  | 'geography'
  | 'eligibility'
  | 'budget'
  | 'api-usage'
  | 'ip-ownership'
  | 'commercialization'
  | 'other';

export interface ExtractionMeta {
  /** Timestamp of extraction */
  extractedAt: string;
  /** Parser version */
  parserVersion: string;
  /** Platform-specific extraction notes */
  platformNotes: string[];
  /** Fields that were inferred vs extracted */
  inferredFields: string[];
  /** Warnings during extraction */
  warnings: string[];
  /** Number of LLM calls if AI normalization used */
  llmCalls: number;
  /** Whether AI normalization was attempted */
  aiNormalized: boolean;
}

/** Options for the universal parser */
export interface UniversalParserOptions {
  /** Optional RouterEngine for AI normalization */
  router?: { execute: (taskType: string, request: unknown) => Promise<unknown> };
  /** Seed for deterministic behavior */
  seed?: number;
  /** Force platform detection (skip auto-detect) */
  forcePlatform?: PlatformType;
  /** Minimum confidence to accept as hackathon (0-1) */
  minConfidence?: number;
  /** Maximum HTML length to process */
  maxHtmlLength?: number;
  /** Multi-strategy parsing configuration */
  multiStrategy?: MultiStrategyConfig;
  /**
   * Extraction strategy to use for producing sections + AI input.
   * `dom` (default) is the current production extractor; `markdown` and
   * `jsonld` are experimental.
   */
  extractor?: 'dom' | 'markdown' | 'jsonld';
}

/** Result of universal parsing */
export interface UniversalParseResult {
  /** The parsed HackathonSpec */
  spec: HackathonSpec;
  /** Whether parsing succeeded */
  success: boolean;
  /** Errors if any */
  errors: string[];
  /** Raw extracted sections for debugging */
  rawSections: Record<string, string>;
}

/** Multi-strategy parsing configuration */
export interface MultiStrategyConfig {
  /** Whether to attempt multiple strategies */
  enabled: boolean;
  /** Minimum confidence threshold to accept a result without retrying */
  minConfidence: number;
  /** Maximum number of strategies to attempt */
  maxStrategies: number;
  /** Strategies to attempt in order */
  strategies: ParseStrategy[];
}

/** Available parsing strategies */
export type ParseStrategy =
  | 'dom_heading'      // Extract from HTML headings (h1-h6)
  | 'readable_content' // Use readability-style content extraction
  | 'semantic_ai'      // Full AI semantic extraction
  | 'meta_tags'        // Extract from meta tags and og:* tags
  | 'json_ld'          // Extract from JSON-LD structured data
  | 'hybrid';          // Combine multiple strategies

/** Strategy result for comparison */
export interface StrategyResult {
  /** Strategy used */
  strategy: ParseStrategy;
  /** The parsed spec from this strategy */
  spec: Partial<HackathonSpec>;
  /** Confidence score */
  confidence: number;
  /** Fields extracted */
  fieldsExtracted: number;
  /** Fields missing */
  fieldsMissing: number;
  /** Time taken (ms) */
  timeMs: number;
}

export interface ExtractedSection {
  heading: string;
  text: string;
  textRaw: string;
  level: number;
  field: string;
  matchedKey: string;
}

export interface UniversalExtractedSections {
  title: string;
  tagline: string;
  description: string;
  themes: string;
  judgingCriteria: string;
  prizes: string;
  sponsors: string;
  rules: string;
  deliverables: string;
  timeline: string;
  resources: string;
  faq: string;
  team: string;
  workshops: string;
  metadata: string;
  rawSections: ExtractedSection[];
  [key: string]: string | ExtractedSection[];
}
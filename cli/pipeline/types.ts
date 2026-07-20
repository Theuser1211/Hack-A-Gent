import type { ExtractedField } from '../confidence.js';

export interface DevpostParseResult {
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  recommendedStack: string[];
  rawText: string;
  submissionRequirements: string[];
  /** Confidence levels for each extracted field. Original fields preserved for backward compatibility. */
  confidence: {
    title: ExtractedField<string>;
    judgingCriteria: ExtractedField<string[]>;
    deadlines: ExtractedField<Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }>>;
    sponsorAPIs: ExtractedField<string[]>;
    organizer: ExtractedField<string>;
    techStack: ExtractedField<string[]>;
    restrictions: ExtractedField<string[]>;
  };
}

// Phase 1: Competition Intelligence Types
export interface CompetitionAnalysis {
  analysisId: string;
  challenge: {
    title: string;
    problemStatement: string;
    theme: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedParticipants: number;
    organizer: string;
  };
  judgingCriteria: Array<{
    name: string;
    weight: number;
    weightRaw: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>;
  sponsorAPIs: Array<{
    name: string;
    provider: string;
    description: string;
    strategicValue: 'must_use' | 'should_use' | 'nice_to_have';
  }>;
  deliverables: Array<{
    description: string;
    format: string;
    required: boolean;
  }>;
  restrictions: string[];
  deadlines: Array<{
    label: string;
    date: string;
    type: 'submission' | 'judging' | 'demo';
  }>;
  /** Extraction confidence metadata — parallel to the fields above. All original fields preserved. */
  extractionConfidence?: {
    title: ExtractedField<string>;
    theme: ExtractedField<string>;
    difficulty: ExtractedField<string>;
    organizer: ExtractedField<string>;
    participants: ExtractedField<number>;
    judgingCriteria: ExtractedField<string[]>;
    sponsorAPIs: ExtractedField<string[]>;
    restrictions: ExtractedField<string[]>;
    deadlines: ExtractedField<Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }>>;
  };
}

// Phase 2: Winning Strategy Types
export interface WinningStrategy {
  projectName: string;
  oneLiner: string;
  whyScoreWell: string[];
  targetedCriteria: Array<{ name: string; weight: number; approach: string }>;
  prioritizedAPIs: string[];
  architecture: string;
  differentiators: string[];
  risks: Array<{ risk: string; mitigation: string }>;
  recommendedStack: string[];
  estimatedJudgeScore: number;
}

export interface FinalReport {
  challengeSummary: string;
  chosenStrategy: WinningStrategy;
  techStack: string[];
  generatedFeatures: string[];
  knownWeaknesses: string[];
  futureImprovements: string[];
  judgeScorePrediction: number;
  innovationScore: number;
  technicalDepthScore: number;
  feasibilityScore: number;
  presentationScore: number;
  completenessScore: number;
  maintainabilityScore: number;
  judgeAlignmentScore: number;
  qualityChecks: QualityCheck[];
}

export interface ReviewScore {
  innovation: number;
  technicalDepth: number;
  feasibility: number;
  presentation: number;
  completeness: number;
  maintainability: number;
  judgeAlignment: number;
  overall: number;
}

export interface ImprovementAction {
  category: string;
  action: string;
  expectedImpact: number;
  effortDays: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ReviewFeedback {
  strengths: string[];
  weaknesses: string[];
  improvementActions: ImprovementAction[];
  score: ReviewScore;
  iteration: number;
  maxIterations: number;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error: string | null;
  result: unknown | null;
}

export interface PipelineContext {
  analysis: CompetitionAnalysis | null;
  strategy: WinningStrategy | null;
  executionResult: {
    features: string[];
    errors: string[];
    deployUrl: string | null;
    taskCount: number;
    buildSuccess: boolean;
    testPassRate: number;
    criteriaCount: number;
    featureCount: number;
    errorCount: number;
    durationMs: number;
  } | null;
  reviewFeedback: ReviewFeedback | null;
  feedbackConverged: boolean;
  feedbackIterations: number;
  qualityChecks: QualityCheck[] | null;
  report: FinalReport | null;
  stages: Record<string, PipelineStage>;
  seed: number;
  startedAt: number;
}

export interface QualityCheck {
  check: string;
  passed: boolean;
  message: string;
  severity: 'required' | 'recommended' | 'optional';
}

export interface GeneratedFile {
  file: string;
  path: string;
}

export interface BenchmarkComparison {
  metric: string;
  oldValue: number | string;
  newValue: number | string;
  improvement: string;
  unit: string;
}

export interface PipelineBenchmarkResult {
  benchmarkName: string;
  category: string;
  oldPipeline: {
    promptSizeChars: number;
    generationTimeMs: number;
    errorCount: number;
    judgeScore: number | null;
    criteriaAnalyzed: number;
    improvementActions: number;
  };
  newPipeline: {
    promptSizeChars: number;
    generationTimeMs: number;
    errorCount: number;
    judgeScore: number | null;
    criteriaAnalyzed: number;
    improvementActions: number;
  };
  comparisons: BenchmarkComparison[];
}

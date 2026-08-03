/**
 * Hack-A-Gent — Next-Generation Modular Prompt Architecture Types
 *
 * Defines the structured context that flows through each pipeline stage.
 * Each stage receives only the context it needs, minimizing unnecessary
 * context bloat and making prompts easier to debug.
 */

import type {
  CompetitionAnalysis,
  WinningStrategy,
  TechnologyStack,
  UIDirection,
  FeaturePriority,
  RoadmapPhase,
} from '../pipeline/types.js';
import type { InterviewResult } from '../interview/types.js';
import type { CodeGenContext } from '../pipeline/strategy-adapter.js';

// ── Inline type aliases for CompetitionAnalysis sub-types ───────────────────

export type JudgingCriterion = NonNullable<CompetitionAnalysis['judgingCriteria']>[number];
export type SponsorAPI = NonNullable<CompetitionAnalysis['sponsorAPIs']>[number];

// ── Pipeline Stage Identifiers ─────────────────────────────────────────────

export type PromptStage =
  | 'meta_system'
  | 'hackathon_summary'
  | 'strategy_planning'
  | 'project_vision'
  | 'architecture_design'
  | 'plan_database'
  | 'plan_api'
  | 'plan_frontend'
  | 'plan_backend'
  | 'judging_alignment'
  | 'design_language'
  | 'feature_spec'
  | 'constraints'
  | 'output_schema'
  | 'generation';

// ── Component Definitions ──────────────────────────────────────────────────

export interface PromptComponent {
  id: string;
  priority: number;
  maxTokens: number;
  required: boolean;
  content: string;
}

export interface PromptSection {
  title: string;
  body: string;
  optional?: boolean;
}

export interface PromptAssembly {
  systemPrompt: string;
  userPrompt: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tokenCount: number;
  budget: number;
  withinBudget: boolean;
  warnings: string[];
  sections: PromptSection[];
}

// ── Multi-Stage Thinking Artifacts ───────────────────────────────────────────

export interface ComponentNode {
  name: string;
  type: 'page' | 'component' | 'layout' | 'hook' | 'provider' | 'middleware' | 'api';
  description: string;
  imports: string[];
  exports: string[];
}

export interface ComponentGraph {
  nodes: ComponentNode[];
  edges: Array<{ from: string; to: string; type: 'import' | 'extends' | 'composes' }>;
}

export interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  purpose: string;
  requestParams: string[];
  responseShape: string;
}

export interface APIGraph {
  baseUrl: string;
  endpoints: APIEndpoint[];
}

export interface DatabaseTable {
  name: string;
  purpose: string;
  columns: Array<{ name: string; type: string; key: boolean; relation?: string }>;
  indexes: string[];
}

export interface DatabaseSchema {
  tables: DatabaseTable[];
  seedData: boolean;
}

export interface UserFlowStep {
  name: string;
  description: string;
  components: string[];
}

export interface UserFlow {
  name: string;
  steps: UserFlowStep[];
}

// ── Context Types — each stage gets only what it needs ────────────────────

export interface MetaSystemContext {
  role: string;
  seed: number;
}

export interface HackathonSummaryContext {
  analysis: CompetitionAnalysis;
  extractionConfidence: NonNullable<CompetitionAnalysis['extractionConfidence']> | null;
}

export interface StrategyPlanningContext {
  analysis: CompetitionAnalysis;
  interviewResult?: InterviewResult;
  winningStrategy?: WinningStrategy;
}

export interface ProjectVisionContext {
  analysis: CompetitionAnalysis;
  interviewResult?: InterviewResult;
  winningStrategy?: WinningStrategy;
  vision: ProjectVision;
}

export interface ProjectVision {
  projectName: string;
  oneLiner: string;
  problemSolved: string;
  targetUsers: string[];
  keyFeatures: string[];
  techFeasibility: string;
  demoNarrative: string;
}

export interface ArchitectureDesignContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  interviewResult?: InterviewResult;
  architectureArtifacts: ArchitectureArtifacts;
}

export interface ArchitectureArtifacts {
  componentGraph: ComponentGraph;
  apiGraph: APIGraph;
  databaseSchema: DatabaseSchema;
  folderStructure: string;
  userFlows: UserFlow[];
}

export interface PlanDatabaseContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  dbSchema: DatabaseSchema;
}

export interface PlanAPIContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  apiGraph: APIGraph;
  dbSchema: DatabaseSchema;
}

export interface PlanFrontendContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  uiDirection: UIDirection;
  componentGraph: ComponentGraph;
}

export interface PlanBackendContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  apiGraph: APIGraph;
  dbSchema: DatabaseSchema;
}

export interface JudgingAlignmentContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  targetedCriteria: WinningStrategy['targetedCriteria'];
  prioritizedAPIs: string[];
}

export interface DesignLanguageContext {
  analysis: CompetitionAnalysis;
  uiDirection: UIDirection;
  theme: string;
  sponsorApis: SponsorAPI[];
}

export interface FeatureSpecContext {
  analysis?: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  fileType: 'scaffold' | 'frontend' | 'backend' | 'database' | 'config';
  specificTask?: string;
}

export interface ConstraintsContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  interviewResult?: InterviewResult;
  restrictions: string[];
}

export interface OutputSchemaContext {
  fileType: 'scaffold' | 'frontend' | 'backend' | 'database' | 'config';
  specificTask?: string;
  requiredTechs?: string[];
}

// ── Context Selection: minimal context for each sub-step ──────────────────

export interface FileContext {
  path: string;
  purpose: string;
  content?: string;
}

export interface NeighborFiles {
  component: FileContext;
  imports: FileContext[];
  tests: FileContext[];
}

// ── Root Prompt Context ────────────────────────────────────────────────────

export interface PromptContext {
  stage: PromptStage;
  seed: number;
  analysis: CompetitionAnalysis;
  strategy?: WinningStrategy;
  codeGenCtx?: CodeGenContext;
  interviewResult?: InterviewResult;
  uiDirection?: UIDirection;
  fileType?: OutputSchemaContext['fileType'];
  specificTask?: string;
  requiredTechs?: string[];
  architectureArtifacts?: ArchitectureArtifacts;
  projectVision?: ProjectVision;
}

/**
 * Hack-A-Gent — Modular Prompt Architecture Types
 *
 * Defines the structured context that flows through each pipeline stage.
 * Each stage receives only the context it needs, minimizing unnecessary
 * context bloat and making prompts easier to debug.
 */

import type { CompetitionAnalysis, WinningStrategy, TechnologyStack, UIDirection, FeaturePriority, RoadmapPhase } from '../pipeline/types.js';
import type { InterviewResult } from '../interview/types.js';
import type { CodeGenContext } from '../pipeline/strategy-adapter.js';

// ── Pipeline Stage Identifiers ─────────────────────────────────────────────

export type PromptStage =
  | 'hackathon_summary'
  | 'strategy_planning'
  | 'architecture_design'
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

// ── Context Types — each stage gets only what it needs ────────────────────

export interface HackathonSummaryContext {
  analysis: CompetitionAnalysis;
}

export interface StrategyPlanningContext {
  analysis: CompetitionAnalysis;
  interviewResult?: InterviewResult;
  winningStrategy?: WinningStrategy;
}

export interface ArchitectureContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
  codeGenCtx: CodeGenContext;
  interviewResult?: InterviewResult;
}

export interface JudgingAlignmentContext {
  analysis: CompetitionAnalysis;
  strategy: WinningStrategy;
}

export interface DesignLanguageContext {
  analysis: CompetitionAnalysis;
  uiDirection: UIDirection;
  theme: string;
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
}

export interface OutputSchemaContext {
  fileType: 'scaffold' | 'frontend' | 'backend' | 'database' | 'config';
  specificTask?: string;
  requiredTechs?: string[];
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
}

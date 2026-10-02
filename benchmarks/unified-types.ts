import type { PhaseResult } from './benchmark-types.js';
import type { ComplexityReport, ReductionPlan } from './complexity-collapse-map.js';
import type { DecisionTrace } from './decision-trace.js';
import type { DemoSurfacePlan } from './demo-surface-compiler.js';
import type { SimulationResult } from './hackathon-simulation-engine.js';
import type { ProjectSnapshot } from './organizational-memory-bank.js';
import type { Phase11Report } from './phase-11-orchestrator.js';
import type { Phase12Report } from './phase-12-orchestrator.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { TaskGraphSnapshot } from './task-graph.js';
import type { ToolCallRecord } from './tool-execution-gateway.js';

export type RuntimeMode = 'benchmark' | 'hackathon' | 'company' | 'research';

export interface RuntimeConfig {
  seed: number;
  workspaceRoot: string;
  stateDir: string;
  dataDir: string;
  mode: RuntimeMode;
  cliMode?: 'run' | 'demo' | 'simulate-only' | 'resume' | 'normal';
  verbose: boolean;
  autoSaveIntervalMs: number;
  maxRepairCycles: number;
  toolPermissions: ToolPermission[];
}

export interface ToolPermission {
  tool: string;
  allowed: boolean;
  requiresApproval: boolean;
}

export interface RuntimeInput {
  devpostUrl?: string;
  problemStatement?: string;
  repositoryInput?: string;
  modeOverride?: RuntimeMode;
  constraints?: string[];
  humanInstructions?: string[];
  executionHints?: string[];
  toolPermissions?: ToolPermission[];
  seedOverride?: number;
}

export interface RuntimeOutput {
  success: boolean;
  mode: RuntimeMode;
  finalState: RuntimeState;
  executionSummary: ExecutionSummary;
  artifacts: RuntimeArtifacts;
}

export interface ExecutionSummary {
  tasksCompleted: number;
  tasksTotal: number;
  deployments: number;
  browserTests: number;
  browserTestsPassed: number;
  mutations: number;
  repairs: number;
  decisionCount: number;
  durationMs: number;
  deployUrl: string | null;
}

export interface RuntimeArtifacts {
  githubRepo: string | null;
  deploymentUrl: string | null;
  report: Phase11Report | Phase12Report | Record<string, unknown> | null;
  snapshot: RuntimeSnapshot | null;
  demoSurfacePlan?: DemoSurfacePlan | Record<string, unknown>;
  simulationResult?: SimulationResult | Record<string, unknown>;
  complexityReport?: ComplexityReport | Record<string, unknown>;
  reductionPlan?: ReductionPlan | Record<string, unknown>;
}

export interface RuntimeState {
  mode: RuntimeMode;
  globalTaskGraph: TaskGraphSnapshot | null;
  memoryBank: { totalProjects: number; snapshots: ProjectSnapshot[] };
  decisionLog: DecisionTrace[];
  toolLog: ToolExecutionRecord[];
  mutationHistory: MutationRecord[];
  deploymentHistory: DeploymentRecord[];
  currentExecutionPointer: ExecutionPointer;
  paused: boolean;
  activeSubsystem: string;
  checkpointVersion: number;
  errors: string[];
}

export interface ExecutionPointer {
  currentPhase: string;
  currentStepIndex: number;
  completedSteps: string[];
  failedSteps: string[];
  blockedSteps: string[];
}

export interface ToolExecutionRecord {
  recordId: string;
  toolType: string;
  action: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  success: boolean;
  durationMs: number;
  timestamp: string;
  error: string | null;
}

export interface MutationRecord {
  mutationId: string;
  mutationType: string;
  severity: string;
  moduleTarget: string;
  fileTarget: string | null;
  intensity: number;
  detected: boolean;
  repaired: boolean;
  timestamp: string;
}

export interface DeploymentRecord {
  deploymentId: string;
  target: string;
  url: string | null;
  status: string;
  attempts: number;
  errors: string[];
  timestamp: string;
}

export interface RuntimeSnapshot {
  snapshotId: string;
  version: string;
  state: RuntimeState;
  config: RuntimeConfig;
  createdAt: string;
}

export interface SystemStatus {
  mode: RuntimeMode;
  uptimeMs: number;
  paused: boolean;
  activeSubsystem: string;
  tasks: { total: number; completed: number; running: number; blocked: number; pending: number };
  memory: { heapMB: number; rssMB: number };
  projects: number;
  decisions: number;
  toolCalls: number;
  mutations: number;
  deployments: number;
  checkpointVersion: number;
  errors: number;
}

export interface ExecutionStep {
  stepId: string;
  description: string;
  subsystem: string;
  dependsOn: string[];
  estimatedDurationMs: number;
}

export interface MemoryState {
  totalProjects: number;
  snapshots: ProjectSnapshot[];
}

import type { ComplexityReport, ReductionPlan } from '../benchmarks/complexity-collapse-map.js';
import type { DecisionTrace } from '../benchmarks/decision-trace.js';
import type { DemoSurfacePlan, FinalDemoOutput } from '../benchmarks/demo-surface-compiler.js';
import type { ExecutionPolicy } from '../benchmarks/execution-policy-optimizer.js';
import type { SimulationResult } from '../benchmarks/hackathon-simulation-engine.js';
import type { InternetHackathonOrchestrator } from '../benchmarks/internet-hackathon-orchestrator.js';
import type { OrganizationalMemoryBank } from '../benchmarks/organizational-memory-bank.js';
import type { Phase12Orchestrator, Phase12Report } from '../benchmarks/phase-12-orchestrator.js';
import type { ProjectStateSnapshot } from '../benchmarks/remote-project-state.js';
import type { SkillRecord } from '../benchmarks/skill-graph.js';
import type { TaskGraphSnapshot } from '../benchmarks/task-graph.js';

export type CommandName =
  | 'run'
  | 'resume'
  | 'status'
  | 'memory'
  | 'benchmark'
  | 'replay'
  | 'deploy'
  | 'test'
  | 'explain'
  | 'health'
  | 'chat'
  | 'help'
  | 'simulate'
  | 'hack-agent'
  | 'config'
  | 'setup';

export interface CLIArgs {
  command: CommandName;
  subcommand?: string;
  positional: string[];
  flags: Record<string, string | number | boolean | undefined>;
}

export interface CLIResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  traceId?: string;
  metrics?: Record<string, number>;
  durationMs?: number;
}

export interface CLIExecutionState {
  projectId: string | null;
  phase: string;
  startedAt: string;
  taskGraphSnapshot: TaskGraphSnapshot | null;
  decisionLog: DecisionTrace[];
  errors: string[];
  currentPhase: string;
  blockedDependencies: string[];
  activeAgents: number;
  deploymentUrl: string | null;
  browserTestStatus: string | null;
  repairCycles: number;
}

export interface CLIContext {
  seed: number;
  workspaceRoot: string;
  stateDir: string;
  dataDir: string;
  config: Record<string, unknown>;
  orchestrator: InternetHackathonOrchestrator | null;
  phase12orchestrator: Phase12Orchestrator | null;
  memory: OrganizationalMemoryBank;
  startTime: number;
  outputFormat: 'pretty' | 'json' | 'quiet';
  verbose: boolean;
  dryRun: boolean;
  decisionLog: DecisionTrace[];
  demoSurfacePlan?: DemoSurfacePlan | null;
  simulationResult?: SimulationResult | null;
  complexityReport?: ComplexityReport | null;
  reductionPlan?: ReductionPlan | null;
  finalDemoOutput?: FinalDemoOutput | null;
}

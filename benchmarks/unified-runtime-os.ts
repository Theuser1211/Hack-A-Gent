import { applyMutations } from './mutation-engine.js';
import { EvaluationOrchestrator } from './evaluation-orchestrator.js';
import { generateBenchmarkSummaryMarkdown } from './benchmark-report.js';
import { CapabilityEvolutionEngine } from './capability-evolution-engine.js';
import { packagePaperData, exportPaperDataJson } from './paper-exporter.js';

// Phase 13.5 — Production Autonomy Hardening
import type { GoalState } from './global-goal-monitor.js';
import { ExecutionConvergenceEngine } from './execution-convergence-engine.js';
import type { ConvergenceReport } from './execution-convergence-engine.js';
import { FailureResilienceLayer } from './failure-resilience-layer.js';
import type { RetryPolicy } from './failure-resilience-layer.js';
import { MultiStrategyExecutionEngine } from './multi-strategy-execution-engine.js';
import type { MultiStrategyResult } from './multi-strategy-execution-engine.js';
import { UserFeedbackInjectionLoop } from './user-feedback-injection-loop.js';
import type { UserFeedback } from './user-feedback-injection-loop.js';
import { SandboxExecutionMode } from './sandbox-execution-mode.js';
import type { SandboxReport } from './sandbox-execution-mode.js';

// Taste & Simplicity Governor — highest-level execution filter
import { TasteGovernor } from './taste-governor.js';
import type { TasteVerdict, FeatureProposal } from './taste-governor.js';

// Demo Surface Compiler — hackathon-winning demo machine
import { DemoSurfaceCompiler } from './demo-surface-compiler.js';
import type { DemoSurfacePlan, FinalDemoOutput } from './demo-surface-compiler.js';

// Hackathon Simulation Engine — predict before building
import { HackathonSimulationEngine } from './hackathon-simulation-engine.js';
import type { SimulationResult } from './hackathon-simulation-engine.js';

// Judge Simulator
import { JudgeSimulator } from './judge-simulator.js';
import type { JudgeVerdict } from './judge-simulator.js';

// Winning Strategy Templates
import { WINNING_STRATEGIES } from './winning-strategy-templates.js';
import type { StrategyTemplate } from './winning-strategy-templates.js';

// Complexity Collapse Map
import { ComplexityCollapseEngine } from './complexity-collapse-map.js';
import type { ComplexityReport, ReductionPlan } from './complexity-collapse-map.js';
import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { DeploymentRepairController } from './deployment-repair-controller.js';
import {
  createDeterministicUuid,
  deterministicNow,
  getSeededRandom,
  initializeGlobalRNG,
  nextTraceCounter,
} from './determinism-kernel.js';
import { DevpostIngestionLayer, type ParsedHackathonSpec } from './devpost-ingestion-layer.js';

// Phase 16 — Execution Control Layer
import {
  ExecutionBudgetManager,
  type BudgetUsage,
  type ExecutionBudgetReport,
  ExecutionBudgetExceededError,
} from './execution-budget-manager.js';
import { ExecutionStabilityGuard, type StabilityReport, type GuardEvent } from './execution-stability-guard.js';
import { FailureContainmentLayer, type ContainmentReport, type ContainmentZone } from './failure-containment-layer.js';
import { GlobalExecutionBrain } from './global-execution-brain.js';
import { GlobalGoalMonitor } from './global-goal-monitor.js';
import { GlobalMemoryIndex, type GlobalMemoryQueryResult } from './global-memory-index.js';
import { HackathonBenchmarkRunner, type BenchmarkRunnerConfig } from './hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from './hackathon-benchmarks.js';
import { InternetHackathonOrchestrator } from './internet-hackathon-orchestrator.js';
import { InterruptProtocol, type InterruptQuestion } from './interrupt-protocol.js';
import { LiveBrowserTestAgent } from './live-browser-test-agent.js';
import { ObservabilityLayer, type FullExecutionReport } from './observability-layer.js';
import type { ProjectSnapshot } from './organizational-memory-bank.js';
import { Phase11Orchestrator } from './phase-11-orchestrator.js';
import type { Phase11Report } from './phase-11-orchestrator.js';
import { Phase12Orchestrator } from './phase-12-orchestrator.js';
import type { Phase12Report } from './phase-12-orchestrator.js';
import { RemoteProjectState } from './remote-project-state.js';
import { StrategicPlanner } from './strategic-planner.js';
import { TaskGraph, type TaskGraphSnapshot } from './task-graph.js';
import { ToolExecutionGateway, type ToolCallRecord } from './tool-execution-gateway.js';
import type {
  RuntimeConfig,
  RuntimeInput,
  RuntimeOutput,
  RuntimeState,
  RuntimeMode,
  RuntimeSnapshot,
  SystemStatus,
  ExecutionPointer,
  ExecutionStep,
  ToolPermission,
  MutationRecord,
  DeploymentRecord,
} from './unified-types.js';
import { UXEvaluationAgent } from './ux-evaluation-agent.js';

const RUNTIME_VERSION = '1.0.0';

const DEFAULT_CONFIG: RuntimeConfig = {
  seed: 42,
  workspaceRoot: process.cwd(),
  stateDir: '.hackagent/state',
  dataDir: '.hackagent/data',
  mode: 'hackathon',
  verbose: false,
  autoSaveIntervalMs: 5000,
  maxRepairCycles: 3,
  toolPermissions: [],
};

export class UnifiedRuntimeOS {
  private readonly config: RuntimeConfig;
  private readonly runtimeId: string;

  private state: RuntimeState;
  private input: RuntimeInput | null = null;
  private parsedInput: ParsedHackathonSpec | null = null;

  // Subsystems
  private readonly devpostIngestion: DevpostIngestionLayer;
  readonly globalMemory: GlobalMemoryIndex;
  readonly toolGateway: ToolExecutionGateway;
  readonly interruptProtocol: InterruptProtocol;
  readonly observability: ObservabilityLayer;
  readonly decisionLogger: DecisionLogger;
  readonly taskGraph: TaskGraph;

  // Mode-specific subsystems (lazy-init)
  private benchmarkRunner: HackathonBenchmarkRunner | null = null;
  private internetOrch: InternetHackathonOrchestrator | null = null;
  private companyOrch: Phase11Orchestrator | null = null;
  private phase12Orch: Phase12Orchestrator | null = null;
  private strategicPlanner: StrategicPlanner | null = null;
  private globalBrain: GlobalExecutionBrain | null = null;
  private uxAgent: UXEvaluationAgent | null = null;
  private evolutionEngine: CapabilityEvolutionEngine | null = null;
  private deployRepair: DeploymentRepairController | null = null;
  private browserAgent: LiveBrowserTestAgent | null = null;

  // Phase 13.5 subsystems
  readonly goalMonitor: GlobalGoalMonitor;
  readonly convergenceEngine: ExecutionConvergenceEngine;
  readonly resilienceLayer: FailureResilienceLayer;
  readonly strategyEngine: MultiStrategyExecutionEngine;
  readonly feedbackLoop: UserFeedbackInjectionLoop;
  readonly sandboxMode: SandboxExecutionMode;

  // Taste & Simplicity Governor
  readonly tasteGovernor: TasteGovernor;

  // Demo Surface Compiler
  readonly demoSurfaceCompiler: DemoSurfaceCompiler;
  private demoSurfacePlan: DemoSurfacePlan | null = null;
  private finalDemoOutput: FinalDemoOutput | null = null;

  // Hackathon Simulation Engine
  readonly simulationEngine: HackathonSimulationEngine;
  private simulationResult: SimulationResult | null = null;

  // Judge Simulator
  readonly judgeSimulator: JudgeSimulator;

  // Complexity Collapse
  readonly complexityCollapse: ComplexityCollapseEngine;
  private complexityReport: ComplexityReport | null = null;
  private reductionPlan: ReductionPlan | null = null;

  // Phase 16 — Execution Control Layer
  readonly budgetManager: ExecutionBudgetManager;
  readonly stabilityGuard: ExecutionStabilityGuard;
  readonly failureContainment: FailureContainmentLayer;
  private budgetReport: ExecutionBudgetReport | null = null;
  private stabilityReport: StabilityReport | null = null;
  private containmentReport: ContainmentReport | null = null;

  constructor(config?: Partial<RuntimeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.runtimeId = 'runtime-' + createDeterministicUuid(this.config.seed, 0).slice(0, 8);

    initializeGlobalRNG(this.config.seed);

    this.state = this.createInitialState();
    this.decisionLogger = new DecisionLogger(this.config.seed + 5000);
    this.devpostIngestion = new DevpostIngestionLayer(this.config.seed + 5010);
    this.globalMemory = new GlobalMemoryIndex(this.config.seed + 5020);
    this.toolGateway = new ToolExecutionGateway(this.config.seed + 5030);
    this.interruptProtocol = new InterruptProtocol(this.config.seed + 5040);
    this.observability = new ObservabilityLayer(this.config.seed + 5050);
    this.taskGraph = new TaskGraph('global-' + this.runtimeId, this.config.seed + 5060);

    // Phase 13.5 subsystems
    this.goalMonitor = new GlobalGoalMonitor(this.config.seed + 6000);
    this.convergenceEngine = new ExecutionConvergenceEngine(this.config.seed + 7000);
    this.resilienceLayer = new FailureResilienceLayer(this.config.seed + 8000);
    this.strategyEngine = new MultiStrategyExecutionEngine(this.config.seed + 9000);
    this.feedbackLoop = new UserFeedbackInjectionLoop(this.config.seed + 10000);
    this.sandboxMode = new SandboxExecutionMode(this.config.seed + 11000);

    // Taste & Simplicity Governor — highest-level filter above all systems
    this.tasteGovernor = new TasteGovernor(this.config.seed + 12000);

    // Demo Surface Compiler — win condition engine for demo mode
    this.demoSurfaceCompiler = new DemoSurfaceCompiler(this.config.seed + 13000);

    // Hackathon Simulation Engine — predict before building
    this.simulationEngine = new HackathonSimulationEngine(this.config.seed + 14000);

    // Judge Simulator — real judge bias model
    this.judgeSimulator = new JudgeSimulator({ seed: this.config.seed + 15000 });

    // Complexity Collapse — system reduction analysis
    this.complexityCollapse = new ComplexityCollapseEngine(this.config.seed + 16000);

    // Phase 16 — Execution Control Layer
    this.budgetManager = new ExecutionBudgetManager(this.config.seed + 17000);
    this.stabilityGuard = new ExecutionStabilityGuard(this.config.seed + 18000);
    this.failureContainment = new FailureContainmentLayer(this.config.seed + 19000);

    this.observability.start();
  }

  // ---- Public API ----

  async run(input: RuntimeInput): Promise<RuntimeOutput> {
    this.input = input;
    if (input.seedOverride) this.config.seed = input.seedOverride;
    if (input.modeOverride) this.switchMode(input.modeOverride);
    if (input.toolPermissions) this.config.toolPermissions = input.toolPermissions;

    this.state.currentExecutionPointer = {
      currentPhase: 'ingestion',
      currentStepIndex: 0,
      completedSteps: [],
      failedSteps: [],
      blockedSteps: [],
    };

    const startTime = Date.now();
    this.observability.trace('checkpoint', 'Runtime execution started', {
      mode: this.state.mode,
      seed: this.config.seed,
      input: this.summarizeInput(input),
    });

    try {
      // 1. Ingestion
      await this.runIngestion(input);

      // 2. Memory consultation
      await this.runMemoryConsultation();

      // 3. Taste Governor validation (after ingestion + memory, before strategy/execution)
      const tasteVerdict = await this.runTasteGovernorValidation();

      // 4. Demo Surface Compilation — collapses everything into single winning demo path
      await this.runDemoSurfaceCompilation();

      // 4a. Simulation preview — predict judge score BEFORE building
      await this.runSimulationPreview();

      // 4b. Complexity collapse — analyze system reduction opportunities
      await this.runComplexityCollapse();

      // 5. Strategy competition (Phase 12) — bypassed if demo surface plan is active
      const phase12Report = this.demoSurfacePlan
        ? await this.runSkippedPhase('strategy_competition', 'Bypassed by Demo Surface Compiler')
        : await this.runStrategyCompetition();

      // 6. Phase 13.5 — Multi-strategy generation (bypassed in demo mode)
      const strategyResult = this.demoSurfacePlan
        ? await this.runSkippedPhase('phase13_strategy', 'Bypassed by Demo Surface Compiler')
        : await this.runPhase13StrategyGeneration(phase12Report);

      // 7. Build global execution plan — uses demo surface plan if present
      await this.buildExecutionPlan(tasteVerdict);

      // 8. Phase 13.5 — Sandbox simulation (bypassed in demo mode)
      await (this.demoSurfacePlan
        ? this.runSkippedPhase('sandbox_simulation', 'Bypassed by Demo Surface Compiler')
        : this.runSandboxSimulation(strategyResult));

      // 9. Mode-specific execution — gated by taste governor, guided by demo surface plan
      const executionResult = await this.runExecutionLoop();

      // 10. Phase 13.5 — Convergence evaluation (bypassed in demo mode)
      const convergenceReport = this.demoSurfacePlan
        ? await this.runSkippedPhase('convergence_check', 'Bypassed by Demo Surface Compiler')
        : await this.runConvergenceCheck(executionResult);

      // 11. Phase 13.5 — Process any queued feedback
      await this.runFeedbackProcessing();

      // 12. Post-project learning
      if (this.state.mode !== 'research') {
        await this.runPostProjectLearning(phase12Report);
      }

      // 12. Save final state
      this.state.currentExecutionPointer.currentPhase = 'complete';
      this.state.currentExecutionPointer.completedSteps.push('complete');
      this.observability.recordStateSnapshot(this.state);

      const elapsed = Date.now() - startTime;
      const summary = this.buildExecutionSummary(elapsed);
      const output: RuntimeOutput = {
        success: true,
        mode: this.state.mode,
        finalState: { ...this.state },
        executionSummary: summary,
        artifacts: {
          githubRepo: executionResult?.githubRepo ?? null,
          deploymentUrl: executionResult?.deployUrl ?? null,
          report: (executionResult?.report ?? phase12Report ?? null) as
            | Record<string, unknown>
            | Phase11Report
            | Phase12Report
            | null,
          snapshot: this.snapshot(),
          demoSurfacePlan: this.demoSurfacePlan ?? undefined,
          simulationResult: this.simulationResult ?? undefined,
          complexityReport: this.complexityReport ?? undefined,
          reductionPlan: this.reductionPlan ?? undefined,
        },
      };

      this.observability.trace('checkpoint', 'Runtime execution completed', {
        durationMs: elapsed,
        success: true,
        mode: this.state.mode,
      });

      return output;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      this.state.errors.push(msg);
      this.observability.recordError(msg, { mode: this.state.mode });

      this.state.currentExecutionPointer.currentPhase = 'failed';
      this.state.currentExecutionPointer.failedSteps.push(msg);

      return {
        success: false,
        mode: this.state.mode,
        finalState: { ...this.state },
        executionSummary: this.buildExecutionSummary(elapsed),
        artifacts: {
          githubRepo: null,
          deploymentUrl: null,
          report: null,
          snapshot: this.snapshot(),
          demoSurfacePlan: this.demoSurfacePlan ?? undefined,
          simulationResult: this.simulationResult ?? undefined,
          complexityReport: this.complexityReport ?? undefined,
          reductionPlan: this.reductionPlan ?? undefined,
        },
      };
    }
  }

  pause(): void {
    this.state.paused = true;
    this.observability.trace('checkpoint', 'Runtime paused', {
      phase: this.state.currentExecutionPointer.currentPhase,
    });
  }

  resume(): void {
    this.state.paused = false;
    this.observability.trace('checkpoint', 'Runtime resumed', {
      phase: this.state.currentExecutionPointer.currentPhase,
    });
  }

  snapshot(): RuntimeSnapshot {
    const snapshot: RuntimeSnapshot = {
      snapshotId: 'snap-' + createDeterministicUuid(this.config.seed, nextTraceCounter()).slice(0, 8),
      version: RUNTIME_VERSION,
      state: JSON.parse(JSON.stringify(this.state)),
      config: { ...this.config },
      createdAt: deterministicNow(this.config.seed),
    };
    this.observability.trace('checkpoint', 'Runtime snapshot created', {
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
    });
    return snapshot;
  }

  restore(snapshot: RuntimeSnapshot): void {
    this.state = JSON.parse(JSON.stringify(snapshot.state));
    this.observability.trace('checkpoint', 'Runtime restored from snapshot', {
      snapshotId: snapshot.snapshotId,
      version: snapshot.version,
    });
  }

  switchMode(mode: RuntimeMode): void {
    const prev = this.state.mode;
    this.state.mode = mode;
    this.observability.trace('state_transition', `Mode switch: ${prev} -> ${mode}`, { prev, mode });
  }

  getSystemStatus(): SystemStatus {
    const progress = this.taskGraph.getProgress();
    const memUsage = process.memoryUsage();
    return {
      mode: this.state.mode,
      uptimeMs: this.observability.getUptimeMs(),
      paused: this.state.paused,
      activeSubsystem: this.state.activeSubsystem,
      tasks: {
        total: progress.total,
        completed: progress.done,
        running: progress.running,
        blocked: progress.blocked,
        pending: progress.pending,
      },
      memory: {
        heapMB: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
        rssMB: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
      },
      projects: this.globalMemory.getSnapshotCount(),
      decisions: this.decisionLogger.getAll().length,
      toolCalls: this.toolGateway.getCallLog().length,
      mutations: this.state.mutationHistory.length,
      deployments: this.state.deploymentHistory.length,
      checkpointVersion: this.state.checkpointVersion,
      errors: this.state.errors.length,
    };
  }

  getState(): RuntimeState {
    return { ...this.state };
  }
  getConfig(): RuntimeConfig {
    return { ...this.config };
  }
  getRuntimeId(): string {
    return this.runtimeId;
  }
  getPhase12Orch(): Phase12Orchestrator | null {
    return this.phase12Orch;
  }

  getFullExecutionReport(): FullExecutionReport {
    return this.observability.exportFullExecutionReport(
      this.state.mode,
      this.decisionLogger.getAll(),
      this.state.toolLog,
      this.state.deploymentHistory,
      this.state.mutationHistory,
      this.state,
    );
  }

  // ---- CLI Hooks & Execution Gating ----

  /**
   * Accept CLI mode and configure execution gating accordingly.
   * - 'simulate-only': blocks ToolExecutionGateway (no side effects)
   * - 'demo': runs ComplexityCollapseEngine only, no execution
   * - 'resume': skips initialization, continues from snapshot
   * - 'run': normal full pipeline
   */
  handleCLIInput(cliMode: string, input: RuntimeInput): void {
    this.config.cliMode = cliMode as RuntimeConfig['cliMode'];
    this.input = input;

    if (cliMode === 'simulate-only') {
      // Block all tool execution — no deploy, no git, no file writes
      this.config.toolPermissions = [];
      this.observability.trace('decision', 'CLI mode: simulate-only — tool execution blocked', {});
    }

    if (cliMode === 'demo') {
      this.observability.trace('decision', 'CLI mode: demo — complexity collapse + compilation only', {});
    }

    if (cliMode === 'resume') {
      this.observability.trace('decision', 'CLI mode: resume — continuing from snapshot', {});
    }

    this.decisionLogger.log('planner', `cli_mode_${cliMode}`, `CLI mode set to: ${cliMode}`, 1.0, [], {});
  }

  /**
   * Validate simulation result before allowing execution.
   * Returns gate decision: canProceed + reason if blocked.
   */
  validateSimulationBeforeExecution(simulationResult: {
    finalJudgeVerdict: { total: number };
    failureTimeline: unknown[];
  }): { canProceed: boolean; reason?: string } {
    const score = simulationResult.finalJudgeVerdict.total;
    const failures = simulationResult.failureTimeline.length;

    if (this.config.cliMode === 'simulate-only') {
      return { canProceed: false, reason: 'simulate-only mode: tool execution is blocked by CLI gate' };
    }

    if (score < 40) {
      return { canProceed: false, reason: `Simulation score ${score}/100 is below minimum threshold (40).` };
    }

    if (failures > 10) {
      return { canProceed: false, reason: `Too many predicted failures (${failures}) — execution blocked.` };
    }

    if (score < 75 && this.config.cliMode === 'run') {
      return { canProceed: true, reason: `Score ${score}/100 is below 75 — proceed with caution.` };
    }

    return { canProceed: true };
  }

  /**
   * Check if tool execution should be gated (suppressed) based on CLI mode.
   */
  isExecutionGated(cliMode?: string): boolean {
    const mode = cliMode ?? this.config.cliMode ?? '';
    return mode === 'simulate-only';
  }

  /**
   * Get the current CLI mode.
   */
  getCLIMode(): string {
    return this.config.cliMode ?? 'normal';
  }

  // ---- No Overbuild Policy (Phase 16) ----

  /**
   * Check if new features should be added based on simulation results.
   * Rule: If simulation already produces high score with clear winning strategy — DO NOT add new features.
   */
  shouldAddNewFeatures(simulationScore: number, hasClearWinner: boolean): boolean {
    if (simulationScore >= 80 && hasClearWinner) {
      this.decisionLogger.log(
        'planner',
        'no_overbuild_feature_block',
        `No-overbuild policy: score ${simulationScore} — 80 with clear winner — blocking new features`,
        1.0,
        [],
        {},
      );
      return false;
    }
    return true;
  }

  /**
   * Activate minimal viable demo mode when time budget is low.
   */
  isTimeBudgetLow(): boolean {
    const elapsed = this.observability.getUptimeMs();
    const maxTimeMs = 12 * 60 * 60 * 1000; // 12 hour hackathon limit
    return elapsed > maxTimeMs * 0.8; // 80% of time used
  }

  /**
   * Check if complexity exceeds threshold and auto-activate ComplexityCollapseEngine.
   */
  checkComplexityOverbuild(): {
    overbuilt: boolean;
    action: string;
  } {
    const graphNodes = this.taskGraph.getAllNodes().length;
    const toolCalls = this.toolGateway.getCallLog().length;

    // Simple heuristic: if task graph has too many nodes or too many tool calls
    const complexityThreshold = 30; // max nodes before overbuild
    const toolCallThreshold = 50; // max tool calls before overbuild

    if (graphNodes > complexityThreshold || toolCalls > toolCallThreshold) {
      const complexityReport = this.complexityCollapse.analyzeGraph();
      this.complexityReport = complexityReport;

      this.decisionLogger.log(
        'planner',
        'complexity_overbuild_detected',
        `No-overbuild: ${graphNodes} nodes, ${toolCalls} tool calls exceeds threshold — complexity collapse activated`,
        0.3,
        [],
        {
          removable: complexityReport.removableModules.length,
          mergeCandidates: complexityReport.mergeCandidates.length,
        },
      );

      return {
        overbuilt: true,
        action: `ComplexityCollapseEngine activated: ${complexityReport.removableModules.length} removable modules, ${complexityReport.mergeCandidates.length} merge candidates`,
      };
    }

    return { overbuilt: false, action: 'within limits' };
  }

  // ---- Execution Control Layer Hooks ----

  /**
   * Run budget check before any action. Throws if exceeded.
   */
  checkBudgetBeforeAction(action: keyof BudgetUsage): void {
    try {
      this.budgetManager.checkAction(action);
    } catch (e) {
      if (e instanceof ExecutionBudgetExceededError) {
        this.observability.trace('decision', `Budget exceeded: ${action}`, {
          violations: e.violations.map((v) => `${v.category}: ${v.actual}/${v.limit}`),
        });
        this.state.errors.push(e.message);
      }
      throw e;
    }
  }

  /**
   * Check stability guard before repair cycle.
   */
  checkRepairStability(scoreBefore: number, scoreAfter: number): boolean {
    const result = this.stabilityGuard.recordRepairCycle(scoreBefore, scoreAfter);
    if (result.action === 'stop' || result.action === 'fail_fast') {
      this.observability.trace('decision', 'Repair saturation — stopping repairs', {
        cycles: result.cycles,
        maxCycles: result.maxCycles,
      });
      return false;
    }
    return true;
  }

  /**
   * Check deployment protection.
   */
  checkDeployProtection(scoreBeforeDeploy: number): boolean {
    const result = this.stabilityGuard.recordDeploy(scoreBeforeDeploy);
    if (!result.allowed) {
      this.observability.trace('decision', 'Deploy protection — blocked', {
        count: result.currentDeployCount,
        max: result.maxDeploys,
      });
    }
    return result.allowed;
  }

  /**
   * Get full Phase 16 control layer report.
   */
  getControlLayerReport(): {
    budget: ExecutionBudgetReport;
    stability: StabilityReport;
    containment: ContainmentReport;
    overbuild: { overbuilt: boolean; action: string };
  } {
    return {
      budget: this.budgetManager.checkAll(),
      stability: this.stabilityGuard.getReport(),
      containment: this.failureContainment.getReport(),
      overbuild: this.checkComplexityOverbuild(),
    };
  }

  // ---- Internal Pipeline Steps ----

  private async runIngestion(input: RuntimeInput): Promise<ParsedHackathonSpec> {
    this.state.activeSubsystem = 'ingestion';
    this.state.currentExecutionPointer.currentPhase = 'ingestion';

    let spec: ParsedHackathonSpec | null = null;

    if (input.devpostUrl) {
      this.observability.trace('decision', 'Ingesting Devpost URL', { url: input.devpostUrl });
      spec = await this.devpostIngestion.parse(input.devpostUrl, 'devpost_url');
    } else if (input.repositoryInput) {
      spec = await this.devpostIngestion.parse(input.repositoryInput, 'file');
    } else if (input.problemStatement) {
      spec = await this.devpostIngestion.parse(input.problemStatement, 'text');
    }

    if (!spec) {
      throw new Error('No valid input provided. Provide devpostUrl, problemStatement, or repositoryInput.');
    }

    const ambiguityQuestions = this.interruptProtocol.detectAmbiguity(spec.problemStatement, {
      judgingCriteria: spec.judgingCriteria,
      constraints: input.constraints ?? spec.constraints,
    });

    if (ambiguityQuestions.length > 0) {
      this.interruptProtocol.raiseInterrupt('ambiguity', ambiguityQuestions, this.snapshot());
      this.interruptProtocol.resolveInterrupt(
        ambiguityQuestions.map((q) => ({
          questionId: q.questionId,
          answer: q.options ? q.options[0]! : spec!.problemStatement.slice(0, 100),
        })),
      );
    }

    if (input.constraints) {
      spec.constraints = [...new Set([...spec.constraints, ...input.constraints])];
    }

    this.parsedInput = spec;
    this.state.currentExecutionPointer.completedSteps.push('ingestion');

    this.decisionLogger.log('planner', 'ingestion_complete', `Ingested: ${spec.title}`, 0.9, [], {
      criteria: spec.judgingCriteria,
      constraints: spec.constraints,
      techStack: spec.techStackHints,
    });

    return spec;
  }

  private async runMemoryConsultation(): Promise<GlobalMemoryQueryResult> {
    this.state.activeSubsystem = 'memory';
    this.state.currentExecutionPointer.currentPhase = 'memory_consult';

    if (!this.parsedInput) throw new Error('No parsed input for memory consultation');

    const queryText = `${this.parsedInput.title} ${this.parsedInput.problemStatement} ${this.parsedInput.techStackHints.join(' ')}`;
    const memoryResult = this.globalMemory.querySimilar(queryText, 5);

    if (memoryResult.snapshots.length > 0) {
      this.observability.trace('memory', `Found ${memoryResult.snapshots.length} similar projects`, {
        similarity: memoryResult.similarity,
      });
      this.decisionLogger.log(
        'planner',
        'memory_consult',
        `Found ${memoryResult.snapshots.length} similar projects (sim=${(memoryResult.similarity * 100).toFixed(0)}%)`,
        memoryResult.similarity,
        [],
        { projects: memoryResult.snapshots.map((s) => s.projectName) },
      );
    }

    this.state.currentExecutionPointer.completedSteps.push('memory_consult');
    return memoryResult;
  }

  private async runStrategyCompetition(): Promise<Phase12Report | null> {
    if (this.state.mode === 'research') return null;

    this.state.activeSubsystem = 'strategy';
    this.state.currentExecutionPointer.currentPhase = 'strategy_competition';

    if (!this.parsedInput) throw new Error('No parsed input for strategy');

    this.phase12Orch = new Phase12Orchestrator(this.config.seed + 100);

    const report = await this.phase12Orch.runProject({
      title: this.parsedInput.title,
      problemStatement: this.parsedInput.problemStatement,
      judgingCriteria: this.parsedInput.judgingCriteria,
      constraints: this.parsedInput.constraints,
      techStack: this.parsedInput.techStackHints,
      preferredStack: this.parsedInput.techStackHints,
    });

    this.decisionLogger.log(
      'strategy',
      'strategy_complete',
      `Winner: ${report.strategyCompetition.winner.name}`,
      0.85,
      [],
      { winner: report.strategyCompetition.winner.name, candidates: report.strategyCompetition.candidates.length },
    );

    this.state.currentExecutionPointer.completedSteps.push('strategy_competition');
    return report;
  }

  private async runTasteGovernorValidation(): Promise<TasteVerdict | null> {
    if (!this.parsedInput || this.state.mode === 'research') return null;

    this.state.activeSubsystem = 'taste_governor';
    this.state.currentExecutionPointer.currentPhase = 'taste_validation';

    const proposal: FeatureProposal = {
      name: this.parsedInput.title,
      description: `${this.parsedInput.problemStatement.slice(0, 200)} Criteria: ${this.parsedInput.judgingCriteria.join(', ')}`,
      category: 'feature',
      visibleInDemo: true,
      improvesDemoFlow: true,
      reducesFailureRisk: true,
      improvesSpeed: false,
      addsNewAbstractionLayer: this.parsedInput.constraints.length > 5,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: false,
      estimatedJudgeGraspSeconds: this.parsedInput.judgingCriteria.length > 5 ? 90 : 30,
    };

    const verdict = this.tasteGovernor.evaluateTaste(proposal);

    if (!verdict.approved && this.state.mode !== 'hackathon') {
      this.decisionLogger.log(
        'planner',
        'taste_rejected',
        `Taste Governor rejected: ${verdict.rejectionReason}`,
        0.2,
        [],
        { score: verdict.score.total, suggestions: verdict.suggestions },
      );
    }

    this.observability.trace('decision', 'Taste Governor validation', {
      approved: verdict.approved,
      score: verdict.score.total,
      demoImpact: verdict.demoImpact,
    });

    this.state.currentExecutionPointer.completedSteps.push('taste_validation');
    return verdict;
  }

  private async runDemoSurfaceCompilation(): Promise<DemoSurfacePlan | null> {
    if (!this.parsedInput) return null;

    this.state.activeSubsystem = 'demo_surface_compiler';
    this.state.currentExecutionPointer.currentPhase = 'demo_surface_compilation';

    const plan = this.demoSurfaceCompiler.compile({
      title: this.parsedInput.title,
      problemStatement: this.parsedInput.problemStatement,
      judgingCriteria: this.parsedInput.judgingCriteria,
      technologies: this.parsedInput.techStackHints,
      constraints: this.parsedInput.constraints,
    });

    this.demoSurfacePlan = plan;

    const wowValidation = this.demoSurfaceCompiler.validateWowMoment();
    if (!wowValidation.valid) {
      this.decisionLogger.log('planner', 'wow_moment_missing', wowValidation.reason, 0.1, [], {
        suggestion: wowValidation.suggestion,
      });
    }

    if (plan.winScore < 80) {
      this.decisionLogger.log(
        'planner',
        'demo_win_score_below_threshold',
        `Demo win score ${plan.winScore}/100 is below 80 threshold — pipeline simplification applied`,
        0.5,
        [],
        { breakdown: plan.winScoreBreakdown },
      );
    }

    this.observability.trace('decision', 'Demo Surface Compilation', {
      score: plan.winScore,
      wowMoment: plan.wowMoment.type,
      steps: plan.executionSteps.length,
      deployTarget: plan.deployTarget,
      breakdown: plan.winScoreBreakdown,
    });

    this.state.currentExecutionPointer.completedSteps.push('demo_surface_compilation');
    return plan;
  }

  private async runSimulationPreview(): Promise<SimulationResult | null> {
    if (!this.parsedInput) return null;

    this.state.activeSubsystem = 'simulation';
    this.state.currentExecutionPointer.currentPhase = 'simulation_preview';

    // Run deterministic simulation
    this.simulationResult = this.simulationEngine.simulate({
      devpost: this.parsedInput,
      strategyMode: 'fast-win',
      seed: this.config.seed,
    });

    const result = this.simulationResult;

    this.observability.trace('decision', 'Simulation preview', {
      winner: result.winnerStrategy.name,
      score: result.finalJudgeVerdict.total,
      failures: result.failureTimeline.length,
      repairs: result.repairTimeline.length,
      gateRecommended: result.finalJudgeVerdict.total >= 75 ? 'proceed' : 'optimize',
    });

    this.decisionLogger.log(
      'planner',
      'simulation_preview',
      `Simulation complete: winner="${result.winnerStrategy.name}" score=${result.finalJudgeVerdict.total}/100`,
      result.finalJudgeVerdict.total / 100,
      [],
      {
        failures: result.failureTimeline.length,
        gateRecommended: result.finalJudgeVerdict.total >= 75 ? 'proceed' : 'optimize',
      },
    );

    this.state.currentExecutionPointer.completedSteps.push('simulation_preview');
    return result;
  }

  private async runComplexityCollapse(): Promise<void> {
    this.state.activeSubsystem = 'complexity_collapse';
    this.state.currentExecutionPointer.currentPhase = 'complexity_collapse';

    this.complexityReport = this.complexityCollapse.analyzeGraph();
    this.reductionPlan = this.complexityCollapse.generateReductionPlan();

    this.observability.trace('decision', 'Complexity collapse', {
      totalScore: this.complexityReport.totalComplexityScore,
      removable: this.complexityReport.removableModules.length,
      riskScore: this.reductionPlan.riskScore,
    });

    this.decisionLogger.log(
      'planner',
      'complexity_collapse',
      `Complexity score=${this.complexityReport.totalComplexityScore} removable=${this.complexityReport.removableModules.length} merge=${this.complexityReport.mergeCandidates.length}`,
      0.8,
      [],
      { reductionRisk: this.reductionPlan.riskScore },
    );

    this.state.currentExecutionPointer.completedSteps.push('complexity_collapse');
  }

  private async runSkippedPhase(phase: string, reason: string): Promise<null> {
    this.state.currentExecutionPointer.completedSteps.push(phase);
    this.decisionLogger.log('planner', `${phase}_skipped`, reason, 0.0, [], {});
    return null;
  }

  private async buildExecutionPlan(tasteVerdict?: TasteVerdict | null): Promise<void> {
    this.state.activeSubsystem = 'planning';
    this.state.currentExecutionPointer.currentPhase = 'planning';

    // Taste Governor simplification
    if (tasteVerdict && this.parsedInput && this.state.mode !== 'research') {
      const activeSystems = [
        'UnifiedRuntimeOS',
        'StrategicPlanner',
        'GlobalExecutionBrain',
        'Phase11Orchestrator',
        'Phase12Orchestrator',
        'UXEvaluationAgent',
        'GlobalGoalMonitor',
        'ToolExecutionGateway',
        'FailureResilienceLayer',
      ];
      const simplifications = this.tasteGovernor.simplifyArchitecture(this.taskGraph, activeSystems);

      for (const s of simplifications) {
        this.decisionLogger.log(
          'planner',
          'simplification_proposal',
          `${s.action} ${s.target}${s.into ? ` into ${s.into}` : ''}: ${s.reason}`,
          0.7,
          [],
          { action: s.action, target: s.target, demoImpact: s.demoImpactGain },
        );
      }

      this.observability.trace('decision', 'Taste Governor simplifications', {
        count: simplifications.length,
        proposals: simplifications.map((s) => `${s.action}:${s.target}`),
      });
    }

    this.state.currentExecutionPointer.completedSteps.push('planning');
  }

  private async runExecutionLoop(): Promise<{
    deployUrl?: string | null;
    githubRepo?: string | null;
    report?: unknown;
  } | null> {
    this.state.paused = false;
    const mode = this.state.mode;

    this.observability.trace('state_transition', `Starting ${mode} execution loop`, { mode });

    switch (mode) {
      case 'benchmark':
        return this.executeBenchmarkMode();
      case 'hackathon':
        return this.executeHackathonMode();
      case 'company':
        return this.executeCompanyMode();
      case 'research':
        return this.executeResearchMode();
      default:
        throw new Error(`Unknown runtime mode: ${mode}`);
    }
  }

  private async executeBenchmarkMode(): Promise<{ report?: unknown }> {
    this.state.activeSubsystem = 'benchmark_runner';
    this.state.currentExecutionPointer.currentPhase = 'benchmark_execution';

    const seed = this.config.seed;
    const config: BenchmarkRunnerConfig = {
      planner: { execute: async () => ({ output: { tasks: [], description: '', estimatedDuration: 0 } }) } as any,
      architect: { execute: async () => ({ output: { modules: [], architecture: '', rationale: '' } }) } as any,
      builderProvider: {
        build: async () => ({ status: 'success' as const, output: '', artifacts: [] }),
        execute: async () => ({}),
      } as any,
    };
    this.benchmarkRunner = new HackathonBenchmarkRunner({ ...config, seed });

    const target = ALL_BENCHMARKS[0]!;
    const result = await this.benchmarkRunner.runBenchmark(target, {
      mutationsEnabled: true,
      mutationLevel: 0.3,
      maxRepairAttempts: 3,
    });

    // Record mutations
    for (const phase of result.phases ?? []) {
      this.state.mutationHistory.push({
        mutationId: 'mut-' + createDeterministicUuid(seed, this.state.mutationHistory.length).slice(0, 8),
        mutationType: phase.phase ?? 'unknown',
        severity: phase.success ? 'low' : 'high',
        moduleTarget: 'benchmark',
        fileTarget: null,
        intensity: 0.5,
        detected: !phase.success,
        repaired: phase.success,
        timestamp: deterministicNow(seed),
      });
    }

    this.state.currentExecutionPointer.completedSteps.push('benchmark_execution');
    return { report: result };
  }

  private async executeHackathonMode(): Promise<{ deployUrl: string | null; githubRepo: string | null }> {
    this.state.activeSubsystem = 'hackathon_orchestrator';
    this.state.currentExecutionPointer.currentPhase = 'hackathon_execution';

    if (!this.parsedInput) throw new Error('No parsed input for hackathon mode');

    const hasNetworkTokens = !!(process.env.GITHUB_TOKEN || process.env.VERCEL_TOKEN);

    if (hasNetworkTokens) {
      this.internetOrch = new InternetHackathonOrchestrator(
        this.config.workspaceRoot,
        this.config.stateDir,
        this.config.seed,
      );
      const rawInput = this.parsedInput.devpostUrl ?? this.parsedInput.problemStatement ?? this.parsedInput.rawText;

      const devpostData = await this.internetOrch.parseDevpost(rawInput);
      const requirements = await this.internetOrch.extractRequirements(devpostData);
      const plan = await this.internetOrch.createExecutionPlan(devpostData, requirements);
      this.observability.trace('decision', `Hackathon plan built: ${plan.taskGraph.getAllNodes().length} tasks`, {});

      if (this.state.paused) return { deployUrl: null, githubRepo: null };

      await this.internetOrch.executeFullPipeline();
      const progress = this.internetOrch.getProgress();

      if (progress.deployUrl) {
        this.state.deploymentHistory.push({
          deploymentId:
            'dep-' + createDeterministicUuid(this.config.seed, this.state.deploymentHistory.length).slice(0, 8),
          target: plan.deploymentTarget,
          url: progress.deployUrl,
          status: 'live',
          attempts: 1,
          errors: [],
          timestamp: deterministicNow(this.config.seed),
        });
      }
      this.state.currentExecutionPointer.completedSteps.push('hackathon_execution');
      return { deployUrl: progress.deployUrl, githubRepo: null };
    }

    // Lightweight deterministic execution when no tokens
    this.observability.trace('decision', 'No network tokens — running lightweight hackathon mode', {});
    this.decisionLogger.log('planner', 'hackathon_light', 'Running lightweight hackathon without real infra', 0.7, [], {
      tokensPresent: false,
      project: this.parsedInput.title,
    });

    // Build local task graph
    const plan = new TaskGraph('hackathon-light-' + this.runtimeId, this.config.seed);
    plan.addNode('Project scaffolding', 'infra', [], 'runtime');
    plan.addNode('Frontend UI', 'frontend', [plan.getAllNodes()[0]!.id], 'runtime');
    plan.addNode('Backend API', 'backend', [plan.getAllNodes()[0]!.id], 'runtime');
    plan.addNode('Testing', 'testing', [plan.getAllNodes()[1]!.id, plan.getAllNodes()[2]!.id], 'runtime');

    for (const node of plan.getAllNodes()) {
      plan.markRunning(node.id);
      plan.markDone(node.id, ['generated']);
    }

    this.state.currentExecutionPointer.completedSteps.push('hackathon_execution');
    return { deployUrl: null, githubRepo: null };
  }

  private async executeCompanyMode(): Promise<{
    deployUrl: string | null;
    githubRepo: string | null;
    report: Phase11Report | null;
  }> {
    this.state.activeSubsystem = 'company_orchestrator';
    this.state.currentExecutionPointer.currentPhase = 'company_execution';

    if (!this.parsedInput) throw new Error('No parsed input for company mode');

    this.companyOrch = new Phase11Orchestrator(this.config.workspaceRoot, this.config.stateDir, this.config.seed);

    // Use the Phase11Orchestrator's company mode
    const report = await this.companyOrch.runCompanyMode(
      this.parsedInput.devpostUrl ?? this.parsedInput.problemStatement ?? this.parsedInput.rawText,
    );

    this.state.currentExecutionPointer.completedSteps.push('company_execution');
    return { deployUrl: report.deploymentReport.liveUrl, githubRepo: null, report };
  }

  private async executeResearchMode(): Promise<{ report?: string }> {
    this.state.activeSubsystem = 'research';
    this.state.currentExecutionPointer.currentPhase = 'research_execution';

    const seed = this.config.seed;
    const rng = getSeededRandom(seed);

    const config: BenchmarkRunnerConfig = {
      planner: { execute: async () => ({ output: { tasks: [], description: '', estimatedDuration: 0 } }) } as any,
      architect: { execute: async () => ({ output: { modules: [], architecture: '', rationale: '' } }) } as any,
      builderProvider: {
        build: async () => ({ status: 'success' as const, output: '', artifacts: [] }),
        execute: async () => ({}),
      } as any,
    };
    const runner = new HackathonBenchmarkRunner({ ...config, seed });

    const results = [];
    for (const benchmark of ALL_BENCHMARKS.slice(0, 2)) {
      const result = await runner.runBenchmark(benchmark, {
        mutationsEnabled: true,
        mutationLevel: 0.3,
        maxRepairAttempts: 3,
      });
      results.push(result);
    }

    const markdown = generateBenchmarkSummaryMarkdown(results);

    const paperData = packagePaperData(
      {
        title: 'Hack-A-Gent Research Run',
        authors: ['System'],
        abstract: 'Research mode execution',
        benchmarkSuiteName: 'Full Suite',
        experimentDate: deterministicNow(seed),
        includeRawData: true,
        includeCharts: false,
        includeFullTaxonomy: true,
      },
      results,
      [],
      null,
      null,
      null,
    );
    const paperJson = exportPaperDataJson(paperData);

    this.state.currentExecutionPointer.completedSteps.push('research_execution');
    return { report: markdown + '\n\n---\nPaper Data:\n' + paperJson.slice(0, 2000) };
  }

  private async runPhase13StrategyGeneration(phase12Report: Phase12Report | null): Promise<MultiStrategyResult | null> {
    if (this.state.mode === 'research' || !this.parsedInput || !phase12Report) return null;

    this.state.activeSubsystem = 'strategy_13';
    this.state.currentExecutionPointer.currentPhase = 'phase13_strategy';

    // Set goal for monitoring
    this.goalMonitor.setGoal({
      goalId: 'goal-' + createDeterministicUuid(this.config.seed, this.state.mutationHistory.length).slice(0, 8),
      description: this.parsedInput.problemStatement.slice(0, 200),
      category: 'performance',
      targetValue: 1,
      currentValue: 0,
      completionEpoch: null,
      priority: 'high',
      rewardTokens: 100,
    });

    const winner = phase12Report.strategyCompetition.winner;
    const strategies = this.strategyEngine.generateStrategies(
      winner.plan,
      this.parsedInput.judgingCriteria,
      this.parsedInput.constraints,
    );
    const result = this.strategyEngine.selectWinner(strategies);

    this.observability.trace('decision', 'Phase 13.5 strategy generation complete', {
      winner: result.winner.type,
      score: result.winner.simulationScore,
      candidates: result.strategies.length,
    });

    this.state.currentExecutionPointer.completedSteps.push('phase13_strategy');
    return result;
  }

  private async runSandboxSimulation(strategyResult: MultiStrategyResult | null): Promise<SandboxReport | null> {
    if (this.state.mode === 'research' || !strategyResult) return null;

    this.state.activeSubsystem = 'sandbox';
    this.state.currentExecutionPointer.currentPhase = 'sandbox_simulation';

    const report = await this.sandboxMode.simulateExecution(strategyResult.winner.plan, this.taskGraph);

    this.observability.trace('decision', 'Sandbox simulation complete', {
      riskScore: report.riskScore,
      deploySuccess: report.deployPrediction.success,
      recommendations: report.recommendations.length,
    });

    if (report.riskScore > 0.7) {
      this.decisionLogger.log(
        'planner',
        'sandbox_high_risk',
        `High risk (${(report.riskScore * 100).toFixed(0)}%) — consider replanning`,
        0.3,
        [],
        { riskScore: report.riskScore, recommendations: report.recommendations },
      );
    }

    this.state.currentExecutionPointer.completedSteps.push('sandbox_simulation');
    return report;
  }

  private async runConvergenceCheck(
    executionResult: { deployUrl?: string | null; githubRepo?: string | null; report?: unknown } | null,
  ): Promise<ConvergenceReport | null> {
    if (this.state.mode === 'research') return null;

    this.state.activeSubsystem = 'convergence';
    this.state.currentExecutionPointer.currentPhase = 'convergence_check';

    const deploymentLive = !!executionResult?.deployUrl;
    const uxScore =
      this.sandboxMode.getHistory().length > 0
        ? this.sandboxMode.getHistory()[this.sandboxMode.getHistory().length - 1]!.uxPrediction.expectedScore
        : 0.5;
    const testPassRate = 0.8;

    const report = this.convergenceEngine.evaluateConvergence(this.taskGraph, uxScore, testPassRate, deploymentLive);

    this.observability.trace('decision', 'Convergence evaluation complete', {
      converged: report.converged,
      score: report.score,
      action: report.recommendedAction,
    });

    if (this.convergenceEngine.shouldEarlyStop(report)) {
      this.decisionLogger.log(
        'planner',
        'early_stop',
        `Early stopping — convergence achieved (${(report.score * 100).toFixed(0)}%)`,
        0.95,
        [],
        { score: report.score },
      );
    }

    this.state.currentExecutionPointer.completedSteps.push('convergence_check');
    return report;
  }

  private async runFeedbackProcessing(): Promise<void> {
    if (!this.feedbackLoop.hasQueuedFeedback()) return;

    this.state.activeSubsystem = 'feedback';
    this.state.currentExecutionPointer.currentPhase = 'feedback_processing';

    let processed = 0;
    while (this.feedbackLoop.hasQueuedFeedback()) {
      const action = this.feedbackLoop.processNextFeedback(this.taskGraph);
      if (action) {
        this.observability.trace('decision', 'Feedback processed', {
          reason: action.reason,
          description: action.description.slice(0, 60),
        });
        processed++;
      }
    }

    if (processed > 0) {
      this.decisionLogger.log('planner', 'feedback_batch', `Processed ${processed} feedback items`, 0.8, [], {
        count: processed,
      });
    }

    this.state.currentExecutionPointer.completedSteps.push('feedback_processing');
  }

  private async runPostProjectLearning(phase12Report: Phase12Report | null): Promise<void> {
    if (!this.phase12Orch || !this.parsedInput) return;

    this.state.activeSubsystem = 'learning';
    this.state.currentExecutionPointer.currentPhase = 'post_project_learning';

    const winner = phase12Report?.strategyCompetition.winner;

    const projectSnapshot: ProjectSnapshot = {
      snapshotId: 'snap-' + createDeterministicUuid(this.config.seed, nextTraceCounter()).slice(0, 8),
      projectName: this.parsedInput.title,
      projectDescription: this.parsedInput.problemStatement,
      strategy: winner?.plan ?? {
        id: 'default-plan',
        projectName: this.parsedInput.title,
        winningStrategy: 'default',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.5,
        recommendedTimeAllocation: {},
        createdAt: deterministicNow(this.config.seed),
      },
      techStack: this.parsedInput.techStackHints,
      judgeCriteria: this.parsedInput.judgingCriteria,
      constraints: this.parsedInput.constraints,
      uxResults: [],
      deploySuccess: this.state.deploymentHistory.length > 0,
      overallScore: phase12Report?.rewardPrediction.predicted ?? 0.5,
      errors: this.state.errors,
      failurePatterns: ((phase12Report as Phase12Report | null)?.failurePatternReport ?? []).map((fp, i) => ({
        patternId: `fp-${i}`,
        category: fp.category,
        description: fp.description,
        frequency: fp.frequency,
        lastOccurrence: deterministicNow(this.config.seed),
        suggestedFix: '',
        fixedByMutation: null,
      })),
      mutations: this.state.mutationHistory.map((m) => ({
        id: m.mutationId,
        type: (['add', 'modify', 'remove'].includes(m.mutationType) ? m.mutationType : 'modify') as
          | 'add'
          | 'modify'
          | 'remove',
        target: m.moduleTarget,
        reason: `Mutation ${m.mutationType} on ${m.moduleTarget}`,
        expectedImpact: m.severity === 'high' ? 'significant' : 'minor',
        simulatedSuccessRate: m.detected ? 0.3 : 0.7,
        activated: !m.repaired,
        timestamp: m.timestamp,
      })),
      startedAt: deterministicNow(this.config.seed),
      completedAt: deterministicNow(this.config.seed),
      tags: [this.state.mode],
    };

    this.globalMemory.store(projectSnapshot);
    this.observability.recordMemoryUpdate('project_stored', { projectName: this.parsedInput.title });

    this.state.currentExecutionPointer.completedSteps.push('post_project_learning');
  }

  // ---- Helpers ----

  private createInitialState(): RuntimeState {
    return {
      mode: this.config.mode,
      globalTaskGraph: null,
      memoryBank: { totalProjects: 0, snapshots: [] },
      decisionLog: [],
      toolLog: [],
      mutationHistory: [],
      deploymentHistory: [],
      currentExecutionPointer: {
        currentPhase: 'initialized',
        currentStepIndex: 0,
        completedSteps: [],
        failedSteps: [],
        blockedSteps: [],
      },
      paused: false,
      activeSubsystem: 'none',
      checkpointVersion: 0,
      errors: [],
    };
  }

  private buildExecutionSummary(durationMs: number): RuntimeOutput['executionSummary'] {
    const progress = this.taskGraph.getProgress();
    return {
      tasksCompleted: progress.done,
      tasksTotal: progress.total,
      deployments: this.state.deploymentHistory.length,
      browserTests: 0,
      browserTestsPassed: 0,
      mutations: this.state.mutationHistory.length,
      repairs: 0,
      decisionCount: this.decisionLogger.getAll().length,
      durationMs,
      deployUrl: this.state.deploymentHistory[this.state.deploymentHistory.length - 1]?.url ?? null,
    };
  }

  private summarizeInput(input: RuntimeInput): Record<string, string> {
    return {
      hasDevpostUrl: input.devpostUrl ? 'yes' : 'no',
      hasProblemStatement: input.problemStatement ? 'yes' : 'no',
      hasRepository: input.repositoryInput ? 'yes' : 'no',
      modeOverride: input.modeOverride ?? 'none',
      constraints: (input.constraints?.length ?? 0).toString(),
    };
  }
}

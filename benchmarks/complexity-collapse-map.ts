import { deterministicNow } from './determinism-kernel.js';
import type { TaskGraph } from './task-graph.js';

// ---- Types ----

export type Criticality = 'core' | 'important' | 'optional' | 'redundant';

export interface SystemNode {
  name: string;
  dependencies: string[];
  criticality: Criticality;
  canDisable: boolean;
  replacement?: string;
}

export interface ComplexityReport {
  generatedAt: string;
  totalComplexityScore: number;
  nodeCount: number;
  removableModules: string[];
  mergeCandidates: [string, string][];
  deadCodeRegions: string[];
  nodeDetails: SystemNodeReport[];
}

export interface SystemNodeReport {
  name: string;
  locWeight: number;
  fanOut: number;
  invocationFrequency: number;
  overlapWith: string[];
  criticality: Criticality;
  canDisable: boolean;
  replacement?: string;
  riskScore: number;
}

export interface ReductionPlan {
  targetReduction: number;
  preserveCore: string[];
  removeOrMerge: string[];
  estimatedLocSaved: number;
  estimatedScoreAfter: number;
  riskScore: number;
  steps: ReductionStep[];
}

export interface ReductionStep {
  action: 'remove' | 'merge' | 'replace_deterministic' | 'inline';
  target: string;
  into?: string;
  reason: string;
}

// ---- System Catalog ----

const ALL_SYSTEMS: SystemNode[] = [
  // Core ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always required
  { name: 'UnifiedRuntimeOS', dependencies: [], criticality: 'core', canDisable: false },
  { name: 'TaskGraph', dependencies: [], criticality: 'core', canDisable: false },
  { name: 'ToolExecutionGateway', dependencies: ['TaskGraph'], criticality: 'core', canDisable: false },
  { name: 'ObservabilityLayer', dependencies: [], criticality: 'core', canDisable: false },
  { name: 'DecisionLogger', dependencies: ['ObservabilityLayer'], criticality: 'core', canDisable: false },
  { name: 'DevpostIngestionLayer', dependencies: [], criticality: 'core', canDisable: false },
  { name: 'InterruptProtocol', dependencies: [], criticality: 'core', canDisable: false },

  // Important ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â used frequently
  { name: 'GlobalMemoryIndex', dependencies: [], criticality: 'important', canDisable: true },
  {
    name: 'DeploymentRepairController',
    dependencies: ['TaskGraph', 'ToolExecutionGateway'],
    criticality: 'important',
    canDisable: true,
  },
  { name: 'LiveBrowserTestAgent', dependencies: ['ToolExecutionGateway'], criticality: 'important', canDisable: true },
  { name: 'StrategicPlanner', dependencies: ['DevpostIngestionLayer'], criticality: 'important', canDisable: true },
  {
    name: 'GlobalExecutionBrain',
    dependencies: ['StrategicPlanner', 'TaskGraph'],
    criticality: 'important',
    canDisable: true,
  },

  // Optional ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â can skip
  { name: 'Phase11Orchestrator', dependencies: ['StrategicPlanner'], criticality: 'optional', canDisable: true },
  { name: 'Phase12Orchestrator', dependencies: ['StrategicPlanner'], criticality: 'optional', canDisable: true },
  {
    name: 'InternetHackathonOrchestrator',
    dependencies: ['ToolExecutionGateway'],
    criticality: 'optional',
    canDisable: true,
  },
  { name: 'UXEvaluationAgent', dependencies: ['LiveBrowserTestAgent'], criticality: 'optional', canDisable: true },
  { name: 'CapabilityEvolutionEngine', dependencies: ['GlobalMemoryIndex'], criticality: 'optional', canDisable: true },
  { name: 'HackathonBenchmarkRunner', dependencies: ['TaskGraph'], criticality: 'optional', canDisable: true },
  {
    name: 'EvaluationOrchestrator',
    dependencies: ['HackathonBenchmarkRunner'],
    criticality: 'optional',
    canDisable: true,
  },

  // Phase 13.5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â mostly redundant now
  {
    name: 'GlobalGoalMonitor',
    dependencies: [],
    criticality: 'optional',
    canDisable: true,
    replacement: 'DemoSurfaceCompiler.handleFailure',
  },
  {
    name: 'ExecutionConvergenceEngine',
    dependencies: ['TaskGraph'],
    criticality: 'redundant',
    canDisable: true,
    replacement: 'DemoSurfaceCompiler.winScore ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 80 check',
  },
  {
    name: 'FailureResilienceLayer',
    dependencies: ['ToolExecutionGateway'],
    criticality: 'redundant',
    canDisable: true,
    replacement: 'DemoSurfaceCompiler.handleFailure',
  },
  {
    name: 'MultiStrategyExecutionEngine',
    dependencies: ['TaskGraph', 'StrategicPlanner'],
    criticality: 'redundant',
    canDisable: true,
    replacement: 'HackathonSimulationEngine',
  },
  { name: 'UserFeedbackInjectionLoop', dependencies: [], criticality: 'optional', canDisable: true },
  {
    name: 'SandboxExecutionMode',
    dependencies: ['TaskGraph'],
    criticality: 'redundant',
    canDisable: true,
    replacement: 'HackathonSimulationEngine phase 2',
  },

  // Taste & Simplicity Governor ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â keep
  { name: 'TasteGovernor', dependencies: [], criticality: 'core', canDisable: false },

  // Demo Surface Compiler ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â new core
  { name: 'DemoSurfaceCompiler', dependencies: [], criticality: 'core', canDisable: false },
];

// ---- Complexity Collapse Engine ----

export class ComplexityCollapseEngine {
  private readonly seed: number;
  private readonly systems: SystemNode[];

  constructor(seed = 42, systems?: SystemNode[]) {
    this.seed = seed;
    this.systems = systems ?? ALL_SYSTEMS;
  }

  getSystems(): SystemNode[] {
    return [...this.systems];
  }

  // ---- System Graph Analysis ----

  analyzeGraph(): ComplexityReport {
    const reports: SystemNodeReport[] = this.systems.map((sys) => ({
      name: sys.name,
      locWeight: estimateLocWeight(sys.name),
      fanOut: sys.dependencies.length,
      invocationFrequency: estimateInvocationFrequency(sys.name, sys.criticality),
      overlapWith: findOverlaps(sys.name, this.systems),
      criticality: sys.criticality,
      canDisable: sys.canDisable,
      replacement: sys.replacement,
      riskScore: computeRiskScore(sys),
    }));

    const removable = reports
      .filter((r) => r.canDisable && r.criticality !== 'core' && r.riskScore < 0.5)
      .map((r) => r.name);

    const mergeCandidates = findMergeCandidates(reports);

    const deadCode = reports.filter((r) => r.criticality === 'redundant' && r.replacement).map((r) => r.name);

    const totalComplexity = reports.reduce((sum, r) => sum + r.locWeight * (1 + r.fanOut * 0.3), 0);

    return {
      generatedAt: new Date(deterministicNow(this.seed)).toISOString(),
      totalComplexityScore: Math.round(totalComplexity),
      nodeCount: this.systems.length,
      removableModules: removable,
      mergeCandidates,
      deadCodeRegions: deadCode,
      nodeDetails: reports,
    };
  }

  // ---- Reduction Plan ----

  generateReductionPlan(): ReductionPlan {
    const report = this.analyzeGraph();

    const preserveCore = [
      'UnifiedRuntimeOS',
      'TaskGraph',
      'ToolExecutionGateway',
      'ObservabilityLayer',
      'DevpostIngestionLayer',
      'TasteGovernor',
      'DemoSurfaceCompiler',
    ];

    const removeTargets = report.nodeDetails
      .filter((r) => r.criticality === 'redundant' || (r.criticality === 'optional' && r.canDisable))
      .map((r) => r.name);

    const mergeTargets = report.mergeCandidates;

    const removableTotalLoc = removeTargets.reduce((sum, name) => {
      const found = report.nodeDetails.find((r) => r.name === name);
      return sum + (found?.locWeight ?? 5);
    }, 0);

    const totalLoc = report.nodeDetails.reduce((sum, r) => sum + r.locWeight, 0);
    const reductionRatio = removableTotalLoc / Math.max(totalLoc, 1);

    const steps: ReductionStep[] = [];

    for (const m of mergeTargets) {
      steps.push({
        action: 'merge',
        target: m[0],
        into: m[1],
        reason: `Overlapping functionality ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${m[0]} can be absorbed by ${m[1]}`,
      });
    }

    for (const name of removeTargets) {
      const found = report.nodeDetails.find((r) => r.name === name);
      if (found?.replacement) {
        steps.push({
          action: 'replace_deterministic',
          target: name,
          reason: `Replaced by ${found.replacement} ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â same output, fewer systems`,
        });
      } else {
        steps.push({ action: 'remove', target: name, reason: `Low criticality and can be disabled safely` });
      }
    }

    const riskScore = Math.round(
      removeTargets.reduce((max, name) => {
        const found = report.nodeDetails.find((r) => r.name === name);
        return Math.max(max, found?.riskScore ?? 0);
      }, 0) * 100,
    );

    return {
      targetReduction: 0.65,
      preserveCore,
      removeOrMerge: [...removeTargets, ...mergeTargets.map((m) => m[0])],
      estimatedLocSaved: removableTotalLoc * 100,
      estimatedScoreAfter: Math.round((1 - reductionRatio) * 100),
      riskScore,
      steps,
    };
  }

  // ---- JSON output ----

  toJsonFiles(): { complexityReport: string; reductionPlan: string } {
    const report = this.analyzeGraph();
    const plan = this.generateReductionPlan();
    return { complexityReport: JSON.stringify(report, null, 2), reductionPlan: JSON.stringify(plan, null, 2) };
  }
}

// ---- Helpers ----

function estimateLocWeight(name: string): number {
  const weights: Record<string, number> = {
    UnifiedRuntimeOS: 12,
    TaskGraph: 8,
    ToolExecutionGateway: 7,
    ObservabilityLayer: 5,
    DecisionLogger: 3,
    DevpostIngestionLayer: 4,
    InterruptProtocol: 3,
    GlobalMemoryIndex: 4,
    DeploymentRepairController: 5,
    LiveBrowserTestAgent: 4,
    StrategicPlanner: 5,
    GlobalExecutionBrain: 6,
    Phase11Orchestrator: 6,
    Phase12Orchestrator: 6,
    InternetHackathonOrchestrator: 7,
    UXEvaluationAgent: 4,
    CapabilityEvolutionEngine: 5,
    HackathonBenchmarkRunner: 6,
    EvaluationOrchestrator: 4,
    GlobalGoalMonitor: 4,
    ExecutionConvergenceEngine: 4,
    FailureResilienceLayer: 5,
    MultiStrategyExecutionEngine: 5,
    UserFeedbackInjectionLoop: 3,
    SandboxExecutionMode: 4,
    TasteGovernor: 6,
    DemoSurfaceCompiler: 5,
    HackathonSimulationEngine: 7,
    JudgeSimulator: 3,
  };
  return weights[name] ?? 3;
}

function estimateInvocationFrequency(name: string, criticality: Criticality): number {
  if (criticality === 'core') return 10;
  if (criticality === 'important') return 6;
  if (criticality === 'optional') return 3;
  return 1;
}

function findOverlaps(name: string, systems: SystemNode[]): string[] {
  const groups: Record<string, string[]> = {
    planning: [
      'StrategicPlanner',
      'Phase11Orchestrator',
      'Phase12Orchestrator',
      'InternetHackathonOrchestrator',
      'MultiStrategyExecutionEngine',
    ],
    execution: ['ToolExecutionGateway', 'TaskGraph', 'GlobalExecutionBrain'],
    deployment: ['DeploymentRepairController', 'LiveBrowserTestAgent', 'SandboxExecutionMode'],
    governance: ['TasteGovernor', 'HackathonSimulationEngine', 'ExecutionConvergenceEngine', 'GlobalGoalMonitor'],
    memory: ['GlobalMemoryIndex', 'CapabilityEvolutionEngine', 'UserFeedbackInjectionLoop'],
    orchestration: ['UnifiedRuntimeOS', 'InternetHackathonOrchestrator', 'Phase11Orchestrator', 'Phase12Orchestrator'],
  };

  const overlaps: string[] = [];
  for (const [, members] of Object.entries(groups)) {
    if (members.includes(name)) {
      for (const m of members) {
        if (m !== name && systems.some((s) => s.name === m)) {
          overlaps.push(m);
        }
      }
    }
  }
  return [...new Set(overlaps)];
}

function findMergeCandidates(reports: SystemNodeReport[]): [string, string][] {
  const candidates: [string, string][] = [];
  const byOverlap = new Map<string, string[]>();

  for (const r of reports) {
    for (const o of r.overlapWith) {
      if (!byOverlap.has(r.name)) byOverlap.set(r.name, []);
      byOverlap.get(r.name)!.push(o);
    }
  }

  const highOverlap = [...byOverlap.entries()].filter(([, v]) => v.length >= 2);
  for (const [name, overlaps] of highOverlap) {
    for (const target of overlaps) {
      if (name < target) {
        candidates.push([name, target]);
      }
    }
  }

  return candidates.slice(0, 6);
}

function computeRiskScore(sys: SystemNode): number {
  if (sys.criticality === 'core') return 0.9;
  if (sys.criticality === 'important') return 0.5;
  if (sys.criticality === 'optional') return 0.2;
  return 0.05;
}

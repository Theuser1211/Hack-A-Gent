export {
  HackathonCategorySchema,
  DeliverableSchema,
  SuccessCriterionSchema,
  RubricItemSchema,
  EvaluationRubricSchema,
  HackathonBenchmarkDefinitionSchema,
  BenchmarkPhaseSchema,
  PhaseResultSchema,
  BenchmarkRunResultSchema,
  BenchmarkSuiteResultSchema,
} from './benchmark-types.js';

export type {
  HackathonCategory,
  Deliverable,
  SuccessCriterion,
  RubricItem,
  EvaluationRubric,
  HackathonBenchmarkDefinition,
  BenchmarkPhase,
  PhaseResult,
  BenchmarkRunResult,
  BenchmarkSuiteResult,
} from './benchmark-types.js';

export {
  ALL_BENCHMARKS,
  AI_HACKATHON,
  SAAS_HACKATHON,
  WEBAPP_HACKATHON,
  HEALTHCARE_HACKATHON,
  EDUCATION_HACKATHON,
  getBenchmarkById,
  getBenchmarksByCategory,
} from './hackathon-benchmarks.js';

export { HackathonBenchmarkRunner } from './hackathon-benchmark-runner.js';
export type { BenchmarkRunnerConfig } from './hackathon-benchmark-runner.js';

export {
  generateBenchmarkReport,
  generateCategoryBreakdown,
  generateBenchmarkSummaryMarkdown,
  generateMutationEvolutionReportMarkdown,
} from './benchmark-report.js';

export { analyzeFailurePatterns, generateFailurePatternsMarkdown, getTopFailurePatterns } from './failure-patterns.js';
export type { FailurePattern } from './failure-patterns.js';

export { MutationGenome } from './mutation-genome.js';
export type { MutationGene, MutationGeneParams, MutationFitness, MutationFitnessInput } from './mutation-genome.js';

export { MutationEvolutionController } from './mutation-evolution-controller.js';
export type { EvolutionDecision, MutationEvolutionReport } from './mutation-evolution-controller.js';

export { MutationDifficultyController } from './mutation-difficulty-controller.js';
export type { MutationDifficultyState } from './mutation-difficulty-controller.js';

export { applyMutations, applyGenomeMutations } from './mutation-engine.js';

export { DemoSurfaceCompiler } from './demo-surface-compiler.js';

export { ExperimentSnapshot } from './experiment-snapshot.js';
export type { FrozenRepositoryState, FrozenMutationSequenceEntry, FrozenGenomeState } from './experiment-snapshot.js';

export { ExperimentTrace } from './experiment-trace.js';
export type { RepairDecisionTrace } from './experiment-trace.js';

export { ResearchContext } from './research-context.js';

export { DevpostIngestionLayer } from './devpost-ingestion-layer.js';
export type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';

export type { ModelAdapter } from './cross-model-adapter.js';

export { EvaluationOrchestrator } from './evaluation-orchestrator.js';

export { HackathonSimulationEngine } from './hackathon-simulation-engine.js';

export { JudgeSimulator } from './judge-simulator.js';

export { ComplexityCollapseEngine, type ComplexityReport } from './complexity-collapse-map.js';

export { ExecutionBudgetManager } from './execution-budget-manager.js';
export type { ExecutionBudget, ExecutionBudgetReport } from './execution-budget-manager.js';

export { SimulationDecisionEngine } from './simulation-decision-engine.js';

export { FailureContainmentLayer } from './failure-containment-layer.js';

export { ExecutionStabilityGuard } from './execution-stability-guard.js';

export { HackathonOrchestrator } from './hackathon-orchestrator.js';

export { InternetHackathonOrchestrator } from './internet-hackathon-orchestrator.js';

export {
  CompanySpawner,
  type CompanyProfile,
  type CompanyAgentProfile,
  type CompanyStrategyType,
  type CompanyAgentRole,
} from './company-spawner.js';
export type { CompanyResult } from './company-spawner.js';

export { ExecutiveCompanyBrain } from './executive-company-brain.js';
export type { CompanyExecutionState, ExecutiveDecision } from './executive-company-brain.js';

export { CompanyEvolutionEngine } from './company-evolution-engine.js';
export type { EvolutionDelta, EvolutionMutationRecord, StrategyBiasShift } from './company-evolution-engine.js';

export { StrategyGenomeDatabase } from './strategy-genome-database.js';
export type { StrategyGenomeRecord, GlobalGenomeSummary } from './strategy-genome-database.js';

export { GlobalHackathonWorld } from './global-hackathon-world.js';
export type {
  HackathonEvent,
  PersistentCompany,
  WorldStateSnapshot,
  WorldSimulationResult,
} from './global-hackathon-world.js';

export { CognitiveInjectionLayer } from './cognitive-injection-layer.js';
export type { CognitiveBias, CognitiveContext, InjectionResult } from './cognitive-injection-layer.js';

export { GlobalMemoryIndex } from './global-memory-index.js';
export type { GlobalMemoryQuery, GlobalMemoryQueryResult } from './global-memory-index.js';

export { OrganizationalMemoryBank } from './organizational-memory-bank.js';
export type {
  ProjectSnapshot as OrganizationalProjectSnapshot,
  WinningPattern as OrganizationalWinningPattern,
  MemoryQueryResult as OrganizationalMemoryQueryResult,
} from './organizational-memory-bank.js';

export { SwarmLeaderboard } from './swarm-leaderboard.js';
export type { SwarmLeaderboardEntry } from './swarm-leaderboard.js';

export { HackathonSwarmOrchestrator } from './hackathon-swarm-orchestrator.js';
export type { SwarmCompetitionResult, SwarmAgent } from './hackathon-swarm-orchestrator.js';

export { SwarmEvolutionEngine } from './swarm-evolution-engine.js';

export { SwarmJudgeAggregator } from './swarm-judge-aggregator.js';

export { SwarmMemoryBank } from './swarm-memory-bank.js';

export { GlobalGoalMonitor } from './global-goal-monitor.js';
export type { GlobalGoal, GoalProgress, CivilizationMetrics } from './global-goal-monitor.js';

export { HackathonRewardModel } from './hackathon-reward-model.js';
export type { TokenTransaction, BudgetBreakdown, ResourceAllocation, RewardModel } from './hackathon-reward-model.js';

export { TypeEvolutionSystem } from './type-evolution-system.js';
export type { TypeSpecialization, SkillTree, CrossAgentLearning, TypeEvolutionEvent } from './type-evolution-system.js';

export { ResourceMarketModel } from './resource-market-model.js';
export type { MarketPrice, ResourceMarket, MarketState } from './resource-market-model.js';

export { EconomyEnforcementHooks } from './economy-enforcement-hooks.js';
export type { EconomyHooks } from './economy-enforcement-hooks.js';

export { HackathonCompanyOrchestrator } from './hackathon-company-orchestrator.js';
export type { CompanyCompetitionConfig, CompanyCompetitionResult } from './hackathon-company-orchestrator.js';

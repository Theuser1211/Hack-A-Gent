import type { BenchmarkJudgeResult } from './benchmark-judge.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import type { VerificationError } from './build-verifier.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { ProtocolPhase } from './evaluation-protocol.js';
import type { RepairRecord } from './hackathon-benchmark-runner.js';
import type { MutationMetadata } from './mutation-engine.js';
import type { MutationGene } from './mutation-genome.js';

export interface CausalLink {
  sourceEventId: string;
  targetEventId: string;
  relationship: 'causes' | 'detects' | 'repairs' | 'validates' | 'scores' | 'mutates';
  confidence: number;
}

export interface TraceIntegrityReport {
  valid: boolean;
  totalEvents: number;
  orphanEvents: string[];
  missingParentEvents: string[];
  incompleteChains: Array<{ chainType: string; missingLinks: string[] }>;
  duplicateEventIds: string[];
  warnings: string[];
}

export interface TraceEvent {
  id: string;
  timestamp: string;
  eventType: string;
  phase: ProtocolPhase;
  actor: string;
  description: string;
  data: Record<string, unknown>;
  parentEventId: string | null;
}

export interface MutationSelectionTrace {
  mutationGeneId: string;
  mutationType: string;
  utilityScore: number;
  diversityScore: number;
  difficultyBias: number;
  finalScore: number;
  selectionRank: number;
  wasSelected: boolean;
  rejectionReason: string | null;
}

export interface AgentExecutionTrace {
  agentId: string;
  phase: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  inputSummary: string;
  outputSummary: string;
  tokenCount: number;
  errors: string[];
  decisionPath: string[];
}

export interface RepairDecisionTrace {
  repairAttempt: number;
  detectedErrors: VerificationError[];
  failedModuleTypes: string[];
  selectedStrategy: string;
  strategySelectionReason: string;
  modulesRegenerated: string[];
  filesPatched: string[];
  moduleDiffs: string[];
  success: boolean;
}

export interface VerificationReasoningTrace {
  verificationPassed: boolean;
  errorCount: number;
  errorsByCategory: Record<string, number>;
  criticalErrors: string[];
  detectedMutations: string[];
  reasoningSteps: string[];
  summary: string;
}

export interface JudgeScoringTrace {
  scoreComponents: Record<string, number>;
  reasoningPerComponent: Record<string, string>;
  strengths: string[];
  weaknesses: string[];
  finalScore: number;
  finalVerdict: string;
}

export interface ExperimentTrace {
  experimentId: string;
  runId: string;
  agentId: string;
  benchmarkId: string;
  masterSeed: number;

  mutationSelection: MutationSelectionTrace[];
  agentExecutionTraces: AgentExecutionTrace[];
  repairDecisionTraces: RepairDecisionTrace[];
  verificationReasoningTraces: VerificationReasoningTrace[];
  judgeScoringTraces: JudgeScoringTrace[];

  eventLog: TraceEvent[];

  repositorySnapshots: Record<string, string>;
  genomeSnapshot: string;
  leaderboardSnapshot: string;

  startedAt: string;
  completedAt: string;
}

export class ExperimentTracer {
  private events: TraceEvent[] = [];
  private eventCounter = 0;
  private causalLinks: CausalLink[] = [];

  private mutationSelection: MutationSelectionTrace[] = [];
  private agentExecutionTraces: AgentExecutionTrace[] = [];
  private repairDecisionTraces: RepairDecisionTrace[] = [];
  private verificationReasoningTraces: VerificationReasoningTrace[] = [];
  private judgeScoringTraces: JudgeScoringTrace[] = [];

  private repositorySnapshots: Record<string, string> = {};
  private genomeSnapshot = '';
  private leaderboardSnapshot = '';

  private readonly experimentId: string;
  private readonly runId: string;
  private readonly agentId: string;
  private readonly benchmarkId: string;
  private readonly masterSeed: number;

  constructor(experimentId: string, runId: string, agentId: string, benchmarkId: string, masterSeed: number) {
    this.experimentId = experimentId;
    this.runId = runId;
    this.agentId = agentId;
    this.benchmarkId = benchmarkId;
    this.masterSeed = masterSeed;
  }

  logEvent(
    eventType: string,
    phase: ProtocolPhase,
    actor: string,
    description: string,
    data: Record<string, unknown> = {},
    parentEventId: string | null = null,
  ): string {
    const id = `evt-${createDeterministicUuid(this.masterSeed, ++this.eventCounter)}`;
    this.events.push({
      id,
      timestamp: deterministicNow(this.masterSeed + this.eventCounter),
      eventType,
      phase,
      actor,
      description,
      data,
      parentEventId,
    });
    return id;
  }

  recordCausalLink(link: CausalLink): void {
    this.causalLinks.push(link);
  }

  recordMutationCausalChain(
    mutationEventId: string,
    detectedEventId: string,
    repairEventId: string | null,
    verifiedEventId: string | null,
    scoreEventId: string | null,
  ): void {
    this.causalLinks.push({
      sourceEventId: mutationEventId,
      targetEventId: detectedEventId,
      relationship: 'causes',
      confidence: 0.9,
    });
    if (repairEventId) {
      this.causalLinks.push({
        sourceEventId: detectedEventId,
        targetEventId: repairEventId,
        relationship: 'detects',
        confidence: 0.85,
      });
    }
    if (verifiedEventId) {
      this.causalLinks.push({
        sourceEventId: repairEventId ?? detectedEventId,
        targetEventId: verifiedEventId,
        relationship: 'validates',
        confidence: 0.95,
      });
    }
    if (scoreEventId) {
      this.causalLinks.push({
        sourceEventId: verifiedEventId ?? detectedEventId,
        targetEventId: scoreEventId,
        relationship: 'scores',
        confidence: 0.9,
      });
    }
  }

  recordMutationSelection(trace: MutationSelectionTrace): void {
    this.mutationSelection.push(trace);
  }

  recordAgentExecution(trace: AgentExecutionTrace): void {
    this.agentExecutionTraces.push(trace);
  }

  recordRepairDecision(trace: RepairDecisionTrace): void {
    this.repairDecisionTraces.push(trace);
  }

  recordVerificationReasoning(trace: VerificationReasoningTrace): void {
    this.verificationReasoningTraces.push(trace);
  }

  recordJudgeScoring(trace: JudgeScoringTrace): void {
    this.judgeScoringTraces.push(trace);
  }

  recordRepositorySnapshot(label: string, snapshot: string): void {
    this.repositorySnapshots[label] = snapshot;
  }

  recordGenomeSnapshot(snapshot: string): void {
    this.genomeSnapshot = snapshot;
  }

  recordLeaderboardSnapshot(snapshot: string): void {
    this.leaderboardSnapshot = snapshot;
  }

  getEventLog(): readonly TraceEvent[] {
    return this.events;
  }

  buildTrace(): ExperimentTrace {
    return {
      experimentId: this.experimentId,
      runId: this.runId,
      agentId: this.agentId,
      benchmarkId: this.benchmarkId,
      masterSeed: this.masterSeed,
      mutationSelection: this.mutationSelection,
      agentExecutionTraces: this.agentExecutionTraces,
      repairDecisionTraces: this.repairDecisionTraces,
      verificationReasoningTraces: this.verificationReasoningTraces,
      judgeScoringTraces: this.judgeScoringTraces,
      eventLog: this.events,
      repositorySnapshots: this.repositorySnapshots,
      genomeSnapshot: this.genomeSnapshot,
      leaderboardSnapshot: this.leaderboardSnapshot,
      startedAt: deterministicNow(this.masterSeed),
      completedAt: deterministicNow(this.masterSeed + 9999),
    };
  }

  verifyTraceIntegrity(): TraceIntegrityReport {
    const eventIds = new Set(this.events.map((e) => e.id));
    const parentIds = new Set(this.events.map((e) => e.parentEventId).filter((id): id is string => id !== null));
    const duplicateChecks = new Map<string, number>();
    const duplicateEventIds: string[] = [];

    for (const eid of eventIds) {
      const count = (duplicateChecks.get(eid) ?? 0) + 1;
      duplicateChecks.set(eid, count);
      if (count > 1) duplicateEventIds.push(eid);
    }

    const orphanEvents = this.events
      .filter((e) => e.parentEventId !== null && !eventIds.has(e.parentEventId!))
      .map((e) => e.id);

    const missingParentEvents = this.events
      .filter((e) => e.parentEventId !== null)
      .map((e) => e.parentEventId!)
      .filter((pid) => !eventIds.has(pid))
      .filter((v, i, a) => a.indexOf(v) === i);

    const incompleteChains: TraceIntegrityReport['incompleteChains'] = [];

    const mutationEvents = this.events.filter((e) => e.eventType === 'mutation_applied');
    const detectionEvents = this.events.filter((e) => e.eventType === 'mutation_detected');
    const repairEvents = this.events.filter((e) => e.eventType === 'repair_attempt');
    const verificationEvents = this.events.filter((e) => e.eventType === 'verification_result');
    const scoringEvents = this.events.filter((e) => e.eventType === 'judge_score');

    if (mutationEvents.length > 0 && detectionEvents.length === 0) {
      incompleteChains.push({
        chainType: 'mutation Ã¢â€ â€™ detection',
        missingLinks: [`${mutationEvents.length} mutation(s) applied but 0 detection events recorded`],
      });
    }
    if (detectionEvents.length > 0 && repairEvents.length === 0) {
      incompleteChains.push({
        chainType: 'detection Ã¢â€ â€™ repair',
        missingLinks: [`${detectionEvents.length} detection(s) but 0 repair attempts recorded`],
      });
    }
    if (repairEvents.length > 0 && verificationEvents.length === 0) {
      incompleteChains.push({
        chainType: 'repair Ã¢â€ â€™ verification',
        missingLinks: [`${repairEvents.length} repair(s) but 0 verification results recorded`],
      });
    }

    const warnings: string[] = [];
    if (this.causalLinks.length > 0) {
      for (const link of this.causalLinks) {
        if (!eventIds.has(link.sourceEventId)) {
          warnings.push(`Causal link references non-existent source event: ${link.sourceEventId}`);
        }
        if (!eventIds.has(link.targetEventId)) {
          warnings.push(`Causal link references non-existent target event: ${link.targetEventId}`);
        }
      }
    }

    const valid =
      orphanEvents.length === 0 &&
      missingParentEvents.length === 0 &&
      incompleteChains.length === 0 &&
      warnings.length === 0 &&
      duplicateEventIds.length === 0;

    return {
      valid,
      totalEvents: this.events.length,
      orphanEvents,
      missingParentEvents,
      incompleteChains,
      duplicateEventIds,
      warnings,
    };
  }
}

export function collectMutationSelectionTraces(
  allGenes: MutationGene[],
  selectedGenes: MutationGene[],
  diversityPressure: number,
  difficultyBias: Record<string, number>,
): MutationSelectionTrace[] {
  const selectedIds = new Set(selectedGenes.map((g) => g.id));
  const sorted = [...allGenes].sort((a, b) => b.fitness.utility_score - a.fitness.utility_score);

  return sorted.map((gene, idx) => {
    const diffBias = difficultyBias[gene.type] ?? 0.5;
    const diversityScore = 1 - allGenes.filter((g) => g.type === gene.type).length / allGenes.length;
    const finalScore = gene.fitness.utility_score * 0.5 + diffBias * 0.3 + diversityScore * diversityPressure * 0.2;

    return {
      mutationGeneId: gene.id,
      mutationType: gene.type,
      utilityScore: gene.fitness.utility_score,
      diversityScore,
      difficultyBias: diffBias,
      finalScore,
      selectionRank: idx + 1,
      wasSelected: selectedIds.has(gene.id),
      rejectionReason: selectedIds.has(gene.id) ? null : 'Insufficient score or diversity constraint',
    };
  });
}

export function collectRepairDecisionTraces(
  repairHistory: RepairRecord[],
  detectedErrors: VerificationError[],
): RepairDecisionTrace[] {
  return repairHistory.map((record) => ({
    repairAttempt: record.attempt,
    detectedErrors,
    failedModuleTypes: record.modules_regenerated,
    selectedStrategy: record.strategy_used,
    strategySelectionReason: `Trigger phase: ${record.trigger_phase}, reason: ${record.trigger_reason}`,
    modulesRegenerated: record.modules_regenerated,
    filesPatched: record.files_repaired,
    moduleDiffs: record.diffs.map(
      (d) =>
        `${d.type}: ${d.oldFileCount}f Ã¢â€ â€™ ${d.newFileCount}f, ${d.oldLineCount}l Ã¢â€ â€™ ${d.newLineCount}l`,
    ),
    success: record.success,
  }));
}

# Hack-A-Gent Dataset & Artifact Export Format v1.0.0

## 1. Overview

This document defines the serialization formats for all artifacts produced by the Hack-A-Gent benchmark framework. Every artifact is designed to be self-contained for full experiment reproducibility.

---

## 2. ExperimentSnapshot Format

The `ExperimentSnapshot` is the primary unit of reproducibility. It captures all state required to replay an experiment.

```jsonc
{
  "snapshotId": "string",
  "createdAt": "string (ISO 8601, deterministic)",
  "masterSeed": 42,
  "agents": [
    {
      "agentId": "string",
      "config": {
        "name": "string",
        "adversarialMode": true,
        "mutationCount": 2,
        "repairLimit": 2
      },
      "specializationProfile": {
        "remove_file": 0.85,
        "corrupt_content": 0.72
        // ... per mutation type
      }
    }
  ],
  "mutationGenomeState": {
    "genes": [
      {
        "id": "string",
        "type": "string",
        "generation": 0,
        "parentIds": [],
        "fitness": {
          "agent_differentiation_score": 0.5,
          "repair_difficulty_score": 0.5,
          "detection_variance_score": 0.5,
          "utility_score": 0.5,
          "ranking_separation_power": 0.5,
          "failure_pattern_consistency": 0.5,
          "repair_difficulty_variance": 0.5,
          "leaderboard_reshuffle_contribution": 0.5
        },
        "parameters": {
          "operationSequence": ["remove_file"],
          "intensityRange": [0.3, 0.7],
          "targetCategories": ["file_structure"],
          "severityBias": "medium",
          "combinatorialWeights": {}
        },
        "sampleCount": 0
      }
    ]
  },
  "initialRepository": {
    "projectName": "string",
    "blueprintVersion": "1.0.0",
    "modules": [
      {
        "name": "frontend",
        "type": "frontend",
        "files": [
          {
            "path": "src/App.tsx",
            "content": "export default function App() { ... }"
          }
        ]
      }
    ]
  },
  "mutationSequence": [
    {
      "geneId": null,
      "mutationType": "corrupt_content",
      "operationSequence": ["corrupt_content"],
      "intensity": 0.5,
      "severity": "medium",
      "moduleTarget": "frontend",
      "fileTarget": "src/App.tsx"
    }
  ],
  "fullExecutionTrace": {
    "agentTraces": [
      {
        "agentId": "string",
        "phase": "building",
        "action": "generate_file",
        "module": "frontend",
        "file": "src/App.tsx",
        "timestamp": "string (deterministic)"
      }
    ],
    "repairDecisionTraces": [
      {
        "attempt": 1,
        "triggerPhase": "build_verification",
        "triggerReason": "Missing file: src/App.tsx",
        "strategyUsed": "file-level patch",
        "success": true
      }
    ],
    "verificationReasoningTraces": [
      {
        "phase": "build_verification",
        "check": "checkRepositoryStructure",
        "passed": false,
        "errors": [
          {
            "category": "missing_file",
            "severity": "error",
            "message": "Required file src/App.tsx not found",
            "module": "frontend",
            "file": "src/App.tsx"
          }
        ]
      }
    ],
    "judgeScoringTraces": [
      {
        "aspect": "Functionality",
        "score": 8,
        "max": 10,
        "reasoning": "Core features present with minor issues"
      }
    ],
    "mutationSelectionTraces": [
      {
        "mutationType": "corrupt_content",
        "intensity": 0.5,
        "selectionMethod": "weighted_random",
        "difficultyScore": 0.5
      }
    ]
  },
  "phaseResults": [ /* PhaseResult[] */ ],
  "finalResults": {
    "robustnessScore": 75.0,
    "repairEfficiency": 80.0,
    "mutationSurvivalRate": 0.2,
    "detectionAccuracy": 85.0,
    "leaderboardRank": 1,
    "correctnessScore": 90.0,
    "mutationRecoveryRate": 80.0,
    "perMutationTypeMetrics": [
      {
        "mutationType": "corrupt_content",
        "applied": 5,
        "detected": 4,
        "repaired": 3,
        "detectionRate": 0.8,
        "repairRate": 0.75,
        "survivalRate": 0.4
      }
    ],
    "canonicalScore": 78.0,
    "verdict": "pass",
    "reasoning": "Agent demonstrated strong mutation detection and repair capability"
  },
  "protocolVersion": "1.0.0",
  "mutationEngineVersion": "1.0.0",
  "judgeVersion": "1.0.0",
  "repairEngineVersion": "1.0.0",
  "reproducibilityHash": "a1b2c3d4"
}
```

### 2.1 Reproducibility Hash Computation

```
hashInput = sorted(JSON.stringify({
  masterSeed, initialRepository, mutationSequence,
  phaseResults, finalResults, protocolVersion,
  mutationEngineVersion, judgeVersion, repairEngineVersion
}))
hash = DJB2(hashInput)  // 8-hex-char string
```

---

## 3. Mutation Log Format

Each mutation applied during adversarial phase is recorded as:

```json
{
  "type": "corrupt_content",
  "severity": "medium",
  "moduleName": "frontend",
  "filePath": "src/App.tsx",
  "description": "Corrupted content in src/App.tsx (replaced 'export' with 'expoort')",
  "expectedFailureCategory": "content_corruption",
  "geneId": null
}
```

The complete mutation log is saved as `mutations-applied.json` in the artifacts directory.

---

## 4. Agent Outputs Format

### 4.1 Agent Configuration

```json
{
  "id": "agent-001",
  "config": {
    "name": "Alpha-Agent",
    "adversarialMode": true,
    "mutationCount": 2,
    "repairLimit": 2
  },
  "specializationProfile": {
    "agentId": "agent-001",
    "perMutationType": {
      "remove_file": {
        "successRate": 0.85,
        "failureRate": 0.15,
        "adaptationScore": 0.72,
        "runCount": 5
      }
    },
    "adaptationSpeed": 0.65,
    "resilienceFactor": 0.78,
    "dominantMutationTypes": ["remove_file", "corrupt_content"],
    "vulnerableMutationTypes": ["break_import_path", "change_return_type"]
  },
  "benchmarkHistory": [
    {
      "benchmark_id": "bench-ai-001",
      "robustness_score": 92.5,
      "overall_success": true
    }
  ],
  "evolutionaryHistory": [
    {
      "timestamp": "string (deterministic)",
      "robustnessScore": 92.5,
      "rank": 1,
      "bdi": 65,
      "globalDifficulty": 0.5,
      "perMutationTypePerformance": {
        "remove_file": 96.0,
        "corrupt_content": 88.0
      }
    }
  ],
  "createdAt": "string (deterministic)",
  "lastUpdated": "string (deterministic)"
}
```

### 4.2 Agent Registry State

```json
{
  "agents": [ /* Agent[] */ ],
  "leaderboardEntries": [ /* LeaderboardEntry[] */ ],
  "metadata": {
    "totalRuns": 15,
    "totalAgents": 3,
    "startedAt": "string (deterministic)"
  }
}
```

---

## 5. Leaderboard Format

### 5.1 Leaderboard Entry

```json
{
  "agentId": "agent-001",
  "name": "Alpha-Agent",
  "averageRobustnessScore": 85.3,
  "mutationSurvivalRate": 0.88,
  "repairEfficiency": 82.1,
  "specializationScore": 0.79,
  "totalBenchmarksRun": 5,
  "rank": 1,
  "lastRunAt": "string (deterministic)",
  "strongestMutationType": "remove_file",
  "mostVulnerableMutationType": "change_return_type"
}
```

### 5.2 Evolution Metrics

```json
{
  "topPerformers": [ /* LeaderboardEntry[] top 3 */ ],
  "averageBenchmarksPerAgent": 5.0,
  "mutationDifficultyTrend": "increasing",
  "specializationDiversity": 0.72,
  "adaptationRate": 0.65,
  "hardMutationClusters": ["break_import_path", "change_return_type"]
}
```

---

## 6. Trace Format

### 6.1 Causal Trace Entry

```json
{
  "eventId": "string (deterministic UUID)",
  "parentEventId": "string | null",
  "phaseId": "string",
  "type": "mutation_application" | "repair_decision" | "verification_check" | "judge_scoring" | "planning" | "architecture" | "generation" | "testing",
  "timestamp": "string (deterministic ISO 8601)",
  "actor": "system" | "agent" | "judge",
  "data": {
    // Type-specific payload
  },
  "delta_ms": 0
}
```

### 6.2 Trace Integrity Verification

All traces must satisfy:
- Every non-root event has a valid `parentEventId` referencing an existing event
- No duplicate `eventId` values
- All events within a contiguous sequence reference their immediate predecessor
- The causality graph forms a directed acyclic tree from root events

---

## 7. Publication Output Format

### 7.1 `PublicationExperimentOutput`

The canonical publication format for sharing results:

```json
{
  "metadata": {
    "experimentId": "string",
    "runId": "string",
    "benchmarkId": "bench-ai-001",
    "benchmarkName": "AI Hackathon — Smart Assistant",
    "benchmarkCategory": "ai",
    "agentId": "agent-001",
    "agentName": "Alpha-Agent",
    "modelProvider": "mock",
    "modelName": "benchmark-model",
    "promptStrategy": "standard",
    "reasoningArchitecture": "none",
    "masterSeed": 42
  },
  "versions": {
    "protocolVersion": "1.0.0",
    "mutationEngineVersion": "1.0.0",
    "judgeVersion": "1.0.0",
    "repairEngineVersion": "1.0.0"
  },
  "metrics": {
    "robustnessScore": 75.0,
    "repairEfficiency": 80.0,
    "mutationSurvivalRate": 0.2,
    "detectionAccuracy": 85.0,
    "leaderboardRank": 1,
    "correctnessScore": 90.0,
    "mutationRecoveryRate": 80.0
  },
  "perMutationTypeMetrics": [
    {
      "mutationType": "corrupt_content",
      "applied": 5,
      "detected": 4,
      "repaired": 3,
      "detectionRate": 0.8,
      "repairRate": 0.75,
      "survivalRate": 0.4
    }
  ],
  "mutationSequence": [ /* FrozenMutationSequenceEntry[] */ ],
  "initialRepositoryHash": "a1b2c3d4",
  "finalRepositoryHash": "e5f6g7h8",
  "protocolPhases": ["planning", "architecture", "building", "materialization", "build_verification", "testing", "judging", "repair"],
  "totalDurationMs": 15000,
  "totalTokensUsed": 5000,
  "errors": [],
  "reproducibilityHash": "rep-42-abc123"
}
```

---

## 8. Directory Structure

Each benchmark run produces artifacts in a structured directory:

```
{artifactsDir}/
  {benchmark-id}/
    {run-id}/
      benchmark-definition.json      # Original benchmark spec
      architecture-blueprint.json     # Generated architecture
      pre-mutation-repository.json    # Repository before mutations
      mutations-applied.json          # Log of all applied mutations
      mutated-repository.json         # Repository after mutations
      experiment-snapshot.json        # Full reproducibility snapshot
      benchmark-run-result.json       # Validated BenchmarkRunResult
      generated-repository.json       # Final repository state
      verification-result.json        # BuildVerifier output
      evaluation-result.json          # FinalEvaluationResult
      ws/                             # Materialized workspace
```

For league runs:

```
reports/
  leaderboard.json                    # Persistent leaderboard state
  mutations.json                      # Mutation genome population
  LEAGUE_RESULTS.md                   # Formatted league report
  FAILURE_PATTERNS.md                  # Failure pattern analysis
```

---

## 9. Snapshot Builder API

```typescript
class ExperimentSnapshotBuilder {
  setMasterSeed(seed: number): this;
  setAgents(agents: FrozenAgentState[]): this;
  setGenomeState(genome: FrozenGenomeState): this;
  setInitialRepository(repo: FrozenRepositoryState): this;
  setMutationSequence(seq: FrozenMutationSequenceEntry[]): this;
  setExecutionTrace(trace: ExperimentSnapshot['fullExecutionTrace']): this;
  setPhaseResults(phases: BenchmarkRunResult['phases']): this;
  setFinalResults(results: FinalEvaluationResult): this;
  setVersions(versions: { protocolVersion, mutationEngineVersion, judgeVersion, repairEngineVersion }): this;
  build(): ExperimentSnapshot;
}
```

---

## 10. Replay Engine API

```typescript
function thawRepository(frozen: FrozenRepositoryState): Repository;
// Reconstructs a Repository from frozen state

function replayMutationSequence(snapshot: ExperimentSnapshot): {
  mutationSequence: FrozenMutationSequenceEntry[];
  originalRepository: Repository;
  finalRepository: Repository;
};
// Re-applies mutations using the original seed

function compareResults(
  expected: FinalEvaluationResult,
  actual: FinalEvaluationResult,
  tolerance?: number,           // default 0.01
): string[];
// Returns list of mismatches (empty if identical)

function validateDeterministicEquality(
  snapshot: ExperimentSnapshot,
  orchestratorFn: (seed: number) => { result: FinalEvaluationResult },
): Promise<ReplayResult>;
// Full replay + comparison
```

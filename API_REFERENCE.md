# Hack-A-Gent API Reference

> **Version:** 0.1.0  
> **Language:** TypeScript (Node.js)  
> **Package:** `hack-agent`

---

## 1. Core Framework (`kernel/`)

The core framework provides the foundational abstractions: agents, events, tasks, builders, LLM routing, planning, memory, state machines, judging, execution, context management, skills, prompts, workspace management, and recovery.

---

### 1.1 Types (`kernel/types/index.ts`)

Base enums and type schemas used across the entire system.

| Export | Kind | Description |
|---|---|---|
| `AgentTypeSchema` / `AgentType` | Zod enum | `'orchestrator' | 'planner' | 'question' | 'architect' | 'execution' | 'subagent' | 'judge' | 'infrastructure' | 'utility'` |
| `TaskTypeSchema` / `TaskType` | Zod enum | `'analysis' | 'planning' | 'architecture' | 'implementation' | 'testing' | 'judging' | 'documentation' | 'devops' | 'fix' | 'refactor' | 'review'` |
| `TaskStatusSchema` / `TaskStatus` | Zod enum | `'PENDING' | 'READY' | 'RUNNING' | 'WAITING' | 'BLOCKED' | 'FAILED' | 'COMPLETED' | 'SKIPPED'` |
| `TaskPrioritySchema` / `TaskPriority` | Zod enum | `'critical' | 'high' | 'medium' | 'low'` |
| `PhaseSchema` / `Phase` | Zod enum | All pipeline phases from `'INIT'` through `'COMPLETED'` |
| `EventTypeSchema` / `EventType` | Zod regex | Uppercase underscore-separated string |
| `EventDeliverySchema` / `EventDelivery` | Zod enum | `'at_most_once' | 'at_least_once' | 'exactly_once'` |
| `EventPrioritySchema` / `EventPriority` | Zod enum | `'critical' | 'high' | 'normal' | 'low'` |
| `MemoryFileSchema` / `MemoryFile` | Zod enum | `'AGENT_LOG.md' | 'BUGS.md' | 'DECISIONS.md' | 'TODO.md'` |
| `MemoryAccessSchema` / `MemoryAccess` | Zod enum | `'append' | 'read' | 'update' | 'admin'` |
| `AccessLevelSchema` / `AccessLevel` | Zod enum | `'read' | 'write' | 'delete' | 'admin'` |
| `AnomalyTypeSchema` / `AnomalyType` | Zod enum | `'infinite_loop' | 'failure_burst' | 'hallucinated_file' | 'broken_build' | 'stuck_checkpoint' | 'context_thrashing'` |
| `AnomalySeveritySchema` / `AnomalySeverity` | Zod enum | `'low' | 'medium' | 'high' | 'critical'` |
| `CheckpointTypeSchema` / `CheckpointType` | Zod enum | Checkpoint types (e.g. `'deployment_approval'`) |
| `CheckpointStatusSchema` / `CheckpointStatus` | Zod enum | `'pending' | 'waiting' | 'resolved' | 'expired' | 'overridden'` |

---

### 1.2 Agents (`kernel/agents/`)

#### `AgentManifest` (interface)

Schema describing an agent's identity, capabilities, permissions, and behavior.

| Property | Type | Description |
|---|---|---|
| `agent_id` | `string` | Dot-separated lowercase ID (e.g. `"planner.v1"`) |
| `agent_name` | `string` | Human-readable name |
| `agent_type` | `AgentType` | Role classification |
| `contract_version` | `string` | SemVer string |
| `capabilities` | `AgentCapability[]` | Declared capabilities |
| `required_skills` | `string[]` | Skills needed |
| `event_subscriptions` | `string[]` | Event types agent listens to |
| `accepted_tasks` | `TaskType[]` | Task types agent can execute |
| `produced_outputs` | `OutputSpecification[]` | Output artifacts |
| `accessible_tools` | `ToolPermission[]` | Tool access rules |
| `accessible_memories` | `MemoryPermission[]` | Memory access rules |
| `escalation_rules` | `EscalationRule[]` | Error escalation policies |
| `timeout_ms` | `number` | Per-task timeout (default 300000) |
| `max_retries` | `number` | Max retries (default 3) |

#### `AgentRegistration` (interface)

| Property | Type | Description |
|---|---|---|
| `manifest` | `AgentManifest` | The agent manifest |
| `endpoint` | `string` | URI where agent listens |
| `health_check` | `{ type, interval_ms }` | Heartbeat config |

#### `AgentRecord` (interface)

| Property | Type | Description |
|---|---|---|
| `manifest` | `AgentManifest` | |
| `endpoint` | `string` | |
| `registered_at` | `string` | ISO timestamp |
| `last_heartbeat` | `string \| null` | |
| `status` | `'active' \| 'idle' \| 'draining' \| 'failed'` | |

#### `AgentRegistry` (class)

In-memory registry of agents.

| Method | Signature | Description |
|---|---|---|
| `register` | `(registration: AgentRegistration): AgentRecord` | Register an agent |
| `unregister` | `(agentId: string): boolean` | Remove an agent |
| `findById` | `(agentId: string): AgentRecord \| null` | Lookup by ID |
| `findByType` | `(agentType: string): AgentRecord[]` | Filter by type |
| `findByCapability` | `(capabilityId: string): AgentRecord[]` | Filter by capability |
| `findByTaskType` | `(taskType: string): AgentRecord[]` | Filter by accepted task type |
| `findAvailable` | `(taskType: string): AgentRecord \| null` | Round-robin available agent |
| `heartbeat` | `(agentId: string): void` | Update heartbeat timestamp |
| `setStatus` | `(agentId: string, status): void` | Update agent status |
| `listAgents` | `(): AgentRecord[]` | All registered agents |
| `count` | `(): number` | Agent count |

#### `Agent` (interface)

| Method | Signature | Description |
|---|---|---|
| `onEvent` | `(event: { type, payload }): Promise<void>` | Handle a routed event |
| `executeTask` | `(task: Task): Promise<TaskResult>` | Execute an assigned task |
| `initialize` | `(): Promise<void>` | Startup hook |
| `shutdown` | `(): Promise<void>` | Cleanup hook |

#### `AgentRuntime` (class)

Manages agent lifecycle and task dispatching.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(config: AgentRuntimeConfig)` | Config includes `EventBus`, `TaskLifecycleManager`, `AgentRegistry` |
| `registerAgent` | `(agent: Agent): void` | Register and subscribe agent to events |
| `getAgent` | `(agentId: string): Agent \| null` | Get loaded agent instance |
| `executeTask` | `(task: Task): Promise<TaskResult>` | Find available agent, dispatch task |
| `heartbeat` | `(agentId: string): Promise<void>` | Send heartbeat |
| `initialize` | `(): Promise<void>` | Initialize all agents |
| `shutdown` | `(): Promise<void>` | Shutdown all agents |

---

### 1.3 Events (`kernel/events/`)

#### `EventEnvelope` (interface)

| Property | Type | Description |
|---|---|---|
| `event_id` | `string` (UUID) | Unique event ID |
| `type` | `string` | Uppercase event type (e.g. `TASK_COMPLETED`) |
| `source` | `string` | Origin component |
| `target` | `string \| string[]` | Target(s) or `'*'` |
| `timestamp` | `string` | ISO datetime |
| `schema_version` | `string` | `"1.0"` |
| `correlation_id` | `string` (UUID) | Correlation ID |
| `causation_id` | `string \| null` | Parent event ID |
| `payload` | `Record<string, unknown>` | Event data |
| `metadata` | `EventMetadata` | Delivery metadata |

#### `EventMetadata` (interface)

| Property | Type | Description |
|---|---|---|
| `priority` | `'critical' \| 'high' \| 'normal' \| 'low'` | |
| `delivery_guarantee` | `'at_most_once' \| 'at_least_once' \| 'exactly_once'` | |
| `ttl_ms` | `number` | Time-to-live |
| `retry_count` | `number` | Current retry |
| `max_retries` | `number` | Max retries before DLQ |
| `blocking` | `boolean` | If true, delivery failure throws |
| `persist` | `boolean` | Persist to event store |

#### `EventAck` (interface)

| Property | Type | Description |
|---|---|---|
| `event_id` | `string` | |
| `receiver` | `string` | |
| `status` | `'accepted' \| 'rejected' \| 'deferred'` | |
| `reason` | `string \| optional` | |

#### `createEvent(params: CreateEventParams): EventEnvelope`

Factory to produce a validated `EventEnvelope`.

#### `EventBus` (class)

Central pub/sub event bus with persistence, retry, dead letter queue, and replay.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(baseDir: string)` | Initializes JSONL store and DLQ |
| `subscribe` | `(subscriberId, eventTypes, handler, filter?): string` | Subscribe handler to event type(s); returns subscription ID |
| `unsubscribe` | `(id: string): void` | Remove subscription |
| `publish` | `(event: EventEnvelope): Promise<void>` | Persist + route to all matching subscribers |
| `publishAndWait` | `(event: EventEnvelope): Promise<void>` | Publish and throw if any handler fails |
| `acknowledge` | `(ack: EventAck): Promise<void>` | Record acknowledgment |
| `replay` | `(options?: ReplayOptions): AsyncGenerator<EventEnvelope>` | Deterministic replay from JSONL store |
| `getDeadLetterQueue` | `(): DeadLetterQueue` | Access the DLQ |
| `start` | `(): Promise<void>` | Start the bus |
| `stop` | `(): Promise<void>` | Stop the bus |
| `isRunning` | `(): boolean` | Running state |

#### `JsonlEventStore` (class)

Persistent JSONL-backed event store with replay.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(baseDir: string)` | |
| `append` | `(event: EventEnvelope): Promise<void>` | Append to store |
| `replay` | `(options?: ReplayOptions): AsyncGenerator<EventEnvelope>` | Iterate stored events |
| `count` | `(): number` | Total events stored |

#### `DeadLetterQueue` (class)

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(baseDir: string)` | |
| `send` | `(event: EventEnvelope, reason: string): Promise<void>` | Send to DLQ |
| `replay` | `(): AsyncGenerator<DeadLetterEntry>` | Replay dead letters |
| `count` | `(): number` | DLQ size |

---

### 1.4 Tasks (`kernel/tasks/`)

#### `Task` (interface)

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` (UUID) | |
| `project_id` | `string` | |
| `parent_task_id` | `string \| null` | |
| `creator_agent` | `string` | |
| `assigned_agent` | `string \| null` | |
| `status` | `TaskStatus` | |
| `type` | `TaskType` | |
| `description` | `string` | |
| `dependencies` | `string[]` | Task IDs this depends on |
| `acceptance_criteria` | `AcceptanceCriterion[]` | |
| `retries` | `RetryPolicy` | |
| `priority` | `TaskPriority` | |
| `checkpoint_required` | `boolean` | |
| `required_skills` | `string[]` | |
| `input` | `Record<string, unknown>` | |
| `expected_outputs` | `string[]` | |
| `error` | `TaskError \| null` | |
| `timestamps` | `TaskTimestamps` | |

#### `TaskResult` (interface)

| Property | Type | Description |
|---|---|---|
| `task_id` | `string` | |
| `status` | `'COMPLETED' \| 'FAILED' \| 'SKIPPED'` | |
| `exit_code` | `'AGENT_OK' \| 'AGENT_FAIL' \| 'AGENT_FATAL' \| 'AGENT_SKIP'` | |
| `artifacts` | `string[]` | Output file paths |
| `criteria_results` | `{ criterion_id, passed, evidence }[]` | |
| `summary` | `string` | |
| `error` | `TaskError \| null` | |

#### `createTask(params: CreateTaskParams): Task`

Factory for creating a validated `Task`.

#### `TaskLifecycleManager` (class)

XState-based task state machine manager.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(repository: TaskRepository, queue: TaskQueue)` | |
| `transition` | `(task: Task, event: TaskEvent): Promise<Task>` | Apply a state transition |
| `handleResult` | `(task: Task, result: TaskResult): Promise<Task>` | Process task result (COMPLETE / FAIL / RETRY) |
| `checkDependencies` | `(task: Task): Promise<Task>` | Evaluate blocked-by dependencies |
| `setWaiting` | `(task: Task, checkpointId: string): Promise<Task>` | Set task as WAITING |
| `resume` | `(task: Task): Promise<Task>` | Resume a WAITING task |
| `fail` | `(task: Task, error?: string): Promise<Task>` | Force-fail a task |
| `complete` | `(task: Task): Promise<Task>` | Force-complete a task |
| `dispose` | `(taskId: string): void` | Cleanup actor |
| `disposeAll` | `(): void` | Cleanup all actors |

#### `TaskQueue` (class)

| Method | Signature | Description |
|---|---|---|
| `enqueue` | `(task: Task): Promise<void>` | |
| `dequeue` | `(): Promise<Task \| null>` | |
| `fail` | `(taskId: string, retryable: boolean): Promise<void>` | |
| `getBlockedBy` | `(task: Task): Promise<string[]>` | Unresolved dependency IDs |

#### `TaskRepository` (class)

| Method | Signature | Description |
|---|---|---|
| `save` | `(task: Task): Promise<void>` | |
| `findById` | `(taskId: string): Promise<Task \| null>` | |
| `update` | `(task: Task): Promise<void>` | |
| `findByProject` | `(projectId: string): Promise<Task[]>` | |
| `findByFilter` | `(filter: TaskFilter): Promise<Task[]>` | |

---

### 1.5 Builders (`kernel/builders/`)

#### `BuilderProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `generateFrontend` | `(blueprint: ArchitectureBlueprint): Promise<GeneratedModule>` | |
| `generateBackend` | `(blueprint): Promise<GeneratedModule>` | |
| `generateDatabase` | `(blueprint): Promise<GeneratedModule>` | |
| `generateConfig` | `(blueprint): Promise<GeneratedModule>` | |
| `generateDocumentation` | `(blueprint): Promise<GeneratedModule>` | |
| `generateTests` | `(blueprint): Promise<GeneratedModule>` | |

#### `CodeRepairProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `repairFile` | `(file: File, report: FileErrorReport): Promise<File>` | |
| `repairModule` | `(module: Module, report: ModuleErrorReport): Promise<ModuleRepairResult>` | |

#### `RepositoryValidator` (class)

| Method | Signature | Description |
|---|---|---|
| `validate` | `(repo: GeneratedRepository): ValidationReport` | Structure + consistency checks |

Key types: `GeneratedFile`, `GeneratedModule`, `GeneratedRepository`, `BuildResult`, `BuildIssue`, `ValidationReport`.

---

### 1.6 LLM (`kernel/llm/`)

#### `LLMProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `getModels` | `(): ModelSpec[]` | Available models |
| `getHealth` | `(): ProviderHealth` | Health status |
| `execute` | `(request: LLMRequest): Promise<LLMResponse>` | Send a completion request |

#### `RouterEngine` (class)

Multi-provider LLM router with cost controls and failover.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(providers: LLMProvider[], config?, routingTable?)` | |
| `getProvider` | `(id: string): LLMProvider \| undefined` | |
| `getHealth` | `(providerId: string): ProviderHealth \| null` | |
| `selectModel` | `(taskType, estimatedTokens, requiredCapabilities?): RoutingDecision` | Best model for the task |
| `execute` | `(request: LLMRequest): Promise<LLMResponse>` | Route and execute |

Key types: `LLMRequest`, `LLMResponse`, `ModelSpec`, `ProviderHealth`, `RoutingDecision`, `ModelCapability`.

---

### 1.7 Planning (`kernel/planning/`)

#### `PlanningProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `execute` | `(input: HackathonInput): Promise<PlannerOutput>` | Analyze hackathon spec |

#### `ArchitectProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `execute` | `(input): Promise<ArchitectureBlueprint>` | Produce architecture plan |

Key types: `PlannerOutput`, `ArchitectureBlueprint`, `ExecutionGraph`, `Milestone`, `HumanCheckpoint`.

---

### 1.8 State Machines (`kernel/state/`)

#### `projectMachine` (XState machine)

Exported state machine for project-level lifecycle.

Types: `ProjectContext`, `ProjectEvent`, `ProjectInput`.

#### `taskMachine` (XState machine)

Exported state machine for task lifecycle.

Types: `TaskContext`, `TaskEvent`, `TaskInput`.

---

### 1.9 Judging (`kernel/judge/`)

#### `JudgeProvider` (interface)

| Method | Signature | Description |
|---|---|---|
| `evaluateArchitecture` | `(blueprint: ArchitectureBlueprint): Promise<JudgeReport>` | |
| `evaluateCode` | `(repository: GeneratedRepository): Promise<JudgeReport>` | |
| `evaluateUX` | `(blueprint, repository?, testReport?): Promise<JudgeReport>` | |
| `evaluateHackathon` | `(blueprint, repository?, testReport?): Promise<JudgeReport>` | |

#### `ProductJudge`, `CodeJudge`, `UXJudge`, `HackathonJudge`, `MockJudgeProvider` (classes)

Concrete implementations of `JudgeProvider`.

Key types: `JudgeReport`, `JudgeCriterion`, `JudgeIssue`, `JudgeScore`, `JudgeVerdict`.

---

### 1.10 Execution (`kernel/execution/`)

| Export | Kind | Description |
|---|---|---|
| `RepositoryMaterializer` | interface | `materialize(repo, workspacePath): Promise<MaterializationResult>` |
| `DefaultRepositoryMaterializer` | class | Concrete materializer |
| `RollbackableRepositoryMaterializer` | class | Materializer with rollback support |
| `WorkspaceProvisioner` | interface | `provision(projectId): Promise<Workspace>` |
| `DefaultWorkspaceProvisioner` | class | |
| `BuildExecutor` | interface | `execute(buildCommand): Promise<BuildReport>` |
| `DefaultBuildExecutor` | class | |
| `DevServerExecutor` | interface | `start(project): Promise<RunningApplication>` |
| `DefaultDevServerExecutor` | class | |

---

### 1.11 Context (`kernel/context/`)

| Export | Kind | Description |
|---|---|---|
| `ContextEngine` | class | Assembles and manages context packages |
| `ContextItem` / `ContextPackage` | types | Structured context data |

---

### 1.12 Skills (`kernel/skills/`)

| Export | Kind | Description |
|---|---|---|
| `SkillEngine` | class | Resolves and executes skills |
| `SkillType`, `SkillMetadata`, `ResolvedSkill`, `ConflictReport` | types | Skill definitions |

---

### 1.13 Prompts (`kernel/prompts/`)

| Export | Kind | Description |
|---|---|---|
| `PromptEngine` | class | Assembles templates into prompts |
| `PromptComponent`, `PromptTemplate`, `PromptAssembly` | types | |

---

### 1.14 Memory (`kernel/memory/`)

| Export | Kind | Description |
|---|---|---|
| `MemoryWriter` | class | Writes to agent memory files |
| `LogEntry`, `BugEntry`, `DecisionEntry`, `TodoSection` | types | |

---

### 1.15 Workspace (`kernel/workspace/`)

| Export | Kind | Description |
|---|---|---|
| `WorkspaceManager` | class | Manages scratchpad and workspace access |
| `WorkspaceAccess`, `WorkspacePermissions`, `ScratchpadEntry` | types | |

---

### 1.16 Recovery (`kernel/recovery/`)

| Export | Kind | Description |
|---|---|---|
| `AnomalyDetector` | class | Detects runtime anomalies |
| `Anomaly`, `DetectorConfig` | types | |

---

## 2. Benchmark Engines (`benchmarks/`)

Simulation, evaluation, mutation, and competition engines for running hackathon benchmarks.

---

### 2.1 Benchmark Types (`benchmarks/benchmark-types.ts`)

| Export | Description |
|---|---|
| `HackathonCategorySchema` / `HackathonCategory` | `'ai' \| 'saas' \| 'webapp' \| 'healthcare' \| 'education'` |
| `HackathonBenchmarkDefinition` | Full benchmark spec: id, name, category, deliverables, success criteria, rubric |
| `BenchmarkRunResult` | Result of a single benchmark run: phases, scores, mutations, errors |
| `BenchmarkSuiteResult` | Aggregated suite result with summary statistics |
| `PhaseResult` | Individual phase outcome within a benchmark run |
| `EvaluationRubric` | Scoring rubric with items, max total, passing threshold |
| `SuccessCriterion` | Individual criterion with weight and verification method |

---

### 2.2 Benchmark Definitions (`benchmarks/hackathon-benchmarks.ts`)

| Export | Description |
|---|---|
| `ALL_BENCHMARKS` | Array of all predefined `HackathonBenchmarkDefinition` |
| `AI_HACKATHON` | AI smart assistant benchmark |
| `SAAS_HACKATHON` | Subscription manager benchmark |
| `WEBAPP_HACKATHON` | Web application benchmark |
| `HEALTHCARE_HACKATHON` | Healthcare platform benchmark |
| `EDUCATION_HACKATHON` | Education platform benchmark |
| `getBenchmarkById(id)` | Lookup a benchmark by ID |
| `getBenchmarksByCategory(category)` | Filter benchmarks by category |

---

### 2.3 HackathonBenchmarkRunner (`benchmarks/hackathon-benchmark-runner.ts`)

The main benchmark execution engine. Runs a multi-phase pipeline: planning → architecture → building → materialization → [adversarial mutation] → verification/repair loop → testing → judging.

```typescript
class HackathonBenchmarkRunner {
  constructor(config: BenchmarkRunnerConfig)
}
```

#### `BenchmarkRunnerConfig` (interface)

| Property | Type | Description |
|---|---|---|
| `planner` | `{ execute(input): Promise<{output: PlannerOutput}> }` | Planning provider |
| `architect` | `{ execute(input): Promise<{output: ArchitectureBlueprint}> }` | Architecture provider |
| `builderProvider` | `BuilderProvider` | Code generation provider |
| `codeRepairProvider?` | `CodeRepairProvider` | Repair logic (default: `DefaultCodeRepairProvider`) |
| `buildVerifier?` | `BuildVerifier` | Build verification |
| `testAgent?` | `BenchmarkTester` | Test execution |
| `judgePanel?` | `BenchmarkJudge` | Judge evaluation |
| `artifactsDir?` | `string` | Output directory |
| `repairLimit?` | `number` | Max repair attempts (default 2) |
| `adversarialMode?` | `boolean` | Enable mutation injection |
| `mutationCount?` | `number` | Number of mutations |
| `difficultyController?` | `MutationDifficultyController` | Adaptive difficulty |
| `memoryBuffer?` | `PerformanceMemoryBuffer` | Performance history |
| `curriculum?` | `AdversarialIntelligenceCurriculum` | Curriculum learning |
| `agentId?` | `string` | Agent identifier |
| `seed?` | `number` | Deterministic seed |

| Method | Signature | Description |
|---|---|---|
| `runBenchmark` | `(benchmark, options?): Promise<BenchmarkRunResult>` | Execute full benchmark pipeline |
| `getRepairHistory` | `(): readonly RepairRecord[]` | Repair attempt log |
| `createSharedMutationState` | `static (repo, mutationCount?, seed?, difficultyController?): SharedMutationState` | Create pre-computed mutation state |

---

### 2.4 Determinism Kernel (`benchmarks/determinism-kernel.ts`)

Deterministic PRNG used across all engines for reproducible runs.

| Export | Description |
|---|---|
| `RNG` (interface) | `next(): number`, `nextInt(min, max): number`, `pick<T>(items): T`, `shuffle<T>(items): T[]` |
| `getSeededRandom(seed)` | Create a new seeded RNG |
| `initializeGlobalRNG(seed)` | Initialize the global RNG |
| `resetGlobalRNG()` | Clear global RNG |
| `getGlobalRNG()` | Get global RNG (throws if uninitialized) |
| `createDeterministicUuid(seed, counter)` | Deterministic UUID v4 |
| `deterministicNow(seed)` | Deterministic timestamp |

---

### 2.5 HackathonSimulationEngine (`benchmarks/hackathon-simulation-engine.ts`)

Simulates hackathon execution: strategy generation, execution simulation, judging, repair, winner selection.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(seed: number)` | |
| `generateStrategies` | `(spec: ParsedHackathonSpec): Strategy[]` | Generate competing strategies |
| `simulateExecution` | `(strategies): { failures, successfulTasks, deployUrls }` | Simulate build/deploy |
| `judgeStrategy` | `(strategy, taskCount, failures): JudgeVerdict` | Simulate judge scoring |
| `simulateRepairs` | `(strategies, failures): RepairEvent[]` | Simulate repair attempts |
| `selectWinner` | `(scores: StrategyScore[]): StrategyScore` | Pick best strategy |
| `simulate` | `(input: SimulationInput): SimulationResult` | Full simulation run |
| `preview` | `(spec: ParsedHackathonSpec): PreviewOutput` | Quick strategy preview |

Key types: `Strategy`, `StrategyScore`, `FailureEvent`, `RepairEvent`, `SimulationInput`, `SimulationResult`.

---

### 2.6 JudgeSimulator (`benchmarks/judge-simulator.ts`)

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(config: JudgeSimulatorConfig)` | Config includes seed and optional bias |
| `evaluate` | `(params): JudgeVerdict` | Score a submission across 5 axes |

Types: `JudgeScore` (innovation, functionality, uxPolish, technicalDepth, demoReliability), `JudgeVerdict` (total, breakdown, biasApplied, wowMomentBonus, passFail, feedback), `JudgeBias`.

---

### 2.7 Mutation Engine (`benchmarks/mutation-engine.ts`)

Injects code mutations for adversarial robustness testing.

| Export | Signature / Description |
|---|---|
| `applyMutations` | `(repo, mutationCount?, seed?, difficultyController?): MutationResult` |
| `applyGenomeMutations` | `(repo, genome, seed?): MutationResult` |

Types: `MutationType`, `MutationSeverity`, `MutationMetadata`, `MutationResult`.

---

### 2.8 Mutation Difficulty Controller (`benchmarks/mutation-difficulty-controller.ts`)

| Method | Signature | Description |
|---|---|---|
| `updateAfterRun` | `(perTypeStats): void` | Adapt difficulty |
| `getGlobalAverageDifficulty` | `(): number` | Current difficulty 0–1 |

---

### 2.9 Mutation Evolution Controller (`benchmarks/mutation-evolution-controller.ts`)

| Method | Signature | Description |
|---|---|---|
| `evolve` | `(): EvolutionDecision` | Evolve mutation strategy |
| `getReport` | `(): MutationEvolutionReport` | Full report |

---

### 2.10 Mutation Genome (`benchmarks/mutation-genome.ts`)

| Export | Description |
|---|---|
| `MutationGenome` (class) | Genetic representation of mutation strategies |
| `MutationGene`, `MutationGeneParams`, `MutationFitness` | Types |

---

### 2.11 DemoSurfaceCompiler (`benchmarks/demo-surface-compiler.ts`)

Generates a "demo surface" plan — a minimal viable hackathon pitch.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(seed?)` | |
| `compile` | `(parsedInput): DemoSurfacePlan` | Generate demo plan |
| `validateWowMoment` | `(): { valid, reason?, suggestion? }` | Validate wow factor |
| `produceFinalOutput` | `(plan, deployTarget): FinalDemoOutput` | Final pitch output |
| `getPlan` | `(): DemoSurfacePlan \| null` | Last compiled plan |

Types: `DemoSurfacePlan`, `WinScoreBreakdown`, `WowMoment`, `DemoExecutionStep`, `FinalDemoOutput`.

---

### 2.12 Evaluation Orchestrator (`benchmarks/evaluation-orchestrator.ts`)

Computes final robustness scores from verification, mutation, and repair data.

| Export | Description |
|---|---|
| `EvaluationOrchestrator` (class) | `evaluate(input: EvaluationInput): FinalEvaluationResult` |
| `computeRobustnessScore` | Standalone function |
| `computeRepairEfficiency` | Standalone function |
| `computeMutationRecoveryRate` | Standalone function |

Types: `EvaluationInput`, `FinalEvaluationResult`.

---

### 2.13 InternetHackathonOrchestrator (`benchmarks/internet-hackathon-orchestrator.ts`)

Full pipeline orchestrator that interacts with real external services (GitHub, Vercel, browser).

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(workspaceRoot, stateDir, seed)` | |
| `setDevpostData` | `(data: DevpostData): void` | Set parsed input |
| `buildExecutionPlan` | `(): InternetExecutionPlan` | Build task graph |
| `executeFullPipeline` | `(): Promise<PipelineResult>` | Run full pipeline |
| `getPhase` | `(): OrchestratorPhase` | Current phase |

Types: `OrchestratorPhase`, `InternetExecutionPlan`, `PipelineResult`, `AutoDecision`.

---

### 2.14 Phase12Orchestrator (`benchmarks/phase-12-orchestrator.ts`)

Strategy competition and post-project learning orchestrator.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(seed?)` | Initializes memory, reward model, simulation engine, policy optimizer, skill graph, competition, learning cycle |
| `runProject` | `(input): Promise<Phase12Report>` | Full strategy competition + reward prediction |
| `runPostProject` | `(input): Promise<LearningCycleOutput>` | Post-project retrospective learning |

Types: `Phase12Report`, `LearningCycleOutput`.

Injected sub-engines (public readonly properties):

| Property | Type | Description |
|---|---|---|
| `memory` | `OrganizationalMemoryBank` | Cross-project memory |
| `rewardModel` | `HackathonRewardModel` | Reward prediction |
| `simulationEngine` | `StrategySimulationEngine` | Strategy simulation |
| `policyOptimizer` | `ExecutionPolicyOptimizer` | Policy evolution |
| `skillGraph` | `SkillGraph` | Technology skill tracking |
| `competition` | `MultiAgentCompetition` | Internal agent competition |
| `learningCycle` | `PostProjectLearningCycle` | Post-project learning |

---

### 2.15 OrganizationalMemoryBank (`benchmarks/organizational-memory-bank.ts`)

Persistent cross-project memory that stores project snapshots, winning patterns, and failure patterns.

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(seed?)` | |
| `saveSnapshot` | `(snapshot: ProjectSnapshot): void` | Store project record |
| `querySimilarProjects` | `(query: string, limit?): MemoryQueryResult` | Find similar projects |
| `getWinningPatterns` | `(): WinningPattern[]` | Top winning patterns |
| `getFailurePatterns` | `(): FailurePatternRecord[]` | Common failures |

Types: `ProjectSnapshot`, `WinningPattern`, `MemoryQueryResult`.

---

### 2.16 DevpostIngestionLayer (`benchmarks/devpost-ingestion-layer.ts`)

| Method | Signature | Description |
|---|---|---|
| `constructor` | `(seed?)` | |
| `parse` | `(input, source?): Promise<ParsedHackathonSpec>` | Parse Devpost URL, file, or raw text |

Type: `ParsedHackathonSpec` — normalized hackathon specification.

---

### 2.17 Report Generation (`benchmarks/benchmark-report.ts`)

| Export | Signature | Description |
|---|---|---|
| `generateBenchmarkReport` | `(results: BenchmarkRunResult[]): BenchmarkSuiteResult` | Full suite report |
| `generateCategoryBreakdown` | `(results): Record<string, { count, passRate, avgScore }>` | Per-category breakdown |
| `generateBenchmarkSummaryMarkdown` | `(results): string` | Markdown summary |
| `generateMutationEvolutionReportMarkdown` | `(report): string` | Evolution report |

---

### 2.18 Failure Patterns (`benchmarks/failure-patterns.ts`)

| Export | Signature | Description |
|---|---|---|
| `analyzeFailurePatterns` | `(results): FailurePattern[]` | Extract patterns |
| `generateFailurePatternsMarkdown` | `(patterns): string` | Markdown output |
| `getTopFailurePatterns` | `(patterns, n?): FailurePattern[]` | Top N patterns |

---

### 2.19 Swarm & Civilization Engines

#### `SwarmMemoryBank`, `SwarmJudgeAggregator`, `SwarmEvolutionEngine`, `SwarmLeaderboard`, `HackathonSwarmOrchestrator`

Multi-agent swarm competition components. See `benchmarks/index.ts` exports.

#### `GlobalHackathonWorld`, `GlobalMemoryIndex`, `GlobalGoalMonitor`, `CompanySpawner`, `ExecutiveCompanyBrain`, `CompanyEvolutionEngine`, `CompanyEvolutionEngine`, `HackathonCompanyOrchestrator`, `HackathonRewardModel`, `ResourceMarketModel`, `EconomyEnforcementHooks`, `TypeEvolutionSystem`, `CognitiveInjectionLayer`

Civilization-scale simulation components for long-running multi-generational hackathon worlds.

---

### 2.20 Other Utility Engines

| Export | File | Description |
|---|---|---|
| `ExperimentSnapshot` / `ExperimentSnapshotBuilder` | `experiment-snapshot.ts` | Frozen state for reproducibility |
| `ExperimentTrace` | `experiment-trace.ts` | Full decision trace |
| `ResearchContext` | `research-context.ts` | Research analysis context |
| `ComplexityCollapseEngine` | `complexity-collapse-map.ts` | Complexity analysis |
| `ExecutionBudgetManager` | `execution-budget-manager.ts` | Budget tracking |
| `SimulationDecisionEngine` | `simulation-decision-engine.ts` | Autonomous decisions |
| `FailureContainmentLayer` | `failure-containment-layer.ts` | Failure isolation |
| `ExecutionStabilityGuard` | `execution-stability-guard.ts` | Stability monitoring |
| `CrossModelAdapter` | `cross-model-adapter.ts` | Multi-model abstraction |

---

## 3. CLI Commands (`cli/`)

The CLI entry point in `cli/index.ts` parses arguments and dispatches to command modules.

### 3.1 Key Types (`cli/types.ts`)

| Export | Description |
|---|---|
| `CommandName` | `'run' \| 'resume' \| 'status' \| 'memory' \| 'benchmark' \| 'replay' \| 'deploy' \| 'test' \| 'explain' \| 'health' \| 'chat' \| 'help' \| 'simulate' \| 'hack-agent'` |
| `CLIArgs` | `{ command, subcommand?, positional, flags }` |
| `CLIResult` | `{ success, message, data?, traceId?, metrics?, durationMs? }` |
| `CLIExecutionState` | Snapshot of current execution state |
| `CLIContext` | Shared context: seed, paths, orchestrator references, memory, flags |

---

### 3.2 Context Factory (`cli/context.ts`)

| Export | Signature | Description |
|---|---|---|
| `createContext` | `(seed?: number): CLIContext` | Initialize workspace, state dirs, memory bank, and global RNG |
| `formatDuration` | `(ms: number): string` | Human-readable duration |
| `prettyPrint` | `(obj, indent?): string` | Pretty-print utility |

---

### 3.3 Command Handlers (`cli/commands/`)

All command functions share the signature:

```typescript
(commandName: Command)(ctx: CLIContext, args: CLIArgs): Promise<CLIResult>
```

#### `runCommand` (`cli/commands/run.ts`)

The main pipeline command. Accepts a Devpost URL, file path, or text description.

| Flag | Type | Description |
|---|---|---|
| `--demo` | `boolean` | Demo surface mode (compile + simulate only) |
| `--simulate-only` | `boolean` | Simulation only |
| `--seed` | `number` | Deterministic seed |
| `--dry-run` | `boolean` | No execution |

Behavior:
- Parses input (URL → `DevpostIngestionLayer`, file → read, text → inline)
- **Demo mode:** runs `DemoSurfaceCompiler.compile()` → `HackathonSimulationEngine.simulate()` → output
- **Full mode:** runs `Phase12Orchestrator.runProject()` → strategy competition → `InternetHackathonOrchestrator.executeFullPipeline()` → `Phase12Orchestrator.runPostProject()`

Types: `ParsedInput`, `parseInput(input): Promise<ParsedInput | null>`.

#### `simulateCommand` (`cli/commands/simulate.ts`)

Alias for `run --simulate-only`.

#### `resumeCommand` (`cli/commands/resume.ts`)

Resume a paused project execution from a saved snapshot.

#### `statusCommand` (`cli/commands/status.ts`)

Show project status or list all projects.

#### `memoryCommand` (`cli/commands/memory.ts`)

Subcommands: `query <text>`, `stats`, `clear`.

Queries the `OrganizationalMemoryBank`.

#### `benchmarkCommand` (`cli/commands/benchmark.ts`)

Subcommands: `list`, `run [id]`.

| Flag | Type | Description |
|---|---|---|
| `--adversarial` | `boolean` | Enable mutation injection |
| `--seed` | `number` | Seed |
| `--mutation-level` | `number` | Mutation intensity |

Creates a `HackathonBenchmarkRunner` and runs `runner.runBenchmark()`.

#### `replayCommand` (`cli/commands/replay.ts`)

Deterministic replay from a JSONL event store.

#### `deployCommand` (`cli/commands/deploy.ts`)

Deploy a built project via `InternetToolGateway`.

#### `testCommand` (`cli/commands/test.ts`)

Run browser tests via `LiveBrowserTestAgent`.

| Flag | Type | Description |
|---|---|---|
| `--url` | `string` | Target URL |

#### `explainCommand` (`cli/commands/explain.ts`)

Show decision traces from `DecisionLogger`.

#### `healthCommand` (`cli/commands/health.ts`)

System health check (LLM providers, workspace, state).

#### `chatCommand` (`cli/commands/chat.ts`)

Interactive conversational mode.

#### `hack-agent.ts` (`cli/hack-agent.ts`)

Production CLI entry point. Exports `runHackAgentFromArgs(ctx, args)`.

---

## 4. CLI Entry Point (`cli/index.ts`)

### Argument Parsing

`parseArgs(argv: string[]): CLIArgs`

Supports:
- `--key=value` and `--key value` style flags
- Subcommands for `memory`, `benchmark`, `replay`, `run`
- Automatic numeric coercion

### Main Dispatch

The `main()` function:
1. Parses args
2. Creates `CLIContext` via `createContext(seed)`
3. Dynamically imports command handler
4. Handles output formatting: `pretty` (default), `json` (`--json`), `quiet` (`--quiet`)
5. Exits with code 0 on success, 1 on failure

### Global Flags

| Flag | Description |
|---|---|
| `--seed <N>` | Deterministic seed (default 42) |
| `--json` | Raw JSON output |
| `--quiet` | Minimal output |
| `--verbose` | Verbose logging |
| `--dry-run` | Simulate without executing |

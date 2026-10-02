# Hack-A-Gent: Runtime Design Specification

> **Version:** 1.0.0
> **Status:** Draft for Implementation
> **Dependencies:** Architecture Spec, Protocol Spec

---

## Table of Contents

1. [LLM Routing System](#1-llm-routing-system)
2. [Context Engine](#2-context-engine)
3. [Skill Engine](#3-skill-engine)
4. [Prompt Engine](#4-prompt-engine)
5. [Execution Runtime](#5-execution-runtime)
6. [Cost Management](#6-cost-management)
7. [Fallback System](#7-fallback-system)
8. [Long-Term Memory Strategy](#8-long-term-memory-strategy)
9. [Agent Workspace System](#9-agent-workspace-system)
10. [Recovery & Self-Healing System](#10-recovery--self-healing-system)

---

## 1. LLM Routing System

### 1.1 Architecture Overview

The LLM Router sits between the Task Executor and the model providers. It selects the optimal model for each task based on: task type, provider health, cost budget, and capability requirements.

```
Task Executor
     |
     v
+---------------------------+
|      LLM Router           |
|  +-------------------+    |
|  | Routing Table     |    |
|  | task_type -> [    |    |
|  |   preferred,      |    |
|  |   fallback,       |    |
|  |   emergency       |    |
|  | ]                |    |
|  +-------------------+    |
|  +-------------------+    |
|  | Confidence Scorer |    |
|  +-------------------+    |
|  +-------------------+    |
|  | Provider Health   |    |
|  | Tracker           |    |
|  +-------------------+    |
|  +-------------------+    |
|  | Cost Oracle       |    |
|  +-------------------+    |
+-----------+---------------+
            |
    provider adapter
            |
    +-------v--------+
    | Gemini | NVIDIA|
    | Mistral| Local |
    +----------------+
```

### 1.2 Provider Pool Definition

```typescript
interface ModelProvider {
  provider_id: "gemini" | "nvidia" | "mistral" | "local";
  models: ModelSpec[];
  priority: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  max_context: number;
  status: "healthy" | "degraded" | "unhealthy";
  rate_limits: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
}

interface ModelSpec {
  model_id: string;
  capabilities: ModelCapability[];
  context_window: number;
  supports_json_mode: boolean;
  supports_tool_calling: boolean;
  typical_latency_ms: number;
}

type ModelCapability =
  | "reasoning"
  | "code_generation"
  | "long_context"
  | "function_calling"
  | "json_output"
  | "vision"
  | "multilingual"
  | "streaming";
```

### 1.3 Provider Configuration

| Provider | Models | Context | Cost/1K Input | Cost/1K Output | Priority |
|----------|--------|---------|---------------|----------------|----------|
| Gemini | 2.5 Pro, 2.5 Flash | 1,048,576 | $0.00125 / $0.00015 | $0.005 / $0.0006 | 1 |
| NVIDIA | Llama 3.1 70B, 405B | 128,000 | $0.0009 / $0.0025 | $0.0009 / $0.0025 | 2 |
| Mistral | Large 2407, Small 2407 | 128,000 / 32,000 | $0.003 / $0.001 | $0.009 / $0.003 | 3 |
| Local | Code-Qwen 7B | 32,000 | $0 | $0 | 4 |

### 1.4 Routing Table (Task Type to Model Chain)

| Task Type | Preferred | Fallback | Emergency | Rationale |
|-----------|-----------|----------|-----------|-----------|
| planning | Gemini 2.5 Pro | Mistral Large | NVIDIA 70B | Needs long context for Devpost pages, strategic reasoning |
| architecture | Gemini 2.5 Pro | Mistral Large | NVIDIA 70B | Structural reasoning, schema design, type generation |
| coding | Mistral Large | Gemini 2.5 Flash | Local 7B | Instruction following for code gen; Flash for speed |
| debugging | Gemini 2.5 Flash | Mistral Large | Local 7B | Fast iteration; Large for hard problems |
| testing | Mistral Large | Gemini 2.5 Flash | Local 7B | Precise instruction following for test gen |
| judging | Gemini 2.5 Pro | Mistral Large | NVIDIA 70B | Nuanced evaluation, multi-criteria scoring |
| documentation | Gemini 2.5 Flash | Mistral Large | Local 7B | Lower complexity; speed and cost optimized |
| ui_design | Mistral Large | Gemini 2.5 Flash | NVIDIA 70B | Component reasoning + code gen |
| devpost_submission | Gemini 2.5 Pro | Mistral Large | NVIDIA 70B | Marketing copy, structured writing, persuasion |
| question_generation | Gemini 2.5 Flash | Mistral Large | Local 7B | Pattern-based; speed preferred |
| code_review | Mistral Large | Gemini 2.5 Flash | NVIDIA 70B | Code understanding + quality assessment |
| schema_design | Gemini 2.5 Pro | Mistral Large | NVIDIA 70B | Data modeling requires precision |

### 1.5 Model Selection Algorithm

```
function selectModel(taskType, context):
  1. Get routing entry for taskType
  2. Try preferred model:
     - Resolve provider
     - Check health (must be "healthy")
     - Check budget fit
     - If all pass, return with confidence score
  3. Try fallback model:
     - Same checks
     - Confidence penalized by 15%
  4. Try emergency model:
     - Same checks
     - Confidence penalized by 40%
  5. Fallback chain:
     - Iterate all providers by priority
     - First healthy one wins (confidence floor: 0.3)
  6. If no provider available:
     - Emit critical error, enter degraded mode
```

### 1.6 Confidence Scoring

Confidence = weighted sum of 5 factors:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Capability match | 35% | Required capabilities found / total required |
| Context window fit | 25% | min(1, context_window / estimated_tokens) |
| Historical success | 20% | Provider success rate from tracking |
| Latency score | 10% | 1 - (typical_latency_ms / 60000) |
| Cost efficiency | 10% | min(1, remaining_budget / estimated_cost) |

Decision threshold:
- confidence >= 0.70: Execute with selected model
- 0.50 <= confidence < 0.70: Execute but warn orchestrator
- confidence < 0.50: Try fallback chain first

### 1.7 Provider Health Tracking

```typescript
interface ProviderHealth {
  provider_id: string;
  status: "healthy" | "degraded" | "unhealthy";
  last_check: string;
  consecutive_failures: number;
  total_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
}

// Health transitions:
// 5 consecutive failures -> degraded
// 15 consecutive failures -> unhealthy
// 30 seconds without failure -> auto-recover from degraded
// Only manual intervention can recover from unhealthy
```

### 1.8 Provider Failure Handling

| Failure Type | Detection | Action |
|-------------|-----------|--------|
| Rate limited | HTTP 429 | Exponential backoff (1s, 2s, 4s, 8s), then fallback |
| Timeout | No response in 30s | Retry once, then fallback |
| 5xx error | HTTP 5xx | Mark degraded, fallback immediately |
| Invalid response | JSON parse fail | Retry with json mode, then fallback |
| Context overflow | 400 Bad Request | Trigger compression, retry |
| Auth failure | HTTP 401/403 | Emit CHECKPOINT_REQUESTED for API key |

### 1.9 Routing Configuration

```yaml
routing:
  defaults:
    preferred: gemini-2.5-flash
    fallback: mistral-small-2407
    emergency: local:code-qwen-7b
  overrides:
    planning:      { preferred: gemini-2.5-pro,  fallback: mistral-large-2407 }
    architecture:  { preferred: gemini-2.5-pro,  fallback: mistral-large-2407 }
    coding:        { preferred: mistral-large-2407, fallback: gemini-2.5-flash }
    judging:       { preferred: gemini-2.5-pro,  fallback: mistral-large-2407 }
  cost_limits:
    max_cost_per_task: 0.10
    max_cost_per_project: 5.00
    warn_at_pct: 0.80
  health:
    degraded_threshold: 5
    unhealthy_threshold: 15
    recovery_cooldown_ms: 30000
```

---

## 2. Context Engine

### 2.1 Purpose

The Context Engine assembles a minimal, task-relevant context package for every agent execution. No agent receives the full project state — only what is necessary.

### 2.2 Context Package Schema

```typescript
interface ContextPackage {
  system_prompt: string;
  task_input: Record<string, unknown>;
  project_context: ProjectSnapshot;
  memory_entries: ContextMemoryEntry[];
  skill_content: string;
  source_files: ContextFile[];
  related_outputs: ContextOutput[];
  token_accounting: {
    total: number;
    budget: number;
    breakdown: Record<string, number>;
  };
  sufficient: boolean;
}

interface ContextMemoryEntry {
  source: "AGENT_LOG" | "BUGS" | "DECISIONS" | "TODO" | "CROSS_PROJECT";
  timestamp: string;
  relevance_score: number;
  summary: string;
  full_text: string;
}

interface ContextFile {
  path: string;
  relevance_score: number;
  content: string;
  original_size_bytes: number;
  compressed: boolean;
}

interface ProjectSnapshot {
  phase: string;
  completed_tasks: string[];
  active_tasks: string[];
  recent_events: string[];
  current_bugs: number;
  current_checkpoints: number;
}
```

### 2.3 Relevance Scoring Algorithm

Each candidate (file, memory entry, skill, output) is scored on 5 dimensions:

1. **Direct Reference Match** (0-40 points): Task input explicitly references the candidate by path/ID.
2. **Type Affinity** (0-20 points): Task type — content type compatibility matrix.
3. **Recency** (0-15 points): Decays linearly with age in hours.
4. **Semantic Keyword Overlap** (0-15 points): Keyword overlap between task description and candidate content.
5. **Dependency Proximity** (0-10 points): Candidate was produced by a task in this task's dependency chain.

Threshold: candidates below score 20 are excluded from consideration.

### 2.4 Token Budget Allocation

Budget = 80% of model's context window (leaves 20% for model response).

Allocation by component (ratios vary by task type):

```yaml
budget_allocation:
  defaults:       { system: 1500, task: 1000, skills: 3000, files: 30%, memory: 15%, related: 10%, buffer: 1500 }
  coding:         { system: 1000, task: 500,  skills: 4000, files: 50%, memory: 2000, related: 2000, buffer: 1000 }
  planning:       { system: 2000, task: 1000, skills: 2000, files: 10%, memory: 30%,  related: 20%,  buffer: 2000 }
  judging:        { system: 2000, task: 1000, skills: 1000, files: 20%, memory: 35%,  related: 15%,  buffer: 2000 }
  architecture:   { system: 2000, task: 2000, skills: 3000, files: 15%, memory: 20%,  related: 20%,  buffer: 2000 }
```

### 2.5 Context Compression Strategies

When the assembled context exceeds budget, these strategies are applied in order:

| Priority | Strategy | Target | Effect |
|----------|----------|--------|--------|
| 1 | Drop low-relevance | Files < 30 score | Remove entirely |
| 2 | Summarize | Memory entries < 50 score | Replace body with 50-token summary |
| 3 | Extract key sections | Skills | Keep only relevant sections |
| 4 | Truncate middle | Oldest files | Keep first 100 + last 50 lines |

If compression fails to fit within budget, the task enters WAITING state with context_insufficient reason.

### 2.6 Context Assembly Algorithm

```
function assembleContext(task, project, memoryStore):
  1. Analyze task requirements (files, schemas, contracts, skills)
  2. Scan and score all candidates (files, memories, skills, outputs)
  3. Sort by relevance score descending
  4. Allocate token budget based on task type + model
  5. Assemble package greedily within budget:
     a. Add system prompt and task context (fixed)
     b. Add skills (highest relevance first)
     c. Add source files (highest relevance first)
     d. Add memory entries (highest relevance first)
     e. Add related outputs (highest relevance first)
  6. If insufficient coverage, attempt compression
  7. Return context package with sufficiency flag
```

---

## 3. Skill Engine

### 3.1 Skill Metadata Format

Every skill file (e.g., `skills/nextjs_skill.md`) begins with YAML frontmatter:

```yaml
---
skill_id: nextjs
name: Next.js 14
version: 14.2.5
type: framework
technology: nextjs
dependencies: [react, typescript]
conflicts_with: [vite, remix]
keywords: [nextjs, app-router, server-components, ssr, ssg]
estimated_tokens: 1800
author: hackagent
updated_at: 2026-06-01
---
```

### 3.2 Skill Manifest Schema

```typescript
interface SkillManifest {
  skill_id: string;
  name: string;
  version: string;
  description: string;
  technology: string;
  type: "framework" | "database" | "tool" | "library" | "pattern" | "platform";
  dependencies: string[];
  conflicts_with: string[];
  keywords: string[];
  file_path: string;
  estimated_tokens: number;
  updated_at: string;
  author: string;
}
```

### 3.3 Skill Registry

```typescript
interface SkillRegistry {
  skills: Map<string, SkillManifest>;
  index: {
    by_technology: Map<string, string[]>;
    by_keyword: Map<string, string[]>;
    by_type: Map<string, string[]>;
  };
  register(manifest: SkillManifest): void;
  resolve(skillIds: string[]): ResolvedSkill[];
  find(technology: string): SkillManifest[];
  detect(analysis: DevpostAnalysis, preferences: UserPreferences): string[];
  checkConflicts(skillIds: string[]): ConflictReport;
}
```

### 3.4 Dependency Resolution

Resolution uses topological sort with cycle detection:

```
function resolveSkills(skillIds, registry):
  1. Build dependency graph from skill manifests
  2. Detect cycles using DFS with visited path tracking
  3. If cycle found: throw CircularDependencyError
  4. Topological sort (Kahn's algorithm)
  5. Check for conflicts in resolved set
  6. Load content in dependency-first order
  7. Strip frontmatter from each file
  8. Return ordered ResolvedSkill[]
```

### 3.5 Conflict Detection

Conflicts are declared in `conflicts_with` in the skill frontmatter. Examples:
- `nextjs` conflicts with `vite`, `remix`
- `supabase` conflicts with `firebase`
- `tailwind` conflicts with `styled-components`

Conflict resolution: if strict checking is enabled, conflicting skill sets throw `SkillConflictError`. In relaxed mode, a warning is logged and the first skill (by dependency order) is kept.

### 3.6 Auto-Detection from Devpost

```
function detectRequiredSkills(analysis, preferences):
  1. Apply always_use from preferences -> add to set
  2. Scan sponsor API names/descriptions against keyword index -> add matches
  3. Scan theme + tracks against keyword index -> add matches
  4. Remove any skill matching never_use
  5. Resolve dependencies of all selected skills
  6. Return resolved set
```

### 3.7 Skill Lifecycle

```
DISCOVERED -> REGISTERED -> RESOLVED -> LOADED -> UNLOADED
     (detected)   (indexed)   (checked)   (in context) (released)
```

---

## 4. Prompt Engine

### 4.1 Architecture

The Prompt Engine dynamically assembles prompts from modular components. Each component renders a section of the prompt based on the context package and task type.

```
ContextPackage + Task
       |
       v
+---------------------------+
| Component Selector        |
| (choose by task type)     |
+---------------------------+
       |
       v
+---------------------------+
| Component Renderer        |
| (render each component    |
|  within token budget)     |
+---------------------------+
       |
       v
+---------------------------+
| Prompt Health Checker     |
| (bloat detection,         |
|  token accounting)        |
+---------------------------+
       |
       v
PromptAssembly { system, messages, tools }
```

### 4.2 Prompt Components

| Component ID | Priority | Max Tokens | Required | Content |
|-------------|----------|------------|----------|---------|
| agent_role | 0 | 200 | Yes | "You are a {role} agent in Hack-A-Gent" |
| project_state | 1 | 300 | Yes | Phase, tasks, bugs, checkpoints |
| skills | 2 | 6000 | No | Loaded skill markdown content |
| memory_context | 3 | 4000 | No | Relevant decisions, bugs, recent logs |
| task_instructions | 0 | 1000 | Yes | Task description + acceptance criteria |
| constraints | 2 | 500 | No | User preferences, never_use rules |
| output_format | 0 | 500 | Yes | Expected output schema or format |

### 4.3 Prompt Assembly Algorithm

```
function assemblePrompt(context, task):
  1. Sort components by priority (0 = highest)
  2. Phase 1: Build system message
     - Iterate components in priority order
     - Render each component with context
     - Track token consumption against system budget (30% of total)
     - Required components always included; optional components dropped if over budget
  3. Phase 2: Build user message
     - Source files section (from context.source_files)
     - Task input section (from context.task_input)
  4. Phase 3: Select tools
     - coding/testing tasks: include file system + Playwright tools
     - other tasks: no tools
  5. Run health check
  6. Return PromptAssembly { system_prompt, messages, tools }
```

### 4.4 Prompt Health Checks

| Check | Rule | Action |
|-------|------|--------|
| System prompt ratio | System <= 40% of total | Warn if exceeded |
| Component dominance | No component > 50% of system | Warn if exceeded |
| Context utilization | Total <= 95% of model window | Warn if exceeded |
| Empty sections | No empty required sections | Error if missing |

### 4.5 Prompt Template Catalog

| Template | Role | Components | Typical Tokens |
|----------|------|-----------|----------------|
| code-gen | Sr. Software Engineer | role, project, skills, task, constraints, output, files | 4K-12K |
| code-review | Code Reviewer | role, project, memory, task, constraints, output, files | 6K-15K |
| architect | Systems Architect | role, project, skills, memory, task, constraints, output | 5K-10K |
| judge | Judge | role, project, memory(decisions), task(criteria), output | 3K-8K |
| debug | Debugging Engineer | role, project, memory(bugs), task, constraints, output, files | 5K-12K |
| planner | Product Strategist | role, project, memory(decisions), task, output | 3K-6K |
| doc-writer | Technical Writer | role, project, skills, task, output, files | 4K-8K |
| test-writer | QA Engineer | role, project, skills, task, constraints, output, files | 4K-10K |
| ui-designer | UI Engineer | role, project, skills, task, constraints, output, files | 5K-12K |

---

## 5. Execution Runtime

### 5.1 Task Executor State Machine

```
IDLE -> ACQUIRED -> CONTEXT_GATHER -> SKILL_LOADING -> MODEL_SELECT
  -> PROMPT_ASSEMBLE -> EXECUTING -> VALIDATING -> COMPLETED -> IDLE
                                              \-> FAILED -> IDLE/ESCALATED
                                      WAITING (checkpoint)
```

### 5.2 State Definitions

| State | Action | Timeout | Next States |
|-------|--------|---------|-------------|
| IDLE | Wait for task assignment | N/A | ACQUIRED |
| ACQUIRED | Lock task, set RUNNING | 5s | CONTEXT_GATHER |
| CONTEXT_GATHER | Assemble context package | 30s | SKILL_LOADING, WAITING |
| SKILL_LOADING | Resolve and load skills | 15s | MODEL_SELECT, FAILED |
| MODEL_SELECT | Select LLM provider/model | 5s | PROMPT_ASSEMBLE, FAILED |
| PROMPT_ASSEMBLE | Build prompt from components | 10s | EXECUTING, WAITING |
| EXECUTING | Call LLM, wait for response | 120s | VALIDATING, FAILED |
| VALIDATING | Parse and validate output | 15s | COMPLETED, FAILED |
| WAITING | Blocked on human checkpoint | Deadline | CONTEXT_GATHER, FAILED |
| COMPLETED | Emit TASK_COMPLETED | 5s | IDLE |
| FAILED | Handle error, retry or escalate | 10s | IDLE, ESCALATED |

### 5.3 Execution Sequence

```
1. Event Bus -> TASK_CREATED -> Task Executor
2. Executor: IDLE -> ACQUIRED (lock task, set RUNNING)
3. Emit TASK_STARTED
4. Executor: ACQUIRED -> CONTEXT_GATHER
5. Context Engine: assembleContext(task, project) -> ContextPackage
6. Executor: CONTEXT_GATHER -> SKILL_LOADING
7. Skill Engine: resolveSkills(skills_list) -> ResolvedSkill[]
8. Executor: SKILL_LOADING -> MODEL_SELECT
9. LLM Router: selectModel(task.type) -> SelectedModel
10. Executor: MODEL_SELECT -> PROMPT_ASSEMBLE
11. Prompt Engine: assemblePrompt(context, task) -> PromptAssembly
12. Executor: PROMPT_ASSEMBLE -> EXECUTING
13. LLM Router: execute(model, messages, tools) -> LLMResponse
14. Executor: EXECUTING -> VALIDATING
15. Validate output (parse JSON, verify criteria, check artifacts)
16a. Success: VALIDATING -> COMPLETED, emit TASK_COMPLETED
16b. Failure: VALIDATING -> FAILED, retry or escalate
```

### 5.4 Output Validation

Validates that the LLM output satisfies:
1. JSON parse (if `output_schema` is provided in task input)
2. Schema conformance (required fields exist, correct types)
3. Artifact existence (declared output files exist on disk)
4. Acceptance criteria satisfaction (evidence of each)
5. Common failure patterns (model refusal, empty output)

Validation produces a `ValidationResult { valid, errors, warnings, parsed_output }`.

---

## 6. Cost Management

### 6.1 Budget Hierarchy

```
Project Budget ($5.00 default)
  +-- Task Budget (per type, e.g., coding: $0.15, judging: $0.05)
       +-- Model Budget (per call, e.g., Gemini Pro: $0.005 per 1K output)
```

### 6.2 Cost Estimation

Before every LLM call, the Cost Oracle estimates:
- Input tokens from ContextPackage token accounting
- Output tokens = input * historical output ratio for task type (default 0.3)
- Cost = (input/1000 * input_rate) + (output/1000 * output_rate)

### 6.3 Cost Tracking

Every LLM call is recorded as a `CostRecord`:

```typescript
interface CostRecord {
  task_id: string;
  project_id: string;
  model_id: string;
  provider: string;
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  task_type: TaskType;
  success: boolean;
}
```

The CostTracker provides per-project, per-model, and per-task-type aggregation.

### 6.4 Budget Enforcement

| Check | Condition | Action |
|-------|-----------|--------|
| Pre-call task budget | estimated_cost > max_cost_per_task[type] | Try cheaper model in fallback chain |
| Pre-call project budget | projected_total > hard_limit | Enter degraded mode |
| Post-call warning | project_cost > hard_limit * warn_threshold | Emit budget warning event |

### 6.5 Cost-Aware Model Selection

When budget is constrained, the selection algorithm:
1. Estimates cost for each viable provider
2. Checks if local model fits within task budget
3. If remaining project budget is tight, prefers cheaper models (Gemini Flash > Mistral Large > Gemini Pro)
4. Falls back to cheapest option with confidence penalty if nothing fits

### 6.6 Default Budget Configuration

```yaml
project:
  max_total_cost: 5.00
  warn_threshold: 0.80
  hard_limit: 10.00
task:
  max_cost_per_task:
    planning: 0.05
    architecture: 0.10
    coding: 0.15
    debugging: 0.10
    testing: 0.10
    judging: 0.05
    documentation: 0.03
    ui_design: 0.10
    devpost_submission: 0.05
    question_generation: 0.02
    code_review: 0.05
    schema_design: 0.05
```

---

## 7. Fallback System

### 7.1 Provider Fallback Tree

```
Preferred Model
  |-- Level 1: Same provider, different model (e.g., Gemini Pro -> Gemini Flash)
  |-- Level 2: Different provider, same tier (e.g., Gemini Pro -> Mistral Large)
  |-- Level 3: Different provider, lower tier (e.g., Gemini Pro -> Mistral Small)
  |-- Level 4: Local model (e.g., Code-Qwen 7B)
  |-- Level 5: Degraded mode (no LLM, template-based)
```

### 7.2 Fallback Level Consequences

| Level | Quality Impact | Context Impact | Feature Impact |
|-------|---------------|----------------|----------------|
| 1 | Minimal | Smaller context window | None |
| 2 | Moderate | Different output style | Tool calling may change |
| 3 | Significant | Half context window | No tool calling |
| 4 | Severe | 32K context max | No structured output guarantee |
| 5 | No generation | N/A | Templates only, no coding |

### 7.3 Degraded Mode by Task Type

| Task Type | Can Degrade? | What Happens |
|-----------|-------------|--------------|
| planning | Yes | Use template plan |
| architecture | Yes | Use template structure |
| coding | No | Manual intervention required |
| debugging | Partial | Log error context, read-only |
| testing | Yes | Use template tests |
| judging | Partial | Skip evaluation |
| documentation | Yes | Use template docs |
| devpost_submission | No | Manual submission required |

### 7.4 Fallback Event Flow

```
Executor -> Router: execute(gemini-pro, prompt)
Router -> Gemini API: POST /generateContent
Gemini -> Router: HTTP 429 (rate limited)
Router: retry 1 (backoff 1s)
Gemini -> Router: HTTP 503 (unavailable)
Router: retry 2 (backoff 2s)
Gemini -> Router: HTTP 503
Router: mark gemini degraded, select fallback L2
Router -> Executor: FallbackEvent { level: 2, from: gemini-pro, to: mistral-large }
Executor: log fallback, update context
Executor -> Router: execute(mistral-large, prompt)
Router -> Mistral API: POST /chat/completions
Mistral -> Router: HTTP 200 { content, usage }
Router -> Executor: LLMResponse { content }
Executor: validate, complete task
```

---

## 8. Long-Term Memory Strategy

### 8.1 Memory Hierarchy

Five tiers of long-term memory:

| Tier | Scope | Storage Format | Retention |
|------|-------|---------------|-----------|
| Project Memory | Single project | Markdown files + JSON | Permanent |
| Cross-Project Memory | All projects | JSON | Permanent |
| User Preferences | All sessions | JSON | Permanent |
| Winning Projects | Successful outcomes | JSON + analysis | Permanent |
| Failed Projects | Failed outcomes | JSON + analysis | Permanent |

### 8.2 Project Memory

Per-project memory files in the project directory:
- `AGENT_LOG.md` — Chronological action log
- `BUGS.md` — Defect tracker
- `DECISIONS.md` — Architectural decisions
- `TODO.md` — Task status board
- `judge/*.json` — Judge reports

Extracted structured summary stored in `data/memory/projects/<uuid>/summary.json`.

### 8.3 Cross-Project Memory

Stored as JSON files in `data/memory/cross-project/`:

```typescript
interface CrossProjectMemory {
  patterns: CrossProjectPattern[];    // Reusable solutions
  tech_experiences: Map<string, TechExperience>;  // Per-tech track record
  failure_modes: FailureMode[];       // Common failure patterns
}

interface CrossProjectPattern {
  pattern_id: string;
  title: string;
  description: string;
  context: string;                    // When to apply
  solution: string;                   // How to apply
  success_rate: number;
  projects_used: string[];
  tags: string[];
}
```

### 8.4 Memory Retrieval

Retrieval uses keyword relevance matching:

```
function retrieveMemory(query):
  cross_project:
    - Extract keywords from query text
    - Score each pattern by keyword overlap with title + description + tags
    - Return patterns with relevance > 0.2
    - Limit to 5 results
  outcomes:
    - Filter winning/top10 projects
    - Boost relevance if query tech_stack matches project strengths
  preferences:
    - Always return current preferences with relevance 1.0
```

### 8.5 Post-Project Learning

After project completion (win or fail):

1. Extract winning patterns: If project won/top10, add each strength as a `CrossProjectPattern`
2. Track failure modes: If project failed/incomplete, add each weakness as a `FailureMode`
3. Update tech stack experience: For each technology used, update `TechExperience` with scores
4. Store outcome in `data/memory/outcomes/`

### 8.6 Memory File Layout

```
data/memory/
  projects/<uuid>/
    summary.json
    memory_index.json
  cross-project/
    patterns.json
    tech-experiences.json
    failure-modes.json
  outcomes/
    winning-projects.json
    failed-projects.json
    outcome-index.json
  preferences/
    preferences.json
```

---

## 9. Agent Workspace System

### 9.1 Workspace Structure

Every project has a `.workspace/` directory managed by the system:

```
projects/<uuid>/.workspace/
  agents/
    <agent-id>/
      private/          # Agent-private files
        scratchpad.md
        working-files/  # In-progress work
      output/           # Produced artifacts
    agent.frontend/
      private/
      output/
    agent.backend/
      private/
      output/
    agent.testing/
      private/
      output/
  shared/
    contracts/          # API contracts (updated by architect, read by all)
    schemas/            # DB schemas
    current-specs/      # Latest approved specs
```

### 9.2 Workspace Permissions

| Agent Type | Private | Shared | Project Root |
|-----------|---------|--------|-------------|
| Orchestrator | R/W/D | R/W/D | R/W |
| Planner | R/W/D | R/W | R |
| Architect | R/W/D | R/W | R |
| Subagent | R/W/D | R | R/W |
| Judge | R/W/D | R | R |
| Git | R/W/D | R/W | R/W |
| Memory | R/W/D | R | R |

(R=read, W=write, D=delete)

### 9.3 Scratchpad System

Each agent-task pair gets a `scratchpad.md` in their private workspace. Entries are:

```typescript
interface ScratchpadEntry {
  timestamp: string;
  type: "thought" | "observation" | "plan" | "question" | "decision" | "error";
  content: string;
  references: string[];
}
```

Scratchpad lifecycle:
1. Created on task assignment
2. Appended during execution
3. Preserved on failure (debugging)
4. Archived on task completion
5. Cleaned on project completion

### 9.4 Artifact Storage Rules

| Artifact | Location | Lifespan |
|----------|----------|----------|
| Scratchpad | .workspace/agents/<id>/private/ | Task duration |
| Working files | .workspace/agents/<id>/private/working-files/ | Task duration |
| Agent output | .workspace/agents/<id>/output/ | Project duration |
| Shared specs | .workspace/shared/ | Phase duration |
| Project code | src/ | Permanent |
| Tests | tests/ | Permanent |
| Judge reports | judge/ | Permanent |

---

## 10. Recovery & Self-Healing System

### 10.1 Recovery Agent

A dedicated infrastructure agent (`agent_id: recovery`) monitors system health and executes recovery operations.

**Responsibilities:**
- Detect infinite loops (same task retried > N times)
- Detect repeated failures (same error across different tasks)
- Detect hallucinated files (output declares file that does not exist)
- Detect broken builds (build command fails consecutively)
- Detect stuck checkpoints (checkpoint pending past deadline)
- Detect context window thrashing (compression loop with no progress)

### 10.2 Anomaly Detection Patterns

| Anomaly | Detection Rule | Action |
|---------|---------------|--------|
| Infinite loop | Same task retried >= max_retries in < 60s | Hard stop task, escalate to orchestrator |
| Repeated failures | Same error.code across >= 3 different tasks in < 5min | Escalate to orchestrator, consider rollback |
| Hallucinated file | TASK_COMPLETED artifact path does not exist after 5s | Emit BUG_DISCOVERED, re-assign fix task |
| Broken build | Build command fails >= 3 consecutive attempts | Rollback to last recovery point |
| Stuck checkpoint | CHECKPOINT expired with no resolution | Execute checkpoint fallback, continue |
| Context thrashing | Compression reduces >50% of context but still over budget | Emit context_insufficient, request human intervention |

### 10.3 Recovery Strategies

| Strategy | Description | When Used |
|----------|-------------|-----------|
| Retry | Re-execute task with same configuration | Transient errors (timeout, rate limit) |
| Retry-different | Re-execute with different model/provider | Model-specific failures |
| Rollback | Git rollback to last recovery point | Code corruption, broken build |
| Skip | Mark task SKIPPED, continue | Optional task, non-critical failure |
| Escalate | Emit error.escalated to orchestrator, WAITING state | Max retries exceeded |
| Checkpoint-fallback | Execute checkpoint fallback behavior | Expired checkpoint |
| Manual-intervention | Emit checkpoint for user | Unrecoverable state |

### 10.4 Recovery Escalation Policy

```
Level 0: Self-heal (retry, retry-different)
  -- failure persists after max_retries -->
Level 1: Task-level recovery (skip, rollback)
  -- failure affects dependency chain -->
Level 2: Phase-level recovery (rollback phase, re-plan)
  -- failure breaks phase invariant -->
Level 3: Project-level recovery (abort, manual intervention)
```

Each level adds more aggressive recovery with higher human involvement.

### 10.5 Recovery Sequence

```
Recovery Agent detects anomaly
  -> Logs anomaly to AGENT_LOG.md
  -> Selects recovery strategy
  -> Emits recovery event:
     Level 0: TASK_RETRYING { strategy: "retry-different", new_model: "mistral" }
     Level 1: GIT_ROLLBACK_REQUESTED { target: "recovery/phase-3" }
     Level 2: PHASE_FAILED { phase: "BUILDING", recovery: "re-plan" }
     Level 3: CHECKPOINT_REQUESTED { type: "manual_intervention" }
  -> Executes recovery
  -> Verifies recovery success
  -> Logs outcome
```

### 10.6 Self-Healing Configuration

```yaml
recovery:
  anomaly_detection:
    loop_threshold: 3          # Same task retried N times in 60s = loop
    failure_burst: 3           # Same error across N tasks = burst
    build_failure_threshold: 3 # Consecutive build failures = rollback
    checkpoint_grace_ms: 60000 # Extra time before fallback after deadline

  strategies:
    retry:
      enabled: true
      max_attempts: 3
    rollback:
      enabled: true
      max_rollbacks: 2
    skip:
      enabled: true
      only_for_task_types: [documentation, question_generation]

  escalation:
    self_heal_attempts: 3
    task_level_attempts: 2
    phase_level_attempts: 1
    project_level: true        # Always available as last resort
```

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Context budgeting fails (token overflow) | Medium | High | Compression cascade, WAITING state fallback |
| Skill dependency cycle | Low | Medium | Cycle detection in resolver, error with diagnostic |
| Cost overrun on complex project | Medium | Medium | Hard budget limit, degraded mode switch |
| All remote providers down | Low | Critical | Local model fallback, degraded mode, manual checkpoint |
| Model hallucinates file paths | Medium | Medium | Validation step checks artifact existence on disk |
| Prompt bloat degrades quality | Medium | Medium | Health checks, component-level budget enforcement |
| Recovery enters loop | Low | High | Escalation policy has hard stop at Level 3 |
| Cross-project memory grows stale | High | Low | Timestamp-based decay in relevance scoring |
| Conflicting skills loaded together | Low | Medium | Conflict detection during dependency resolution |
| Token budget misallocated for task | Medium | Medium | Dynamic budgets by task type, compression fallback |

---

*End of Runtime Design Specification*

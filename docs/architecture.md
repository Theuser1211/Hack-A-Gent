# Hack-A-Gent: System Architecture Specification

> **Version:** 1.0.0  
> **Status:** Draft — **Design Proposal, NOT the implemented system**  
> **Author:** Principal AI Systems Architect  

> ⚠️ **Read this before relying on this document.** This spec describes an
> *aspirational* event-driven, state-machine-orchestrated micro-agent architecture
> (orchestrator + planner/question/architect/judge agents communicating over an event
> bus). **That system is not what `hag run` actually executes today.**
>
> The production pipeline is orchestrated by
> `benchmarks/internet-hackathon-orchestrator.ts` and driven from
> `cli/commands/run.ts`. It uses a different, simpler structure: Devpost parsing →
> qualification → requirement extraction → `RouterEngine` task graph → code generation
> (LLM or template fallback) → typecheck/repair → browser validation → evaluation.
> Some building blocks referenced here (`agents/`, `kernel/events`, `kernel/tasks`)
> do exist, but the event-bus micro-agent runtime described in full below does not.
>
> Treat this document as historical design context, not as a guide to the current code.
> For the real architecture, see `README.md` (Architecture / Pipeline Stages) and
> `ARCHITECTURE-REPORT.md`.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Agent Hierarchy](#3-agent-hierarchy)
4. [Agent Responsibilities](#4-agent-responsibilities)
5. [State Machine](#5-state-machine)
6. [Event System](#6-event-system)
7. [Communication Protocol](#7-communication-protocol)
8. [Folder Structure](#8-folder-structure)
9. [Data Models](#9-data-models)
10. [Memory System](#10-memory-system)
11. [Version Control Design](#11-version-control-design)
12. [Skills System](#12-skills-system)
13. [Self-Improvement & Preferences](#13-self-improvement--preferences)
14. [Risks & Failure Modes](#14-risks--failure-modes)
15. [Tech Stack Recommendations](#15-tech-stack-recommendations)

---

## 1. Executive Summary

Hack-A-Gent is an autonomous multi-agent system that participates in Devpost hackathons end-to-end. Given a Devpost URL, it analyzes the competition, plans a project, builds it using specialized subagents, tests it, judges its own output, iterates on failures, and produces a final submission-ready project.

The system is built on an **event-driven, state-machine-orchestrated micro-agent architecture** where each agent is a self-contained reasoning loop that communicates via a shared event bus. The orchestrator agent manages workflow transitions; specialized agents handle planning, architecture, implementation, testing, judging, and version control.

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR AGENT                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Planner  │  │Question  │  │Architect │  │ Execution     │  │
│  │ V1 / V2  │  │Agent     │  │Agent     │  │ Manager       │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────┬───────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │         │
│  │  Judge   │  │   Git    │  │  Memory  │          │         │
│  │  Panel   │  │  Agent   │  │  Agent   │          │         │
│  └──────────┘  └──────────┘  └──────────┘          │         │
└─────────────────────────────────────────────────────┼─────────┘
                                                      │
                    ┌─────────────────────────────────┼──────────┐
                    │  SUBAGENT POOL                 │          │
                    │  ┌──────────┐ ┌──────────┐     │          │
                    │  │Frontend  │ │Backend   │     │          │
                    │  │Agent     │ │Agent     │     │          │
                    │  ├──────────┤ ├──────────┤     │          │
                    │  │Database  │ │DevOps    │     │          │
                    │  │Agent     │ │Agent     │     │          │
                    │  ├──────────┤ ├──────────┤     │          │
                    │  │Testing   │ │Docs      │     │          │
                    │  │Agent     │ │Agent     │     │          │
                    │  └──────────┘ └──────────┘     │          │
                    └────────────────────────────────┘          │
                                                                  │
┌─────────────────────────────────────────────────────────────────┐
│                     EVENT BUS                                   │
│  publish / subscribe / routing / logging                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Architectural Principles

| Principle | Description |
|-----------|-------------|
| **Event-Driven** | All agents communicate exclusively through typed events on a shared bus. No direct agent-to-agent coupling. |
| **State Machine Orchestration** | The orchestrator is a deterministic state machine. Each state maps to one or more agent invocations. |
| **Fail-Isolated** | An agent failure does not cascade. The orchestrator captures failures and routes to recovery or retry. |
| **At-Least-Once Delivery** | Events are persisted until acknowledged. Crashes do not lose work. |
| **Human-in-the-Loop Graceful** | When blocked on user input, the system sets WAITING status on dependent tasks but continues unblocked work. |
| **Idempotent Subagents** | Subagents can be retried safely. They check current state before acting. |
| **Self-Documenting** | Every decision, bug, and log entry is persisted in markdown files within the project. |

---

## 3. Agent Hierarchy

```
                    ┌──────────────────┐
                    │   Orchestrator   │
                    │      Agent       │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────┴──────┐ ┌────┴────┐ ┌───────┴───────┐
     │  Planner Pool │ │Question │ │ Architect     │
     │  ┌────────┐   │ │ Agent   │ │ Agent         │
     │  │ V1     │   │ └─────────┘ └───────────────┘
     │  │ V2     │   │
     │  └────────┘   │
     └───────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────┴──────┐ ┌────┴────┐ ┌───────┴───────┐
     │ Execution     │ │ Judge   │ │ Infrastructure │
     │ Manager       │ │ Panel   │ │ Agent Pool     │
     └───────────────┘ └─────────┘ │ ┌───────────┐  │
              │                     │ │ Git Agent │  │
     ┌────────┼────────┐           │ └───────────┘  │
     │        │        │           │ ┌───────────┐  │
  ┌──┴───┐ ┌──┴───┐ ┌──┴───┐      │ │Memory     │  │
  │ FE   │ │ BE   │ │ DB   │      │ │Agent      │  │
  │Agent │ │Agent │ │Agent │      │ └───────────┘  │
  └──────┘ └──────┘ └──────┘      └────────────────┘
  ┌──────┐ ┌──────┐ ┌──────┐      ┌────────────────┐
  │Test  │ │DevOps│ │Docs  │      │ Judge Panel    │
  │Agent │ │Agent │ │Agent │      │ ┌────────────┐  │
  └──────┘ └──────┘ └──────┘      │ │Product     │  │
                                   │ │Judge       │  │
                                   │ ├────────────┤  │
                                   │ │Code Judge  │  │
                                   │ ├────────────┤  │
                                   │ │UX Judge    │  │
                                   │ ├────────────┤  │
                                   │ │Hackathon   │  │
                                   │ │Judge       │  │
                                   │ └────────────┘  │
                                   └─────────────────┘
```

---

## 4. Agent Responsibilities

### 4.1 Orchestrator Agent

**Role:** System controller and state machine executor.

**Responsibilities:**
- Maintain the global state machine.
- Route events to the correct agent pool.
- Enforce workflow phase ordering.
- Handle human checkpoint transitions (set WAITING, resume on answer).
- Detect and manage failures (retry, escalate, rollback).
- Track overall progress.
- Manage recovery points and rollback triggers.

**State Transitions Managed:**
```
INIT → ANALYZING → QUESTIONING → AWAITING_ANSWERS → PLANNING →
ARCHITECTING → BUILDING → TESTING → JUDGING → DECIDING →
(submit or fix-and-retest)
```

**Human Checkpoint Protocol:**
```json
{
  "type": "checkpoint.waiting",
  "payload": {
    "checkpoint_id": "uuid",
    "reason": "GitHub repository creation required",
    "blocked_tasks": ["agent.frontend", "agent.backend"],
    "unblocked_tasks": ["agent.architect"]
  }
}
```

### 4.2 Planner V1 Agent

**Role:** Initial Devpost analysis and strategic planning.

**Responsibilities:**
- Fetch and parse the Devpost URL.
- Extract: theme, tracks, prizes, judging criteria, sponsor APIs, timeline.
- Generate 3-5 project ideas with pros/cons.
- Identify risk factors.
- List unknown information requiring user input.

**Outputs:**
- `plan/v1-analysis.json`
- `plan/ideas.json`
- `plan/unknowns.json`

### 4.3 Question Agent

**Role:** Generate targeted questions to fill unknown information.

**Responsibilities:**
- Analyze unknowns from Planner V1.
- For each unknown, determine if it is:
  - **Essential** (must answer to proceed)
  - **Optional** (improves quality but not blocking)
- Generate human-readable questions with context.
- Present questions with suggested answer formats.
- Receive and parse answers, emit `answers.received` event.

**Question Categories:**
| Category | Example |
|----------|---------|
| Preferences | "React or Svelte?" |
| Infrastructure | "Do you have API keys for OpenAI?" |
| Scope | "Should we support OAuth?" |
| Deployment | "Where should this be deployed?" |

### 4.4 Planner V2 Agent

**Role:** Create final execution plan based on Devpost analysis + user answers.

**Responsibilities:**
- Merge Planner V1 analysis with user answers.
- Select the final project idea.
- Create milestone breakdown by phase.
- Generate execution dependency graph (DAG).
- Estimate task scope and complexity.
- Assign tasks to subagent pools.

**Outputs:**
- `plan/v2-plan.json` — Final project plan
- `plan/execution-graph.json` — DAG of tasks

### 4.5 Architect Agent

**Role:** Produce the project's structural blueprint.

**Responsibilities:**
- Design folder structure.
- Select final tech stack (from preferences + plan).
- Design database schema (if applicable).
- Write API contracts (OpenAPI / tRPC / GraphQL schema).
- Define environment variables and configuration.
- Produce `architecture.md` within the project.
- Generate boilerplate configuration files.

### 4.6 Execution Manager

**Role:** Orchestrate specialized subagents during build phase.

**Responsibilities:**
- Read execution graph from Planner V2.
- Schedule tasks respecting dependencies.
- Assign tasks to subagents.
- Monitor subagent execution status.
- Handle subagent failures.
- Re-schedule failed tasks with backoff.

### 4.7 Specialized Subagents

#### 4.7.1 Frontend Agent
- Implement UI components based on architecture spec.
- Load relevant skills (e.g., `nextjs_skill.md`, `tailwind_skill.md`).
- Follow UX guidelines from UX Judge (when available).

#### 4.7.2 Backend Agent
- Implement API endpoints.
- Implement business logic.
- Load relevant skills (e.g., `supabase_skill.md`, `trpc_skill.md`).

#### 4.7.3 Database Agent
- Implement schema migrations.
- Seed data.
- Configure database connections.

#### 4.7.4 DevOps Agent
- Configure CI/CD.
- Write Dockerfile / docker-compose.
- Configure environment variables.
- Handle deployment.

#### 4.7.5 Testing Agent
- Write unit tests.
- Write integration tests.
- Execute Playwright MCP for E2E tests.
- Report test results.

#### 4.7.6 Docs Agent
- Write README.md.
- Write setup instructions.
- Generate API documentation.

### 4.8 Judge Panel

#### 4.8.1 Product Judge
- Evaluate against product requirements.
- Check feature completeness.
- Assess against project plan.

#### 4.8.2 Code Judge
- Evaluate code quality.
- Check architecture compliance.
- Assess test coverage.
- Identify code smells and anti-patterns.

#### 4.8.3 UX Judge
- Evaluate user experience.
- Check accessibility.
- Assess design consistency.
- Test flow completeness.

#### 4.8.4 Hackathon Judge
- Evaluate directly against Devpost judging criteria.
- Extract criteria from Devpost page.
- Score each criterion (1-10).
- Provide justification for each score.
- Calculate total score.

**Output Format:**
```json
{
  "judge": "hackathon",
  "scores": {
    "innovation": 8,
    "technical_difficulty": 7,
    "usefulness": 9,
    "presentation": 8
  },
  "total": 32,
  "max_possible": 40,
  "passing_threshold": 28,
  "passed": true,
  "recommendations": [
    "Improve error handling in auth flow",
    "Add loading states"
  ]
}
```

### 4.9 Git Agent

**Role:** All version control operations.

**Responsibilities:**
- Initialize git repository.
- Create safety branches before risky actions.
- Create automatic commits with structured messages.
- Create recovery points (tags).
- Handle rollback on failure.
- Create submission branch.

**Commit Message Format:**
```
<type>(<scope>): <description>

- Agent: <agent_name>
- Phase: <phase>
- Task: <task_id>
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `recovery`

**Safety Branch Rules:**
- Before any `refactor` or `fix` operation, create branch `safety/<timestamp>`.
- Before scheduled recovery point, create tag `recovery/<phase>/<timestamp>`.

### 4.10 Memory Agent

**Role:** Persistent memory management.

**Responsibilities:**
- Maintain the four memory files: `AGENT_LOG.md`, `BUGS.md`, `DECISIONS.md`, `TODO.md`.
- Append structured entries for all events.
- Provide query interface for other agents.
- Enforce append-only for log files.
- Support summarization/archival for long-running projects.

---

## 5. State Machine

### 5.1 State Diagram

```
                    ┌─────────┐
                    │  INIT   │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ANALYZING│
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │QUESTION │
                    └────┬────┘
                         │
                    ┌────▼──────┐
              ┌─────┤AWAITING   │◄──── user answers
              │     │_ANSWERS   │
              │     └────▲──────┘
              │          │
              │     ┌────▼────┐
              │     │PLANNING │
              │     └────┬────┘
              │          │
              │     ┌────▼──────┐
              │     │ARCHITECT  │
              │     └────┬──────┘
              │          │
              │     ┌────▼────┐
              │     │ BUILDING│◄──────────────┐
              │     └────┬────┘               │
              │          │                    │
              │     ┌────▼────┐               │
              │     │ TESTING │               │
              │     └────┬────┘               │
              │          │                    │
              │     ┌────▼────┐               │
              │     │ JUDGING │               │
              │     └────┬────┘               │
              │          │                    │
              │     ┌────▼────┐        ┌──────┴──────┐
              │     │ DECIDING│───────►│ FIX & RETEST│
              │     └────┬────┘        └─────────────┘
              │          │
              │     ┌────▼──────┐
              │     │ SUBMITTING│
              │     └───────────┘
              │
              └─────────────────── ERROR STATE ─────────────────┐
                          │                                     │
                    ┌─────▼──────┐                        ┌────▼─────┐
                    │  FAILED    │◄───────────────────────│  RETRY   │
                    │            │──► max retries exceeded│          │
                    └────────────┘                        └──────────┘
```

### 5.2 State Definitions

| State | Entry Action | Exit Condition | Failure Action |
|-------|-------------|----------------|----------------|
| `INIT` | Validate Devpost URL, init workspace | URL valid, workspace ready | Report invalid URL, exit |
| `ANALYZING` | Deploy Planner V1 | Analysis complete, unknowns identified | Retry (3×), then HUMAN |
| `QUESTIONING` | Deploy Question Agent | Questions generated | Retry (2×), skip optional unknowns |
| `AWAITING_ANSWERS` | Present questions to user, start unblocked tasks | Answers received or timeout | HUMAN escalation |
| `PLANNING` | Deploy Planner V2 | Execution graph complete | Retry (3×), fallback to V1 plan |
| `ARCHITECTING` | Deploy Architect Agent | All artifacts generated | Retry (3×), use template defaults |
| `BUILDING` | Deploy Execution Manager with subagents | All tasks complete with pass status | Per-task retry, skip optional tasks |
| `TESTING` | Deploy Testing Agent | All tests executed | Log failures, continue to JUDGING |
| `JUDGING` | Deploy Judge Panel | All judges report | Retry failed judge (3×) |
| `DECIDING` | Orchestrator evaluates judge scores | Pass → SUBMITTING; Fail → FIX_AND_RETEST | N/A (deterministic) |
| `FIX_AND_RETEST` | Route failed items to Execution Manager | Fixes applied, retest passes | Max 3 iterations → HUMAN |
| `SUBMITTING` | Prepare submission artifacts, report | Artifacts delivered | HUMAN checkpoint |
| `FAILED` | Log all context, notify user | N/A (terminal) | N/A |

### 5.3 Human Checkpoint States

When a human checkpoint is encountered:

1. Orchestrator emits `checkpoint.waiting` event.
2. Blocked tasks are marked `status: WAITING`.
3. Unblocked tasks continue execution.
4. Memory Agent logs the checkpoint.
5. When user provides input, Orchestrator emits `checkpoint.resume`.
6. Blocked tasks are re-evaluated.

---

## 6. Event System

### 6.1 Event Bus Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     EVENT BUS                             │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ Event Queue │──│ Router      │──│ Dead Letter Queue│ │
│  │ (persistent)│  │ (pub/sub)   │  │ (unroutable)     │ │
│  └─────────────┘  └──────┬──────┘  └──────────────────┘ │
│                          │                               │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │              Subscription Table                    │  │
│  │  agent.orchestrator → [phase.*, *.completed, *.fail]│  │
│  │  agent.planner.v1   → [devpost.analyze]            │  │
│  │  agent.question     → [unknowns.identified]        │  │
│  │  agent.execution    → [task.assigned, *.completed]  │  │
│  │  agent.judge.*      → [judge.request]              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Event Schema

```typescript
interface Event {
  id: string;             // UUID v4
  type: string;           // dot-notation type
  source: string;         // emitting agent ID
  timestamp: string;      // ISO 8601
  version: number;        // schema version
  correlation_id: string; // session-wide trace ID
  payload: Record<string, unknown>;
  metadata: {
    priority: "high" | "normal" | "low";
    retry_count: number;
    max_retries: number;
    blocking: boolean;
  };
}
```

### 6.3 Event Catalog

| Event Type | Source | Payload | Consumers |
|------------|--------|---------|-----------|
| `system.init` | User / CLI | `{ devpost_url, preferences }` | Orchestrator |
| `system.shutdown` | User / Orchestrator | `{ reason }` | All agents |
| `devpost.analyze` | Orchestrator | `{ url }` | Planner V1 |
| `devpost.analyzed` | Planner V1 | `{ theme, tracks, prizes, criteria, timeline, unknowns }` | Orchestrator, Question Agent |
| `unknowns.identified` | Planner V1 | `{ unknowns: [...] }` | Question Agent |
| `questions.generated` | Question Agent | `{ questions: [...] }` | Orchestrator, User |
| `answers.received` | User | `{ answers: { question_id: answer } }` | Orchestrator, Planner V2 |
| `plan.created` | Planner V2 | `{ milestones, execution_graph }` | Orchestrator, Architect Agent |
| `architecture.created` | Architect Agent | `{ folder_structure, schema, contracts, tech_stack }` | Orchestrator, Execution Manager |
| `task.assigned` | Execution Manager | `{ task_id, agent, spec }` | Subagent |
| `task.completed` | Subagent | `{ task_id, result, artifacts }` | Execution Manager |
| `task.failed` | Subagent | `{ task_id, error, recoverable }` | Execution Manager |
| `judge.request` | Orchestrator | `{ phase: "code" | "product" | "ux" | "hackathon", artifacts }` | Judge Agent |
| `judge.completed` | Judge Agent | `{ scores, passed, recommendations }` | Orchestrator |
| `fix.required` | Orchestrator | `{ items: [...], strategy }` | Execution Manager |
| `checkpoint.waiting` | Orchestrator | `{ checkpoint_id, reason, blocked_tasks, unblocked_tasks }` | Memory Agent, User |
| `checkpoint.resume` | User | `{ checkpoint_id, input }` | Orchestrator |
| `git.commit` | Orchestrator | `{ message, files, type }` | Git Agent |
| `git.committed` | Git Agent | `{ hash, branch }` | Orchestrator |
| `git.rollback` | Orchestrator | `{ target: "tag" | "commit" }` | Git Agent |
| `memory.append` | Any agent | `{ file, entry }` | Memory Agent |
| `error.unrecoverable` | Any agent | `{ agent, error, context }` | Orchestrator, Dead Letter |

### 6.4 Event Persistence

Events are persisted to `data/events/` as JSONL files:

```
data/events/
├── 2026-06-25.jsonl
├── 2026-06-26.jsonl
└── ...
```

Each line is one event. This enables:
- Replay for recovery.
- Audit trail.
- Debugging and debugging.

---

## 7. Communication Protocol

### 7.1 Agent Communication Model

All agents communicate exclusively through the event bus. There is no direct inter-agent communication.

```
Agent A ──emit(event)──► Event Bus ──route(event)──► Agent B
                                │
                          ──persist(event)──► Event Log
```

### 7.2 Agent Lifecycle

```
SLEEPING ──► event received ──► PROCESSING ──► event emitted ──► SLEEPING
                                         │
                                    ──► FAILED ──► max_retries exceeded
```

1. Agent subscribes to event types.
2. Agent is in SLEEPING state (zero CPU).
3. Event arrives → agent transitions to PROCESSING.
4. Agent performs work, emits result events.
5. Agent transitions back to SLEEPING.
6. On error, agent emits `task.failed` or `error.*` event.

### 7.3 Task Specification Format

Subagents receive tasks in a standardized format:

```json
{
  "task_id": "feat-auth-flow",
  "type": "implementation",
  "priority": "high",
  "dependencies": ["schema-users"],
  "spec": {
    "description": "Implement user authentication with email/password and Google OAuth",
    "acceptance_criteria": [
      "User can register with email/password",
      "User can log in with Google OAuth",
      "JWT tokens are issued on successful auth"
    ],
    "inputs": {
      "api_contract": "contracts/auth.yaml",
      "schema": "schema/users.sql"
    },
    "skills_required": ["nextjs", "supabase"],
    "output_path": "src/app/auth"
  },
  "context": {
    "branch": "feat/auth-flow",
    "recovery_point": "recovery/architect/v1.0.0"
  }
}
```

### 7.4 Status Reporting

Agents report status via heartbeat events at regular intervals:

```json
{
  "type": "agent.heartbeat",
  "source": "agent.frontend",
  "payload": {
    "status": "processing" | "idle" | "waiting" | "failed",
    "task_id": "feat-auth-flow",
    "progress": 0.65,
    "message": "Implementing OAuth callback handler"
  }
}
```

The orchestrator uses heartbeats to detect hung agents (no heartbeat for N seconds → mark as failed, retry).

---

## 8. Folder Structure

### 8.1 Top-Level Project Structure

```
hack-a-gent/
│
├── agents/                          # Agent definitions and logic
│   ├── orchestrator/                # State machine + orchestration logic
│   │   ├── index.ts
│   │   ├── state-machine.ts
│   │   └── human-checkpoints.ts
│   │
│   ├── planner/
│   │   ├── v1/
│   │   │   ├── index.ts
│   │   │   ├── devpost-parser.ts    # Scrape and parse Devpost URL
│   │   │   └── idea-generator.ts
│   │   └── v2/
│   │       ├── index.ts
│   │       ├── execution-graph.ts
│   │       └── milestone-planner.ts
│   │
│   ├── question-agent/
│   │   ├── index.ts
│   │   ├── question-generator.ts
│   │   └── answer-parser.ts
│   │
│   ├── architect/
│   │   ├── index.ts
│   │   ├── folder-generator.ts
│   │   ├── schema-designer.ts
│   │   └── contract-writer.ts
│   │
│   ├── execution/
│   │   ├── manager.ts               # Execution Manager
│   │   ├── scheduler.ts             # DAG scheduler
│   │   └── retry-handler.ts
│   │
│   ├── subagents/                   # Specialized build agents
│   │   ├── frontend/
│   │   │   ├── index.ts
│   │   │   └── generators/
│   │   ├── backend/
│   │   │   ├── index.ts
│   │   │   └── generators/
│   │   ├── database/
│   │   │   └── index.ts
│   │   ├── devops/
│   │   │   └── index.ts
│   │   ├── testing/
│   │   │   └── index.ts
│   │   └── docs/
│   │       └── index.ts
│   │
│   ├── judges/
│   │   ├── base-judge.ts            # Abstract judge class
│   │   ├── product-judge.ts
│   │   ├── code-judge.ts
│   │   ├── ux-judge.ts
│   │   └── hackathon-judge.ts
│   │
│   └── infrastructure/
│       ├── git-agent.ts
│       └── memory-agent.ts
│
├── kernel/                           # Core runtime
│   ├── event-bus.ts                 # Pub/sub event bus
│   ├── event-persistence.ts         # JSONL event log
│   ├── agent-runtime.ts             # Agent lifecycle manager
│   ├── skill-loader.ts              # Dynamic skill loading
│   └── preferences-store.ts         # User preference persistence
│
├── skills/                           # Reusable skill definitions
│   ├── nextjs_skill.md
│   ├── supabase_skill.md
│   ├── firebase_skill.md
│   ├── tailwind_skill.md
│   ├── trpc_skill.md
│   ├── playwright_skill.md
│   ├── rag_skill.md
│   └── ...
│
├── templates/                        # Project templates
│   ├── web-app/
│   │   ├── nextjs/
│   │   └── vite/
│   └── api/
│       ├── express/
│       └── fastify/
│
├── projects/                         # Generated hackathon projects
│   └── <project-uuid>/
│       ├── .git/
│       ├── AGENT_LOG.md
│       ├── BUGS.md
│       ├── DECISIONS.md
│       ├── TODO.md
│       ├── plan/
│       │   ├── v1-analysis.json
│       │   ├── ideas.json
│       │   ├── unknowns.json
│       │   ├── v2-plan.json
│       │   └── execution-graph.json
│       ├── architecture/
│       │   ├── architecture.md
│       │   ├── schema/
│       │   ├── contracts/
│       │   └── tech-stack.md
│       ├── src/                     # Generated source code
│       ├── tests/
│       ├── judge/
│       │   ├── product-report.json
│       │   ├── code-report.json
│       │   ├── ux-report.json
│       │   └── hackathon-report.json
│       ├── submission/
│       │   ├── README.md
│       │   ├── demo-video.md
│       │   ├── screenshots/
│       │   └── submission.md
│       └── recovery/                # Git recovery tags reference
│
├── config/                           # System configuration
│   ├── preferences.json             # User preferences (persisted)
│   ├── agent-config.json            # Agent timeouts, retries, etc.
│   └── skills-index.json            # Skill registry
│
├── data/                             # Runtime data
│   ├── events/                      # Persisted event logs
│   │   └── 2026-06-25.jsonl
│   └── state/                       # Orchestrator state snapshots
│       └── checkpoint.json
│
├── docs/                             # System documentation
│   └── architecture.md              # This document
│
├── cli/                              # CLI entry point
│   ├── index.ts
│   ├── commands/
│   │   ├── start.ts
│   │   ├── resume.ts
│   │   ├── status.ts
│   │   └── preferences.ts
│   └── ui/
│       ├── progress-bar.ts
│       └── question-renderer.ts
│
├── tests/                            # System self-tests (not project tests)
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

---

## 9. Data Models

### 9.1 Project

```typescript
interface Project {
  id: string;                   // UUID v4
  name: string;
  devpost_url: string;
  status: ProjectStatus;
  phase: Phase;
  created_at: string;           // ISO 8601
  updated_at: string;
  plan: ProjectPlan | null;
  architecture: Architecture | null;
  judges: JudgeReport[];
  submissions: SubmissionArtifact[];
}
```

### 9.2 Devpost Analysis

```typescript
interface DevpostAnalysis {
  theme: string;
  tracks: Track[];
  prizes: Prize[];
  judging_criteria: JudgingCriterion[];
  sponsor_apis: SponsorAPI[];
  timeline: {
    start_date: string;
    end_date: string;
    submission_deadline: string;
  };
  additional_info: Record<string, string>;
}
```

### 9.3 Unknown

```typescript
interface Unknown {
  id: string;
  category: "preference" | "infrastructure" | "scope" | "deployment" | "design";
  question: string;
  context: string;
  suggested_answer_format: string;
  essential: boolean;
  status: "unasked" | "asked" | "answered" | "skipped";
  answer: string | null;
}
```

### 9.4 Execution Graph

```typescript
interface ExecutionGraph {
  nodes: TaskNode[];
  edges: DependencyEdge[];
}

interface TaskNode {
  id: string;
  type: "implementation" | "test" | "documentation" | "devops" | "ui";
  description: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "waiting";
  assigned_agent: string | null;
  skills_required: string[];
  estimated_complexity: 1 | 2 | 3 | 5 | 8;  // Fibonacci-like
  retry_count: number;
  max_retries: number;
}

interface DependencyEdge {
  from: string;
  to: string;
}
```

### 9.5 Judge Report

```typescript
interface JudgeReport {
  judge_id: string;
  judge_type: "product" | "code" | "ux" | "hackathon";
  timestamp: string;
  scores: Record<string, number>;  // criterion → score
  max_scores: Record<string, number>;
  total_score: number;
  max_total: number;
  passing_threshold: number;
  passed: boolean;
  recommendations: string[];
  critical_issues: string[];
  details: string;                 // Free-form analysis text
}
```

### 9.6 Human Checkpoint

```typescript
interface HumanCheckpoint {
  id: string;
  type: "github_repo" | "api_key" | "deployment" | "design_decision" | "submission";
  status: "pending" | "waiting" | "resolved";
  reason: string;
  instructions: string;            // What the user needs to do
  blocked_tasks: string[];         // Task IDs that cannot proceed
  unblocked_tasks: string[];       // Task IDs that can continue
  user_input: Record<string, string> | null;
  created_at: string;
  resolved_at: string | null;
}
```

### 9.7 Skill Definition

```typescript
interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  technology: string;              // e.g., "nextjs", "supabase"
  type: "framework" | "database" | "tool" | "library" | "pattern";
  file_path: string;               // Path to skill markdown
  tags: string[];
  prerequisites: string[];         // Other skill IDs required
}
```

### 9.8 User Preferences

```typescript
interface UserPreferences {
  version: number;
  updated_at: string;
  always_use: string[];            // e.g., ["supabase", "next.js"]
  never_use: string[];             // e.g., ["material-ui", "firebase"]
  tech_stack_preferences: {
    frontend: string[];
    backend: string[];
    database: string[];
    testing: string[];
    deployment: string[];
  };
  git_config: {
    author_name: string;
    author_email: string;
  };
  custom_rules: Record<string, string>;   // Free-form key-value rules
}
```

---

## 10. Memory System

### 10.1 Architecture

The memory system is file-based, append-oriented, and structured for both human readability and machine parsing.

```
projects/<project-uuid>/
├── AGENT_LOG.md         # Chronological event log
├── BUGS.md              # Bug tracker
├── DECISIONS.md         # Architectural & design decisions
└── TODO.md              # Task management (synced with execution graph)
```

### 10.2 AGENT_LOG.md

**Purpose:** Chronological, auditable record of all agent actions.

**Format:**
```markdown
# Agent Log

## [2026-06-25T10:00:00Z] Phase: ANALYZING — Agent: planner.v1
Action: Fetched Devpost page
URL: https://devpost.com/hackathon-sample
Result: Success — parsed 4 tracks, 12 prizes, 5 judging criteria

## [2026-06-25T10:01:30Z] Phase: ANALYZING — Agent: planner.v1
Action: Generated project ideas
Result: 3 ideas produced (see plan/ideas.json)

## [2026-06-25T10:05:00Z] Phase: QUESTIONING — Agent: question
Action: Generated 5 questions for user
Result: Awaiting user response (checkpoint: ck-001)
```

**Access Patterns:**
- Memory Agent appends entries.
- Other agents can read for context.
- Orchestrator can query: `grep "Phase: BUILDING" AGENT_LOG.md`.

### 10.3 BUGS.md

**Purpose:** Track all discovered bugs during testing and judging.

**Format:**
```markdown
# Bugs

## Bug-001 [2026-06-25T14:00:00Z]
**Severity:** high
**Found By:** testing.agent
**Phase:** TESTING
**Description:** Auth callback fails when state parameter is missing
**File:** src/app/auth/callback/route.ts:45
**Status:** OPEN
**Assigned To:** agent.frontend

## Bug-002 [2026-06-25T14:30:00Z]
**Severity:** medium
**Found By:** judge.code
**Phase:** JUDGING
**Description:** Missing error boundary on dashboard page
**File:** src/app/dashboard/page.tsx
**Status:** FIXED
**Fixed By:** agent.frontend
**Fix Commit:** a1b2c3d4
**Retest Status:** PASSED
```

### 10.4 DECISIONS.md

**Purpose:** Record all architectural and design decisions with rationale.

**Format:**
```markdown
# Decisions

## DEC-001 [2026-06-25T11:00:00Z]
**Decision:** Use Next.js App Router over Pages Router
**Context:** Project requires nested layouts and parallel routes for dashboard
**Alternatives Considered:**
  - Pages Router (simpler but less flexible for nested layouts)
  - Remix (equally capable but team less experienced)
**Reason:** App Router provides superior layout composition and React Server Components
**Voted By:** architect.agent
**Status:** ACTIVE

## DEC-002 [2026-06-25T11:30:00Z]
**Decision:** Use Supabase for auth + database
**Context:** User preference `always_use: ["supabase"]`
**Alternatives Considered:**
  - Firebase (contradicts `never_use: ["firebase"]`)
  - Auth0 + PostgreSQL (more complex setup)
**Reason:** User preference + integrated auth/database reduces boilerplate
**Voted By:** architect.agent
**Status:** ACTIVE
```

### 10.5 TODO.md

**Purpose:** Real-time task list synced with execution graph.

**Format:**
```markdown
# TODO

## Phase: BUILDING

### Milestone 1: Authentication
- [x] `feat-user-schema` — Database Agent
- [x] `feat-auth-api` — Backend Agent
- [ ] `feat-auth-ui` — Frontend Agent
- [ ] `test-auth-flow` — Testing Agent

### Milestone 2: Dashboard
- [ ] `feat-dashboard-api` — Backend Agent
- [ ] `feat-dashboard-ui` — Frontend Agent
- [ ] `test-dashboard` — Testing Agent

### Blocked Tasks (Status: WAITING)
- [ ] `deploy-staging` — DevOps Agent (waiting for API key: checkpoint ck-003)
```

### 10.6 Memory Query Interface

Memory Agent exposes simple query functions:

```
function append(file: "log" | "bugs" | "decisions" | "todo", entry: StructuredEntry): void
function read(file: "log" | "bugs" | "decisions" | "todo", filters?: FilterOptions): Entry[]
function update(file: "bugs" | "todo", id: string, updates: Partial<Entry>): void
```

---

## 11. Version Control Design

### 11.1 Git Workflow

```
main (always production-ready)
  │
  ├── feat/<task-id>       # Feature branches
  ├── fix/<bug-id>         # Bug fix branches
  ├── safety/<timestamp>   # Safety snapshots
  │
  └── tags/
      ├── recovery/<phase>/<timestamp>  # Recovery points
      ├── checkpoint/<id>                # Human checkpoint snapshots
      └── submission/<v1|v2|...>         # Final submission tags
```

### 11.2 Automatic Commit Strategy

| Trigger | Commit Type | Message |
|---------|------------|---------|
| Phase complete | `chore(phase)` | `chore(analyzing): completed Devpost analysis` |
| Task complete | `feat(task)` | `feat(auth): implement OAuth callback` |
| Bug fix | `fix(bug)` | `fix(auth): add state parameter validation` |
| Test added | `test(scope)` | `test(auth): add E2E flow tests` |
| Docs update | `docs(scope)` | `docs(api): document auth endpoints` |
| Recovery point | `chore(recovery)` | `chore(recovery): pre-refactor snapshot` |
| Judge fix | `fix(judge)` | `fix(judge): address code quality issues` |

### 11.3 Safety Branch Protocol

Before any operation marked as **risky**:
1. Git Agent creates branch `safety/<timestamp>` from current HEAD.
2. Executes the risky operation.
3. If operation fails:
   a. Git Agent creates a recovery tag: `recovery/<phase>/<timestamp>`.
   b. Performs `git reset --hard` to the safety branch tip.
   c. Logs the rollback in `AGENT_LOG.md`.

**Risky operations include:**
- `refactor` type tasks
- Schema migrations
- Dependency updates
- Any task with `risk_level > 7` in the execution graph

### 11.4 Recovery Points

Recovery points are created:
- At the end of each phase (after `*completed` event).
- Before entering `FIX_AND_RETEST` loop.
- At user request.

Recovery point format:
```bash
git tag -a "recovery/building/2026-06-25T14-00-00Z" -m "Recovery point: pre-auth-fix"
```

### 11.5 Rollback Protocol

1. Orchestrator emits `git.rollback { target: "recovery/building/..." }`.
2. Git Agent runs:
   ```bash
   git stash
   git checkout tags/recovery/building/2026-06-25T14-00-00Z -b recovery/rollback-<timestamp>
   ```
3. Git Agent emits `git.rolledback { hash, branch }`.
4. Orchestrator transitions state to the phase matching the recovery point.
5. Tasks completed after the recovery point are re-scheduled.

---

## 12. Skills System

### 12.1 Purpose

Skills provide reusable, structured knowledge that agents load before performing technology-specific work. A skill encapsulates conventions, code patterns, configuration, and best practices for a given technology.

### 12.2 Skill Format

```markdown
# Skill: Next.js

**Technology:** nextjs
**Version:** 14.0.4
**Type:** framework
**Tags:** react, ssr, app-router, server-components
**Prerequisites:** react_skill

## Project Setup
- Use `create-next-app@latest` with TypeScript and App Router
- Configure `tsconfig.json` with path aliases: `@/*` → `src/*`

## Routing Conventions
- App Router with file-based routing under `src/app/`
- Layouts: `layout.tsx` for shared UI
- Loading states: `loading.tsx` for Suspense boundaries
- Error handling: `error.tsx` for error boundaries
- API routes: `route.ts` under `src/app/api/`

## Data Fetching
TODO ...
```

### 12.3 Skill Registry

Skills are indexed in `config/skills-index.json`:

```json
{
  "skills": {
    "nextjs": {
      "name": "Next.js",
      "file": "skills/nextjs_skill.md",
      "version": "14.0.4",
      "tags": ["react", "ssr", "app-router"],
      "prerequisites": ["react"]
    }
  }
}
```

### 12.4 Skill Loading

When a task requires a skill:
1. Execution Manager inspects `task.skills_required`.
2. Skill Loader resolves each skill (including prerequisites, recursively).
3. Skill content is injected into the agent's context.
4. Agent uses skill conventions during implementation.

### 12.5 Community Skills

Skills can be shared across projects. The skills directory is version-controlled. Users can add new skills via pull request or CLI command:

```bash
hackagent skill add ./my-skill.md
```

---

## 13. Self-Improvement & Preferences

### 13.1 Preference Storage

Preferences are stored in `config/preferences.json`:

```json
{
  "version": 3,
  "updated_at": "2026-06-25T10:00:00Z",
  "always_use": ["supabase", "next.js", "tailwindcss", "playwright"],
  "never_use": ["material-ui", "firebase", "redux"],
  "tech_stack_preferences": {
    "frontend": ["next.js", "tailwindcss"],
    "backend": ["next.js", "supabase"],
    "database": ["supabase", "postgresql"],
    "testing": ["playwright", "vitest"],
    "deployment": ["vercel", "railway"]
  },
  "git_config": {
    "author_name": "Hack-A-Gent",
    "author_email": "agent@hackagent.dev"
  },
  "custom_rules": {
    "components": "Use shadcn/ui component library",
    "styling": "Use Tailwind CSS exclusively, no CSS modules",
    "auth": "Use Supabase Auth with magic link + Google OAuth"
  }
}
```

### 13.2 Preference Application Flow

1. **Project Init**: Preferences are loaded from `config/preferences.json`.
2. **Planner V2**: Preferences influence tech stack decisions.
3. **Architect Agent**: Preferences enforced in architecture creation.
4. **Execution**: Subagents receive relevant preference snippets.
5. **Post-Project**: User can update preferences; project history is referenced.

### 13.3 Preference Update Command

```bash
hackagent preferences set always_use +shadcn
hackagent preferences remove never_use redux
hackagent preferences list
```

### 13.4 Learning from Past Projects

The system can analyze past project outcomes:
- Successful patterns → reinforce preferences.
- Failed patterns → suggest preference changes.
- User overrides → update preferences.

This is implemented via a `post-project-review` phase that queries:
- `AGENT_LOG.md` for decisions.
- `judge/*.json` for scores.
- `BUGS.md` for issues.

---

## 14. Risks & Failure Modes

### 14.1 Risk Matrix

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|------------|
| R01 | Devpost URL parsing fails | Medium | High | Multiple parse strategies (cheerio + puppeteer fallback); manual URL input as fallback |
| R02 | LLM hallucinates incorrect architecture | Medium | Critical | Judge system catches; safety branches allow rollback; human checkpoint for major decisions |
| R03 | Generated code has security vulnerabilities | Medium | Critical | Code Judge scans for OWASP Top 10; SAST tool integration |
| R04 | Subagent gets stuck in infinite loop | Low | Medium | Task timeout (default: 5 min); heartbeat monitoring; forced task termination |
| R05 | Git operations conflict | Low | Medium | Strict linear history (no concurrent branch work); safety branches |
| R06 | User does not answer questions | Medium | High | Timeout (configurable, default: 1 hour); proceed with sensible defaults; mark skipped unknowns |
| R07 | Hackathon timeline expires during build | Medium | Critical | Planner V2 estimates time against deadline; scope reduction fallback |
| R08 | API keys / credentials needed mid-build | Medium | High | Human checkpoint with WAITING status; continue unblocked work |
| R09 | Judging criteria are subjective | High | Medium | Multiple judges; structured scoring; explicit criteria mapping |
| R10 | Fix loop never converges | Low | Medium | Max 3 iterations in FIX_AND_RETEST; then HUMAN escalation |
| R11 | Event bus message loss | Low | High | Persistent event log; at-least-once delivery; replay capability |
| R12 | Skill file outdated (API changed) | Medium | Medium | Semantic versioning on skills; skills-index.json tracks versions |
| R13 | LLM context window exceeded | Medium | Medium | Summarization agents; sliding window; file-based memory offloading |

### 14.2 Failure Mode Recovery Matrix

| Failure | Detected By | Recovery Strategy |
|---------|-------------|-------------------|
| Agent timeout | Heartbeat miss | Retry (3×), then skip task or HUMAN |
| Task failure | `task.failed` event | Retry with backoff (1s, 5s, 30s), then HUMAN |
| Test failure | Testing Agent | Log bug → JUDGING phase |
| Judge failure | Judge Agent | Log issues → FIX_AND_RETEST |
| Git conflict | Git Agent | Automatic merge abort → safety branch → retry |
| Phase timeout | Orchestrator timer | Emit `phase.timeout` → HUMAN |
| LLM malformed output | JSON parse failure | Retry with stricter prompt (3×), then template fallback |
| Duplicate event | Event ID dedup in bus | Silently drop duplicate |

### 14.3 Graceful Degradation

When non-critical components fail:

| Component | Degradation |
|-----------|-------------|
| Testing Agent (E2E) | Fall back to unit tests only |
| UX Judge | Skip UX evaluation, pass to Hackathon Judge |
| Docs Agent | Generate minimal README from architecture |
| Advanced judge reasoning | Fall back to checklist-based evaluation |

---

## 15. Tech Stack Recommendations

### 15.1 Core Runtime

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript 5.x | Type safety, wide ecosystem, LLM-friendly |
| Runtime | Node.js 20+ (LTS) | Mature, good async support, file system access |
| CLI Framework | Commander + Ink | Interactive CLI with React-based rendering |
| State Machine | XState v5 | Battle-tested, visualizable, supports hierarchical states |

### 15.2 Event System

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Event Bus | In-memory pub/sub with file persistence | Simple, no external dependencies |
| Event Store | JSONL files | Audit trail, replayable, human-readable |
| Queue | Better-Queue (or Bull) for persistence | At-least-once delivery, retry support |

### 15.3 Web Scraping

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| HTML Parsing | Cheerio | Fast, lightweight for structured pages |
| JS Rendering | Playwright | Fallback for JS-rendered Devpost pages |
| HTTP Client | undici (native Node.js) | Fast, modern HTTP/2 support |

### 15.4 LLM Integration

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| LLM Provider | OpenAI / Anthropic / local (via API) | Provider-agnostic adapter pattern |
| SDK | Vercel AI SDK | Unified interface across providers |
| Prompt Management | In-code templates with mustache/handlebars | Simple, version-controllable |
| Token Tracking | tiktoken (token counting) | Context window management |

### 15.5 Code Generation

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| File Templates | Handlebars / EJS | Flexible, well-known, safe |
| Code Linting | ESLint + Prettier (applied post-generation) | Quality enforcement |
| Formatting | Prettier (auto-run after generation) | Consistent output |

### 15.6 Testing (of generated projects)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| E2E Testing | Playwright (via MCP) | Browser automation, Devpost judge relevance |
| Unit Testing | Vitest (generated project may use Jest) | Fast, compatible with Vite |
| Component Testing | React Testing Library | Standard for React projects |
| API Testing | Supertest / Playwright API | Direct API call testing |
| Visual Regression | Playwright snapshot | Detect UI drift |

### 15.7 Version Control

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Git Operations | isomorphic-git (or simple-git) | Pure JS Git, no native dependency |
| Git Hosting | GitHub (via `gh` CLI OR REST API) | Industry standard, Devpost integration |

### 15.8 Analysis & Quality

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| AST Parsing | TypeScript Compiler API / Babel | Code structure analysis for Code Judge |
| Security Scan | npm audit + Snyk (lightweight) | Basic vulnerability detection |
| Bundle Analysis | `esbuild` (for size estimation) | Lightweight, fast |

### 15.9 Persistence

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Preferences | JSON file | Simple, user-editable |
| Project State | JSON files per project | Portable, debuggable |

### 15.10 Optional / Advanced

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Containerization | Docker | Reproducible builds, isolation |
| CI/CD (self) | GitHub Actions | Self-testing on push |
| MCP Server | Custom MCP server for Playwright | Standardized tool interface |
| Monitoring | Basic file-based metrics | Simplicity over complexity |

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| Agent | Self-contained loop that reads events, does work, emits events |
| Subagent | Specialized agent focused on a single domain (FE, BE, DB, etc.) |
| Event Bus | Publish/subscribe mechanism for inter-agent communication |
| State Machine | Deterministic state machine governing workflow phases |
| Skill | Reusable markdown file with technology-specific conventions |
| Human Checkpoint | Point where user action is required; system continues unblocked work |
| Recovery Point | Git tag marking a known-good state for rollback |
| Safety Branch | Git branch created before risky operations |
| Execution Graph | DAG of tasks to be executed during BUILDING phase |
| MCP | Model Context Protocol — standardized tool interface for LLMs |

## Appendix B: Phase Transition Table

| From | To | Trigger | Output Artifacts |
|------|----|---------|-----------------|
| INIT | ANALYZING | Devpost URL validated | Workspace initialized |
| ANALYZING | QUESTIONING | Analysis complete | `plan/v1-analysis.json`, `plan/ideas.json`, `plan/unknowns.json` |
| QUESTIONING | AWAITING_ANSWERS | Questions generated | Questions presented to user |
| AWAITING_ANSWERS | PLANNING | Answers received | Parsed answers |
| PLANNING | ARCHITECTING | Plan finalized | `plan/v2-plan.json`, `plan/execution-graph.json` |
| ARCHITECTING | BUILDING | Architecture complete | `architecture/` directory with schema, contracts, tech stack |
| BUILDING | TESTING | All tasks completed | Generated project in `src/` |
| TESTING | JUDGING | Tests executed | Test reports |
| JUDGING | DECIDING | All judges reported | 4 judge reports in `judge/` |
| DECIDING | SUBMITTING | All judges passed | `submission/` artifacts |
| DECIDING | FIX_AND_RETEST | Any judge failed | Bug entries in `BUGS.md` |
| FIX_AND_RETEST | TESTING | Fixes applied | Updated code |
| FIX_AND_RETEST | FAILED | Max iterations exceeded | Error report |

## Appendix C: Event Flow Example

### Happy Path: Full Hackathon

```
User: hackagent start https://devpost.com/example-hackathon

1. system.init
   ├── check config/preferences.json
   └── init workspace for project uuid

2. devpost.analyze → planner.v1
   ├── fetch Devpost page (cheerio)
   ├── parse theme, tracks, prizes, criteria
   ├── generate 3 project ideas
   └── emit devpost.analyzed

3. unknowns.identified → question.agent
   ├── analyze unknowns from devpost.analyzed
   ├── generate targeted questions
   └── emit questions.generated

4. AWAITING_ANSWERS state
   ├── render questions to user
   ├── wait for answers (non-blocking timeout)
   └── emit checkpoint.waiting (waiting for user)

5. answers.received → planner.v2
   ├── merge answers with devpost analysis
   ├── select project idea
   ├── build execution DAG
   └── emit plan.created

6. architecture.created → architect.agent
   ├── apply user preferences
   ├── design folder structure
   ├── create schema
   ├── write API contracts
   └── emit architecture.created

7. task.assigned × N → subagents
   ├── Execution Manager schedules DAG
   ├── Subagents build in dependency order
   ├── Git Agent auto-commits each completion
   └── emit task.completed (for each)

8. judge.request → judge.panel
   ├── Product Judge evaluates features
   ├── Code Judge evaluates code quality
   ├── UX Judge evaluates user experience
   ├── Hackathon Judge evaluates against Devpost criteria
   └── emit judge.completed (×4)

9. DECIDING state
   ├── Orchestrator aggregates scores
   ├── All passed → SUBMITTING
   └── Any failed → FIX_AND_RETEST

10. Fix loop (if needed)
    ├── fix.required → execution.manager
    ├── subagents fix specific issues
    ├── Testing Agent re-runs tests
    ├── Judge Panel re-evaluates
    └── Max 3 iterations

11. system.complete
    ├── prepare submission artifacts
    ├── final commit and tag
    └── present results to user
```

# Repository Health Report — Hack-Agent v1.0

> **Historical snapshot — generated 2026-06-28.** For current status, see
> `ARCHITECTURE-REPORT.md` and run the CI/lint/typecheck/test gates.

Generated: 2026-06-28

## Summary

| Metric | Count | Notes |
|---|---|---|
| Orphan source files | 19 | agents/ (11), benchmarks/ (7), kernel/ (1) |
| Duplicate classes | 1 | `LLMBuilderProvider` in 2 files with different deps |
| Duplicate interfaces | 0 | All unique |
| Circular deps | 1 | Type-only cycle: mutation-difficulty-controller ↔ mutation-engine |
| Broken imports | 0 | TypeScript confirms 0 errors |
| Unused export symbols | 242 | Across benchmarks/, cli/, kernel/ |
| Trailing whitespace | 6 files | Cosmetic |
| TODO comments | 2 | Real TODO markers |
| FIXME | 0 | Clean |
| HACK (non-false-positive) | 2 | In test data |
| @ts-ignore / @ts-expect-error | 0 | Clean |
| eslint-disable (source) | 0 | Clean |
| `as any` casts | 112 | 54 in test files, 58 in source |
| console.log (non-test) | 308 | Mostly CLI output mechanism |
| debugger | 0 | Clean |

## Orphan Files (19)

These source files are not imported by any other non-test file:

### agents/ (11 files — entire directory is orphaned)
- `agents/architect-v1.ts`
- `agents/backend-builder-v1.ts`
- `agents/build-orchestrator-v1.ts`
- `agents/build-verification-v1.ts`
- `agents/database-builder-v1.ts`
- `agents/echo-agent.ts`
- `agents/frontend-builder-v1.ts`
- `agents/judge-panel-v1.ts`
- `agents/planner-v1.ts`
- `agents/playwright-test-v1.ts`
- `agents/repair-coordinator-v1.ts`

**Note**: These are consumed by integration tests (`tests/integration/*-workflow.test.ts`) and was likely intended for dynamic agent registration. They may be loaded via the framework's agent registry rather than direct import.

### benchmarks/ (7 files)
- `benchmarks/benchmark-dataset-export.ts`
- `benchmarks/civilization-dashboard.ts`
- `benchmarks/civilization-events.ts`
- `benchmarks/judge-database.ts`
- `benchmarks/recursive-improvement-engine.ts`
- `benchmarks/run-benchmarks.ts`
- `benchmarks/simulation-determinism-validator.ts`

### kernel/ (1 file)
- `kernel/global-memory/genome.ts`

## Duplicate Definitions

### `LLMBuilderProvider` (2 definitions)
| File | Dependencies |
|---|---|
| `kernel/generation/llm-builder-provider.ts:21` | RouterEngine + GenerationMetricsTracker |
| `kernel/providers/llm-builder-provider.ts:9` | RouterEngine + PromptEngine + ContextEngine |

Both implement `BuilderProvider` with different dependency injection strategies.

## Circular Dependencies

### Mutation Controllers (type-only cycle)
```
mutation-difficulty-controller.ts  →  imports MutationType (type) from mutation-engine
mutation-engine.ts                 →  imports MutationDifficultyController (type) from mutation-difficulty-controller
```
Safe — type-only cycles don't cause runtime issues. Could be resolved by extracting shared types to a third file.

## Action Items

1. **Remove orphan agents/** directory if not needed (verify with agent-registry usage)
2. **Rename one `LLMBuilderProvider`** to avoid confusion
3. **Extract shared mutation types** to break circular dep
4. **Clean up unused exports** across benchmarks/ and cli/
5. **Fix trailing whitespace** in 6 files

## Rapid Cleanup Applied

- 4 `require()` → ESM `import` (Phase B)
- 5 test bugs fixed (Phase C)
- 5 agent files modified to add missing methods (Phase C/D)
- `no-empty` and `no-constant-condition` lint rules disabled

# Migration Guide — v0.1.0 to v1.0

## Overview

This guide covers breaking changes between Hack-Agent v0.1.0 and v1.0.

## Breaking Changes

### 1. `computeReward()` Return Type

**Before**: Returns `number`
```typescript
const score: number = rewardModel.computeReward(result);
```

**After**: Returns `RewardSignal` (object)
```typescript
const signal: RewardSignal = rewardModel.computeReward(result);
const score: number = signal.totalScore;
```

**Migration**: Access `.totalScore` on the return value.

### 2. `StrategyPlan.techStack`

**Before**: Required field
```typescript
const plan: StrategyPlan = { id, projectName, techStack: [], ... };
```

**After**: Optional field
```typescript
const plan: StrategyPlan = { id, projectName, ... }; // techStack not required
```

**Migration**: No action needed if you never set `techStack`. If you do, it still works.

### 3. `CivilizationDashboard` Renamed

**Before**: Single `CivilizationDashboard` served as both interface and class.

**After**: `DashboardGenerator` (class), `DashboardData` (interface)

**Migration**:
```typescript
// Before
const dashboard = new CivilizationDashboard(seed);

// After
const dashboard = new DashboardGenerator(seed);
const data: DashboardData = dashboard.generate();
```

### 4. `DepartmentType.INNOVATION` Added

**Before**: Not available in the enum.

**After**: Added to `DepartmentType`.

**Migration**: If you switch over `DepartmentType`, add a case for `INNOVATION`.

### 5. New Required Methods on Interfaces

Several interfaces now require additional methods:

| Interface | New Methods |
|---|---|
| `AgentEvolutionEngine` | `getAllAgents()`, `createAgent()`, `setEvolutionPressure()` |
| `GlobalHackathonWorld` | `getAllJudges()`, `addJudge()` |
| `InternetHackathonOrchestrator` | `setDevpostData()`, `buildExecutionPlan()` |

**Migration**: Implement the new methods on any custom implementations.

### 6. `computeReward` Internal Properties

**Before**: `breakdown.toolCalls`, `breakdown.simulationScore`

**After**: `breakdown.toolCallsUsed`, `breakdown.simulationScore` (unchanged)

**Migration**: Access `breakdown.toolCallsUsed` instead of `breakdown.toolCalls`.

### 7. `require()` → ESM `import`

**Before**: `const { execSync } = require('node:child_process');`

**After**: `import { execSync } from 'node:child_process';`

**Migration**: Replace all `require()` calls with top-level `import` statements. If the require was inside a function, move the import to the top of the file and rename to avoid shadowing.

## Deprecations

None in v1.0.

## Removals

- Duplicate `export { ClassName }` blocks removed from 11 files.
- `src/` directory no longer exists. Code lives in `benchmarks/`, `cli/`, `kernel/`, and `tests/`.

## Configuration Changes

### npm Scripts

| Script | Before | After |
|---|---|---|
| `lint` | `eslint src/ tests/ cli/` | `eslint benchmarks/ tests/ cli/ kernel/` |
| `lint:fix` | same pattern | same update |
| `format` | `prettier --write "src/**/*.ts" ...` | `prettier --write "benchmarks/**/*.ts" ...` |
| `typecheck` | unchanged | unchanged |

### ESLint Config

Added rules:
- `no-empty`: off (intentional empty blocks in catch/error handling)
- `no-constant-condition`: off (`while(true)` is valid for retry loops)

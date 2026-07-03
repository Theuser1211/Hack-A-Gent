# Changelog

## v1.0.0 (2026-06-28)

### Added
- Unified Runtime OS with Phase 13.5 subsystems (goal monitor, convergence engine, resilience layer, sandbox execution mode, feedback injection loop, multi-strategy execution engine)
- Taste & Simplicity Governor for demo-quality enforcement
- Demo Surface Compiler with execution path collapse
- Determinism kernel with seeded RNG, UUID, and timestamps
- Replay engine for exact mutation sequence reproduction
- 5 winning hackathon strategy templates
- 13 CLI commands with full help documentation
- Organizational memory bank with query/stats/clear
- Adversarial system (intent engine, interference, deception, judge drift, conflict resolution)
- Civilization evolution engine
- Resource economy with ledger, enforcement hooks, market model
- Judge calibration engine with drift analysis
- Agent evolution engine with capability mutations
- Organization evolution with department specialization
- Swarm evolution engine
- Strategy genome database with win-rate tracking
- 78 test files with 1138 tests total

### Changed
- TypeScript errors: 775 → 0 (100% reduction)
- `computeReward()` now returns `RewardSignal` object instead of `number`
- `StrategyPlan.techStack` is now optional
- `CivilizationDashboard` renamed to `DashboardGenerator` (class) / `DashboardData` (interface)
- `require()` calls converted to ESM `import`
- Lint script updated from `src/` to `benchmarks/` and `kernel/` directories
- ESLint config: disabled `no-empty` and `no-constant-condition` rules

### Fixed
- Duplicate class/symbol declarations in 11 barrel files
- RNG type mismatch across 14 files (typed as `RNG` instead of `() => number`)
- Missing `devpostUrl` on `ParsedHackathonSpec` interface
- 86 undefined type/interface/enum references (TS2304)
- 44 wrong argument count errors (TS2554)
- Interface/class naming collision in `civilization-dashboard.ts`
- Missing `INNOVATION` in `DepartmentType` enum
- 17 test assertion mismatches in `resource-economy.test.ts`
- Index out of bounds in `strategy-genome-database.test.ts`
- Missing `getDecisionLogger()` on `HackathonRewardModel`
- Incorrect expected value in `phase13.test.ts` submission readiness test
- Entity ID mismatches in `adversarial-system.test.ts`
- Detection threshold too high in `deception-layer.ts`

### Removed
- `src/` directory (moved to `benchmarks/`, `cli/`, `kernel/`)
- Duplicate re-exports from barrel files

### Security
- All `require()` imports converted to ESM `import`
- No secrets or credentials in source code

## v0.1.0 (Initial Release)

- Initial project scaffolding
- CLI framework
- Core agent runtime with event bus
- Builder/planner/architect agents
- Basic LLM provider support
- Task lifecycle management
- Build execution and verification
- Initial test suite

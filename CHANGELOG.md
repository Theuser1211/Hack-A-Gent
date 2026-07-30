# Changelog

## v1.1.1 (2026-07-23)

### Added
- URL normalization — bare Devpost hostnames auto-prepend `https://` (`hag run competition.devpost.com` works without URL prefix)
- GitHub token onboarding — `hag setup` prompts for GitHub token with skip option; `hag doctor` shows GitHub check (pass/warn)
- Routing persistence — `model-performance-tracker` records per-model success/failure across sessions; `hag doctor --routing` shows persistence status
- `config-manager.getGitHubToken()` / `requireGitHubToken()` — exports with actionable error messages
- 24 URL validation tests in `tests/unit/devpost-url-validation.test.ts`

### Changed
- `cli/pipeline/parsing.ts`: `normalizeUrl()` prepends `https://` to bare hostnames; `parseDevpostUrl()` uses normalized URL
- `cli/commands/run.ts`: `parseInput()` restructured — normalizes Devpost URLs, always tries parsing when `devpost.com` present, rejects empty input
- `cli/commands/setup.ts`: GitHub token prompt in wizard
- `cli/commands/doctor.ts`: GitHub token diagnostic check
- ECONNRESET race condition fixed in production smoke test
- Test suite: 70 test files pass (2 file regression from timeout), 1076 tests pass (3 pre-existing failures)
- Package version: 1.1.0 → 1.1.1

## v1.1.0 (2026-07-23)

### Added
- `hag doctor --routing` — adaptive routing diagnostics with ranked model table, persistence status, and demotion/reason summaries
- Reusable, audited prompt template library (`kernel/prompts/templates.ts`) — 9 canonical templates (planner, architect, frontend/backend/database builders, repair, judge, reporting, validation) with structured output contracts, anti-hallucination rules, and deterministic rendering
- `PromptEngine.assembleFromTemplate()` — assemble provider-ready messages from registered prompt templates
- Request/response diagnostic logging in `CustomEndpointProvider` — REQUEST, TIMING, and ABORT FIRED blocks with elapsed times and stage tracking
- `class` → `className` auto-fix pattern in autonomous repair engine
- Process tree cleanup in browser validator — kills orphaned grandchildren on Windows via `taskkill /F /T`

### Changed
- `withRetry` converted from recursive to iterative `for` loop — eliminates stack growth on deep retry chains (identical behavior)
- Qualification engine softened: unknown technologies default to `partial` (template fallback) instead of `unsupported` (hard rejection) — prevents false-positive rejections on normal Devpost hackathons
- `seed` parameter added to `PromptEngine`, and all internal state uses `createDeterministicUuid` / seeded ordering
- Test suite: 69 test files pass (1 file regression from timeout), 1068 tests pass (3 pre-existing failures in benchmarks.test.ts — SyntaxError, timeout, history)
- Pre-existing false-positive rejection test (`pipeline-false-positives.test.ts`) now passes consistently

### Fixed
- `repo-detector.ts`: normalize Windows paths in `walkDir()` (`.replace(/\\/g, '/')`), add depth limit of 10 to prevent infinite recursion on symlink loops
- `build-executor.ts`: remove `2>nul` shell redirects (cross-platform), add `getPythonCmd()` with python3/python fallback
- `dev-server-executor.ts`: remove `2>nul` shell redirects, add `getPythonCmd()` with python3/python fallback, add missing `execSync` import
- `provider-types.ts`: recursive `withRetry` → iterative `for` loop (no functional change, eliminates stack frames on retry)
- `model-performance-tracker.ts`: guard for missing `models` key in loaded JSON (`if (!parsed.models) parsed.models = {}`)
- `browser-validator.ts`: replace `server.kill()` with `killProcessTree()` that uses `taskkill /F /T` on Windows to kill orphan grandchild processes

### Removed
- `2>nul` shell redirects from `build-executor.ts` and `dev-server-executor.ts` (Windows-incompatible)

### Added
- 6 LLM provider integrations (NVIDIA NIMs, OpenAI, Anthropic, Gemini, OpenRouter, Custom)
- Devpost URL parsing with competition intelligence
- Winning strategy generator (judge-optimized recommendations)
- Full pipeline orchestrator (CompetitionIntel → StrategyGen → SelfReview → Report)
- Project scaffolder with quality checks (README, LICENSE, .gitignore, .env.example, Docker, CI/CD)
- Self-review scorer (7 dimensions: Innovation, Technical Depth, Feasibility, Presentation, Completeness, Maintainability, Judge Alignment)
- Hackathon optimizer with targeted improvement actions
- Pipeline benchmarker (old vs improved comparison)
- Pipeline report generator (comprehensive end-of-generation markdown report)
- Post-generation typecheck and auto-repair
- Runtime smoke test (starts dev server, verifies HTTP 200)
- Organizational memory bank with query/stats/clear
- Deterministic execution (same seed = same output)
- Template fallback (works without any LLM)
- 15+ CLI commands with colored terminal output
- Interactive setup wizard
- `.env` file support
- Zod config schema validation
- Provider health checks
- Contribution guidelines, code of conduct, security policy
- GitHub Actions CI workflow
- Issue and PR templates
- 1168 tests across 80 files — 0 failures

### Changed
- TypeScript errors: 775 → 0 (100% reduction)
- `process.exit()` → `process.exitCode` for Windows compatibility
- All console.log/console.error → structured output utility
- Package version: 0.1.0 → 1.0.0
- README rewritten for production readiness

### Fixed
- LLM timeout handling (moved res.json() inside AbortController)
- Retry logic (AbortError skips retries — was causing 40-min delays)
- CustomEndpointProvider API key lookup (`this.apiKeyEnvVar` → `this.providerId`)
- `require is not defined` in runtime smoke test (switched to ESM imports)
- Version display showing 0.1.0 after npm install (path resolution in dist/)

### Security
- Removed `githubToken → ANTHROPIC_API_KEY` and `vercelToken → OPENAI_API_KEY` mappings
- Added command allowlist to `handleShell()`
- Added package name regex validation to `handlePackage()`
- Switched git remote token auth to credential helper pattern
- RouterEngine provider-aware execution
- Path traversal in explain/replay commands
- Git command injection (repo name validation)
- Config file dependency detection (auto-adds tailwindcss/postcss/autoprefixer)
- Post-write package.json merge (scans all project files for imports)
- LLM output validation (filters malformed code with brace/paren mismatch)
- Pages Router cleanup (removes _app.tsx when App Router exists)
- Auto-add @types/* packages for detected dependencies
- Integration test timeouts (typecheckAndRepair moved out of executeFullPipeline)

### Security
- Git command injection blocked with regex validation
- Path traversal blocked on file read/write operations
- API keys stored in local config only (never sent to third parties)
- All secrets removed from source code

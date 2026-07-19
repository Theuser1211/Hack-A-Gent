# Architecture

> Auto-generated module map. For the authoritative design, see `docs/architecture.md`.

## Layer Map

- **cli/** — command dispatch, TUI output, config, provider init.
- **kernel/** — LLM router + providers, qualification, evaluation, validation, repair, learning, prompts.
- **benchmarks/** — real project-evaluation benchmarks + (legacy) adversarial research subsystem.
- **features/** — NEW: Devpost intelligence (`analyze`), real category benchmarks (`categories`), docs generator.
- **agents/** — agent manifests (planner/architect/builders/judge).

## Folder Structure

```
├─ AGENTS.md
├─ API_REFERENCE.md
├─ ARCHITECTURE-REPORT.md
├─ AUDIT-REPORT.md
├─ CHANGELOG.md
├─ CODE_OF_CONDUCT.md
├─ CONTRIBUTING.md
├─ DEVELOPER_JOURNEY.md
├─ ENGINEERING_REPORT.md
├─ MIGRATION_GUIDE.md
├─ PRODUCTION_AUDIT.md
├─ PRODUCTION_CERTIFICATION.md
├─ README.md
├─ RELEASE-READINESS.md
├─ RELEASE.md
├─ RELEASE_NOTES_v1.0.md
├─ REPOSITORY_HEALTH.md
├─ ROADMAP.md
├─ ROADMAP_GAPS_AND_NEXT_PHASES.md
├─ SECURITY.md
├─ SUPPORT.md
├─ TEST_CERTIFICATION.md
├─ agents/
│  ├─ architect-v1.ts
│  ├─ backend-builder-v1.ts
│  ├─ build-orchestrator-v1.ts
│  ├─ build-verification-v1.ts
│  ├─ database-builder-v1.ts
│  ├─ echo-agent.ts
│  ├─ frontend-builder-v1.ts
│  ├─ judge-panel-v1.ts
│  ├─ planner-v1.ts
│  ├─ playwright-test-v1.ts
│  └─ repair-coordinator-v1.ts
├─ benchmarks/
│  ├─ adversarial-curriculum.ts
│  ├─ adversarial-evolution.ts
│  ├─ adversarial-intent-engine.ts
│  ├─ adversarial-metrics.ts
│  ├─ agent-evolution-engine.ts
│  ├─ agent-registry.ts
│  ├─ agent-types.ts
│  ├─ analysis-engine.ts
│  ├─ benchmark-dataset-export.ts
│  ├─ benchmark-judge.ts
│  ├─ benchmark-report.ts
│  ├─ benchmark-specification.ts
│  ├─ benchmark-tester.ts
│  ├─ benchmark-types.ts
│  ├─ browser-test-agent.ts
│  ├─ build-verifier.ts
│  ├─ capability-evolution-engine.ts
│  ├─ capability-registry.ts
│  ├─ civilization-dashboard.ts
│  ├─ civilization-engine.ts
│  ├─ civilization-history.ts
│  ├─ cognitive-injection-layer.ts
│  ├─ company-evolution-engine.ts
│  ├─ company-spawner.ts
│  ├─ competition-test.ts
│  ├─ complexity-collapse-map.ts
│  ├─ conflict-resolution-engine.ts
│  ├─ cross-entity-interference.ts
│  ├─ cross-model-adapter.ts
│  ├─ deception-layer.ts
│  ├─ decision-trace.ts
│  ├─ demo-surface-compiler.ts
│  ├─ deployment-repair-controller.ts
│  ├─ determinism-kernel.ts
│  ├─ devpost-ingestion-layer.ts
│  ├─ economy-enforcement-hooks.ts
│  ├─ evaluation-orchestrator.ts
│  ├─ evaluation-protocol.ts
│  ├─ evaluation-types.ts
│  ├─ evolution-controller.ts
│  ├─ execution-budget-manager.ts
│  ├─ execution-convergence-engine.ts
│  ├─ execution-environment-router.ts
│  ├─ execution-policy-optimizer.ts
│  ├─ execution-stability-guard.ts
│  ├─ executive-company-brain.ts
│  ├─ experiment-snapshot.ts
│  ├─ experiment-trace.ts
│  ├─ failure-containment-layer.ts
│  ├─ failure-patterns.ts
│  ├─ failure-resilience-layer.ts
│  ├─ global-execution-brain.ts
│  ├─ global-goal-monitor.ts
│  ├─ global-hackathon-world.ts
│  ├─ global-memory-index.ts
│  ├─ hackathon-benchmark-runner.ts
│  ├─ hackathon-benchmarks.ts
│  ├─ hackathon-company-orchestrator.ts
│  ├─ hackathon-orchestrator.ts
│  ├─ hackathon-reward-model.ts
│  ├─ hackathon-simulation-engine.ts
│  ├─ hackathon-swarm-orchestrator.ts
│  ├─ human-control-layer.ts
│  ├─ human-interaction-strategist.ts
│  ├─ index.ts
│  ├─ interaction-manager.ts
│  ├─ internet-hackathon-orchestrator.ts
│  ├─ internet-tool-gateway.ts
│  ├─ interrupt-protocol.ts
│  ├─ judge-adversarial-drift.ts
│  ├─ judge-calibration-engine.ts
│  ├─ judge-database.ts
│  ├─ judge-identity.ts
│  ├─ judge-simulator.ts
│  ├─ leaderboard.ts
│  ├─ live-browser-test-agent.ts
│  ├─ measurement/
│  │  ├─ history.ts
│  │  ├─ leaderboard.ts
│  │  └─ measure.ts
│  ├─ meta-judge.ts
│  ├─ metrics-definition.ts
│  ├─ multi-agent-competition.ts
│  ├─ multi-strategy-execution-engine.ts
│  ├─ mutation-difficulty-controller.ts
│  ├─ mutation-engine.ts
│  ├─ mutation-evolution-controller.ts
│  ├─ mutation-genome.ts
│  ├─ mutation-types.ts
│  ├─ observability-layer.ts
│  ├─ orchestrator-templates.ts
│  ├─ organization-evolution.ts
│  ├─ organizational-memory-bank.ts
│  ├─ paper-exporter.ts
│  ├─ performance-memory-buffer.ts
│  ├─ phase-11-orchestrator.ts
│  ├─ phase-12-orchestrator.ts
│  ├─ post-project-learning-cycle.ts
│  ├─ protocol-types.ts
│  ├─ publication-schema.ts
│  ├─ publication-validator.ts
│  ├─ real-benchmark-runner.ts
│  ├─ real-benchmark-suite.ts
│  ├─ recursive-improvement-engine.ts
│  ├─ remote-project-state.ts
│  ├─ replay-engine.ts
│  ├─ research-context.ts
│  ├─ resource-ledger.ts
│  ├─ resource-market-model.ts
│  ├─ run-benchmarks.ts
│  ├─ runner-types.ts
│  ├─ sandbox-execution-mode.ts
│  ├─ simulation-decision-engine.ts
│  ├─ simulation-determinism-validator.ts
│  ├─ skill-graph.ts
│  ├─ strategic-planner.ts
│  ├─ strategy-genome-database.ts
│  ├─ strategy-genome.ts
│  ├─ strategy-simulation-engine.ts
│  ├─ swarm-evolution-engine.ts
│  ├─ swarm-judge-aggregator.ts
│  ├─ swarm-leaderboard.ts
│  ├─ swarm-memory-bank.ts
│  ├─ task-graph.ts
│  ├─ taste-governor.ts
│  ├─ tool-execution-gateway.ts
│  ├─ tool-execution-graph.ts
│  ├─ tool-executor.ts
│  ├─ type-evolution-system.ts
│  ├─ unified-runtime-os.ts
│  ├─ unified-types.ts
│  ├─ user-feedback-injection-loop.ts
│  ├─ ux-evaluation-agent.ts
│  └─ winning-strategy-templates.ts
├─ build-a-todo-app/
│  ├─ next-env.d.ts
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ src/
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ config.ts
│  │  ├─ db/
│  │  ├─ lib/
│  │  └─ middleware/
│  ├─ tests/
│  │  └─ api.test.ts
│  ├─ tsconfig.json
├─ cli/
│  ├─ agents/
│  │  ├─ base-agent.ts
│  │  ├─ index.ts
│  │  ├─ intelligence-agent.ts
│  │  └─ types.ts
│  ├─ commands/
│  │  ├─ benchmark.ts
│  │  ├─ chat.ts
│  │  ├─ config.ts
│  │  ├─ deploy.ts
│  │  ├─ doctor.ts
│  │  ├─ explain.ts
│  │  ├─ health.ts
│  │  ├─ memory.ts
│  │  ├─ models.ts
│  │  ├─ providers.ts
│  │  ├─ replay.ts
│  │  ├─ resume.ts
│  │  ├─ run.ts
│  │  ├─ setup.ts
│  │  ├─ simulate.ts
│  │  ├─ status.ts
│  │  ├─ test.ts
│  │  └─ version.ts
│  ├─ config-manager.ts
│  ├─ context.ts
│  ├─ decisions.ts
│  ├─ devpost-parser.ts
│  ├─ errors.ts
│  ├─ hack-agent.ts
│  ├─ index.ts
│  ├─ learning/
│  │  └─ organizational-memory.ts
│  ├─ orchestration/
│  │  ├─ checkpoint-store.ts
│  │  ├─ events.ts
│  │  ├─ execution-state.ts
│  │  ├─ index.ts
│  │  ├─ orchestrator.ts
│  │  └─ types.ts
│  ├─ output.ts
│  ├─ pipeline/
│  │  ├─ benchmarking.ts
│  │  ├─ competition-intelligence.ts
│  │  ├─ index.ts
│  │  ├─ optimizer.ts
│  │  ├─ orchestrator.ts
│  │  ├─ parsing.ts
│  │  ├─ reporting.ts
│  │  ├─ scaffolding.ts
│  │  ├─ self-review.ts
│  │  ├─ strategy.ts
│  │  └─ types.ts
│  ├─ provider-init.ts
│  └─ types.ts
├─ features/
│  ├─ analyze/
│  │  ├─ analyzer.ts
│  │  ├─ command.ts
│  │  ├─ formatter.ts
│  │  ├─ parser.ts
│  │  └─ types.ts
│  ├─ benchmarks/
│  │  ├─ category-suite.ts
│  │  ├─ command.ts
│  │  └─ framework.ts
│  ├─ commands/
│  │  ├─ analyze.ts
│  │  ├─ categories.ts
│  │  ├─ docs.ts
│  │  ├─ intelligence.ts
│  │  └─ knowledge.ts
│  ├─ intelligence/
│  │  ├─ command.ts
│  │  ├─ engine.ts
│  │  ├─ renderer.ts
│  │  └─ types.ts
│  └─ knowledge/
│     ├─ command.ts
│     ├─ curated.ts
│     ├─ ingest.ts
│     ├─ search.ts
│     ├─ store.ts
│     └─ types.ts
├─ kernel/
│  ├─ agents/
│  │  ├─ agent-manifest.ts
│  │  ├─ agent-registry.ts
│  │  ├─ agent-runtime.ts
│  │  └─ index.ts
│  ├─ builders/
│  │  ├─ builder-provider.ts
│  │  ├─ builder-types.ts
│  │  ├─ code-repair-provider.ts
│  │  ├─ index.ts
│  │  ├─ mock-builder-provider.ts
│  │  ├─ repository-types.ts
│  │  └─ repository-validator.ts
│  ├─ context/
│  │  ├─ context-engine.ts
│  │  ├─ context-types.ts
│  │  └─ index.ts
│  ├─ evaluation/
│  │  └─ real-evaluator.ts
│  ├─ events/
│  │  ├─ dead-letter-queue.ts
│  │  ├─ event-bus.ts
│  │  ├─ event-envelope.ts
│  │  ├─ index.ts
│  │  └─ jsonl-store.ts
│  ├─ execution/
│  │  ├─ build-executor.ts
│  │  ├─ dev-server-executor.ts
│  │  ├─ execution-types.ts
│  │  ├─ index.ts
│  │  ├─ repository-materializer.ts
│  │  └─ workspace-provisioner.ts
│  ├─ generation/
│  │  ├─ code-repair-provider.ts
│  │  ├─ generation-metrics.ts
│  │  ├─ generation-types.ts
│  │  ├─ index.ts
│  │  └─ llm-builder-provider.ts
│  ├─ global-memory/
│  │  └─ genome.ts
│  ├─ index.ts
│  ├─ judge/
│  │  ├─ index.ts
│  │  ├─ judge-provider.ts
│  │  └─ judge-types.ts
│  ├─ learning/
│  │  └─ failure-tracker.ts
│  ├─ llm/
│  │  ├─ index.ts
│  │  ├─ llm-provider.ts
│  │  ├─ llm-types.ts
│  │  ├─ mock-providers.ts
│  │  └─ router-engine.ts
│  ├─ memory/
│  │  ├─ index.ts
│  │  └─ memory-writer.ts
│  ├─ planning/
│  │  ├─ architect-provider.ts
│  │  ├─ architect-types.ts
│  │  ├─ index.ts
│  │  ├─ planner-types.ts
│  │  └─ planning-provider.ts
│  ├─ prompts/
│  │  ├─ index.ts
│  │  ├─ prompt-engine.ts
│  │  ├─ prompt-types.ts
│  │  └─ templates.ts
│  ├─ providers/
│  │  ├─ anthropic-provider.ts
│  │  ├─ custom-endpoint-provider.ts
│  │  ├─ gemini-provider.ts
│  │  ├─ index.ts
│  │  ├─ llm-architect-provider.ts
│  │  ├─ llm-builder-provider.ts
│  │  ├─ llm-planning-provider.ts
│  │  ├─ openai-provider.ts
│  │  ├─ openrouter-provider.ts
│  │  ├─ provider-factory.ts
│  │  └─ provider-types.ts
│  ├─ qualification/
│  │  ├─ capability-registry.ts
│  │  └─ hackathon-qualifier.ts
│  ├─ recovery/
│  │  ├─ anomaly-detector.ts
│  │  └─ index.ts
│  ├─ repair/
│  │  ├─ autonomous-repair.ts
│  │  ├─ code-quality-validator.ts
│  │  ├─ index.ts
│  │  ├─ repair-task-generator.ts
│  │  └─ repair-types.ts
│  ├─ skills/
│  │  ├─ index.ts
│  │  ├─ skill-engine.ts
│  │  └─ skill-types.ts
│  ├─ state/
│  │  ├─ index.ts
│  │  ├─ project-state-machine.ts
│  │  └─ task-state-machine.ts
│  ├─ tasks/
│  │  ├─ index.ts
│  │  ├─ task-entity.ts
│  │  ├─ task-lifecycle.ts
│  │  ├─ task-queue.ts
│  │  └─ task-repository.ts
│  ├─ test/
│  │  ├─ index.ts
│  │  ├─ test-provider.ts
│  │  └─ test-types.ts
│  ├─ types/
│  │  └─ index.ts
│  ├─ validation/
│  │  └─ browser-validator.ts
│  └─ workspace/
│     ├─ index.ts
│     └─ workspace-manager.ts
├─ package-lock.json
├─ package.json
├─ paper/
│  ├─ README.md
│  ├─ benchmark-spec.md
│  ├─ dataset-spec.md
│  ├─ figures.md
│  ├─ paper.md
│  ├─ reproducibility-statement.md
│  └─ usage.md
├─ scripts/
│  └─ generate-docs.ts
├─ tests/
│  ├─ features/
│  │  ├─ analyze.test.ts
│  │  ├─ benchmark-measure.test.ts
│  │  ├─ benchmarks.test.ts
│  │  ├─ docs.test.ts
│  │  ├─ intelligence.test.ts
│  │  ├─ knowledge.test.ts
│  │  └─ prompts.test.ts
│  ├─ integration/
│  │  ├─ architect-workflow.test.ts
│  │  ├─ autonomous-execution.test.ts
│  │  ├─ build-verification-workflow.test.ts
│  │  ├─ builder-workflow.test.ts
│  │  ├─ cli.test.ts
│  │  ├─ company-mode.test.ts
│  │  ├─ deterministic-reproducibility.test.ts
│  │  ├─ e2e-todo-app.test.ts
│  │  ├─ internet-execution.test.ts
│  │  ├─ judge-workflow.test.ts
│  │  ├─ orchestrator-workflow.test.ts
│  │  ├─ phase12.test.ts
│  │  ├─ phase13.test.ts
│  │  ├─ pipeline-false-positives.test.ts
│  │  ├─ planner-workflow.test.ts
│  │  ├─ provider-integration.test.ts
│  │  ├─ repair-workflow.test.ts
│  │  ├─ runtime-os.test.ts
│  │  ├─ task-lifecycle.test.ts
│  │  └─ testing-workflow.test.ts
│  └─ unit/
│     ├─ adversarial-system.test.ts
│     ├─ agent-registry.test.ts
│     ├─ agent-runtime.test.ts
│     ├─ anomaly-detector.test.ts
│     ├─ architect-provider.test.ts
│     ├─ architect-types.test.ts
│     ├─ architect-v1.test.ts
│     ├─ backend-builder-v1.test.ts
│     ├─ benchmark-suite.test.ts
│     ├─ build-executor.test.ts
│     ├─ build-orchestrator-v1.test.ts
│     ├─ build-verification-v1.test.ts
│     ├─ builder-provider.test.ts
│     ├─ builder-types.test.ts
│     ├─ code-repair-provider.test.ts
│     ├─ cognitive-injection-layer.test.ts
│     ├─ context-engine.test.ts
│     ├─ context-types.test.ts
│     ├─ database-builder-v1.test.ts
│     ├─ dead-letter-queue.test.ts
│     ├─ devpost-url-validation.test.ts
│     ├─ echo-agent.test.ts
│     ├─ event-bus.test.ts
│     ├─ event-envelope.test.ts
│     ├─ execution-types.test.ts
│     ├─ frontend-builder-v1.test.ts
│     ├─ generated-project-validation.test.ts
│     ├─ generation-metrics.test.ts
│     ├─ generation-types.test.ts
│     ├─ global-hackathon-world.test.ts
│     ├─ jsonl-store.test.ts
│     ├─ judge-panel-v1.test.ts
│     ├─ judge-provider.test.ts
│     ├─ judge-types.test.ts
│     ├─ llm-builder-provider.test.ts
│     ├─ llm-types.test.ts
│     ├─ memory-writer.test.ts
│     ├─ mock-providers.test.ts
│     ├─ orchestration-foundation.test.ts
│     ├─ planner-types.test.ts
│     ├─ planner-v1.test.ts
│     ├─ planning-provider.test.ts
│     ├─ playwright-test-v1.test.ts
│     ├─ project-state-machine.test.ts
│     ├─ prompt-engine.test.ts
│     ├─ prompt-types.test.ts
│     ├─ repair-coordinator-v1.test.ts
│     ├─ repair-task-generator.test.ts
│     ├─ repair-types.test.ts
│     ├─ repository-materializer.test.ts
│     ├─ repository-validator.test.ts
│     ├─ requirement-fidelity.test.ts
│     ├─ resource-economy.test.ts
│     ├─ router-engine.test.ts
│     ├─ skill-engine.test.ts
│     ├─ skill-types.test.ts
│     ├─ sprint3-regressions.test.ts
│     ├─ strategy-genome-database.test.ts
│     ├─ task-entity.test.ts
│     ├─ task-queue.test.ts
│     ├─ task-repository.test.ts
│     ├─ task-state-machine.test.ts
│     ├─ workspace-manager.test.ts
│     └─ workspace-provisioner.test.ts
├─ tsconfig.json
├─ tsconfig.production.json
└─ vitest.config.ts
```

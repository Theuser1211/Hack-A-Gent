# Hack-A-Gent

**A Deterministic Adversarial Multi-Agent Benchmark for AI Code Generation Robustness**

Hack-A-Gent is a fully deterministic benchmarking framework for evaluating the robustness of AI-powered code generation systems under targeted adversarial mutation attacks. It combines a mutation engine with 15 operation types, an adaptive adversarial curriculum, a multi-agent competitive league, and a complete reproducibility toolkit.

---

## Project Structure

```
hack-agent/
│
├── paper/                          # Publication & documentation
│   ├── README.md                   # This file — project overview & release structure
│   ├── paper.md                    # Full arXiv-style research paper
│   ├── benchmark-spec.md           # Formal benchmark specification
│   ├── dataset-spec.md             # Dataset & artifact export format
│   ├── figures.md                  # Figure/diagram descriptions (text-only)
│   ├── reproducibility-statement.md # Determinism guarantees & validation
│   └── usage.md                    # Benchmark usage guide
│
├── benchmarks/                     # Core benchmark engine
│   ├── determinism-kernel.ts       # Seeded RNG, deterministic UUIDs, timestamps
│   ├── hackathon-benchmarks.ts     # 5 benchmark definitions (AI, SaaS, WebApp, Healthcare, Education)
│   ├── hackathon-benchmark-runner.ts # 8-phase evaluation pipeline orchestrator
│   ├── mutation-engine.ts          # 15 mutation operations + application logic
│   ├── mutation-genome.ts          # Evolutionary algorithm for mutation strategies
│   ├── mutation-difficulty-controller.ts # BDI adaptive difficulty system
│   ├── adversarial-curriculum.ts   # Curriculum state classification
│   ├── evaluation-orchestrator.ts  # Single-source-of-truth scoring
│   ├── experiment-snapshot.ts      # Frozen state serialization
│   ├── replay-engine.ts            # Experiment replay & comparison
│   ├── publication-schema.ts       # Publication output format
│   ├── publication-validator.ts    # Automated reproducibility validation
│   ├── build-verifier.ts           # Repository structure & content verification
│   ├── benchmark-judge.ts          # Multi-faceted evaluation judging
│   ├── benchmark-tester.ts         # Automated test suite execution
│   ├── benchmark-report.ts         # Report generation
│   ├── benchmark-types.ts          # Zod schemas & TypeScript types
│   ├── agent-registry.ts           # Agent lifecycle management
│   ├── agent-types.ts              # Agent data types
│   ├── leaderboard.ts              # Agent ranking & evolution metrics
│   ├── evolution-controller.ts     # Population-wide evolutionary pressure
│   ├── mutation-evolution-controller.ts # Genome + difficulty evolution orchestrator
│   ├── performance-memory-buffer.ts # Circular buffer for performance history
│   ├── failure-patterns.ts         # Failure pattern analysis
│   ├── analysis-engine.ts          # Cross-agent analysis
│   ├── paper-exporter.ts           # Paper data package generation
│   ├── benchmark-dataset-export.ts # Dataset export utilities
│   ├── cross-model-adapter.ts      # Multi-model comparison
│   ├── run-benchmarks.ts           # CLI entry point for league runs
│   └── index.ts                    # Public API exports
│
├── kernel/                         # Core system modules
│   ├── builders/                   # Repository generation & validation
│   │   ├── repository-types.ts     # IR Schema: Repository → Module → File
│   │   ├── builder-types.ts        # Generated types with Zod validation
│   │   ├── builder-provider.ts     # Builder provider interface
│   │   ├── llm-builder-provider.ts # LLM-backed builder implementation
│   │   ├── repository-validator.ts # Schema & structure validation
│   │   └── code-repair-provider.ts # Automated repair strategies
│   ├── planning/                   # Planning & architecture
│   │   ├── planner-types.ts        # Planner interfaces
│   │   ├── planner-v1.ts           # Planner implementation
│   │   ├── architect-types.ts      # Architecture blueprint types
│   │   └── architect-provider.ts   # Architecture provider interface
│   ├── execution/                  # Execution & materialization
│   │   ├── repository-materializer.ts # Filesystem materialization
│   │   └── build-executor.ts       # Build execution
│   ├── llm/                        # LLM provider abstraction
│   │   ├── llm-provider.ts         # LLM provider interface
│   │   ├── llm-types.ts            # LLM request/response types
│   │   └── router-engine.ts        # Provider routing & fallback
│   ├── judge/                      # Judge evaluation
│   └── generation/                 # Generation metrics & tracking
│
├── agents/                         # Agent implementations
│   └── ...                         # (user-defined agents)
│
├── tests/                          # Test suites
│   ├── unit/                       # Unit tests
│   │   ├── benchmark-suite.test.ts # Benchmark definition tests
│   │   └── ...                     # (other unit tests)
│   └── integration/                # Integration tests
│       └── deterministic-reproducibility.test.ts # 24 determinism tests
│
├── snapshots/                      # Archived experiment snapshots
│   └── ...                         # .json files (one per run)
│
├── datasets/                       # Exported datasets
│   └── ...                         # .json exports
│
├── reports/                        # Generated reports
│   ├── leaderboard.json            # Persistent leaderboard state
│   ├── LEAGUE_RESULTS.md           # Formatted league report
│   └── FAILURE_PATTERNS.md         # Failure pattern analysis
│
├── tsconfig.json                   # TypeScript configuration
├── vitest.config.ts                # Test runner configuration
├── package.json                    # Project metadata & dependencies
└── README.md                       # (root) Quick-start README
```

---

## Key Features

- **15 mutation types** across 4 categories: file structure, content distortion, schema violation, semantic inconsistency
- **Deterministic kernel**: Seeded LCG RNG guarantees bit-for-bit reproducibility across runs
- **8-phase evaluation pipeline**: Planning → Architecture → Building → Materialization → Adversarial Mutation → Verification/Repair → Testing → Judging
- **Adaptive curriculum**: BDI (Benchmark Difficulty Index) automatically adjusts mutation difficulty based on agent performance
- **Genome evolution**: Mutation strategies evolve through crossover, mutation, and selection
- **Multi-agent league**: Competitive evaluation with specialization profiling and leaderboard ranking
- **Full reproducibility toolkit**: Snapshot serialization, replay engine, publication validator
- **5 benchmark categories**: AI, SaaS, WebApp, Healthcare, Education

---

## Quick Start

```bash
npm install
npm run build
npx tsx benchmarks/run-benchmarks.ts
```

## Citation

If you use Hack-A-Gent in your research, please cite:

```bibtex
@software{hackagent2026,
  title = {Hack-A-Gent: A Deterministic Adversarial Multi-Agent Benchmark for AI Code Generation Robustness},
  year = {2026},
  url = {https://github.com/anomalyco/hack-agent}
}
```

## License

MIT

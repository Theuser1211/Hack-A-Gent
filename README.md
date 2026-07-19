# Hack-A-Gent

Autonomous hackathon engineering CLI. Give it a Devpost URL, and it generates a complete, production-ready project.

[![CI](https://github.com/Theuser1211/Hack-A-Gent/actions/workflows/ci.yml/badge.svg)](https://github.com/Theuser1211/Hack-A-Gent/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Devpost Integration** — Parse any Devpost software page into structured requirements
- **Competition Intelligence** — Extract judging criteria, sponsor APIs, deadlines, and restrictions
- **Winning Strategy** — Judge-optimized architecture recommendations
- **Full Project Generation** — Scaffolded Next.js + TypeScript projects with frontend, backend, and deployment config
- **Quality Checks** — README, LICENSE, .gitignore, .env.example, Docker, CI/CD, tests
- **Self-Review Scorer** — 7-dimension scoring: Innovation, Technical Depth, Feasibility, Presentation, Completeness, Maintainability, Judge Alignment
- **Pipeline Benchmarks** — Compare old vs improved pipeline performance
- **6 LLM Providers** — NVIDIA NIMs, OpenAI, Anthropic, Gemini, OpenRouter, or any OpenAI-compatible endpoint
- **Template Fallback** — Works without an LLM using built-in templates
- **Deterministic** — Same seed + same input = same output every time
- **Organizational Memory** — Learns from past projects to improve future results
- **15+ CLI Commands** — run, setup, config, doctor, simulate, explain, replay, and more
- **Hackathon Qualification** — Pre-run capability check: determines if a hackathon is compatible before committing resources
- **Real Evaluation** — Scores 6 dimensions with verifiable code analysis (build, tests, docs, deployment)
- **Browser Validation** — Starts dev server, analyzes HTML content, checks for titles/headings/interactive elements
- **Autonomous Repair** — Parses TypeScript errors, applies pattern-based fixes automatically
- **Failure Tracking** — Records failures, provides prevention strategies for future runs
- **Real Benchmarks** — 5 self-contained test scenarios evaluating actual code generation quality

## Screenshots

```
$ hag help
```

```
Usage: hackagent <command> [options]

Commands:
  run <input>          Full hackathon pipeline (Devpost URL, file, or text)
  simulate <input>     Run simulation only
  resume <projectId>   Resume a paused execution
  status [projectId]   Show project status / list projects
  memory <query|stats|clear>  Organizational memory
  benchmark list|run   Benchmark suite
  benchmark real|measure  Real benchmarks & quality measurement
  replay <runId>       Deterministic replay of a past run
  config               Configure LLM providers and deploy tokens
  setup                Interactive first-time setup wizard
  deploy <projectId>   Deploy a built project
  test <projectId>     Run browser tests
  explain [projectId]  Decision traces and debug analysis
  health               System health check
  chat                 Interactive conversational mode
  doctor               System diagnostics
  models               List available models
  providers            Show provider status
  version              Show version information
  hack-agent <input>   Autonomous multi-agent orchestration mode
  analyze <url>        Competition intelligence from a Devpost URL
  inspect <url>        Verbose analysis (risks + winners playbook)
  opportunities <url>  Scoring opportunities + MVP focus
  sponsors <url>       Sponsor & API breakdown
  timeline <url>       Timeline, milestones, completion probability
  strategy <url>       Winning strategy + differentiators
  compare <a> <b>      Diff two hackathons
  categories           Real benchmark framework (16 categories)
  docs generate        Generate documentation
  knowledge            Project quality knowledge base
  help                 Show this help message
```

```
$ hag doctor
```

```
✔ System check passed
  Node: v20.12.0 ✓
  Git: 2.44.0 ✓
  Config: /home/user/.config/hackagent/config.json ✓
  Provider: nvidia (healthy)
  Workspace: /home/user/projects (writable) ✓
```

```
$ hag run https://devpost.com/software/example
```

```
╭─ Full Pipeline ─────────────────────────────────╮
│ ✔ Parsing input              (0.3s)             │
│   "AI Assistant"                                 │
│ ✔ Initializing LLM providers (0.1s)             │
│ ✔ Running strategy competition(1.2s)             │
│   winner: "MVP First"                            │
│ ✔ Extracting requirements    (0.2s)             │
│   requirements: 8                                │
│ ✔ Building TaskGraph         (0.1s)             │
│   tasks: 20                                      │
│ ✔ Executing pipeline         (4.5s)             │
│ ✔ Type-checking              (1.2s)             │
│   passed: yes                                    │
│ ✔ Smoke test                 (2.1s)             │
│   http200: yes                                   │
╰─────────────────────────────────────────────────╯
```

## Installation

### From source (recommended)

```bash
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent
npm install
npm run build
npm link
```

After linking, use `hag` or `hackagent` from any directory.

### Via npx (no install)

```bash
npx hackagent setup
```

## Quick Start

```bash
# 1. Run the setup wizard (first time)
hag setup

# 2. Generate a project from a Devpost URL
hag run https://devpost.com/software/example

# 3. Try without an LLM (template fallback)
hag run "Project: Todo App
Problem: A simple todo application
Judging Criteria: Functionality, UX, Innovation
Tech Stack: React, Node.js"
```

## Configuration

### Interactive setup

```bash
hag setup
```

### Manual config

```bash
# NVIDIA NIMs (fastest option)
hag config --provider nvidia --api-key nvapi-xxx

# OpenAI
hag config --provider openai --api-key sk-xxx

# Custom endpoint (Ollama, LM Studio, any OpenAI-compatible)
hag config --provider custom --api-key your-key --endpoint http://localhost:11434/v1

# Verify the connection
hag config --verify

# Show current config
hag config --show
```

Provider aliases: `nvidia-nims`, `nvidia-nim` → `nvidia`. Endpoint aliases: `--endpoint` → `--base-url`.

### .env file

```env
HACKAGENT_PROVIDER=nvidia
HACKAGENT_API_KEY=nvapi-xxx
HACKAGENT_BASE_URL=https://integrate.api.nvidia.com/v1
HACKAGENT_MODEL=meta/llama-3.1-8b-instruct
```

## Supported Providers

| Provider | Flag value | Auto-detects models | Health check |
|----------|-----------|-------------------|--------------|
| NVIDIA NIMs | `nvidia` | Yes | Real API call |
| OpenAI | `openai` | Yes | Cached |
| Anthropic | `anthropic` | Yes | Cached |
| Gemini | `gemini` | Yes | Cached |
| OpenRouter | `openrouter` | Yes | Cached |
| Custom | `custom` | No | Real GET /models |

## Commands

| Command | Description |
|---------|-------------|
| `hag run <input>` | Full pipeline: parse, strategize, generate, typecheck, smoke test. `--demo`, `--simulate-only`, `--resume`, `--force` |
| `hag hack-agent <input>` | Autonomous agent mode (multi-agent orchestration) |
| `hag setup` | Interactive setup wizard |
| `hag config` | View or change LLM/config settings |
| `hag doctor` | System diagnostics — Node, Git, config, provider, workspace |
| `hag models` | List available models from configured provider |
| `hag providers` | Show status of all 6 supported providers |
| `hag simulate <input>` | Simulation only (no code generation) |
| `hag status [id]` | Show project status or list saved projects |
| `hag memory <query\|stats\|clear>` | Organizational memory |
| `hag benchmark list\|run` | Synthetic benchmark suite |
| `hag benchmark real <list\|run\|run-all>` | Real, code-analysis-based benchmarks |
| `hag benchmark measure [dir]` | Measure a project across 12 quality dimensions |
| `hag benchmark history\|leaderboard\|compare\|suggest` | Track and compare benchmark runs |
| `hag explain [id]` | Decision traces and debug analysis |
| `hag replay <id>` | Deterministic replay of a past run (list / trace / snapshot) |
| `hag resume <projectId>` | Resume a paused execution from its saved snapshot |
| `hag deploy <id>` | Deploy a built project |
| `hag test <id>` | Run browser tests |
| `hag health` | System health check |
| `hag chat` | Interactive REPL mode |
| `hag analyze <url>` | Competition intelligence from a Devpost URL |
| `hag intelligence <analyze\|inspect\|opportunities\|sponsors\|timeline\|strategy\|compare>` | Winning-strategy intelligence |
| `hag knowledge <update\|search\|stats\|explain\|export>` | Project quality knowledge base |
| `hag categories <list\|run\|run-all\|compare\|history>` | Real benchmark framework (16 categories, 15 dimensions) |

> **Note:** `hag run` and `hag categories run --generate` will not silently overwrite an existing, non-empty project directory. Pass `--force` to override.
| `hag docs` | Generate documentation |
| `hag version` | Display version |
| `hag help` | Show help |

## Project Structure

```
Hack-A-Gent/
├── cli/              # Command-line interface
│   ├── commands/     # Command implementations
│   ├── output.ts     # ANSI color/spinner/icon utility
│   ├── config-manager.ts
│   ├── provider-init.ts
│   └── index.ts      # Entry point
├── benchmarks/       # Hackathon generation engines
│   ├── internet-hackathon-orchestrator.ts
│   ├── devpost-parser.ts
│   ├── real-benchmark-suite.ts
│   └── real-benchmark-runner.ts
├── kernel/           # Core runtime
│   ├── llm/          # Provider implementations
│   ├── prompts/      # Prompt templates
│   ├── qualification/ # Hackathon capability checking
│   ├── evaluation/   # Real project evaluation
│   ├── validation/   # Browser validation
│   ├── repair/       # Autonomous repair loop
│   └── learning/     # Failure tracking
├── agents/           # Legacy multi-agent modules (architect, builder, planner, judge, etc.)
│   ├── architect-v1.ts
│   ├── planner-v1.ts
│   ├── judge-panel-v1.ts
│   └── ... (11 agent modules)
├── tests/            # Test suite
│   ├── unit/
│   └── integration/
├── docs/             # Documentation (architecture, protocol, runtime specs)
├── .github/          # GitHub templates and workflows
└── package.json
```

## Architecture

The system is organized in four layers:

- **CLI** (`cli/`) — Command-line interface, configuration, output formatting, error handling
- **Benchmarks** (`benchmarks/`) — Hackathon simulation, project generation, competition intelligence
- **Kernel** (`kernel/`) — LLM provider abstraction, routing, tool execution
- **Agents** (`agents/`) — Specialized agents (architect, builder, planner, judge)

All execution is deterministic — the same seed produces the same output every time.

## Pipeline Stages

When you run `hag run`, the pipeline executes:

1. **Parsing input** — Devpost URL, file, or text specification
2. **Qualifying hackathon** — Pre-run capability check (SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED)
3. **Initializing LLM providers** — Connects to configured provider
4. **Running strategy competition** — Multiple agents propose approaches
5. **Extracting requirements** — Structured requirements from parsed input
6. **Building TaskGraph** — Execution plan with task dependencies
7. **Executing pipeline** — Code generation, builds, deployment
8. **Competition intelligence** — Judging criteria, sponsor APIs, deadlines
9. **Winning strategy** — Judge-optimized architecture recommendations
10. **Post-project learning** — Memory update for future runs
11. **Self-review & optimization** — Quality scoring and improvement suggestions
12. **Type-checking** — TypeScript compilation check
13. **Browser validation** — Starts dev server, analyzes HTML content, checks titles/headings/interactive elements
14. **Real evaluation** — Scores 6 dimensions: Organization, Code Quality, Completeness, Testing, Deployment, Documentation
15. **Failure tracking** — Records failures and provides prevention strategies for next run

## Development

```bash
# Build
npm run build

# Type-check
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Format
npm run format
```

## Testing

The project has 1200+ tests across 80+ test files:

- **Unit tests** — Individual module/class tests
- **Integration tests** — Pipeline, orchestration, and workflow tests
- **Determinism tests** — Same seed produces identical results

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/unit/router-engine.test.ts

# Run tests with coverage
npm run test:coverage
```

## FAQ

### Do I need an LLM API key?

No. Hack-A-Gent works without any LLM using built-in templates. The templates produce a working Next.js project with scaffold, frontend pages, and backend API routes.

With an LLM (NVIDIA, OpenAI, etc.), generated code is more customized to the specific hackathon requirements.

### What does `hag run` generate?

A complete Next.js 14 project with:
- `package.json` with all dependencies
- TypeScript configuration
- App Router pages and layouts
- API routes
- Tests
- Deployment configuration
- `.gitignore`, `.env.example`

### Can I use my own LLM provider?

Yes. Hack-A-Gent supports 6 providers: NVIDIA NIMs, OpenAI, Anthropic, Gemini, OpenRouter, and any OpenAI-compatible custom endpoint (Ollama, LM Studio, etc.).

### Is it deterministic?

Yes. Pass `--seed <N>` to any command for deterministic execution. Same seed + same input = same output.

### Which platforms are supported?

Windows, macOS, and Linux. Requires Node.js 20+.

## Known Limitations

- **LLM generation quality varies** — ~40% of generated projects compile on first try with LLM-assisted generation. Template fallback (no LLM) always produces working code. Autonomous repair loop mitigates remaining failures.
- **Browser validation is limited** — Starts the dev server and analyzes the rendered HTML (title, headings, interactive elements, content length). It does not run full end-to-end interaction tests.
- **Single framework** — Currently generates Next.js projects only. Python/Go/Rust support is on the roadmap.
- **Validation projects** — 2 of 6 validation projects pass build when using LLM generation; template fallback passes 6/6.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, code style, and pull request guidelines.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT — see [LICENSE](LICENSE).

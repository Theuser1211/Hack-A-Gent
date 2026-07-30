# Hack-A-Gent

Give it a Devpost URL. It generates a complete, working hackathon project — scaffold, frontend, backend, tests, and deployment config — using either an LLM or built-in templates. CLI-first, deterministic, cross-platform.

[![CI](https://github.com/Theuser1211/Hack-A-Gent/actions/workflows/ci.yml/badge.svg)](https://github.com/Theuser1211/Hack-A-Gent/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.5-blue)

## Features

- **Devpost pipeline** — Parse any Devpost software page, extract judging criteria, sponsor APIs, deadlines, and restrictions. Generate a winning strategy optimized for those criteria.
- **Full project generation** — Scaffolded Next.js 14 + TypeScript project with landing page, API routes, tests, and deployment config.
- **6 LLM providers** — NVIDIA NIMs, OpenAI, Anthropic, Gemini, OpenRouter, or any OpenAI-compatible custom endpoint (Ollama, LM Studio, etc.).
- **Template fallback** — Works entirely without an LLM. Built-in templates produce a working project regardless of API availability.
- **Autonomous repair** — When LLM-generated TypeScript has errors, the system parses the error output and applies pattern-based fixes automatically.
- **Browser validation** — Starts a dev server, fetches the rendered HTML, and validates titles, headings, and interactive elements.
- **Real evaluation** — Scores generated projects on 6 dimensions using verifiable code analysis (build, tests, docs, deployment).
- **Project quality checks** — README, LICENSE, .gitignore, .env.example, Docker, CI/CD, responsive UI validation.
- **Competition intelligence** — Analyze Devpost challenges for theme, difficulty, weighted judging criteria, sponsor APIs, and strategic recommendations.
- **Hackathon qualification** — Pre-run capability check determines if a hackathon is compatible before committing resources.
- **Self-review scorer** — 7-dimension scoring: Innovation, Technical Depth, Feasibility, Presentation, Completeness, Maintainability, Judge Alignment.
- **Pipeline benchmarks** — 5 self-contained test scenarios measuring actual code generation quality.
- **Organizational memory** — Records failures and outcomes to improve future runs.
- **Deterministic** — Same seed + same input = same output every time. No hidden randomness.
- **Cross-platform CLI** — Windows, macOS, Linux. Node.js 20+.
- **17+ CLI commands** — run, setup, config, doctor, analyze, explain, resume, and more.

## Quick Start

```bash
# Install
npm install -g hackagent

# Run the setup wizard
hag setup

# Generate a project from a Devpost URL
hag run https://devpost.com/software/example

# Or try without an LLM (template fallback)
hag run "Project: Todo App
Problem: A simple todo application
Judging Criteria: Functionality, UX, Innovation
Tech Stack: React, Node.js"
```

## Installation

### From npm (recommended)

```bash
npm install -g hackagent
```

After installing, use `hag` or `hackagent` from any directory.

### From source

```bash
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent
npm install
npm run build
npm link
```

### Via npx (no install)

```bash
npx hackagent setup
```

## Usage

```
$ hag help

  Hack-A-Gent — Autonomous Hackathon Teammate

  Usage:
    hackagent <command> [options]
    hag <command> [options]

  Public Commands:
    run <url|file|text>      Build a hackathon submission from a URL, file, or description
    resume <projectId>       Resume a paused build
    explain [projectId]      Show decision traces and debug analysis
    setup                    Interactive first-time setup wizard
    doctor                   System diagnostics
    providers                Show configured provider status
    models                   List available models from configured provider

  Internal / Advanced Commands:
    config                   Configure LLM provider, API keys, deploy tokens
    status [projectId]       Show project status / list projects
    memory                   Search organizational memory, show stats
    benchmark                Run benchmark suite, list benchmarks, measure projects
    replay <runId>           Deterministic replay of a past run
    deploy <projectId>       Deploy a built project
    test <projectId>         Run browser tests
    health                   System health check
    chat                     Interactive conversational mode
    simulate <input>         Run simulation only
    hack-agent               Internal pipeline runner
    version                  Show version

  Intelligence Commands:
    analyze <url|file|text>     Full competition analysis
    inspect <url|file|text>     Verbose analysis with risks + winners
    opportunities <url|text>    Scoring opportunities + MVP focus
    sponsors <url|text>         Sponsor API breakdown
    timeline <url|text>         Timeline and milestone analysis
    strategy <url|text>         Winning strategy generator
    compare <a> <b>             Diff two competitions
    categories list             Benchmark categories
    docs generate               Generate project documentation
    knowledge update/search     Knowledge base operations

  Global Flags:
    --seed <N>           Set deterministic seed (default: 42)
    --json               Output raw JSON
    --quiet              Minimal output
    --verbose            Verbose logging
    --dry-run            Simulate without executing
    --debug              Show full error stack traces

  Examples:
    hag run https://devpost.com/software/example
    hag setup
    hag memory query "React dashboard"
    hag benchmark list
    hag analyze https://devpost.com/software/example
```

## Pipeline

Running `hag run` executes the full generation pipeline:

```
$ hag run https://devpost.com/software/example

╭─ Hackathon Pipeline ──────────────────────────────────╮
│ ✔ Parsing              (1.2s)   devpost.com/software… │
│ ✔ Qualification        (0.1s)   PARTIALLY_SUPPORTED   │
│ ✔ LLM init             (0.0s)   nvidia (healthy)      │
│ ✔ Strategy             (0.0s)   Judge-optimized plan  │
│ ✔ Planning             (0.0s)   20 tasks generated    │
│ ✔ Code generation      (4m10s)  template fallback     │
│ ✔ Build validation     (8.2s)   npm run build passes  │
│ ✔ Browser test         (35.0s)  Title, headings, nav  │
│ ✔ Learning             (5.0s)   Memory updated        │
│ ✔ Review               (5.0s)   7-dimension score     │
│ ✔ Evaluation           (5.0s)   74.2/100              │
│ ✔ Submission check     (2.0s)   12/14 checks pass     │
╰───────────────────────────────────────────────────────╯
Pipeline completed in 4m 9s (20 tasks)
```

## Configuration

### Interactive setup

```bash
hag setup
```

### Manual configuration

```bash
# NVIDIA NIMs
hag config --provider nvidia --api-key nvapi-xxx

# OpenAI
hag config --provider openai --api-key sk-xxx

# Anthropic
hag config --provider anthropic --api-key sk-ant-xxx

# Custom endpoint (Ollama, LM Studio)
hag config --provider custom --api-key your-key --endpoint http://localhost:11434/v1

# Verify the connection
hag config --verify

# Show current config
hag config --show
```

Provider aliases: `nvidia-nims`, `nvidia-nim` → `nvidia`. Endpoint alias: `--endpoint` → `--base-url`.

### `.env` file

```env
HACKAGENT_PROVIDER=nvidia
HACKAGENT_API_KEY=nvapi-xxx
HACKAGENT_BASE_URL=https://integrate.api.nvidia.com/v1
HACKAGENT_MODEL=meta/llama-3.1-8b-instruct
```

## Supported Providers

| Provider | Config value | Model discovery | Health check |
|---|---|---|---|
| NVIDIA NIMs | `nvidia` | API-driven | Real `GET /models` |
| OpenAI | `openai` | Static | Cached |
| Anthropic | `anthropic` | Static | Cached |
| Gemini | `gemini` | Static | Cached |
| OpenRouter | `openrouter` | Static | Cached |
| Custom endpoint | `custom` | Static | Real `GET /models` |

## Diagnostics

```bash
$ hag doctor

✔ System check passed
  Node: v20.12.0
  Git: 2.44.0
  Config: /home/user/.hackagent/config.json
  Provider: nvidia (healthy)
  Workspace: /home/user/projects (writable)
```

## How It Works

1. **Parse** the Devpost URL or input text into structured requirements
2. **Analyze** the competition: judging criteria with normalized weights, sponsor APIs, deliverables, restrictions, deadlines
3. **Strategize** a judge-optimized plan: which criteria to prioritize, which sponsor APIs to integrate, differentiators
4. **Plan** the execution as a task graph with dependencies
5. **Generate** code for each task — scaffold, frontend, backend, config — using either the LLM provider or fallback templates
6. **Validate** the build compiles, starts a dev server, and renders correct HTML
7. **Evaluate** the output on 6 quality dimensions with verifiable analysis
8. **Learn** from failures and outcomes to improve future runs

## Project Structure

```
hackagent/
├── cli/              # Command-line interface
│   ├── commands/     # Command implementations
│   ├── output.ts     # ANSI color/spinner/icon utility
│   ├── config-manager.ts
│   ├── provider-init.ts
│   └── index.ts      # Entry point + aliases + SIGINT handler
├── benchmarks/       # Generation engine & evaluation
│   ├── internet-hackathon-orchestrator.ts
│   ├── devpost-parser.ts
│   ├── orchestrator-templates.ts
│   └── real-benchmark-runner.ts
├── kernel/           # Core runtime
│   ├── llm/          # Provider implementations + router
│   ├── prompts/      # Prompt assembly
│   ├── providers/    # Provider factory, types, base classes
│   ├── qualification/ # Pre-run capability checking
│   ├── evaluation/   # Code quality scoring
│   ├── validation/   # Browser-based HTML validation
│   ├── repair/       # Autonomous error repair
│   └── learning/     # Failure tracking & memory
├── agents/           # Legacy agent modules
├── tests/            # Unit + integration test suite
└── docs/             # Architecture & protocol docs
```

## Development

```bash
# Build
npm run build

# Type-check
npx tsc --noEmit

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

The test suite has 1200+ tests across 80+ test files covering unit, integration, and determinism testing.

## FAQ

### Do I need an LLM API key?

No. Hack-A-Gent works without any LLM using built-in templates. The templates produce a working Next.js project with scaffold, frontend pages, and backend API routes.

With an LLM (NVIDIA, OpenAI, etc.), generated code is more customized to the specific hackathon requirements.

### What does `hag run` generate?

A complete Next.js 14 project with package.json, TypeScript config, App Router pages/layouts, API routes, tests, deployment config, `.gitignore`, `.env.example`, and a polished landing page.

### Can I use my own LLM provider?

Yes. Any OpenAI-compatible API works via the `custom` provider. Also supports NVIDIA NIMs, OpenAI, Anthropic, Gemini, and OpenRouter.

### Is it deterministic?

Yes. Pass `--seed <N>` for deterministic execution. Same seed + same input = same output.

### Which platforms are supported?

Windows, macOS, and Linux. Requires Node.js 20+.

## Known Limitations

- **LLM generation quality varies** — ~40% of LLM-generated projects compile on first try. Template fallback always produces working code. The autonomous repair loop fixes common issues automatically.
- **Browser validation** — Starts the dev server and checks rendered HTML (title, headings, interactive elements, content length). It does not run full end-to-end tests.
- **Single framework** — Currently generates Next.js projects. Python/Rust/Go support is on the roadmap.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, code style, and pull request guidelines.

## License

MIT — see [LICENSE](LICENSE).

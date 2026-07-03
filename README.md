# Hack-A-Gent

Autonomous hackathon engineering CLI. Give it a Devpost URL, and it generates a complete project.

## Quick Start

```bash
# Install globally
npm install -g hack-agent

# Interactive setup (first time)
hag setup

# Run the pipeline with a Devpost URL
hag run https://devpost.com/software/my-project
```

The CLI detects an unconfigured state and launches the setup wizard automatically on first use.

## Installation

### Global install (recommended)

```bash
npm install -g hack-agent
hag setup
```

### From source

```bash
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent
npm install
npm run build
npm link
```

## Commands

| Command | Description |
|---------|-------------|
| `hag setup` (or `s`) | Interactive setup wizard — provider, API key, verify |
| `hag config` (or `c`) | View or change LLM/config settings |
| `hag run <input>` | Full pipeline: parse, strategize, generate, deploy |
| `hag doctor` | System diagnostics — Node, Git, config, provider, workspace |
| `hag models` | List available models from configured provider |
| `hag providers` | Show status of all 6 supported providers |
| `hag version` | Display version |
| `hag status [id]` | Project status, list saved projects |
| `hag memory <query\|stats\|clear>` | Organizational memory |
| `hag benchmark list\|run` | Benchmark suite |
| `hag replay <id>` | Deterministic replay |
| `hag deploy <id>` | Deploy a built project |
| `hag test <id>` | Run browser tests |
| `hag explain [id]` | Decision traces and debug analysis |
| `hag health` | System health check |
| `hag chat` | Interactive REPL mode |
| `hag simulate <input>` | Simulation only |

## Configuration

### Interactive wizard

```bash
hag setup
```

Walks through provider selection, API key entry, endpoint URL, and optional connection verification.

### CLI config

```bash
# NVIDIA NIMs (recommended for speed)
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

## Supported providers

| Provider | Flag value | Auto-detects models | Health check |
|----------|-----------|-------------------|--------------|
| NVIDIA NIMs | `nvidia` | Yes | Real API call |
| OpenAI | `openai` | Yes | Cached |
| Anthropic | `anthropic` | Yes | Cached |
| Gemini | `gemini` | Yes | Cached |
| OpenRouter | `openrouter` | Yes | Cached |
| Custom | `custom` | No | Real GET /models |

## Pipeline stages

When you run `hag run`, the pipeline shows structured progress:

1. **Parsing input** — Devpost URL, file, or text specification
2. **Initializing LLM providers** — connects to configured provider
3. **Running strategy competition** — multiple agents propose approaches
4. **Extracting requirements** — structured requirements from parsed input
5. **Building TaskGraph** — execution plan with task dependencies
6. **Executing pipeline** — code generation, builds, deployment
7. **Post-project learning** — memory update for future runs

A rich summary is shown on completion with elapsed time, task count, and next steps.

## Error handling

All errors include contextual what/why/fix messages:

```
✘ Connection failed
  Why: The provider endpoint is unreachable or not responding.
  Fix: Check your internet connection and verify the endpoint URL.
```

Pass `--debug` to any command for full stack traces.

## Global flags

| Flag | Effect |
|------|--------|
| `--seed <N>` | Deterministic seed |
| `--json` | JSON output |
| `--quiet` | Minimal output |
| `--verbose` | Verbose logging |
| `--dry-run` | Simulate without execution |
| `--debug` | Show stack traces |

## Architecture

The codebase is split into four layers:

- **CLI** (`cli/`) — command-line interface, config, output formatting, error handling
- **Benchmarks** (`benchmarks/`) — hackathon simulation and generation engines
- **Kernel** (`kernel/`) — LLM providers, routing, tool execution
- **Agents** (`agents/`) — architect, builder, and frontend agents

The system is deterministic — same seed + same input = same output every time.

## Requirements

- Node.js 20+
- LLM API key (NVIDIA, OpenAI, Anthropic, Gemini, OpenRouter, or any OpenAI-compatible endpoint)

## License

MIT

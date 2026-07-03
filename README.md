# Hack-A-Gent

Give it a Devpost link, and it builds the project. An autonomous hackathon agent that reads competition briefs and generates fully functional code.

## Quick Start

```bash
# Interactive setup (recommended for first-time users)
hackagent setup

# Or configure manually
hag config --provider nvidia --api-key YOUR_KEY

# Run the full pipeline with a Devpost URL
hag run https://devpost.com/software/my-project
```

Done. It'll parse the competition, pick a winning strategy, generate the code, and deploy it.

## Shorthands

All commands have short aliases:

| Full | Short |
|------|-------|
| `hackagent` | `hag` |
| `hackagent config` | `hag c` |
| `hackagent setup` | `hag s` |

## Configuration

### Interactive wizard (recommended)

```bash
hackagent setup
```

Walks you through provider selection, API key entry, endpoint URL, and optionally verifies the connection.

### CLI config

```bash
# NVIDIA NIMs (recommended for speed)
hag config --provider nvidia --api-key nvapi-xxx --endpoint https://integrate.api.nvidia.com/v1

# Provider aliases also work
hag config --provider nvidia-nims --api-key nvapi-xxx

# OpenAI
hag config --provider openai --api-key sk-xxx

# Custom endpoint (Ollama, LM Studio, anything OpenAI-compatible)
hag config --provider custom --api-key your-key --endpoint http://localhost:11434/v1

# Verify the connection works
hag config --verify

# Show current config
hag config --show
```

### .env file

Create a `.env` in your project root:

```env
HACKAGENT_PROVIDER=nvidia
HACKAGENT_API_KEY=nvapi-xxx
HACKAGENT_BASE_URL=https://integrate.api.nvidia.com/v1
```

For deployment features, you can also set:
- `--github-token` or `GITHUB_TOKEN` — GitHub repo creation
- `--vercel-token` or `VERCEL_TOKEN` — Vercel deployment
- `--netlify-token` or `NETLIFY_AUTH_TOKEN` — Netlify deployment

## Running locally

```bash
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent
npm install
npm run build

# Try it out
npx tsx cli/index.ts run "Build a URL shortener with analytics"
```

Or use `tsx` directly without building:

```bash
npm run hag -- config --provider nvidia --api-key nvapi-xxx
npm run hag -- run https://devpost.com/software/my-project
```

## What it does

- **Parses Devpost URLs** — pulls title, tech stack, judging criteria, and constraints automatically
- **Runs strategy competition** — multiple agents battle it out to pick the best approach
- **Generates real code** — not toy templates, actual working projects with React, Node.js, databases
- **Builds and deploys** — compiles the project and publishes it live

## How it works

The pipeline has three phases. First, it scrapes the Devpost page and extracts everything — the problem statement, what technologies they're looking for, how judges will score it. Second, it runs a strategy competition where multiple planning agents propose different approaches and vote on which one wins. Third, it generates the actual code using your configured LLM provider.

The strategy selection isn't random. It looks at past hackathon winners and picks a pattern that matches the competition type — portfolio projects get minimalist designs, developer tools get clean APIs, consumer apps get social features as the hook.

The whole system is deterministic. Same seed, same Devpost URL, same output every time. This makes it useful for benchmarking and testing.

## Architecture

The codebase is split into a few layers:

- **CLI** (`cli/`) — command-line interface and config management
- **Benchmarks** (`benchmarks/`) — the core hackathon simulation and generation engines
- **Kernel** (`kernel/`) — LLM providers, routing, and tool execution
- **Agents** (`agents/`) — architect, builder, and frontend agents that do the actual work

## Requirements

- Node.js 20+
- An LLM API key (NVIDIA, OpenAI, Anthropic, or any OpenAI-compatible endpoint)

## Credits

Built as an autonomous hackathon competition system. Uses Zod for validation, XState for state management, and native fetch for LLM calls.

## License

MIT

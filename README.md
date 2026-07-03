# Hack-A-Gent

Give it a Devpost link, and it builds the project. An autonomous hackathon agent that reads competition briefs and generates fully functional code.

## Quick Start

```bash
# Configure your LLM provider (supports NVIDIA NIMs, OpenAI, Anthropic, or custom endpoints)
hackagent config --provider nvidia --api-key YOUR_KEY --base-url https://integrate.api.nvidia.com/v1

# Run the full pipeline with a Devpost URL
hackagent run https://devpost.com/software/my-project

# Or pass a description directly
hackagent run "Build a habit tracker with social sharing"
```

Done. It'll parse the competition, pick a winning strategy, generate the code, and deploy it.

## What it does

- **Parses Devpost URLs** — pulls title, tech stack, judging criteria, and constraints automatically
- **Runs strategy competition** — multiple agents battle it out to pick the best approach
- **Generates real code** — not toy templates, actual working projects with React, Node.js, databases
- **Builds and deploys** — compiles the project and publishes it live

## Configuration

Hack-A-Gent supports multiple LLM providers. Set it up once:

```bash
# NVIDIA NIMs (recommended for speed)
hackagent config --provider nvidia --api-key nvapi-xxx --base-url https://integrate.api.nvidia.com/v1

# OpenAI
hackagent config --provider openai --api-key sk-xxx

# Custom endpoint (Ollama, LM Studio, anything OpenAI-compatible)
hackagent config --provider custom --api-key your-key --base-url http://localhost:11434/v1

# Show current config
hackagent config --show
```

For deployment features, you can also set:
- `--github-token` — GitHub repo creation
- `--vercel-token` — Vercel deployment
- `--netlify-token` — Netlify deployment

## Running locally

```bash
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent
npm install
npm run build

# Try it out
npx tsx cli/index.ts run "Build a URL shortener with analytics"
```

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
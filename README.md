# Hack-A-Gent

Heyy, so Hack-A-Gent(HAG) is an AI agent specialized in only one thing, that is hackathons. Most hackathons have time constrain, and for students like me don't have enought time after school to make innovations, that's where HAG comes into the picture. HAG uses AI to make a baseline code so innovators have more to innovate insead of manually writting code.

## Quick start

```bash
npm install -g hackagent
hag setup
hag run <hackathon URL?
```

Or without an LLM:

```bash
hag run "Project: Todo App\nProblem: A simple todo application\nJudging Criteria: Functionality, UX, Innovation\nTech Stack: React, Node.js"
```

## Installation

```bash
npm install -g hackagent
# or from source
git clone https://github.com/Theuser1211/Hack-A-Gent.git
cd Hack-A-Gent && npm install && npm run build && npm link
```

Requires Node.js 20+.

## Usage

Main commands: `run`, `setup`, `doctor`, `config`, `status`, `memory`, `benchmark`, `replay`, `explain`, `resume`, `deploy`, `test`, `analyze`. Use `--seed 42` for deterministic runs.

Configuration is done via `hag config --provider <name> --api-key <key>`. `.env` variables: `HACKAGENT_PROVIDER`, `HACKAGENT_API_KEY`, `HACKAGENT_BASE_URL`, `HACKAGENT_MODEL`.

Supported providers: Nebius Token Factory (`nebius`, serves NVIDIA Nemotron open-weight models), NVIDIA NIMs (`nvidia`), OpenAI (`openai`), Anthropic (`anthropic`), Gemini (`gemini`), OpenRouter (`openrouter`), custom endpoint (`custom`). Set `NEBIUS_API_KEY` in `.env` to auto-select Nebius.

## Pipeline

`hag run` executes sequentially: parse -> qualify -> init LLM -> strategy -> plan -> generate -> build -> browser check -> learn -> review -> evaluate. Template fallback is used when no LLM is configured or if API calls fail.

Example output (from an actual run; your results will vary):

```
Pipeline completed in 4m 9s (20 tasks)
```

## Architecture

- `cli/` — command interface and output formatting
- `benchmarks/` — generation engine, orchestrator, parser, templates
- `kernel/` — LLM router, prompts, qualification, repair, validation, evaluation, learning
- `tests/` — 1200+ tests across unit, integration, and determinism

## Development

```bash
npm run build
npx tsc --noEmit
npm test
npm run test:watch
npm run lint
```

## Limitations

- ~40% of LLM outputs compile on first try; repair fixes common errors but not all.
- Only Next.js is supported; other frameworks are not implemented.
- Browser validation checks HTML rendering, not full end-to-end flows.

## License

MIT — see LICENSE.


# Hack-A-Gent

Heyy, so Hack-A-Gent(HAG) is an AI agent specialized in only one thing, that is hackathons. Most hackathons have time constrain, and for students like me don't have enought time after school to make innovations, that's where HAG comes into the picture. HAG uses AI to make a baseline code so innovators have more to innovate insead of manually writting code.

## Quick start

```bash
npm install -g hackagent
hag setup
hag run <hackathon-url>
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

Configuration is done via `hag config --provider <name> --api-key <key>`. `.env` variables: `HACKAGENT_PROVIDER`, `HACKAGENT_API_KEY`, `HACKAGENT_BASE_URL`, `HACKAGENT_MODEL`. See `.env.example` for the full variable list and provider auto-detection precedence (native keys like `NEBIUS_API_KEY` / `GEMINI_API_KEY` are auto-detected).

Supported providers: Nebius Token Factory (`nebius`, serves NVIDIA Nemotron open-weight models), NVIDIA NIMs (`nvidia`), OpenAI (`openai`), Anthropic (`anthropic`), Gemini (`gemini`), OpenRouter (`openrouter`), custom endpoint (`custom`). Set `NEBIUS_API_KEY` in `.env` to auto-select Nebius.

## Pipeline

`hag run` executes sequentially: parse -> qualify -> init LLM -> strategy -> plan -> generate -> build -> browser check -> learn -> review -> evaluate. Template fallback is used when no LLM is configured or if API calls fail.

Example output (from an actual run; your results will vary):

```
Pipeline completed in 4m 9s (20 tasks)
```

## Nebius × NVIDIA Nemotron

Hack-A-Gent runs on [Nebius Token Factory](https://nebius.com) as an OpenAI-compatible inference endpoint and uses NVIDIA Nemotron open-weight models — a real runtime call to the Token Factory inference API with at least one NVIDIA open-source model.

- **Enable it:** set `NEBIUS_API_KEY` in `.env` (or `hag config --provider nebius --api-key <key>`). Nebius is auto-detected and auto-registered; no other setup is required.
- **Endpoint:** `POST https://api.tokenfactory.nebius.com/v1/chat/completions` with `Authorization: Bearer $NEBIUS_API_KEY` — OpenAI-compatible request/response shape, including `response_format: json_object` support.
- **Nemotron models served:** `nvidia/nemotron-3-super-120b-a12b` (262k context), `nvidia/nemotron-3-nano-30b-a3b` (262k), `nvidia/nemotron-3-ultra-550b-a55b` (1M). The curated catalog also lists `deepseek-ai/DeepSeek-R1-0528`.
- **Default coding model:** `nvidia/nemotron-3-super-120b-a12b` — the validated entry of `STATIC_CODING_CHAIN` in `kernel/llm/router-engine.ts`, confirmed by real chat requests against a live account (retired or unprovisioned candidates were removed after 410/404 probes).
- **Routing:** for coding/repair tasks the router orders the `nvidia` and `nebius` providers first and restricts them to the vetted Nemotron chain; prompts are gated against per-model capability ceilings (`MODEL_CAPABILITY_PROFILES`) so oversized prompts are skipped instead of timing out.
- **Managed coding:** when `nebius` (or `nvidia`) is the configured provider, code-generation tasks execute only on that provider — failures surface to the caller instead of silently falling through to another provider. A 429 rate limit is recoverable (one Retry-After-bounded retry, never a permanent blacklist); a 5xx gets one bounded retry, then the error is returned.
- **Smoke test:** `npx tsx scripts/verify-provider-env.ts` — auto-detects the provider from `.env`, checks router selection, and issues one real inference request (exits non-zero on the first failed check).

Other providers remain supported and unchanged: Anthropic, OpenAI, Gemini, OpenRouter, NVIDIA NIMs (`nvidia`), and custom OpenAI-compatible endpoints (`custom`, `custom:<name>`).

## Architecture

- `cli/` — command interface and output formatting
- `benchmarks/` — generation engine, orchestrator, parser, templates
- `kernel/` — LLM router, prompts, qualification, repair, validation, evaluation, learning
- `tests/` — 169 unit tests across 20 files, run with `npm test`

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


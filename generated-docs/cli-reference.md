# CLI Reference

Command | Summary | Usage
--- | --- | ---
`run` | Run the full hackathon pipeline from a Devpost URL, file, or free text. | `hag run <input> [--demo|--simulate-only] | hag run --resume <project-id>`
`simulate` | Run simulation only (no execution/deploy). | `hag simulate <input> [--demo]`
`resume` | Resume a paused execution (snapshot viewer). | `hag resume <projectId>`
`status` | Show project status or list projects. | `hag status [projectId]`
`memory` | Search or manage organizational memory. | `hag memory <query|stats|clear>`
`benchmark` | Run benchmark suites (synthetic, real code analysis, or measurement). | `hag benchmark <list|run|real|measure|history|leaderboard|compare|suggest>`
`replay` | Deterministic replay of a past run from its trace. | `hag replay <runId>`
`deploy` | Deploy a built project (GitHub/Vercel/Netlify). | `hag deploy <projectId>`
`test` | Run browser tests against a project. | `hag test <projectId> [--url <url>]`
`explain` | Show decision traces and debug analysis for a project. | `hag explain [projectId]`
`health` | Aggregate provider health checks. | `hag health`
`chat` | Interactive conversational mode. | `hag chat`
`config` | Configure LLM providers and deploy tokens. | `hag config [--provider|--api-key|--base-url|--model|--show|--clear|--verify]`
`setup` | Interactive first-time setup wizard. | `hag setup`
`doctor` | System diagnostics: Node, git, config, provider, workspace. | `hag doctor`
`models` | List available models from the configured provider. | `hag models`
`providers` | Show configured provider status. | `hag providers`
`version` | Show the installed version. | `hag version`
`help` | Show the help message. | `hag help`
`analyze` | Devpost intelligence: 20-dimension strategic analysis of a hackathon. Independent of `hag run`. | `hag analyze <devpost-url> [--json] [--out <file>] [--html <file>]`
`inspect` | Alias of `analyze` (Devpost intelligence). | `hag inspect <devpost-url>`
`categories` | Real benchmark framework across 16 project categories and 15 evaluation dimensions. | `hag categories <list|run|run-all|compare|history>`
`docs` | Generate documentation from the current CLI surface. | `hag docs generate [--out <dir>]`
`knowledge` | Project-quality knowledge base: update, search, stats, explain, export. | `hag knowledge <update|search|stats|explain|export>`
`hack-agent` | Autonomous multi-agent orchestration mode. | `hag hack-agent <input> [--seed <N>]`
`opportunities` | Scoring opportunities + MVP focus from a hackathon analysis. | `hag opportunities <url|file|text> [--json]`
`sponsors` | Sponsor & API breakdown for a hackathon. | `hag sponsors <url|file|text> [--json]`
`timeline` | Timeline, milestones, and completion probability for a hackathon. | `hag timeline <url|file|text> [--json]`
`strategy` | Winning strategy + differentiators for a hackathon. | `hag strategy <url|file|text> [--json]`
`compare` | Diff two hackathons (competitiveness delta). | `hag compare <a> <b> [--json]`

## Detailed

### `hag run`

Run the full hackathon pipeline from a Devpost URL, file, or free text.

**Usage:** `hag run <input> [--demo|--simulate-only] | hag run --resume <project-id>`

**Flags:**
- `--demo`
- `--simulate-only`
- `--resume <project-id>`
- `--seed <N>`
- `--force`

**Examples:**
```bash
hag run https://devpost.com/software/example
```
```bash
hag run spec.txt
```
```bash
hag run "Build a chatbot"
```
```bash
hag run --resume my-project
```

### `hag simulate`

Run simulation only (no execution/deploy).

**Usage:** `hag simulate <input> [--demo]`

**Flags:**
- `--demo`

**Examples:**
```bash
hag simulate https://devpost.com/software/example
```

### `hag resume`

Resume a paused execution (snapshot viewer).

**Usage:** `hag resume <projectId>`

**Examples:**
```bash
hag resume my-project
```

### `hag status`

Show project status or list projects.

**Usage:** `hag status [projectId]`

**Examples:**
```bash
hag status
```

### `hag memory`

Search or manage organizational memory.

**Usage:** `hag memory <query|stats|clear>`

**Examples:**
```bash
hag memory query "React dashboard"
```
```bash
hag memory stats
```
```bash
hag memory clear
```

### `hag benchmark`

Run benchmark suites (synthetic, real code analysis, or measurement).

**Usage:** `hag benchmark <list|run|real|measure|history|leaderboard|compare|suggest>`

**Flags:**
- `--adversarial`
- `--seed <N>`
- `--mutation-level <0-1>`
- `--skip-slow`

**Examples:**
```bash
hag benchmark list
```
```bash
hag benchmark real list
```
```bash
hag benchmark real run real-chatbot-frontend
```
```bash
hag benchmark measure . --skip-slow
```

### `hag replay`

Deterministic replay of a past run from its trace.

**Usage:** `hag replay <runId>`

**Examples:**
```bash
hag replay run-2026-01-15
```

### `hag deploy`

Deploy a built project (GitHub/Vercel/Netlify).

**Usage:** `hag deploy <projectId>`

**Flags:**
- `--github-token`
- `--vercel-token`
- `--netlify-token`

### `hag test`

Run browser tests against a project.

**Usage:** `hag test <projectId> [--url <url>]`

**Examples:**
```bash
hag test my-project
```

### `hag explain`

Show decision traces and debug analysis for a project.

**Usage:** `hag explain [projectId]`

**Examples:**
```bash
hag explain my-project
```

### `hag health`

Aggregate provider health checks.

**Usage:** `hag health`

### `hag chat`

Interactive conversational mode.

**Usage:** `hag chat`

### `hag config`

Configure LLM providers and deploy tokens.

**Usage:** `hag config [--provider|--api-key|--base-url|--model|--show|--clear|--verify]`

**Examples:**
```bash
hag config --provider nvidia --api-key nvapi-xxx
```
```bash
hag config --show
```

### `hag setup`

Interactive first-time setup wizard.

**Usage:** `hag setup`

### `hag doctor`

System diagnostics: Node, git, config, provider, workspace.

**Usage:** `hag doctor`

### `hag models`

List available models from the configured provider.

**Usage:** `hag models`

### `hag providers`

Show configured provider status.

**Usage:** `hag providers`

### `hag version`

Show the installed version.

**Usage:** `hag version`

### `hag help`

Show the help message.

**Usage:** `hag help`

### `hag analyze`

Devpost intelligence: 20-dimension strategic analysis of a hackathon. Independent of `hag run`.

**Usage:** `hag analyze <devpost-url> [--json] [--out <file>] [--html <file>]`

**Flags:**
- `--json`
- `--out <file>`
- `--html <file>`
- `--seed <N>`

**Examples:**
```bash
hag analyze https://devpost.com/software/example
```
```bash
hag analyze https://devpost.com/software/example --json --out report.json
```

### `hag inspect`

Alias of `analyze` (Devpost intelligence).

**Usage:** `hag inspect <devpost-url>`

### `hag categories`

Real benchmark framework across 16 project categories and 15 evaluation dimensions.

**Usage:** `hag categories <list|run|run-all|compare|history>`

**Flags:**
- `--generate`
- `--model <name>`
- `--seed <N>`
- `--no-shell`

**Examples:**
```bash
hag categories list
```
```bash
hag categories run landing-page --generate
```
```bash
hag categories run-all
```
```bash
hag categories compare <runA> <runB>
```

### `hag docs`

Generate documentation from the current CLI surface.

**Usage:** `hag docs generate [--out <dir>]`

**Examples:**
```bash
hag docs generate
```

### `hag knowledge`

Project-quality knowledge base: update, search, stats, explain, export.

**Usage:** `hag knowledge <update|search|stats|explain|export>`

**Flags:**
- `--url <url>`
- `--category <c>`
- `--source <s>`
- `--limit <n>`
- `--format <json|md>`
- `--out <file>`

**Examples:**
```bash
hag knowledge update --url https://devpost.com/software/example
```
```bash
hag knowledge search "auth flow"
```

### `hag hack-agent`

Autonomous multi-agent orchestration mode.

**Usage:** `hag hack-agent <input> [--seed <N>]`

**Examples:**
```bash
hag hack-agent "Build a todo app"
```

### `hag opportunities`

Scoring opportunities + MVP focus from a hackathon analysis.

**Usage:** `hag opportunities <url|file|text> [--json]`

**Examples:**
```bash
hag opportunities https://devpost.com/software/example
```

### `hag sponsors`

Sponsor & API breakdown for a hackathon.

**Usage:** `hag sponsors <url|file|text> [--json]`

**Examples:**
```bash
hag sponsors https://devpost.com/software/example
```

### `hag timeline`

Timeline, milestones, and completion probability for a hackathon.

**Usage:** `hag timeline <url|file|text> [--json]`

**Examples:**
```bash
hag timeline https://devpost.com/software/example
```

### `hag strategy`

Winning strategy + differentiators for a hackathon.

**Usage:** `hag strategy <url|file|text> [--json]`

**Examples:**
```bash
hag strategy https://devpost.com/software/example
```

### `hag compare`

Diff two hackathons (competitiveness delta).

**Usage:** `hag compare <a> <b> [--json]`

**Examples:**
```bash
hag compare https://devpost.com/software/a https://devpost.com/software/b
```

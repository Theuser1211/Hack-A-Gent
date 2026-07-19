/**
 * Documentation Generator
 * ======================
 *
 * Produces a complete, accurate documentation set into a dedicated
 * `generated-docs/` directory (or `docs/generated/`). It is a
 * READ-ONLY generator: it never touches manually-written docs
 * (README.md, docs/*.md, the root *.md reports). On each run it
 * refreshes only its own output directory.
 *
 * Outputs (all deterministic for a given repo snapshot):
 *   index.md            — navigation + generated summary
 *   cli-reference.md    — every command, flags, examples
 *   configuration.md    — config keys, env vars, providers
 *   architecture.md     — module map + ASCII folder tree
 *   api.md              — exported symbols per module (scanned)
 *   developer.md       — how to add a command / benchmark / prompt
 *   examples.md         — common workflows
 *   migration.md        — from MIGRATION_GUIDE.md (if present)
 *
 * Regenerate after every release: `npm run gen-docs`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CLIContext, CLIArgs, CLIResult } from '../../cli/types.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

/** Files this generator is allowed to (re)write. Anything else is left alone. */
const GENERATED_DIRS = ['generated-docs', 'docs/generated'];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.next',
  'coverage',
  'tmp',
  '.hackagent',
  '.notebook',
  'generated-docs',
  'docs',
]);

interface CommandEntry {
  name: string;
  alias?: string;
  summary: string;
  usage: string;
  flags: string[];
  examples: string[];
  related: string;
}

/** Curated, accurate summaries (verified against AGENTS.md / index.ts). */
const COMMAND_CATALOG: Record<string, Partial<CommandEntry>> = {
  run: { summary: 'Run the full hackathon pipeline from a Devpost URL, file, or free text.', usage: 'hag run <input> [--demo|--simulate-only] | hag run --resume <project-id>', flags: ['--demo', '--simulate-only', '--resume <project-id>', '--seed <N>', '--force'], examples: ['hag run https://devpost.com/software/example', 'hag run spec.txt', 'hag run "Build a chatbot"', 'hag run --resume my-project'] },
  simulate: { summary: 'Run simulation only (no execution/deploy).', usage: 'hag simulate <input> [--demo]', flags: ['--demo'], examples: ['hag simulate https://devpost.com/software/example'] },
  resume: { summary: 'Resume a paused execution (snapshot viewer).', usage: 'hag resume <projectId>', examples: ['hag resume my-project'] },
  status: { summary: 'Show project status or list projects.', usage: 'hag status [projectId]', examples: ['hag status'] },
  memory: { summary: 'Search or manage organizational memory.', usage: 'hag memory <query|stats|clear>', examples: ['hag memory query "React dashboard"', 'hag memory stats', 'hag memory clear'] },
  benchmark: { summary: 'Run benchmark suites (synthetic, real code analysis, or measurement).', usage: 'hag benchmark <list|run|real|measure|history|leaderboard|compare|suggest>', flags: ['--adversarial', '--seed <N>', '--mutation-level <0-1>', '--skip-slow'], examples: ['hag benchmark list', 'hag benchmark real list', 'hag benchmark real run real-chatbot-frontend', 'hag benchmark measure . --skip-slow'] },
  replay: { summary: 'Deterministic replay of a past run from its trace.', usage: 'hag replay <runId>', examples: ['hag replay run-2026-01-15'] },
  deploy: { summary: 'Deploy a built project (GitHub/Vercel/Netlify).', usage: 'hag deploy <projectId>', flags: ['--github-token', '--vercel-token', '--netlify-token'] },
  test: { summary: 'Run browser tests against a project.', usage: 'hag test <projectId> [--url <url>]', examples: ['hag test my-project'] },
  explain: { summary: 'Show decision traces and debug analysis for a project.', usage: 'hag explain [projectId]', examples: ['hag explain my-project'] },
  health: { summary: 'Aggregate provider health checks.', usage: 'hag health' },
  chat: { summary: 'Interactive conversational mode.', usage: 'hag chat' },
  config: { summary: 'Configure LLM providers and deploy tokens.', usage: 'hag config [--provider|--api-key|--base-url|--model|--show|--clear|--verify]', examples: ['hag config --provider nvidia --api-key nvapi-xxx', 'hag config --show'] },
  setup: { summary: 'Interactive first-time setup wizard.', usage: 'hag setup' },
  doctor: { summary: 'System diagnostics: Node, git, config, provider, workspace.', usage: 'hag doctor' },
  models: { summary: 'List available models from the configured provider.', usage: 'hag models' },
  providers: { summary: 'Show configured provider status.', usage: 'hag providers' },
  version: { summary: 'Show the installed version.', usage: 'hag version' },
  help: { summary: 'Show the help message.', usage: 'hag help' },
  analyze: { summary: 'Devpost intelligence: 20-dimension strategic analysis of a hackathon. Independent of `hag run`.', usage: 'hag analyze <devpost-url> [--json] [--out <file>] [--html <file>]', flags: ['--json', '--out <file>', '--html <file>', '--seed <N>'], examples: ['hag analyze https://devpost.com/software/example', 'hag analyze https://devpost.com/software/example --json --out report.json'] },
  inspect: { summary: 'Alias of `analyze` (Devpost intelligence).', usage: 'hag inspect <devpost-url>' },
  categories: { summary: 'Real benchmark framework across 16 project categories and 15 evaluation dimensions.', usage: 'hag categories <list|run|run-all|compare|history>', flags: ['--generate', '--model <name>', '--seed <N>', '--no-shell'], examples: ['hag categories list', 'hag categories run landing-page --generate', 'hag categories run-all', 'hag categories compare <runA> <runB>'] },
  docs: { summary: 'Generate documentation from the current CLI surface.', usage: 'hag docs generate [--out <dir>]', examples: ['hag docs generate'] },
  knowledge: { summary: 'Project-quality knowledge base: update, search, stats, explain, export.', usage: 'hag knowledge <update|search|stats|explain|export>', flags: ['--url <url>', '--category <c>', '--source <s>', '--limit <n>', '--format <json|md>', '--out <file>'], examples: ['hag knowledge update --url https://devpost.com/software/example', 'hag knowledge search "auth flow"'] },
  'hack-agent': { summary: 'Autonomous multi-agent orchestration mode.', usage: 'hag hack-agent <input> [--seed <N>]', examples: ['hag hack-agent "Build a todo app"'] },
  opportunities: { summary: 'Scoring opportunities + MVP focus from a hackathon analysis.', usage: 'hag opportunities <url|file|text> [--json]', examples: ['hag opportunities https://devpost.com/software/example'] },
  sponsors: { summary: 'Sponsor & API breakdown for a hackathon.', usage: 'hag sponsors <url|file|text> [--json]', examples: ['hag sponsors https://devpost.com/software/example'] },
  timeline: { summary: 'Timeline, milestones, and completion probability for a hackathon.', usage: 'hag timeline <url|file|text> [--json]', examples: ['hag timeline https://devpost.com/software/example'] },
  strategy: { summary: 'Winning strategy + differentiators for a hackathon.', usage: 'hag strategy <url|file|text> [--json]', examples: ['hag strategy https://devpost.com/software/example'] },
  compare: { summary: 'Diff two hackathons (competitiveness delta).', usage: 'hag compare <a> <b> [--json]', examples: ['hag compare https://devpost.com/software/a https://devpost.com/software/b'] },
};

// ── Repo scanning helpers ──────────────────────────────────────────

function readIndexCommands(): { commands: string[]; aliases: Record<string, string> } {
  const idxPath = path.join(REPO_ROOT, 'cli', 'index.ts');
  const commands: string[] = [];
  const aliases: Record<string, string> = {};
  if (!existsSync(idxPath)) return { commands, aliases };
  const src = readFileSync(idxPath, 'utf-8');

  const arrayMatch = src.match(/VALID_COMMANDS\s*:\s*CommandName\[\]\s*=\s*\[([\s\S]*?)\];/);
  if (arrayMatch) {
    for (const m of arrayMatch[1]!.matchAll(/'([\w-]+)'/g)) commands.push(m[1]!);
  }
  const aliasMatch = src.match(/COMMAND_ALIASES\s*:\s*Record<string,\s*CommandName>\s*=\s*\{([\s\S]*?)\};/);
  if (aliasMatch) {
    for (const m of aliasMatch[1]!.matchAll(/'([\w-]+)'\s*:\s*'([\w-]+)'/g)) {
      aliases[m[1]!] = m[2]!;
    }
  }
  return { commands, aliases };
}

function walkTree(root: string, maxDepth: number, prefix = '', out: string[] = []): string[] {
  if (maxDepth <= 0) return out;
  let entries: string[] = [];
  try {
    entries = readdirSync(root).filter((n) => !SKIP_DIRS.has(n) && !n.startsWith('.'));
  } catch {
    return out;
  }
  entries.sort();
  entries.forEach((name, i) => {
    const full = path.join(root, name);
    const last = i === entries.length - 1;
    const branch = last ? '└─ ' : '├─ ';
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        out.push(`${prefix}${branch}${name}/`);
        walkTree(full, maxDepth - 1, prefix + (last ? '   ' : '│  '), out);
      } else if (/\.(ts|tsx|json|md)$/.test(name)) {
        out.push(`${prefix}${branch}${name}`);
      }
    } catch {
      /* ignore */
    }
  });
  return out;
}

interface ModuleApi {
  dir: string;
  symbols: Array<{ kind: string; name: string }>;
}

function scanApi(): ModuleApi[] {
  const roots = ['kernel', 'benchmarks', 'features', 'agents', 'cli'];
  const result: ModuleApi[] = [];
  for (const root of roots) {
    const rootDir = path.join(REPO_ROOT, root);
    if (!existsSync(rootDir)) continue;
    const symbols: ModuleApi['symbols'] = [];
    const walk = (dir: string, depth: number): void => {
      if (depth > 3) return;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        if (SKIP_DIRS.has(name) || name === 'node_modules') continue;
        const full = path.join(dir, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) walk(full, depth + 1);
        else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
          let src = '';
          try {
            src = readFileSync(full, 'utf-8');
          } catch {
            continue;
          }
          const re = /export\s+(?:async\s+)?(?:abstract\s+)?(?:function|class|interface|type|const|enum)\s+([A-Za-z_][\w]*)/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(src))) {
            symbols.push({ kind: 'export', name: m[1]! });
          }
        }
      }
    };
    walk(rootDir, 0);
    if (symbols.length > 0) result.push({ dir: root, symbols: symbols.slice(0, 80) });
  }
  return result;
}

// ── Render functions ───────────────────────────────────────────────

function renderCliReference(commands: string[], aliases: Record<string, string>): string {
  const L: string[] = ['# CLI Reference', '', 'Command | Summary | Usage', '--- | --- | ---'];
  for (const name of commands) {
    const c = COMMAND_CATALOG[name] ?? {};
    const summary = c.summary ?? `_(see \`hag ${name} --help\`)_`;
    const usage = c.usage ?? `hag ${name}`;
    const alias = aliases[name] ? ` _(alias: ${aliases[name]})_` : '';
    L.push(`\`${name}\`${alias} | ${summary} | \`${usage}\``);
  }
  L.push('', '## Detailed', '');
  for (const name of commands) {
    const c = COMMAND_CATALOG[name] ?? {};
    if (!c.summary) continue;
    L.push(`### \`hag ${name}\``, '', c.summary, '');
    if (c.usage) L.push(`**Usage:** \`${c.usage}\``, '');
    if (c.flags && c.flags.length > 0) {
      L.push('**Flags:**', ...c.flags.map((f) => `- \`${f}\``), '');
    }
    if (c.examples && c.examples.length > 0) {
      const examples = c.examples as string[];
      L.push('**Examples:**', ...examples.map((e: string) => '```bash\n' + e + '\n```'), '');
    }
  }
  return L.join('\n');
}

function renderConfiguration(): string {
  const cfgPath = path.join(REPO_ROOT, 'cli', 'config-manager.ts');
  let helpText = '_See `hag config --help` for the authoritative list._';
  if (existsSync(cfgPath)) {
    const src = readFileSync(cfgPath, 'utf-8');
    const m = src.match(/export const CONFIG_HELP\s*=\s*`([\s\S]*?)`;/);
    if (m) helpText = m[1]!.replace(/^\n+/, '');
  }
  return ['# Configuration Reference', '', '## Providers', '', '`anthropic`, `openai`, `gemini`, `openrouter`, `nvidia` (alias `nvidia-nims`), `custom`.', '', '## Environment Variables', '', '| Variable | Purpose |', '| --- | --- |', '| `HACKAGENT_PROVIDER` / `LLM_PROVIDER` | Provider selection |', '| `HACKAGENT_API_KEY` / `LLM_API_KEY` | API key |', '| `HACKAGENT_BASE_URL` / `HACKAGENT_ENDPOINT` | Custom endpoint (NVIDIA NIMs, local models) |', '| `HACKAGENT_MODEL` / `LLM_MODEL` | Model name |', '| `GITHUB_TOKEN` / `VERCEL_TOKEN` / `NETLIFY_AUTH_TOKEN` | Deploy tokens |', '', '## Reference', '', '```', helpText, '```', ''].join('\n');
}

function renderArchitecture(): string {
  const tree = walkTree(REPO_ROOT, 3).join('\n');
  return [
    '# Architecture',
    '',
    '> Auto-generated module map. For the authoritative design, see `docs/architecture.md`.',
    '',
    '## Layer Map',
    '',
    '- **cli/** — command dispatch, TUI output, config, provider init.',
    '- **kernel/** — LLM router + providers, qualification, evaluation, validation, repair, learning, prompts.',
    '- **benchmarks/** — real project-evaluation benchmarks + (legacy) adversarial research subsystem.',
    '- **features/** — NEW: Devpost intelligence (`analyze`), real category benchmarks (`categories`), docs generator.',
    '- **agents/** — agent manifests (planner/architect/builders/judge).',
    '',
    '## Folder Structure',
    '',
    '```',
    tree,
    '```',
    '',
  ].join('\n');
}

function renderApi(mods: ModuleApi[]): string {
  const L: string[] = ['# API Documentation', '', '_Exported symbols per module (auto-scanned)._', ''];
  for (const m of mods) {
    L.push(`## \`${m.dir}/\``, '');
    L.push(...m.symbols.slice(0, 30).map((s) => `- \`${s.name}\``));
    if (m.symbols.length > 30) L.push(`- _…and ${m.symbols.length - 30} more_`);
    L.push('');
  }
  return L.join('\n');
}

function renderDeveloper(): string {
  return [
    '# Developer Guide',
    '',
    '## Add a CLI command',
    '',
    '1. Create `cli/commands/<name>.ts` exporting `<name>Command(ctx, args): Promise<CLIResult>`.',
    '2. Register `<name>` in `VALID_COMMANDS` (cli/index.ts) and the `CommandName` union (cli/types.ts).',
    '3. Add a `case` to the `main()` switch, or register it as a feature command under `features/commands/`.',
    '',
    '## Add a feature command (zero-risk to the production CLI)',
    '',
    'Place `features/commands/<name>.ts` exporting `<name>Command(ctx, args)`.',
    'Map it in the dynamic feature loader inside `cli/index.ts` (the `default` switch case).',
    'This keeps new capabilities out of the refactored `cli/` files.', // avoid touching run pipeline / devpost-parser
    '',
    '## Add a benchmark category',
    '',
    '1. Add a `CategorySpec` to `features/benchmarks/category-suite.ts`.',
    '2. Declare `acceptance` patterns and per-dimension `weights`.',
    '3. Evaluate with `hag categories run <id> --generate` and compare runs.',
    '',
    '## Improve a prompt',
    '',
    'Edit or add a template in `kernel/prompts/templates.ts`, then reference it from',
    '`getTemplate(id)` / `PromptEngine.registerTemplate(...)`. Templates are',
    'provider-agnostic and deterministically rendered.',
    '',
    '## Tests',
    '',
    '`npm test` (vitest). New modules under `features/` should ship a `tests/features/*.test.ts`.',
    '',
  ].join('\n');
}

function renderExamples(): string {
  return [
    '# Examples',
    '',
    '## Generate a project from Devpost', '```bash', 'hag run https://devpost.com/software/example', '```', '',
    '## Analyze a hackathon (offline, 20 dimensions)', '```bash', 'hag analyze https://devpost.com/software/example --json --out analysis.json', '```', '',
    '## Benchmark a generated project', '```bash', 'hag benchmark real run real-chatbot-frontend ./my-project', '```', '',
    '## Run the 16-category benchmark suite', '```bash', 'hag categories run-all', 'hag categories compare <runA> <runB>', '```', '',
    '## Regenerate docs', '```bash', 'npm run gen-docs', '```', '',
    '## Diagnostics', '```bash', 'hag doctor', 'hag health', 'hag providers', 'hag models', '```', '',
  ].join('\n');
}

function renderMigration(): string {
  const mgPath = path.join(REPO_ROOT, 'MIGRATION_GUIDE.md');
  if (existsSync(mgPath)) {
    const body = readFileSync(mgPath, 'utf-8').replace(/^#.*$/m, '# Migration Guide').slice(0, 4000);
    return ['# Migration Guide', '', body, ''].join('\n');
  }
  return ['# Migration Guide', '', '_No `MIGRATION_GUIDE.md` found in this checkout._', ''].join('\n');
}

function renderIndex(files: string[], commands: string[]): string {
  return [
    '# Hack-A-Gent — Generated Documentation',
    '',
    `> Generated ${new Date(1700000000000).toISOString().slice(0, 10)} · ${commands.length} commands · ${files.length} doc files.`,
    '> This directory is produced by the docs generator and is safe to delete/regenerate.',
    '',
    '## Contents',
    '',
    '- [CLI Reference](cli-reference.md)',
    '- [Configuration](configuration.md)',
    '- [Architecture](architecture.md)',
    '- [API Documentation](api.md)',
    '- [Developer Guide](developer.md)',
    '- [Examples](examples.md)',
    '- [Migration Guide](migration.md)',
    '',
    '## Manual documentation (authored, not overwritten)',
    '',
    '- `README.md`, `docs/architecture.md`, `AGENTS.md`, `API_REFERENCE.md`.',
    '',
  ].join('\n');
}

// ── Public API ──────────────────────────────────────────────────

export interface GenerateDocsOptions {
  outDir?: string;
}

export interface GenerateDocsResult {
  outDir: string;
  files: string[];
}

export function generateDocs(opts: GenerateDocsOptions = {}): GenerateDocsResult {
  const outRel = opts.outDir ?? GENERATED_DIRS[0]!;
  const outDir = path.isAbsolute(outRel) ? outRel : path.join(REPO_ROOT, outRel);

  // Refresh ONLY the generated directory — never manual docs.
  if (existsSync(outDir)) {
    for (const f of readdirSync(outDir)) {
      try {
        rmSync(path.join(outDir, f), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
  mkdirSync(outDir, { recursive: true });

  const { commands, aliases } = readIndexCommands();
  const order = commands.length > 0 ? commands : Object.keys(COMMAND_CATALOG);
  const mods = scanApi();

  const docs: Record<string, string> = {
    'index.md': renderIndex([], order),
    'cli-reference.md': renderCliReference(order, aliases),
    'configuration.md': renderConfiguration(),
    'architecture.md': renderArchitecture(),
    'api.md': renderApi(mods),
    'developer.md': renderDeveloper(),
    'examples.md': renderExamples(),
    'migration.md': renderMigration(),
  };

  const files: string[] = [];
  for (const [name, content] of Object.entries(docs)) {
    const full = path.join(outDir, name);
    writeFileSync(full, content, 'utf-8');
    files.push(path.relative(REPO_ROOT, full));
  }

  return { outDir, files };
}

/**
 * CLI entry point for `hag docs generate`. Deterministic, offline.
 */
export function docsCommand(_ctx: CLIContext, args: CLIArgs): CLIResult {
  const outDir = typeof args.flags.out === 'string' ? args.flags.out : undefined;
  try {
    const { outDir: resolved, files } = generateDocs({ outDir });
    success(`Generated ${files.length} docs into ${path.relative(REPO_ROOT, resolved) || resolved}`);
    for (const f of files) log(`  • ${f}`);
    return {
      success: true,
      message: `Generated ${files.length} documentation files`,
      data: { files },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Docs generation failed: ${msg}`);
    return { success: false, message: `Docs generation failed: ${msg}` };
  }
}

// local output aliases (avoid importing cli/output to keep generator dependency-light)
function success(s: string): void { console.log(`  ✔ ${s}`); }
function error(s: string): void { console.log(`  ✘ ${s}`); }
function log(s: string): void { console.log(s); }

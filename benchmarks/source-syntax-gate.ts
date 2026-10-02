/**
 * Source syntax gate.
 *
 * Validates that generated .ts/.tsx/.js/.jsx/.mjs/.cjs content parses before it
 * reaches disk. Uses `ts.createSourceFile(...).parseDiagnostics` — the parser's
 * own diagnostics — which needs no CompilerHost.
 *
 * Historically every gate site hand-rolled a `ts.createProgram` with a fake
 * host instead:
 *   - sites without `getDefaultLibFileName`/`writeFile` threw
 *     `host.getDefaultLibFileName is not a function` on EVERY file, so the
 *     orchestrator rejected all LLM output and wrote nothing;
 *   - sites that did provide `getDefaultLibFileName` but answered
 *     `fileExists: () => true` / `readFile: () => content` recursed forever on
 *     any file containing an import and threw
 *     `Maximum call stack size exceeded`.
 *
 * `parseDiagnostics` is the same class of check as `program.getSyntacticDiagnostics`
 * (syntax only, no type checking) without a program, so the gate's contract is
 * unchanged: valid source passes, malformed source is rejected with a real
 * message.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const SOURCE_PATH_PATTERN = /\.(tsx?|jsx?|mjs|cjs)$/i;

/** Directories never walked when sweeping a tree (matches the final gate). */
const SWEEP_SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'coverage', '.vercel', '.turbo']);

/** True for paths the gate must run on (TS/JS source only). */
export function isSourcePath(filePath: string): boolean {
  return SOURCE_PATH_PATTERN.test(filePath);
}

/** Script kind for a source path; .mjs/.cjs/.js/.jsx are parsed as JS. */
export function scriptKindFor(filePath: string): ts.ScriptKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (lower.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (lower.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function formatDiagnostic(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, '; ');
}

/**
 * Returns syntax errors for `content` as readable messages.
 * Returns `[]` when the content parses cleanly.
 */
export function getSourceSyntaxErrors(filePath: string, content: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const diagnostics =
    (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  return diagnostics.map(formatDiagnostic);
}

/**
 * Throws when `content` has syntax errors; silent when it parses.
 * Error message is prefixed with the file path for log correlation.
 */
export function assertSourceSyntax(filePath: string, content: string): void {
  const errors = getSourceSyntaxErrors(filePath, content);
  if (errors.length > 0) {
    throw new Error(`Syntax validation failed for ${filePath}: ${errors.join('; ')}`);
  }
}

/**
 * True when writing `content` to `filePath` cannot introduce a parse error.
 *
 * Non-source paths (`.css`, `.json`, `.md`, …) always pass. Every mutation site
 * — template writes, regex-driven repairs, contract patches, stub generation —
 * must consult this before `writeFileSync`, so a "repair" can never turn a tree
 * that parsed into one that does not.
 */
export function canWriteSource(filePath: string, content: string): boolean {
  return !isSourcePath(filePath) || getSourceSyntaxErrors(filePath, content).length === 0;
}

/**
 * Removes source files under `rootDir` that do not parse.
 *
 * A generated project directory is reused across runs, so files written by an
 * earlier run (potentially before the write gate existed) are still on disk.
 * Nothing in the per-run pipeline validates a file it did not write, so such a
 * file would otherwise survive untouched and only be discovered by the final
 * tree integrity gate — after the whole run has executed.
 *
 * Returns the removed files as sorted, POSIX-style paths relative to `rootDir`.
 * Non-throwing: a file that cannot be deleted is left alone so the final gate
 * still reports it.
 */
export function pruneUnparsableSourceFiles(rootDir: string): string[] {
  const removed: string[] = [];
  if (!existsSync(rootDir)) return removed;

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SWEEP_SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!isSourcePath(entry.name)) continue;
      let content: string;
      try {
        content = readFileSync(full, 'utf-8');
      } catch {
        continue;
      }
      if (getSourceSyntaxErrors(full, content).length === 0) continue;
      try {
        rmSync(full, { force: true });
        removed.push(path.relative(rootDir, full).replace(/\\/g, '/'));
      } catch {
        /* leave it: the final gate reports files this sweep could not remove */
      }
    }
  };

  walk(rootDir);
  return removed.sort();
}

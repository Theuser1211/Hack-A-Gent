/**
 * Autonomous Repair Loop
 *
 * Instead of just re-running failed tasks blindly, this module:
 * 1. Parses actual error output (TypeScript, ESLint, build)
 * 2. Groups errors by file and type
 * 3. Uses the LLM to generate targeted fixes
 * 4. Verifies the fix compiled before moving to next file
 * 5. Tracks repair attempts to avoid infinite loops
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { getSourceSyntaxErrors } from '../../benchmarks/source-syntax-gate.js';

export interface RepairAttempt {
  file: string;
  errorType: 'typescript' | 'eslint' | 'build' | 'import' | 'runtime';
  errorMessage: string;
  fixDescription: string;
  success: boolean;
  timestamp: number;
}

export interface RepairResult {
  success: boolean;
  attempts: RepairAttempt[];
  remainingErrors: string[];
  totalFixes: number;
  duration: number;
}

export interface RepairContext {
  projectDir: string;
  routerEngine?: LLMRepairEngine;
  maxAttempts?: number;
  timeout?: number;
}

/**
 * Minimal structural contract for the LLM engine used by repair. The orchestrator
 * passes its RouterEngine, which already satisfies this shape. Keep it structural
 * so the repair module stays decoupled from the full routing implementation.
 */
export interface LLMRepairEngine {
  execute(
    taskType: string,
    request: {
      model_id: string;
      provider: string;
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      temperature: number;
      max_tokens: number;
      response_format: 'text' | 'json_object';
    },
  ): Promise<{ response: { content: string } | null }>;
}

interface ParsedError {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  raw: string;
}

/**
 * Parse TypeScript compiler output into structured errors.
 */
function parseTscOutput(output: string): ParsedError[] {
  const errors: ParsedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: file.tsx(10,5): error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.
    const match = line.match(/^(.+?\.(?:tsx?|jsx?))\((\d+),(\d+)\):\s+error\s+(TS\d+|TS\d+\/ts\d+):\s+(.+)$/);
    if (match) {
      errors.push({
        file: match[1]!,
        line: parseInt(match[2]!, 10),
        column: parseInt(match[3]!, 10),
        code: match[4]!,
        message: match[5]!,
        raw: line,
      });
    }
  }

  return errors;
}

/**
 * Group errors by file.
 */
function groupErrorsByFile(errors: ParsedError[]): Map<string, ParsedError[]> {
  const grouped = new Map<string, ParsedError[]>();
  for (const err of errors) {
    const existing = grouped.get(err.file) ?? [];
    existing.push(err);
    grouped.set(err.file, existing);
  }
  return grouped;
}

/**
 * Read the content of a file with error context (surrounding lines).
 */
function readFileWithContext(filePath: string, line: number, contextLines: number = 10): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);
    const numbered = lines.slice(start, end).map((l, i) => {
      const num = start + i + 1;
      const marker = num === line ? '>>>' : '   ';
      return `${marker} ${num}: ${l}`;
    });
    return `File: ${filePath}\nLines ${start + 1}-${end} of ${lines.length}:\n${numbered.join('\n')}`;
  } catch {
    return `File: ${filePath} (could not read)`; // file deleted or permission denied
  }
}

/**
 * Generate a fix prompt for a specific error.
 */
function generateFixPrompt(
  error: ParsedError,
  fileContent: string,
  allErrorsInFile: ParsedError[],
  projectContext: string,
): { system: string; user: string } {
  const otherErrors = allErrorsInFile
    .filter(e => e !== error)
    .map(e => `  Line ${e.line}: ${e.code} - ${e.message}`)
    .join('\n');

  const system = `You are an expert TypeScript developer fixing build errors. You must return ONLY the complete fixed file content — no explanation, no markdown, no code fences. Just the raw TypeScript/JavaScript code.

RULES:
- Fix the specific error while preserving all other code
- If fixing a type error, add proper type annotations or casts
- If fixing a missing import, add the import statement
- If fixing a React component, ensure proper JSX/TSX syntax
- Do NOT change the overall structure or logic unless required by the error
- Return the COMPLETE file content, not a diff`;

  const user = `Project context: ${projectContext}

FILE WITH ERRORS:
${fileContent}

ERRORS IN THIS FILE:
${otherErrors}

CURRENT ERROR TO FIX:
Line ${error.line}, Column ${error.column}: ${error.code} - ${error.message}

Raw error: ${error.raw}

Fix this error and return the complete corrected file content.`;

  return { system, user };
}

/**
 * Apply a fix to a file.
 */
function applyFix(filePath: string, content: string): boolean {
  try {
    // SYNTAX GATE: validate repaired source before writing.
    // Uses the shared createSourceFile/parseDiagnostics gate; the previous
    // `require('typescript')` call is not defined in ESM and threw on every
    // attempt, so repairs were silently never written.
    if (getSourceSyntaxErrors(filePath, content).length > 0) {
      return false; // do not write invalid repair
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify the project builds after a fix.
 */
function verifyBuild(projectDir: string, timeout: number = 30000): { success: boolean; output: string } {
  try {
    const output = execSync('npx tsc --noEmit 2>&1', {
      cwd: projectDir,
      stdio: 'pipe',
      timeout,
      encoding: 'utf-8',
      windowsHide: true,
    });
    return { success: true, output };
  } catch (err: unknown) {
    const output = (err as { stdout?: string }).stdout ?? String(err);
    return { success: false, output };
  }
}

/**
 * Parse import errors from TypeScript output.
 */
function parseImportErrors(output: string): string[] {
  const missingFiles: string[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Cannot find module '@/components/Foo' or its corresponding type declarations.
    const match = line.match(/Cannot find module ['"](.+?)['"]/);
    if (match) {
      missingFiles.push(match[1]!);
    }
  }

  return missingFiles;
}

/**
 * Generate a stub file for a missing import.
 */
function generateStubFile(modulePath: string, projectDir: string): boolean {
  // Resolve the module path to a file
  const isComponent = modulePath.includes('components');
  const isLib = modulePath.includes('lib');
  const isHook = modulePath.includes('hooks');
  const isType = modulePath.includes('types');

  const resolvedPath = path.resolve(projectDir, modulePath.replace(/^@\//, 'src/'));

  // Determine file extension
  let ext = '.ts';
  if (isComponent || modulePath.endsWith('Page') || modulePath.endsWith('Layout')) {
    ext = '.tsx';
  }

  const fullPath = resolvedPath + ext;

  // Don't overwrite existing files
  if (fs.existsSync(fullPath)) return false;

  // Ensure directory exists
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = '';
  if (isComponent) {
    const name = path.basename(modulePath).replace(/\.\w+$/, '');
    content = `export default function ${name}() {
  return <div>${name}</div>;
}
`;
  } else if (isHook) {
    const name = path.basename(modulePath).replace(/\.\w+$/, '');
    content = `import { useState } from 'react';

export function ${name}() {
  const [value, setValue] = useState(null);
  return { value, setValue };
}
`;
  } else if (isType) {
    content = `export interface Placeholder {}
`;
  } else {
    content = `export const placeholder = true;
`;
  }

  return applyFix(fullPath, content);
}

/**
 * Fix TS2614: "Module 'X' has no exported member 'Y'".
 *
 * The common case is a consumer using a named import while the target module
 * only has a default export (the LLM's preferred shape). The deterministic fix
 * is to add a named re-export of the default export to the target module.
 *
 * @param projectDir - Root of the generated project
 * @param consumerFile - File that triggered the error (relative to projectDir)
 * @param errorMessage - Full TS2614 error message
 * @returns true when a fix was applied
 */
export function fixNoExportedMember(
  projectDir: string,
  consumerFile: string,
  errorMessage: string,
): boolean {
  const modMatch = errorMessage.match(/Module ['"](.+?)['"]/);
  const memberMatch = errorMessage.match(/no exported member ['"](.+?)['"]/);
  if (!modMatch || !memberMatch) return false;

  const specifier = modMatch[1]!.replace(/^["']+|["']+$/g, '');
  const member = memberMatch[1]!.replace(/^["']+|["']+$/g, '');

  let relPath = specifier;
  if (relPath.startsWith('@/')) relPath = relPath.replace(/^@\//, 'src/');

  const consumerDir = path.dirname(path.resolve(projectDir, consumerFile));
  const base = relPath.startsWith('src/')
    ? path.resolve(projectDir, relPath)
    : path.resolve(consumerDir, relPath);

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ];
  const modulePath = candidates.find(p => fs.existsSync(p));
  if (!modulePath) return false;

  let content: string;
  try {
    content = fs.readFileSync(modulePath, 'utf-8');
  } catch {
    return false;
  }

  // Only fix when the module default-exports the missing member.
  const defaultIsMember = new RegExp(
    `export\\s+default\\s+(?:(?:function|class)\\s+)?${escapeRegExp(member)}(?:\\s|\\{|;|\\(|$)`,
  );
  if (!defaultIsMember.test(content)) return false;

  // Skip if the named export already exists.
  if (new RegExp(`export\\s*\\{\\s*${escapeRegExp(member)}\\s*(?:,|})`).test(content)) return false;

  const addition = `\nexport { ${member} };\n`;
  if (content.includes(addition)) return false;

  return applyFix(modulePath, content + addition);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve a module specifier ('@/lib/types', './foo', or 'better-sqlite3') to an
 * absolute file path if it is a local module. Returns undefined for external
 * packages. Resolves to the actual existing file (appending .ts/.tsx/index) so
 * the map key matches the path the LLM returns.
 */
function resolveModuleSpecifier(projectDir: string, specifier: string, consumerFile: string): string | undefined {
  const cleaned = specifier.replace(/^["']+|["']+$/g, '');
  let base: string;
  if (cleaned.startsWith('@/')) {
    base = path.join(projectDir, 'src', cleaned.slice(2));
  } else if (cleaned.startsWith('.')) {
    const consumerAbs = path.resolve(projectDir, consumerFile);
    base = path.resolve(path.dirname(consumerAbs), cleaned);
  } else {
    return undefined; // external package like 'better-sqlite3'
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

/**
 * Use the LLM to synthesize a missing named export of a local module.
 *
 * This targets the TS2305 family ("Module 'X' has no exported member 'Y'"), where
 * the agent should add the missing export to the target module. The fix prompt
 * asks the LLM to return a JSON object mapping a file path to its new content, so
 * a single call can reconcile a fragmented module in one round.
 *
 * Exported for unit testing with a mock router engine.
 */
export async function llmFixMissingExports(
  context: RepairContext,
  errors: ParsedError[],
  router: LLMRepairEngine,
): Promise<boolean> {
  const toFixByModule = new Map<string, Set<string>>();
  for (const error of errors) {
    if (!(error.code === 'TS2305' || error.code.includes('2305'))) continue;
    const modRaw = error.message.match(/Module ['"](.+?)['"]\s+has no exported member/);
    const memberMatch = error.message.match(/no exported member ['"](.+?)['"]/);
    if (!modRaw || !memberMatch) continue;
    const modSpec = modRaw[1]!.replace(/^["']+|["']+$/g, '').trim();
    const modPath = resolveModuleSpecifier(context.projectDir, modSpec, error.file);
    if (!modPath) continue;
    if (!toFixByModule.has(modPath)) toFixByModule.set(modPath, new Set());
    toFixByModule.get(modPath)!.add(memberMatch[1]!.replace(/^["']+|["']+$/g, ''));
  }

  if (toFixByModule.size === 0) return false;

  const fileAccessor = (p: string): string => {
    try {
      return fs.readFileSync(p, 'utf-8');
    } catch {
      return '';
    }
  };

  const modulesBlock = [...toFixByModule.entries()]
    .map(([modPath, members]) => {
      const rel = path.relative(context.projectDir, modPath).replace(/\\/g, '/');
      return `  { "path": "src/${rel}", "missingMembers": [${[...members].map((x) => `"${x}"`).join(', ')}] }`;
    })
    .join('\n');

  const filesToEdit = [...toFixByModule.keys()];
  const filesBlock = filesToEdit
    .map((p) => {
      const rel = path.relative(context.projectDir, p).replace(/\\/g, '/');
      return `### File: src/${rel}\n${fileAccessor(p)}`;
    })
    .join('\n\n');

  const system = `You are an expert TypeScript developer fixing missing-export errors. You will receive TypeScript source files. Your job is to add the missing exported members (types, interfaces, or functions) to the relevant file so that the imports resolve.

Rules:
- Add ONLY the missing members referenced. Do not remove existing code.
- Infer sensible type signatures from how the members are named and used.
- Output STRICT JSON matching: {"nextFiles":[{"path":"<relative path with src/ prefix>","content":"<full rewritten file content>"}]}
- Escape newlines in JSON strings.`;

  const user = `Project directory root uses "src/" prefix for local modules.

The following modules are missing exported members (TypeScript error TS2305):
${modulesBlock}

The current content of each affected module:
${filesBlock}

Return JSON: add the missing exported members to each module's content and output the full rewritten file for each. Keep all existing code intact.`;

  try {
    const { response } = await router.execute('coding', {
      model_id: '',
      provider: 'nvidia',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.0,
      max_tokens: 4096,
      response_format: 'json_object',
    });
    if (!response || !response.content || !response.content.trim()) return false;

    const raw = response.content.trim();
    const jsonBlock = raw.match(/\{[\s\S]*\}/);
    if (!jsonBlock) return false;
    const parsed: { next?: Array<{ path: string; content: string }> } = JSON.parse(jsonBlock[0]!);
    const next = parsed.next ?? [];

    let applied = false;
    for (const item of next) {
      if (!item || typeof item.path !== 'string' || typeof item.content !== 'string') continue;
      const cleanedPath = item.path.replace(/^\.\//, '');
      const absPath = path.resolve(context.projectDir, cleanedPath);
      if (!toFixByModule.has(absPath)) continue;
      if (item.content.length < fileAccessor(absPath).length) continue;
      if (applyFix(absPath, item.content)) applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}

const SYNTAX_ERROR_CODES = new Set(['TS1005', 'TS1003', 'TS1002', 'TS1127', 'TS1128', 'TS1009', 'TS1109', 'TS1131']);

/**
 * Use the LLM to rewrite files that contain syntax-corruption errors (leaked
 * JSON escapes, embedded parse fragments, encoded control chars) which no
 * pattern-based fix can repair. The agent returns the fully corrected file
 * content for each broken file.
 *
 * Exported for unit testing with a mock router engine.
 */
export async function llmRewriteBrokenFiles(
  context: RepairContext,
  errors: ParsedError[],
  router: LLMRepairEngine,
): Promise<boolean> {
  const files = new Map<string, ParsedError[]>();
  for (const error of errors) {
    if (!SYNTAX_ERROR_CODES.has(error.code)) continue;
    const fullPath = path.resolve(context.projectDir, error.file);
    if (!fs.existsSync(fullPath)) continue;
    if (!files.has(fullPath)) files.set(fullPath, []);
    files.get(fullPath)!.push(error);
  }
  if (files.size === 0) return false;

  const readFile = (p: string): string => {
    try {
      return fs.readFileSync(p, 'utf-8');
    } catch {
      return '';
    }
  };

  const descBlock = [...files.entries()]
    .map(([p, errs]) => {
      const rel = path.relative(context.projectDir, p).replace(/\\/g, '/');
      const errDesc = errs.map((e) => `  Line ${e.line}: ${e.code} - ${e.message}`).join('\n');
      return `### File: src/${rel}\n${errDesc}\n\nCurrent content:\n${readFile(p)}`;
    })
    .join('\n\n');

  const system = `You are an expert TypeScript/TSX developer fixing files that have syntax or parse errors from corrupted generation (e.g. escaped quotes, stray tokens, truncated fragments).

Rules:
- Repair the file so it is valid, runnable TypeScript/TSX.
- Preserve the file's clear intent and as much original code as possible.
- Do not leave any JSON-escaping artifacts (like \\" inside source) or stray tokens.
- Output STRICT JSON matching: {"nextFiles":[{"path":"<relative path with src/ prefix>","content":"<full corrected file content>"}]}
- Escape newlines and quotes properly in the JSON strings.`;

  const user = `The following files have syntax errors. For each, output the full corrected file content.

${descBlock}

Return JSON: {"nextFiles":[{"path":"src/...","content":"...full corrected file..."}]}`;

  try {
    const { response } = await router.execute('coding', {
      model_id: '',
      provider: 'nvidia',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.0,
      max_tokens: 4096,
      response_format: 'json_object',
    });
    if (!response || !response.content || !response.content.trim()) return false;

    const raw = response.content.trim();
    const jsonBlock = raw.match(/\{[\s\S]*\}/);
    if (!jsonBlock) return false;
    const parsed: { next?: Array<{ path: string; content: string }> } = JSON.parse(jsonBlock[0]!);
    const next = parsed.next ?? [];

    let applied = false;
    for (const item of next) {
      if (!item || typeof item.path !== 'string' || typeof item.content !== 'string') continue;
      const cleanedPath = item.path.replace(/^\.\//, '');
      const absPath = path.resolve(context.projectDir, cleanedPath);
      if (!files.has(absPath)) continue;
      if (item.content.trim().length < 20) continue;
      if (applyFix(absPath, item.content)) applied = true;
    }
    return applied;
  } catch {
    return false;
  }
}

/**
 * Run the autonomous repair loop.
 *
 * @param context - Repair context with project directory and options
 * @returns Repair result with success status and all attempts
 */
export async function autonomousRepair(context: RepairContext): Promise<RepairResult> {
  const startTime = Date.now();
  const maxAttempts = context.maxAttempts ?? 5;
  const timeout = context.timeout ?? 30000;
  const attempts: RepairAttempt[] = [];
  let remainingErrors: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. Run typecheck
    const buildResult = verifyBuild(context.projectDir, timeout);

    if (buildResult.success) {
      return {
        success: true,
        attempts,
        remainingErrors: [],
        totalFixes: attempts.filter(a => a.success).length,
        duration: Date.now() - startTime,
      };
    }

    // 2. Parse errors
    const errors = parseTscOutput(buildResult.output);

    if (errors.length === 0) {
      // Non-TypeScript errors (e.g., npm install failures)
      remainingErrors = buildResult.output.split('\n').filter(l => l.trim());
      break;
    }

    // Reset provider blacklist to allow repair LLM to use fallback providers
    // if the generation provider is marked unhealthy (e.g., after 503).
    if (context.routerEngine && typeof (context.routerEngine as any).resetBlacklist === 'function') {
      (context.routerEngine as any).resetBlacklist();
    }

    // 2b. LLM-first pass for missing-export (TS2305) errors — the pattern-based
    // fixes below cannot synthesize missing members of existing modules. When the
    // router engine is available, let the agent add the missing exports in one
    // round before falling back to deterministic patterns.
    if (context.routerEngine) {
      const llmFixed = await llmFixMissingExports(context, errors, context.routerEngine);
      if (llmFixed) {
        attempts.push({
          file: 'multiple',
          errorType: 'typescript',
          errorMessage: 'TS2305: synthesized missing module exports',
          fixDescription: 'LLM added missing exported members',
          success: true,
          timestamp: Date.now(),
        });
        continue; // Re-run typecheck to verify the LLM fix
      }

      // 2c. LLM-first pass for syntax-corruption errors (TS1005, TS1109, TS1127, etc.)
      // Pattern-based fixes may not cover all syntax errors. Let the LLM attempt
      // a full rewrite before falling back to deterministic patterns.
      const llmFixedSyntax = await llmRewriteBrokenFiles(context, errors, context.routerEngine);
      if (llmFixedSyntax) {
        attempts.push({
          file: 'multiple',
          errorType: 'typescript',
          errorMessage: 'Syntax error: LLM rewrote broken files',
          fixDescription: 'LLM rewrote files with syntax errors',
          success: true,
          timestamp: Date.now(),
        });
        continue; // Re-run typecheck to verify the LLM fix
      }
    }

    // 3. Group by file
    const grouped = groupErrorsByFile(errors);

    // 4. Fix first file with errors
    let fixedSomething = false;
    for (const [file, fileErrors] of grouped) {
      if (fileErrors.length === 0) continue;

      const error = fileErrors[0]!;
      const fullPath = path.resolve(context.projectDir, file);

      // Read file content
      const fileContent = readFileWithContext(fullPath, error.line, 20);

      // Generate fix prompt
      const { system, user } = generateFixPrompt(
        error,
        fileContent,
        fileErrors,
        `Project: ${context.projectDir}`,
      );

      // Try to fix with LLM (placeholder — in real implementation, call router engine)
      // For now, try common fix patterns
      let fixed = false;

      // Pattern 1: Missing import — generate stub
      if (error.code === 'TS2307' || error.code.includes('2307')) {
        const missingModules = parseImportErrors(buildResult.output);
        for (const mod of missingModules) {
          if (generateStubFile(mod, context.projectDir)) {
            fixed = true;
          }
        }
      }

      // Pattern 2: Type mismatch — try adding type assertion
      if (error.code === 'TS2345' || error.code.includes('2345')) {
        // Read the file and try to fix common type errors
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          // Fix: "any" type annotations
          content = content.replace(/:\s*any\b/g, ': unknown');
          // Fix: missing return types on arrow functions
          content = content.replace(/(\w+)\s*=\s*\(/g, '$1 = (');
          if (content !== fs.readFileSync(fullPath, 'utf-8')) {
            applyFix(fullPath, content);
            fixed = true;
          }
        } catch { /* skip */ }
      }

      // Pattern 3: Missing property — try adding optional chaining
      if (error.code === 'TS2339' || error.code.includes('2339')) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          // Add ?. for common property access patterns
          const propMatch = error.message.match(/Property '(.+?)' does not exist on type/);
          if (propMatch) {
            const prop = propMatch[1];
            // Replace obj.prop with obj?.prop (simplified)
            content = content.replace(new RegExp(`(\\w+)\\.${prop}\\b`, 'g'), `$1?.${prop}`);
            if (content !== fs.readFileSync(fullPath, 'utf-8')) {
              applyFix(fullPath, content);
              fixed = true;
            }
          }
        } catch { /* skip */ }
      }

      // Pattern 4: Missing children prop
      if (error.code === 'TS2322' || error.code.includes('2322')) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          if (error.message.includes('children') && error.message.includes('missing')) {
            // Add children prop to component
            const componentMatch = content.match(/export default function (\w+)\(([^)]*)\)/);
            if (componentMatch && !componentMatch[2]!.includes('children')) {
              const newParams = componentMatch[2]
                ? `${componentMatch[2]}, children: React.ReactNode`
                : 'children: React.ReactNode';
              content = content.replace(
                componentMatch[0]!,
                `export default function ${componentMatch[1]}(${newParams})`,
              );
              applyFix(fullPath, content);
              fixed = true;
            }
          }
        } catch { /* skip */ }
      }

      // Pattern 6: Module has no exported member — add named re-export of default export
      if (error.code === 'TS2614' || error.code.includes('2614')) {
        if (fixNoExportedMember(context.projectDir, file, error.message)) {
          fixed = true;
        }
      }

      // Pattern 5: `class` instead of `className` in JSX
      if (error.message.includes('class') && (error.message.includes('DetailedHTMLProps') || error.message.includes('HTMLAttributes'))) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          const original = content;
          content = content.replace(/\bclass="/g, 'className="');
          content = content.replace(/\bclass='/g, "className='");
          content = content.replace(/\bclass=\{/g, 'className={');
          if (content !== original) {
            applyFix(fullPath, content);
            fixed = true;
          }
        } catch { /* skip */ }
      }

      if (fixed) {
        attempts.push({
          file,
          errorType: 'typescript',
          errorMessage: `${error.code}: ${error.message}`,
          fixDescription: 'Applied pattern-based fix',
          success: true,
          timestamp: Date.now(),
        });
        fixedSomething = true;
        break; // Re-run typecheck after each fix
      } else {
        attempts.push({
          file,
          errorType: 'typescript',
          errorMessage: `${error.code}: ${error.message}`,
          fixDescription: 'No pattern match — requires LLM fix',
          success: false,
          timestamp: Date.now(),
        });
      }
    }

    // If no deterministic pattern fixed anything but LLM-first missing-export also failed,
    // attempt a generic file-level LLM rewrite for remaining errors (semantic errors
    // that don't match any pattern, e.g., TS2305 synthesis failure, TS18046).
    if (!fixedSomething && context.routerEngine) {
      // Try syntax-only rewrite first (existing behavior)
      const syntaxRewritten = await llmRewriteBrokenFiles(context, errors, context.routerEngine);
      if (syntaxRewritten) {
        attempts.push({
          file: 'multiple',
          errorType: 'typescript',
          errorMessage: 'Syntax corruption — LLM rewrote broken files',
          fixDescription: 'LLM rewrote files with parse errors',
          success: true,
          timestamp: Date.now(),
        });
        fixedSomething = true;
      }

      // If still nothing, try a broader repair attempt for semantic/missing-export
      // errors that couldn't be synthesized deterministically.
      if (!fixedSomething && errors.some(e => e.code === 'TS2305' || e.code.includes('2305') || e.code === 'TS18046' || e.code === 'TS2741' || e.code.includes('2741') || e.code === 'TS1005' || e.code.includes('1005'))) {
        try {
          const fileErrors = groupErrorsByFile(errors);
          const targetFile = [...fileErrors.keys()][0];
          if (targetFile) {
            const fullPath = path.resolve(context.projectDir, targetFile);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const { response } = await (context.routerEngine as LLMRepairEngine).execute('repair', {
              model_id: '', provider: 'nvidia',
              messages: [{ role: 'system', content: 'Fix TypeScript errors and return ONLY full corrected file content (JSON with nextFiles array).' },
                { role: 'user', content: `File ${targetFile}:\n${content}\nErrors: ${errors.map(e => e.raw).join('\n')}` }],
              temperature: 0, max_tokens: 4096, response_format: 'json_object',
            });
            if (response && response.content && response.content.trim()) {
              const raw = response.content.trim();
              const jsonBlock = raw.match(/\{[\s\S]*\}/);
              if (jsonBlock) {
                const parsed = JSON.parse(jsonBlock[0]!) as { next?: Array<{ path: string; content: string }> };
                const next = parsed.next ?? [];
                let applied = false;
                for (const item of next) {
                  const cleaned = item.path.replace(/^\.\//, '');
                  const absPath = path.resolve(context.projectDir, cleaned);
                  if (fs.existsSync(absPath) && typeof item.content === 'string') {
                    if (item.content.trim().length > 20) {
                      // SYNTAX GATE: route through applyFix so repaired content
                      // is parse-validated before it can touch disk. This path
                      // previously wrote raw, letting invalid LLM output
                      // overwrite previously validated generated files.
                      if (applyFix(absPath, item.content)) {
                        applied = true;
                      }
                    }
                  }
                }
                if (applied) {
                  attempts.push({
                    file: targetFile,
                    errorType: 'typescript',
                    errorMessage: 'Semantic/TS2305: LLM file repair',
                    fixDescription: 'LLM rewrote file for semantic errors',
                    success: true,
                    timestamp: Date.now(),
                  });
                  fixedSomething = true;
                }
              }
            }
          }
        } catch { /* suppress — repair attempt failed without crashing loop */ }
      }
    }

    if (!fixedSomething) {
      // No fixes could be applied
      remainingErrors = errors.map(e => e.raw);
      break;
    }
  }

  return {
    success: remainingErrors.length === 0,
    attempts,
    remainingErrors,
    totalFixes: attempts.filter(a => a.success).length,
    duration: Date.now() - startTime,
  };
}

/**
 * Format repair result for CLI display.
 */
export function formatRepairResult(result: RepairResult): string {
  const lines: string[] = [];

  const icon = result.success ? '✅' : '⚠️';
  lines.push(`${icon} Autonomous Repair: ${result.success ? 'SUCCESS' : 'PARTIAL'}`);
  lines.push(`   Fixes applied: ${result.totalFixes}`);
  lines.push(`   Attempts: ${result.attempts.length}`);
  lines.push(`   Duration: ${(result.duration / 1000).toFixed(1)}s`);

  if (result.attempts.length > 0) {
    lines.push('   Details:');
    for (const a of result.attempts.slice(0, 10)) {
      const aIcon = a.success ? '✓' : '✗';
      lines.push(`     ${aIcon} ${a.file}: ${a.errorMessage.slice(0, 60)}`);
    }
  }

  if (result.remainingErrors.length > 0) {
    lines.push(`   Remaining errors: ${result.remainingErrors.length}`);
  }

  return lines.join('\n');
}

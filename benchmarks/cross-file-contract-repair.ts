/**
 * Deterministic cross-file contract repair.
 *
 * Each generator phase comes from a separate LLM call, so a consumer file can
 * import a symbol the shared module never exported, or read a property its
 * type never declared. That drift surfaces as a closed set of diagnostics:
 *
 *   TS2305 / TS2614 / TS2724  module has no exported member 'X'
 *   TS2339                    property 'p' does not exist on type 'T'
 *   TS2304 / TS2552           cannot find name 'X'
 *   TS2693                    a type name used as a value (missing `const`)
 *
 * Every repair is driven by real evidence: the local declaration, an existing
 * default export of the same (possibly differently-cased) name, the production
 * template's declaration plus its intra-template dependencies, a sibling type
 * that already models the property, or the single module that exports the
 * unresolved name. Nothing here invents placeholder logic, renames project
 * files, or rewrites a consumer into something that merely happens to compile.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

import {
  CANONICAL_LIB_DB,
  CANONICAL_LIB_TYPES,
  CANONICAL_TYPES_EXPORTS,
  CANONICAL_DB_EXPORTS,
  hasCanonicalPrefix,
  extractCanonicalCore,
  extractExportedNames
} from './orchestrator-shared-templates.js';
import { canWriteSource } from './source-syntax-gate.js';

interface ParsedError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

interface DeclInfo {
  name: string;
  kind: 'interface' | 'type' | 'class' | 'function' | 'variable' | 'enum';
  node: ts.Statement;
  text: string;
  hasExport: boolean;
  isDefault: boolean;
}

interface ModuleShape {
  file: string;
  content: string;
  sf: ts.SourceFile;
  statements: readonly ts.Statement[];
  decls: Map<string, DeclInfo>;
  namedExports: Set<string>;
}

const ERROR_LINE = /^(.+?\.(?:tsx?|jsx?))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;
const MISSING_EXPORT =
  /^Module\s+['"]+([^'"]+?)['"]+\s+has no exported member\s+['"]([^'"]+)['"]/;
const MISSING_PROPERTY = /^Property '([^']+)' does not exist on type '([^']+)'/;
const MISSING_NAME = /^Cannot find name '([^']+)'/;
const MISSING_REQUIRED_PROPERTY =
  /Property '([^']+)' is missing in type .* but required in type '([^']+)'/;
const NOT_ASSIGNABLE_LITERAL = /^Type '"([^"]+)"' is not assignable to type '([^']+)'\.?$/;
const NO_OVERLAP = /because the types '([^']+)' and '"([^"]+)"' have no overlap/;
const NOT_ASSIGNABLE_NULL = /^Type 'null' is not assignable to type '([^']+)'\.?$/;
const SUGGESTED_PROPERTY =
  /Property '([^']+)' does not exist on type '[^']+'\. Did you mean '([^']+)'?/;
/** Diagnostics that say the shared surface does not provide something. */
const SURFACE_CODES = new Set(['TS2304', 'TS2305', 'TS2339', 'TS2551', 'TS2552', 'TS2614', 'TS2724']);

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'coverage', 'out']);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordPattern(name: string): RegExp {
  return new RegExp(`(?<![\\w$])${escapeRegex(name)}(?![\\w$])`);
}

function parseErrors(errorLines: string[]): ParsedError[] {
  const out: ParsedError[] = [];
  for (const raw of errorLines) {
    // Windows shells prepend a UTF-8 BOM to redirected output, which would
    // otherwise become part of the first reported file name.
    const clean = raw.replace(/\uFEFF/g, '').replace(/\r/g, '');
    const m = clean.match(ERROR_LINE);
    if (m) {
      out.push({ file: m[1]!, line: Number(m[2]), col: Number(m[3]), code: m[4]!, message: m[5]! });
      continue;
    }
    // TypeScript indents the detail line of a diagnostic ("Property 'status' is
    // missing in type ...") under its header. Without folding it in, every
    // repair that keys off the detail — TS2322 shape drift above all — is blind.
    if (out.length > 0 && /^\s+\S/.test(clean)) {
      const prev = out[out.length - 1]!;
      prev.message = `${prev.message} ${clean.trim()}`;
    }
  }
  return out;
}

function scriptKindFor(file: string): ts.ScriptKind {
  if (/\.tsx$/i.test(file)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(file)) return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some(m => m.kind === kind);
}

function collectLocalDeclarations(sf: ts.SourceFile, node: ts.Statement): Array<{ name: string; kind: DeclInfo['kind'] }> {
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  ) {
    const name = node.name?.getText(sf);
    const kind: DeclInfo['kind'] = ts.isInterfaceDeclaration(node)
      ? 'interface'
      : ts.isTypeAliasDeclaration(node)
        ? 'type'
        : ts.isClassDeclaration(node)
          ? 'class'
          : ts.isEnumDeclaration(node)
            ? 'enum'
            : 'function';
    return name ? [{ name, kind }] : [];
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .filter(d => ts.isIdentifier(d.name))
      .map(d => ({ name: (d.name as ts.Identifier).text, kind: 'variable' as const }));
  }
  return [];
}

function buildModuleShape(file: string, content: string): ModuleShape {
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const decls = new Map<string, DeclInfo>();
  const namedExports = new Set<string>();

  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) namedExports.add(el.name.text);
      continue;
    }
    const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(st, ts.SyntaxKind.DefaultKeyword);
    for (const local of collectLocalDeclarations(sf, st)) {
      decls.set(local.name, {
        name: local.name,
        kind: local.kind,
        node: st,
        text: st.getText(sf),
        hasExport: exported,
        isDefault,
      });
      if (exported && !isDefault) namedExports.add(local.name);
    }
  }

  return { file, content, sf, statements: sf.statements, decls, namedExports };
}

function readShape(file: string): ModuleShape | null {
  try {
    const content = readFileSync(file, 'utf-8');
    return buildModuleShape(file, content);
  } catch {
    return null;
  }
}

function listSourceFiles(projectDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(projectDir, 'src'));
  return out;
}

function isFile(target: string): boolean {
  try {
    return existsSync(target) && statSync(target).isFile();
  } catch {
    return false;
  }
}

function resolveModuleFile(spec: string, consumerFile: string, projectDir: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(projectDir, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(consumerFile), spec);
  else return null;

  if (isFile(base)) return base;
  for (const ext of ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']) {
    if (isFile(base + ext)) return base + ext;
    const idx = path.join(base, 'index' + ext);
    if (isFile(idx)) return idx;
  }
  return null;
}

function templateContentFor(projectDir: string, moduleFile: string): string | null {
  const normalized = path.resolve(moduleFile);
  const typesPath = path.resolve(projectDir, 'src', 'lib', 'types.ts');
  const dbPath = path.resolve(projectDir, 'src', 'lib', 'db.ts');
  if (normalized === typesPath) return CANONICAL_LIB_TYPES;
  if (normalized === dbPath) return CANONICAL_LIB_DB;
  return null;
}

function writeIfChanged(file: string, before: string, after: string, fixes: string[], label: string): boolean {
  if (after === before) return false;

  // Canonical immutability guard: protect src/lib/types.ts and src/lib/db.ts
  // from modifications that would corrupt the canonical core
  const normalizedFile = path.resolve(file);
  if (normalizedFile.endsWith(path.join('src', 'lib', 'types.ts')) ||
      normalizedFile.endsWith(path.join('src', 'lib', 'db.ts'))) {
    const canonicalCore = normalizedFile.endsWith('types.ts') ? CANONICAL_LIB_TYPES : CANONICAL_LIB_DB;
    const canonicalExports = normalizedFile.endsWith('types.ts') ? CANONICAL_TYPES_EXPORTS : CANONICAL_DB_EXPORTS;

    // Only enforce canonical immutability if the file already has the canonical prefix
    // This allows fresh scaffold files to be built up, but protects canonical files from corruption
    if (hasCanonicalPrefix(before, canonicalCore)) {
      // File already has canonical core - must preserve it
      if (!hasCanonicalPrefix(after, canonicalCore)) {
        // Would corrupt canonical core - reject the write
        return false;
      }
      // Additional check: ensure canonical exports are still present
      const afterExports = extractExportedNames(after);
      for (const exp of canonicalExports) {
        if (!afterExports.has(exp)) {
          // Would remove a canonical export - reject the write
          return false;
        }
      }
    }
    // If file doesn't have canonical prefix yet, allow modifications (e.g., during initial scaffold)
  }

  // A contract patch is a rewrite of live source: never persist one that does
  // not parse, or the repair pass itself becomes the invalid-source writer.
  if (!canWriteSource(file, after)) return false;
  try {
    writeFileSync(file, after, 'utf-8');
    fixes.push(label);
    return true;
  } catch {
    return false;
  }
}

interface ProjectIndex {
  files: string[];
  shapes: Map<string, ModuleShape>;
  exporters: Map<string, string[]>;
}

interface RepairContext {
  projectDir: string;
  index: ProjectIndex;
  fixes: string[];
}

function buildIndex(projectDir: string): ProjectIndex {
  const files = listSourceFiles(projectDir);
  const shapes = new Map<string, ModuleShape>();
  const exporters = new Map<string, string[]>();
  for (const file of files) {
    const shape = readShape(file);
    if (!shape) continue;
    shapes.set(file, shape);
    for (const name of shape.namedExports) {
      const list = exporters.get(name) ?? [];
      list.push(file);
      exporters.set(name, list);
    }
  }
  return { files, shapes, exporters };
}

function appendTopLevelLines(
  file: string,
  content: string,
  lines: string[],
  fixes: string[],
  label: string,
): boolean {
  const trimmed = content.replace(/\s*$/, '');
  return writeIfChanged(file, content, `${trimmed}\n\n${lines.join('\n')}\n`, fixes, label);
}

function directiveEnd(shape: ModuleShape): number {
  let i = 0;
  while (i < shape.statements.length) {
    const st = shape.statements[i]!;
    if (ts.isExpressionStatement(st) && ts.isStringLiteralLike(st.expression)) i++;
    else break;
  }
  return i > 0 ? shape.statements[i - 1]!.getEnd() : -1;
}

function topInsertOffset(shape: ModuleShape): number {
  let lastImport = -1;
  for (const st of shape.statements) if (ts.isImportDeclaration(st)) lastImport = st.getEnd();
  if (lastImport >= 0) return lastImport;
  const afterDirective = directiveEnd(shape);
  if (afterDirective >= 0) return afterDirective;
  if (shape.statements.length > 0) return shape.statements[0]!.getStart(shape.sf);
  return 0;
}

function resolveExportTarget(
  ctx: RepairContext,
  name: string,
  consumerShape: ModuleShape,
): string | null {
  const hits = (ctx.index.exporters.get(name) ?? []).filter(
    f => path.resolve(f) !== path.resolve(consumerShape.file),
  );
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0]!;
  const imported = new Set<string>();
  for (const st of consumerShape.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const spec = (st.moduleSpecifier as ts.StringLiteralLike).text;
    const resolved = resolveModuleFile(spec, consumerShape.file, ctx.projectDir);
    if (resolved) imported.add(path.resolve(resolved));
  }
  const preferred = hits.filter(f => imported.has(path.resolve(f)));
  const pool = preferred.length > 0 ? preferred : hits;
  if (pool.length === 1) return pool[0]!;
  // Several modules export the same name. Ranking by basename match, then by
  // living in `src/lib`, then lexicographically keeps the choice stable across
  // runs instead of silently skipping the import.
  const rank = pool.map(file => {
    const base = path.basename(file).replace(/\.(tsx?|jsx?)$/, '');
    return {
      file,
      named: base === name ? 0 : 1,
      shared: path.basename(path.dirname(file)) === 'lib' ? 0 : 1,
    };
  });
  rank.sort((a, b) => a.named - b.named || a.shared - b.shared || a.file.localeCompare(b.file));
  return rank[0]!.file;
}

function specifierFor(targetFile: string, projectDir: string, consumerFile: string): string {
  const srcRoot = path.join(projectDir, 'src');
  const rel = path.relative(srcRoot, targetFile);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return '@/'.concat(rel.replace(/\\/g, '/').replace(/\.(ts|tsx|mts|cts)$/, ''));
  }
  const fromConsumer = path.relative(path.dirname(consumerFile), targetFile)
    .replace(/\\/g, '/')
    .replace(/\.(ts|tsx|mts|cts)$/, '');
  return fromConsumer.startsWith('.') ? fromConsumer : `./${fromConsumer}`;
}

function isValueType(index: ProjectIndex, file: string, name: string): boolean {
  const shape = index.shapes.get(path.resolve(file)) ?? readShape(file);
  const decl = shape?.decls.get(name);
  if (!decl) return false;
  return decl.kind === 'function' || decl.kind === 'variable' || decl.kind === 'class' || decl.kind === 'enum';
}

/**
 * Import `names` from `targetFile` into `consumerFile`, merging into an
 * existing import of the same module and type-only flavour when possible.
 */
function addNamedImport(ctx: RepairContext, consumerFile: string, targetFile: string, names: string[]): boolean {
  const shape = readShape(consumerFile);
  if (!shape) return false;

  for (const name of names) {
    // Re-read per symbol: an earlier merge in this loop changed the file.
    const shape = readShape(consumerFile);
    if (!shape) return false;
    const wantType = !isValueType(ctx.index, targetFile, name);
    let done = false;
    for (const st of shape.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const spec = (st.moduleSpecifier as ts.StringLiteralLike).text;
      const resolved = resolveModuleFile(spec, consumerFile, ctx.projectDir);
      if (!resolved || path.resolve(resolved) !== path.resolve(targetFile)) continue;
      const clause = st.importClause;
      if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
      if (clause.isTypeOnly !== wantType) continue;
      const have = new Set(clause.namedBindings.elements.map(el => el.name.text));
      if (have.has(name)) { done = true; break; }
      const insertAt = clause.namedBindings.elements.end;
      const next = `${shape.content.slice(0, insertAt)}, ${name}${shape.content.slice(insertAt)}`;
      writeIfChanged(consumerFile, shape.content, next, ctx.fixes, `import '${name}' from ${path.relative(ctx.projectDir, targetFile)}`);
      ctx.index = buildIndex(ctx.projectDir);
      done = true;
      break;
    }
    if (done) continue;

    const spec = specifierFor(targetFile, ctx.projectDir, consumerFile);
    const line = wantType
      ? `import type { ${name} } from '${spec}';`
      : `import { ${name} } from '${spec}';`;
    const offset = topInsertOffset(shape);
    const next = `${shape.content.slice(0, offset)}\n${line}${shape.content.slice(offset)}`;
    if (writeIfChanged(consumerFile, shape.content, next, ctx.fixes, `import '${name}' from ${path.relative(ctx.projectDir, targetFile)}`)) {
      ctx.index = buildIndex(ctx.projectDir);
      continue;
    }
    return false;
  }
  return true;
}

/**
 * TS2305 / TS2614 / TS2724 — a module exists but does not export `member`.
 */
function repairMissingExports(ctx: RepairContext, errors: ParsedError[]): void {
  const handled = new Set<string>();
  for (const err of errors) {
    if (err.code !== 'TS2305' && err.code !== 'TS2614' && err.code !== 'TS2724') continue;
    const match = err.message.match(MISSING_EXPORT);
    if (!match) continue;
    const consumerAbs = path.resolve(ctx.projectDir, err.file);
    const moduleFile = resolveModuleFile(match[1]!, consumerAbs, ctx.projectDir);
    if (!moduleFile) continue;
    const key = `${moduleFile}::${match[2]}`;
    if (handled.has(key)) continue;
    handled.add(key);
    applyMissingExport(ctx, moduleFile, match[2]!);
  }
}

function applyMissingExport(ctx: RepairContext, moduleFile: string, member: string): void {
  const shape = readShape(moduleFile);
  if (!shape || shape.namedExports.has(member)) return;
  const rel = path.relative(ctx.projectDir, moduleFile);

  const exact = shape.decls.get(member);
  if (exact && !exact.hasExport) {
    const at = exact.node.getStart(shape.sf);
    const next = `${shape.content.slice(0, at)}export ${shape.content.slice(at)}`;
    writeIfChanged(moduleFile, shape.content, next, ctx.fixes, `export '${member}' in ${rel}`);
    ctx.index = buildIndex(ctx.projectDir);
    return;
  }
  if (exact) {
    const statement = exact.kind === 'interface' || exact.kind === 'type'
      ? `export type { ${member} };`
      : `export { ${member} };`;
    appendTopLevelLines(moduleFile, shape.content, [statement], ctx.fixes, `export default '${member}' in ${rel}`);
    ctx.index = buildIndex(ctx.projectDir);
    return;
  }

  const alternate = [...shape.decls.values()].find(d => d.name.toLowerCase() === member.toLowerCase());
  if (alternate) {
    const statement = alternate.kind === 'interface' || alternate.kind === 'type'
      ? `export type { ${alternate.name} as ${member} };`
      : `export { ${alternate.name} as ${member} };`;
    appendTopLevelLines(moduleFile, shape.content, [statement], ctx.fixes, `export '${alternate.name}' as '${member}' in ${rel}`);
    ctx.index = buildIndex(ctx.projectDir);
    return;
  }

  applyTemplateExport(ctx, moduleFile, member, shape);
}

/**
 * Source a missing export from the production template: the declaration itself
 * plus every template declaration it references that this module does not
 * already define, then import anything those chunks need.
 */
function applyTemplateExport(
  ctx: RepairContext,
  moduleFile: string,
  member: string,
  moduleShapeNow: ModuleShape,
): void {
  const template = templateContentFor(ctx.projectDir, moduleFile);
  if (!template) return;

  // Canonical immutability guard: ensure we don't modify the canonical core
  const currentContent = readFileSync(moduleFile, 'utf-8');
  const canonicalCore = moduleFile.endsWith('types.ts') ? CANONICAL_LIB_TYPES : CANONICAL_LIB_DB;
  if (!hasCanonicalPrefix(currentContent, canonicalCore)) {
    // File doesn't have canonical prefix - don't write to it
    return;
  }

  const templateShape = buildModuleShape('template.ts', template);
  const target = templateShape.decls.get(member);
  if (!target) return;

  const declared = new Set(moduleShapeNow.decls.keys());
  const chosen: DeclInfo[] = [];
  const chosenNames = new Set<string>();
  const queue: DeclInfo[] = [target];
  while (queue.length > 0) {
    const decl = queue.shift()!;
    if (chosenNames.has(decl.name) || declared.has(decl.name)) continue;
    chosen.push(decl);
    chosenNames.add(decl.name);
    for (const candidate of templateShape.decls.values()) {
      if (chosenNames.has(candidate.name) || declared.has(candidate.name)) continue;
      if (wordPattern(candidate.name).test(decl.text)) queue.push(candidate);
    }
  }
  if (chosen.length === 0) return;

  const declaredNow = new Set([...declared, ...chosenNames]);
  const needed = new Set<string>();
  for (const decl of chosen) {
    for (const token of decl.text.matchAll(/[A-Za-z_$][\w$]*/g)) {
      const name = token[0]!;
      if (declaredNow.has(name) || templateShape.decls.has(name)) continue;
      needed.add(name);
    }
  }

  // The chunks have to land before the first top-level statement that reads
  // any of them. Appending at the end of the module left `const`/`let` bindings
  // referenced by an earlier statement — TypeScript reports that as
  // used-before-declaration, so the repair itself introduced the error.
  const ordered = orderDeclarations(chosen);
  const chunks = ordered.map(d => d.text).join('\n\n');
  const rel = path.relative(ctx.projectDir, moduleFile);
  const firstUse = firstTopLevelUse(moduleShapeNow, chosenNames);
  const before =
    firstUse >= 0
      ? `${moduleShapeNow.content.slice(0, firstUse)}${chunks}\n\n${moduleShapeNow.content.slice(firstUse)}`
      : `${moduleShapeNow.content.replace(/\s*$/, '')}\n\n${chunks}\n`;
  if (!writeIfChanged(moduleFile, moduleShapeNow.content, before, ctx.fixes, `complete '${member}' in ${rel} from the production template`)) return;
  ctx.index = buildIndex(ctx.projectDir);

  const importsByTarget = new Map<string, string[]>();
  const refreshed = readShape(moduleFile);
  if (!refreshed) return;
  for (const name of needed) {
    const targetFile = resolveExportTarget(ctx, name, refreshed);
    if (!targetFile) continue;
    const list = importsByTarget.get(targetFile) ?? [];
    if (!list.includes(name)) list.push(name);
    importsByTarget.set(targetFile, list);
  }
  for (const [targetFile, names] of importsByTarget) {
    addNamedImport(ctx, moduleFile, targetFile, names);
  }
}

/**
 * Emit the chosen declarations with every `const`/`let` dependency first.
 * Interfaces, types, classes, enums and functions hoist, so only variable
 * bindings constrain the order.
 */
function orderDeclarations(chosen: DeclInfo[]): DeclInfo[] {
  const ordered: DeclInfo[] = [];
  const remaining = [...chosen];
  const emitted = new Set<string>();
  while (remaining.length > 0) {
    let progressed = false;
    for (let i = 0; i < remaining.length; i++) {
      const decl = remaining[i]!;
      const blocked = chosen.some(
        other =>
          other.name !== decl.name &&
          other.kind === 'variable' &&
          !emitted.has(other.name) &&
          wordPattern(other.name).test(decl.text),
      );
      if (blocked) continue;
      ordered.push(decl);
      emitted.add(decl.name);
      remaining.splice(i, 1);
      i--;
      progressed = true;
    }
    if (!progressed) ordered.push(...remaining.splice(0));
  }
  return ordered;
}

/** Offset of the first top-level statement that reads one of `names`. */
function firstTopLevelUse(shape: ModuleShape, names: Set<string>): number {
  for (const st of shape.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) continue;
    const text = st.getText(shape.sf);
    for (const name of names) {
      if (wordPattern(name).test(text)) return st.getStart(shape.sf);
    }
  }
  return -1;
}

/**
 * TS2304 / TS2552 — a name no file declares; import it from the module that does.
 */
function repairMissingImports(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2304' && err.code !== 'TS2552') continue;
    const match = err.message.match(MISSING_NAME);
    if (!match) continue;
    const name = match[1]!;
    const consumerAbs = path.resolve(ctx.projectDir, err.file);
    const consumer = ctx.index.shapes.get(consumerAbs) ?? readShape(consumerAbs);
    if (!consumer) continue;
    if (consumer.decls.has(name) || consumer.namedExports.has(name)) continue;
    const target = resolveExportTarget(ctx, name, consumer);
    if (!target) continue;
    addNamedImport(ctx, consumerAbs, target, [name]);
  }
}

function typeMembersOf(node: ts.Statement): ts.NodeArray<ts.TypeElement> | null {
  if (ts.isInterfaceDeclaration(node)) return node.members;
  if (ts.isTypeAliasDeclaration(node) && ts.isTypeLiteralNode(node.type)) return node.type.members;
  if (ts.isTypeAliasDeclaration(node) && ts.isIntersectionTypeNode(node.type)) {
    const literal = node.type.types.find(t => ts.isTypeLiteralNode(t));
    if (literal) return (literal as ts.TypeLiteralNode).members;
  }
  return null;
}

function balancedBlock(source: string, openIdx: number, open: string, close: string): string | null {
  let depth = 0;
  let quote: string | null = null;
  let esc = false;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i]!;
    if (quote) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * A new member must be optional whenever an existing object literal for the
 * type omits it, otherwise those literals become excess-property errors. With
 * no literals to inspect, optional only when every read chains through `?.`.
 */
function isPropertyOptional(ctx: RepairContext, typeName: string, prop: string, consumerFile: string): boolean {
  const pattern = new RegExp(`:\\s*${escapeRegex(typeName)}\\s*(?:\\[\\])?\\s*=\\s*([{\\[])`, 'g');
  let sawLiteral = false;
  let literalOmits = false;
  for (const shape of ctx.index.shapes.values()) {
    for (const found of shape.content.matchAll(pattern)) {
      sawLiteral = true;
      const open = found[1]!;
      const block = balancedBlock(shape.content, found.index! + found[0].length - 1, open, open === '{' ? '}' : ']');
      if (block && !wordPattern(prop).test(block)) literalOmits = true;
    }
  }
  if (sawLiteral) return literalOmits;

  const consumer = ctx.index.shapes.get(consumerFile) ?? readShape(consumerFile);
  if (!consumer) return true;
  const accesses = [...consumer.content.matchAll(new RegExp(`\\.${escapeRegex(prop)}\\b`, 'g'))];
  if (accesses.length === 0) return true;
  return accesses.every(found => consumer.content[found.index! + found[0].length] === '?');
}

/**
 * TS2339 — declare the property on the type that owns it, reusing the shape a
 * sibling type in the same file already models when one exists.
 */
function repairMissingProperties(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2339') continue;
    const match = err.message.match(MISSING_PROPERTY);
    if (!match) continue;
    const prop = match[1]!;
    const typeName = match[2]!.split(/[|<(\s]/)[0]!.replace(/[\].,]+$/, '');
    if (!typeName || /^(any|unknown|never|object)$/.test(typeName)) continue;
    if (/[.[\]]/.test(prop)) continue;

    const candidates = [...ctx.index.shapes.entries()]
      .map(([file, shape]) => ({ file, shape, decl: shape.decls.get(typeName) }))
      .filter(c => c.decl && (c.decl.kind === 'interface' || c.decl.kind === 'type'))
      .sort((a, b) => (path.join(a.file).includes(`${path.sep}lib${path.sep}`) ? -1 : 0) - (path.join(b.file).includes(`${path.sep}lib${path.sep}`) ? -1 : 0));
    const target = candidates[0];
    if (!target?.decl) continue;

    const members = typeMembersOf(target.decl.node);
    if (!members) continue;
    if (members.some(m => m.name && m.name.getText(target.shape.sf) === prop)) continue;

    let typeText = 'any';
    for (const [name, decl] of target.shape.decls) {
      if (name === typeName) continue;
      const sibling = typeMembersOf(decl.node)?.find(
        m => m.name && m.name.getText(target.shape.sf) === prop && ts.isPropertySignature(m) && m.type,
      );
      if (sibling && ts.isPropertySignature(sibling)) {
        typeText = sibling.type!.getText(target.shape.sf);
        break;
      }
    }

    const optional = isPropertyOptional(ctx, typeName, prop, path.resolve(ctx.projectDir, err.file));
    const content = target.shape.content;
    let insertAt: number;
    let text: string;
    if (members.length > 0) {
      const first = members[0]!;
      const lineStart = content.lastIndexOf('\n', first.getStart(target.shape.sf)) + 1;
      const indent = content.slice(lineStart, first.getStart(target.shape.sf)).match(/^[ \t]*/)?.[0] ?? '  ';
      insertAt = members.end;
      text = `\n${indent}${prop}${optional ? '?' : ''}: ${typeText};`;
    } else {
      const declStart = target.decl.node.getStart(target.shape.sf);
      const baseIndent = content.slice(content.lastIndexOf('\n', declStart) + 1, declStart).match(/^[ \t]*/)?.[0] ?? '';
      insertAt = members.end;
      text = `\n${baseIndent}  ${prop}${optional ? '?' : ''}: ${typeText};\n${baseIndent}`;
    }

    const next = content.slice(0, insertAt) + text + content.slice(insertAt);
    const rel = path.relative(ctx.projectDir, target.file);
    if (writeIfChanged(target.file, content, next, ctx.fixes, `declare '${typeName}.${prop}' in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * TS2693 — a statement-position `name: Type = { ... }` is parsed as a label
 * plus a type-used-as-value. Only prefix `const ` when the same file also
 * reports that identifier as unresolved, which proves it was meant to be a
 * declaration.
 */
function repairLabeledInitializer(ctx: RepairContext, errors: ParsedError[]): void {
  // Line-number driven, so apply from the bottom of each file upward to keep
  // earlier line numbers valid as later ones are prefixed.
  const targets = errors
    .filter(e => e.code === 'TS2693')
    .sort((a, b) => b.line - a.line);
  for (const err of targets) {
    const match = err.message.match(/^'([^']+)' only refers to a type, but is being used as a value here/);
    if (!match) continue;
    const typeUsed = match[1]!;
    const abs = path.resolve(ctx.projectDir, err.file);
    let content: string;
    try {
      content = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const idx = err.line - 1;
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx]!;
    const lm = line.match(/^(\s*)([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*=/);
    if (!lm || lm[3] !== typeUsed) continue;
    const ident = lm[2]!;
    const unresolved = errors.some(
      x =>
        x.code === 'TS2304' &&
        path.resolve(ctx.projectDir, x.file) === abs &&
        x.message.startsWith(`Cannot find name '${ident}'.`),
    );
    if (!unresolved) continue;
    lines[idx] = `${lm[1]!}const ${line.slice(lm[1]!.length)}`;
    const rel = path.relative(ctx.projectDir, abs);
    writeIfChanged(abs, content, lines.join(eol), ctx.fixes, `restore missing 'const ' for '${ident}' in ${rel}`);
    ctx.index = buildIndex(ctx.projectDir);
  }
}

function offsetOf(sf: ts.SourceFile, line: number, col: number): number {
  try {
    return sf.getPositionOfLineAndCharacter(Math.max(0, line - 1), Math.max(0, col - 1));
  } catch {
    return -1;
  }
}

/**
 * `'a' | 'b' | 'c'` -> ordered members, else null. Accepts either quote style:
 * TypeScript's diagnostic renderer uses double quotes, source text uses the
 * file's own style, and both have to compare as the same member list.
 */
function unionLiterals(text: string): string[] | null {
  const parts = text.split('|');
  if (parts.length < 2) return null;
  const out: string[] = [];
  for (const part of parts) {
    const m = part.trim().match(/^(['"])((?:\\.|(?!\1).)*)\1$/);
    if (!m) return null;
    out.push(m[2]!);
  }
  return out;
}

/** A type-correct default for a required member, or null when none is evident. */
function defaultLiteralFor(typeText: string): string | null {
  const union = unionLiterals(typeText);
  if (union) return `'${union[0]}'`;
  const t = typeText.trim();
  if (/^string(\s*\|\s*undefined)?$/.test(t)) return `''`;
  if (/^number(\s*\|\s*undefined)?$/.test(t)) return '0';
  if (/^boolean(\s*\|\s*undefined)?$/.test(t)) return 'false';
  return null;
}

/** Top-level member names of a rendered object type, tolerating `...` truncation. */
function topLevelKeysOfTypeText(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '{' || ch === '(' || ch === '[') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
      if (depth < 0) break;
    } else if (ch === ';' && depth === 1) {
      keys.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (start >= 0 && start < text.length) keys.push(text.slice(start));
  return keys
    .map(segment => segment.match(/^\s*([A-Za-z_$][\w$]*)\s*:/)?.[1])
    .filter((k): k is string => !!k);
}

function topLevelKeysOfObjectLiteral(node: ts.ObjectLiteralExpression, sf: ts.SourceFile): string[] {
  const keys: string[] = [];
  for (const prop of node.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.name.getText(sf));
    }
  }
  return keys;
}

/**
 * Locate the shared object a TS2339 diagnostic is complaining about: the
 * variable holding an object literal whose top-level members are exactly the
 * members the rendered type reports. Preference goes to `src/lib`, then to the
 * tightest match, so the answer never depends on directory iteration order.
 */
function findSharedObjectTarget(
  ctx: RepairContext,
  typeText: string,
): { file: string; declName: string; init: ts.ObjectLiteralExpression } | null {
  const wanted = new Set(topLevelKeysOfTypeText(typeText));
  if (wanted.size === 0) return null;

  const files = [...ctx.index.files].sort((a, b) => {
    const la = path.basename(path.dirname(a)) === 'lib' ? 1 : 0;
    const lb = path.basename(path.dirname(b)) === 'lib' ? 1 : 0;
    return lb - la || a.localeCompare(b);
  });

  let best: { file: string; declName: string; init: ts.ObjectLiteralExpression } | null = null;
  let bestScore = -1;
  for (const file of files) {
    const shape = ctx.index.shapes.get(file);
    if (!shape) continue;
    for (const st of shape.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
        const keys = topLevelKeysOfObjectLiteral(d.initializer, shape.sf);
        if (keys.length === 0) continue;
        const keySet = new Set(keys);
        let overlap = 0;
        for (const k of wanted) if (keySet.has(k)) overlap++;
        if (overlap === 0) continue;
        const exact = keySet.size === wanted.size && overlap === wanted.size ? 1000 : 0;
        const score = exact + overlap;
        if (score > bestScore) {
          bestScore = score;
          best = { file, declName: d.name.text, init: d.initializer };
        }
      }
    }
  }
  return best;
}

/**
 * TS2304 / TS2552 where no module declares the name — source the declaration
 * from the production template into the shared module that owns that kind of
 * contract, so the import pass that follows has somewhere to import from.
 */
function repairTemplateDeclarations(ctx: RepairContext, errors: ParsedError[]): void {
  const typesPath = path.join(ctx.projectDir, 'src', 'lib', 'types.ts');
  const dbPath = path.join(ctx.projectDir, 'src', 'lib', 'db.ts');
  const handled = new Set<string>();

  for (const err of errors) {
    if (err.code !== 'TS2304' && err.code !== 'TS2552') continue;
    const match = err.message.match(MISSING_NAME);
    if (!match) continue;
    const name = match[1]!;
    if (handled.has(name)) continue;
    if (ctx.index.exporters.has(name)) continue;
    handled.add(name);

    for (const [moduleFile, template] of [
      [typesPath, CANONICAL_LIB_TYPES],
      [dbPath, CANONICAL_LIB_DB],
    ] as const) {
      if (!isFile(moduleFile)) continue;
      const shape = ctx.index.shapes.get(moduleFile) ?? readShape(moduleFile);
      if (!shape || shape.decls.has(name)) continue;
      if (!buildModuleShape('template.ts', template).decls.has(name)) continue;

      // Canonical immutability guard: ensure we don't modify the canonical core
      const currentContent = readFileSync(moduleFile, 'utf-8');
      const canonicalCore = moduleFile === typesPath ? CANONICAL_LIB_TYPES : CANONICAL_LIB_DB;
      if (!hasCanonicalPrefix(currentContent, canonicalCore)) {
        // File doesn't have canonical prefix - don't write to it
        continue;
      }

      applyTemplateExport(ctx, moduleFile, name, shape);
      ctx.index = buildIndex(ctx.projectDir);
      break;
    }
  }
}

/**
 * TS2551 — TypeScript already named the member the consumer meant; adopt its
 * suggestion at the call site rather than growing the shared contract.
 */
function repairSuggestedMember(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2551') continue;
    const match = err.message.match(SUGGESTED_PROPERTY);
    if (!match) continue;
    const [, wrong, right] = match;
    const abs = path.resolve(ctx.projectDir, err.file);
    const shape = readShape(abs);
    if (!shape) continue;
    const next = shape.content.replace(
      new RegExp(`(\\.${escapeRegex(wrong!)})\\b`, 'g'),
      `.${right}`,
    );
    if (next === shape.content) continue;
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `use '${right}' instead of '${wrong}' in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * TS2339 / TS2551 against an inferred object type (a shared `db`-style module)
 * — the missing member is added only when the production template declares it,
 * because the template is the canonical, self-consistent contract.
 */
function repairSharedModuleMembers(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2339' && err.code !== 'TS2551') continue;
    const match = err.message.match(MISSING_PROPERTY);
    if (!match) continue;
    const prop = match[1]!;
    const typeText = match[2]!;
    if (!typeText.startsWith('{')) continue;

    const target = findSharedObjectTarget(ctx, typeText);
    if (!target) continue;
    const shape = ctx.index.shapes.get(target.file) ?? readShape(target.file);
    if (!shape || shape.decls.has(prop)) continue;
    const template = templateContentFor(ctx.projectDir, target.file);
    if (!template) continue;
    // The template is the canonical contract: only members it actually
    // declares may be merged. Anything else would be inventing an API.
    if (!buildModuleShape('template.ts', template).decls.has(prop)) continue;

    // Canonical immutability guard: ensure we don't modify the canonical core
    const currentContent = readFileSync(target.file, 'utf-8');
    const canonicalCore = target.file.endsWith('types.ts') ? CANONICAL_LIB_TYPES : CANONICAL_LIB_DB;
    if (!hasCanonicalPrefix(currentContent, canonicalCore)) {
      // File doesn't have canonical prefix - don't write to it
      continue;
    }

    // Stage 1: the template declaration (plus its intra-template dependencies).
    applyTemplateExport(ctx, target.file, prop, shape);

    // Stage 2: expose it on the shared object consumers actually call.
    const fresh = readShape(target.file);
    if (!fresh) continue;
    const decl = fresh.decls.get(target.declName);
    if (!decl || !ts.isVariableStatement(decl.node)) continue;
    const init = decl.node.declarationList.declarations.find(
      d => ts.isIdentifier(d.name) && d.name.text === target.declName && d.initializer && ts.isObjectLiteralExpression(d.initializer),
    )?.initializer;
    if (!init || !ts.isObjectLiteralExpression(init)) continue;
    const openIdx = init.getStart(fresh.sf);
    if (fresh.content.slice(openIdx, openIdx + 1) !== '{') continue;
    if (topLevelKeysOfObjectLiteral(init, fresh.sf).includes(prop)) continue;

    const rel = path.relative(ctx.projectDir, target.file);
    const next = `${fresh.content.slice(0, openIdx + 1)} ${prop},${fresh.content.slice(openIdx + 1)}`;
    if (writeIfChanged(target.file, fresh.content, next, ctx.fixes, `expose '${prop}' on '${target.declName}' in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * The declared type of `prop` on the owner named in `ownerTypeText`
 * (`ApiResponse<WorkItem[]>` -> the `status` member of `ApiResponse`).
 */
function memberTypeText(ctx: RepairContext, ownerTypeText: string, prop: string): string | null {
  const owner = ownerTypeText.match(/^[A-Za-z_$][\w$]*/)?.[0];
  if (!owner) return null;
  const files = [...ctx.index.files].sort((a, b) => {
    const la = path.basename(path.dirname(a)) === 'lib' ? 1 : 0;
    const lb = path.basename(path.dirname(b)) === 'lib' ? 1 : 0;
    return lb - la || a.localeCompare(b);
  });
  for (const file of files) {
    const shape = ctx.index.shapes.get(file);
    const decl = shape?.decls.get(owner);
    if (!shape || !decl) continue;
    const members = typeMembersOf(decl.node);
    if (!members) continue;
    for (const member of members) {
      if (!ts.isPropertySignature(member) || !member.type) continue;
      if (member.name.getText(shape.sf) !== prop) continue;
      return member.type.getText(shape.sf);
    }
  }
  return null;
}

/**
 * TS2322 / TS2741 detail — a required member the consumer's object literal
 * omits. The shared contract stays authoritative: the literal supplies the
 * member.
 */
function repairRequiredMember(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2322' && err.code !== 'TS2741') continue;
    const match = err.message.match(MISSING_REQUIRED_PROPERTY);
    if (!match) continue;
    const prop = match[1]!;
    const memberType = memberTypeText(ctx, match[2]!, prop);
    if (memberType === null) continue;
    const value = defaultLiteralFor(memberType);
    if (value === null) continue;

    const abs = path.resolve(ctx.projectDir, err.file);
    const shape = ctx.index.shapes.get(abs) ?? readShape(abs);
    if (!shape) continue;
    const offset = offsetOf(shape.sf, err.line, err.col);
    if (offset < 0) continue;

    // TS2741 points at the declared variable; the literal it complains about
    // is the initializer on that same statement. TS2322 points at the value.
    let openIdx: number;
    if (err.code === 'TS2741') {
      const eq = shape.content.indexOf('=', offset);
      if (eq < 0) continue;
      const after = shape.content.slice(eq + 1);
      const found = after.indexOf('{');
      if (found < 0 || /[;\n]/.test(after.slice(0, found))) continue;
      openIdx = eq + 1 + found;
    } else {
      openIdx = shape.content.indexOf('{', offset);
      if (openIdx < 0) continue;
    }
    // Only patch a literal in argument or initializer position — never a
    // statement block.
    let prev = openIdx - 1;
    while (prev >= 0 && /\s/.test(shape.content[prev]!)) prev--;
    if (prev < 0 || !'(:,='.includes(shape.content[prev]!)) continue;

    const block = balancedBlock(shape.content, openIdx, '{', '}');
    if (!block) continue;
    const inner = block.slice(1, -1);
    if (new RegExp(`(?<![\\w$])${escapeRegex(prop)}(?![\\w$])\\s*:`).test(inner)) continue;
    if (!inner.trim()) continue;

    const prefix = shape.content.slice(0, openIdx + 1);
    const tail = shape.content.slice(openIdx + 1 + inner.length);
    const sep = /^\s/.test(inner) ? '' : ' ';
    const next = `${prefix} ${prop}: ${value},${sep}${inner}${tail}`;
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `supply '${prop}' in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * TS2322 / TS2367 — a string literal outside the declared union. Every literal
 * the consumers actually use is paired, in order of first appearance, with the
 * union's own members in declaration order; a cardinality mismatch means the
 * vocabularies are not a permutation of each other and nothing is guessed.
 */
function repairUnionLiterals(ctx: RepairContext, errors: ParsedError[]): void {
  const appearance: string[] = [];
  const byKey = new Map<string, { declared: string[]; used: string[] }>();
  const affectedFiles = new Set<string>();

  for (const err of errors) {
    let declared: string[] | null = null;
    let used: string | null = null;
    if (err.code === 'TS2322') {
      const m = err.message.match(NOT_ASSIGNABLE_LITERAL);
      if (!m) continue;
      used = m[1]!;
      declared = unionLiterals(m[2]!);
    } else if (err.code === 'TS2367') {
      const m = err.message.match(NO_OVERLAP);
      if (!m) continue;
      used = m[2]!;
      declared = unionLiterals(m[1]!);
    }
    if (!declared || !used) continue;

    const key = declared.join('|');
    const entry = byKey.get(key);
    if (entry) {
      if (!entry.used.includes(used)) entry.used.push(used);
    } else {
      byKey.set(key, { declared, used: [used] });
    }
    if (!appearance.includes(used)) appearance.push(used);
    affectedFiles.add(err.file);
  }

  // Only a genuine permutation of the union is safe to remap; anything else
  // would be guessing which member the consumer meant.
  const remap = new Map<string, string>();
  for (const { declared, used } of byKey.values()) {
    if (used.length !== declared.length) continue;
    used.forEach((literal, i) => remap.set(literal, declared[i]!));
  }
  if (remap.size === 0) return;

  for (const relFile of affectedFiles) {
    const abs = path.resolve(ctx.projectDir, relFile);
    const shape = readShape(abs);
    if (!shape) continue;
    let next = shape.content;
    for (const [from, to] of remap) {
      const esc = escapeRegex(from);
      next = next
        .replace(new RegExp(`(\\b[A-Za-z_$][\\w$]*\\s*:\\s*)(['"])${esc}\\2`, 'g'), `$1'${to}'`)
        .replace(new RegExp(`(\\.[A-Za-z_$][\\w$]*\\s*(?:===|==|!==|!=)\\s*)(['"])${esc}\\2`, 'g'), `$1'${to}'`);
    }
    if (next === shape.content) continue;
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `align literals with the declared union in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * TS2322 — `null` supplied where the declared type accepts `undefined`.
 */
function repairNullToUndefined(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2322') continue;
    const match = err.message.match(NOT_ASSIGNABLE_NULL);
    if (!match) continue;
    if (!/(^|\|)\s*undefined\s*($|\|)/.test(match[1]!.trim())) continue;

    const abs = path.resolve(ctx.projectDir, err.file);
    const shape = readShape(abs);
    if (!shape) continue;
    const offset = offsetOf(shape.sf, err.line, err.col);
    if (offset < 0) continue;
    const window = shape.content.slice(offset, offset + 240);
    const found = window.match(/\bnull\b/);
    if (!found) continue;
    const at = offset + found.index!;
    if (at > 0 && /[\w$!?.]/.test(shape.content[at - 1]!)) continue;

    const next = `${shape.content.slice(0, at)}undefined${shape.content.slice(at + 4)}`;
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `use 'undefined' for null in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

function declarationMemberNames(decl: DeclInfo): Set<string> | null {
  const members = typeMembersOf(decl.node);
  if (!members) return null;
  const names = new Set<string>();
  for (const member of members) {
    if (member.name && ts.isIdentifier(member.name)) names.add(member.name.text);
  }
  return names;
}

function objectLiteralOf(shape: ModuleShape, name: string): ts.ObjectLiteralExpression | null {
  for (const st of shape.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
      if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) return decl.initializer;
    }
  }
  return null;
}

function exportedObjectLiteralNames(shape: ModuleShape): string[] {
  const out: string[] = [];
  for (const st of shape.statements) {
    if (!ts.isVariableStatement(st) || !hasModifier(st, ts.SyntaxKind.ExportKeyword)) continue;
    for (const decl of st.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
        out.push(decl.name.text);
      }
    }
  }
  return out;
}

function propertyValue(
  literal: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  key: string,
): ts.Expression | null {
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name.getText(sf) !== key) continue;
    return prop.initializer;
  }
  return null;
}

function resolveInitializer(shape: ModuleShape, expr: ts.Expression | null): ts.Expression | null {
  if (!expr) return null;
  if (ts.isObjectLiteralExpression(expr)) return expr;
  if (ts.isIdentifier(expr)) {
    for (const st of shape.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === expr.text && decl.initializer) return decl.initializer;
      }
    }
  }
  return null;
}

function templateDeclaresKey(template: ModuleShape, base: string, key: string): boolean {
  const literal = objectLiteralOf(template, base);
  if (!literal) return false;
  return topLevelKeysOfObjectLiteral(literal, template.sf).includes(key);
}

function templateDeclaresChain(template: ModuleShape, base: string, chain: string[]): boolean {
  const literal = objectLiteralOf(template, base);
  if (!literal) return false;
  if (!topLevelKeysOfObjectLiteral(literal, template.sf).includes(chain[0]!)) return false;
  if (chain.length === 1) return true;
  const inner = resolveInitializer(template, propertyValue(literal, template.sf, chain[0]!));
  if (!inner || !ts.isObjectLiteralExpression(inner)) return false;
  return topLevelKeysOfObjectLiteral(inner, template.sf).includes(chain[1]!);
}

/** Every `base.member(.member)` read of `base` anywhere in the project. */
function memberChainsUsed(index: ProjectIndex, base: string): string[][] {
  const chains: string[][] = [];
  for (const shape of index.shapes.values()) {
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === base) {
        const chain = [node.name.text];
        const parent = node.parent;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) chain.push(parent.name.text);
        chains.push(chain);
      }
      ts.forEachChild(node, visit);
    };
    visit(shape.sf);
  }
  return chains;
}

/** Names pulled out of `const { a, b } = base`, which read `base.a` and `base.b`. */
function destructuredFrom(index: ProjectIndex, base: string): string[] {
  const names: string[] = [];
  for (const shape of index.shapes.values()) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
        let init = node.initializer;
        while (init && (ts.isAsExpression(init) || ts.isParenthesizedExpression(init))) init = init.expression;
        if (init && ts.isIdentifier(init) && init.text === base) {
          for (const element of node.name.elements) {
            if (element.name && ts.isIdentifier(element.name)) names.push(element.name.text);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(shape.sf);
  }
  return names;
}

function filesImporting(ctx: RepairContext, moduleFile: string): string[] {
  const target = path.resolve(moduleFile);
  const out: string[] = [];
  for (const file of ctx.index.files) {
    const shape = ctx.index.shapes.get(file);
    if (!shape) continue;
    for (const st of shape.statements) {
      if (!ts.isImportDeclaration(st)) continue;
      const spec = (st.moduleSpecifier as ts.StringLiteralLike).text;
      const resolved = resolveModuleFile(spec, file, ctx.projectDir);
      if (resolved && path.resolve(resolved) === target) {
        out.push(file);
        break;
      }
    }
  }
  return out;
}

/**
 * The production template may replace a generated shared module only when it
 * is a superset of it: every name the module exports, every member of every
 * shared type, and every member a consumer actually reads off an exported
 * object literal. A superset loses nothing, so the replacement cannot break a
 * consumer that compiled against the generated module.
 */
function isTemplateSuperset(current: ModuleShape, template: ModuleShape, ctx: RepairContext): boolean {
  const failures: string[] = [];
  for (const name of current.namedExports) {
    if (!template.namedExports.has(name)) failures.push(`missing export '${name}'`);
  }
  for (const [name, decl] of current.decls) {
    if (!decl.hasExport) continue;
    const target = template.decls.get(name);
    if (!target) continue;
    const have = declarationMemberNames(decl);
    const want = declarationMemberNames(target);
    if (!have || !want) continue;
    for (const member of have) if (!want.has(member)) failures.push(`missing member '${name}.${member}'`);
  }
  const bases = new Set([...exportedObjectLiteralNames(current), ...exportedObjectLiteralNames(template)]);
  for (const base of bases) {
    for (const chain of memberChainsUsed(ctx.index, base)) {
      if (!templateDeclaresChain(template, base, chain)) failures.push(`missing chain '${base}.${chain.join('.')}'`);
    }
    for (const name of destructuredFrom(ctx.index, base)) {
      if (!templateDeclaresKey(template, base, name)) failures.push(`missing key '${base}.${name}'`);
    }
  }
  if (failures.length > 0 && process.env.HAG_CONTRACT_DEBUG) {
    console.error(`[contract] ${current.file} is not covered by the template: ${[...new Set(failures)].join(', ')}`);
  }
  return failures.length === 0;
}

/**
 * An error reported *inside* a shared module implicates that module only when
 * it names something the module itself declares — a name, a type, a member of
 * its own contract. That is the drift the canonical pair repairs: a module
 * contradicting its own declarations. An error about something the module
 * merely consumes (an imported type, a label) is repaired where it was
 * reported and leaves the shared surface alone.
 */
function namesOwnDeclaration(shape: ModuleShape | undefined, message: string): boolean {
  if (!shape) return false;
  for (const decl of shape.decls.values()) {
    if (new RegExp(`(?<![\\w$])${escapeRegex(decl.name)}(?![\\w$])`).test(message)) return true;
    for (const member of declarationMemberNames(decl) ?? []) {
      if (message.includes(`'${member}'`)) return true;
    }
  }
  return false;
}

/**
 * A generated `src/lib/types.ts` + `src/lib/db.ts` pair whose surface the
 * production template strictly covers is replaced by that pair, atomically:
 * the template `db` module imports the template `types` module, so restoring
 * one without the other would leave an import nothing declares.
 */
function restoreCanonicalSharedModules(ctx: RepairContext, errors: ParsedError[]): string[] {
  const typesPath = path.join(ctx.projectDir, 'src', 'lib', 'types.ts');
  const dbPath = path.join(ctx.projectDir, 'src', 'lib', 'db.ts');
  if (!isFile(typesPath) || !isFile(dbPath)) return [];

  // Only a diagnostic about the shared surface — a name, export, or member a
  // module does not provide — can justify replacing that surface, as can a
  // diagnostic inside one of the shared modules about something that module
  // itself declares: a file that does not typecheck against its own
  // declarations is exactly the drift the canonical pair repairs. Anything
  // else (a label, a literal, a null) is repaired where it was reported.
  const sharedFiles = new Set([path.resolve(typesPath), path.resolve(dbPath)]);
  const implicated = new Set(
    errors
      .filter(err => {
        if (SURFACE_CODES.has(err.code)) return true;
        const abs = path.resolve(ctx.projectDir, err.file);
        if (!sharedFiles.has(abs)) return false;
        return namesOwnDeclaration(ctx.index.shapes.get(abs), err.message);
      })
      .map(err => path.resolve(ctx.projectDir, err.file)),
  );
  if (implicated.size === 0) return [];
  const involved = [typesPath, dbPath].some(
    file =>
      implicated.has(path.resolve(file)) ||
      filesImporting(ctx, file).some(imp => implicated.has(path.resolve(imp))),
  );
  if (!involved) return [];

  const typesShape = readShape(typesPath);
  const dbShape = readShape(dbPath);
  if (!typesShape || !dbShape) return [];
  if (typesShape.content === CANONICAL_LIB_TYPES && dbShape.content === CANONICAL_LIB_DB) return [];

  const typesTemplate = buildModuleShape('types.ts', CANONICAL_LIB_TYPES);
  const dbTemplate = buildModuleShape('db.ts', CANONICAL_LIB_DB);
  if (!isTemplateSuperset(typesShape, typesTemplate, ctx)) return [];
  if (!isTemplateSuperset(dbShape, dbTemplate, ctx)) return [];

  const restored: string[] = [];
  for (const [file, shape, template] of [
    [typesPath, typesShape, CANONICAL_LIB_TYPES],
    [dbPath, dbShape, CANONICAL_LIB_DB],
  ] as const) {
    const rel = path.relative(ctx.projectDir, file);
    if (writeIfChanged(file, shape.content, template, ctx.fixes, `restore the canonical shared contract in ${rel}`)) {
      restored.push(path.resolve(file));
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
  return restored;
}

const NOT_ASSIGNABLE = /^Type '([^']+)' is not assignable to type '([^']+)'/;
const JSX_PROPS_TARGET = /^IntrinsicAttributes & ([A-Za-z_$][\w$]*)/;

/** Drop the `| null` / `| undefined` that make a value's type unreadable. */
function stripNullish(text: string): string {
  return text
    .split('|')
    .map(part => part.trim())
    .filter(part => part !== 'null' && part !== 'undefined')
    .join('|')
    .trim();
}

function parseObjectTypeMembers(text: string): Array<{ name: string; type: string }> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  const inner = trimmed.slice(1, -1);
  const out: Array<{ name: string; type: string }> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if ((ch === ';' || i === inner.length) && depth === 0) {
      const segment = inner.slice(start, i).trim();
      const match = segment.match(/^([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]+)$/);
      if (match) out.push({ name: match[1]!, type: match[2]!.trim() });
      start = i + 1;
    }
  }
  return out;
}

/** Every declared property in the project whose written type is `typeText`. */
function propertyNamesWithType(ctx: RepairContext, typeText: string): Set<string> {
  const want = typeText.replace(/\s+/g, '');
  const names = new Set<string>();
  for (const shape of ctx.index.shapes.values()) {
    const visit = (node: ts.Node): void => {
      if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.type) {
        if (
          node.name &&
          ts.isIdentifier(node.name) &&
          node.type.getText(shape.sf).replace(/\s+/g, '') === want
        ) {
          names.add(node.name.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(shape.sf);
  }
  return names;
}

function pickUnwrapMember(
  members: Array<{ name: string; type: string }>,
  target: string,
  hint: string | undefined,
): string | null {
  const wanted = target.replace(/\s+/g, '');
  const assignable =
    wanted === 'ReactNode'
      ? ['string', 'number', 'boolean', 'ReactNode', 'Element']
      : [wanted];
  const candidates = members.filter(member =>
    assignable.includes(stripNullish(member.type).replace(/\s+/g, '')),
  );
  if (candidates.length === 0) return null;
  if (hint && candidates.some(member => member.name === hint)) return hint;
  const message = candidates.find(member => member.name === 'message');
  if (message) return message.name;
  return candidates.length === 1 ? candidates[0]!.name : null;
}

function jsxTargetExpression(sf: ts.SourceFile, offset: number): { node: ts.Expression; hint?: string } | null {
  let attribute: ts.JsxAttribute | null = null;
  let expression: ts.JsxExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (node.getStart(sf) <= offset && offset <= node.getEnd()) {
      if (ts.isJsxAttribute(node)) attribute = node;
      if (ts.isJsxExpression(node)) expression = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (expression) {
    const found: ts.JsxExpression = expression;
    return found.expression ? { node: found.expression } : null;
  }
  if (attribute) {
    const found: ts.JsxAttribute = attribute;
    if (found.initializer && ts.isJsxExpression(found.initializer) && found.initializer.expression) {
      return { node: found.initializer.expression, hint: found.name.getText(sf) };
    }
  }
  return null;
}

/**
 * TS2322 where the value is an object envelope (`{ message, code }`) and the
 * target wants its scalar (`string`, `ReactNode`). The member to read is the
 * envelope's own member assignable to that target — never a guess about which
 * property the caller meant.
 */
function repairErrorMessageUnwrap(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2322') continue;
    const match = err.message.match(NOT_ASSIGNABLE);
    if (!match) continue;
    const source = stripNullish(match[1]!);
    const target = stripNullish(match[2]!);
    if (!source.startsWith('{')) continue;
    if (target !== 'string' && target !== 'ReactNode') continue;

    const members = parseObjectTypeMembers(source);
    if (members.length === 0) continue;
    const abs = path.resolve(ctx.projectDir, err.file);
    const shape = readShape(abs);
    if (!shape) continue;
    const offset = offsetOf(shape.sf, err.line, err.col);
    if (offset < 0) continue;
    const value = jsxTargetExpression(shape.sf, offset);
    if (!value) continue;
    const member = pickUnwrapMember(members, target, value.hint);
    if (!member) continue;

    const accesses: ts.PropertyAccessExpression[] = [];
    const collect = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) accesses.push(node);
      ts.forEachChild(node, collect);
    };
    collect(value.node);

    const owners = propertyNamesWithType(ctx, source);
    let selected: ts.Node[] = owners.size > 0
      ? accesses.filter(access => owners.has(access.name.text))
      : accesses;
    if (selected.length === 0 && ts.isIdentifier(value.node)) selected = [value.node];
    if (selected.length === 0) continue;

    const edits: Array<{ at: number; text: string }> = [];
    for (const node of selected) {
      const at = node.getEnd();
      const after = shape.content.slice(at, at + member.length + 3);
      if (after.startsWith(`.${member}`) || after.startsWith(`?.${member}`)) continue;
      edits.push({ at, text: `?.${member}` });
    }
    if (edits.length === 0) continue;

    let next = shape.content;
    for (const edit of edits.sort((a, b) => b.at - a.at)) {
      next = `${next.slice(0, edit.at)}${edit.text}${next.slice(edit.at)}`;
    }
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `read '${member}' off the envelope in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/** True when the component's props are destructured with a rest element. */
function componentForwardsRestProps(ctx: RepairContext, name: string): boolean {
  for (const shape of ctx.index.shapes.values()) {
    const decl = shape.decls.get(name);
    if (!decl || (decl.kind !== 'function' && decl.kind !== 'variable')) continue;
    const param = firstParameterOf(decl.node);
    if (!param) return true;
    if (param.name && ts.isObjectBindingPattern(param.name)) {
      return param.name.elements.some(element => element.dotDotDotToken !== undefined);
    }
    return true;
  }
  return true;
}

function firstParameterOf(node: ts.Statement): ts.ParameterDeclaration | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return node.parameters[0];
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        return init.parameters[0];
      }
    }
  }
  return undefined;
}

function jsxAttributeAt(sf: ts.SourceFile, offset: number): ts.JsxAttribute | null {
  let found: ts.JsxAttribute | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.getStart(sf) <= offset && offset <= node.getEnd()) found = node;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** `isLoading` and `loading` name the same idea; nothing else is renamed. */
function nearMissMember(declared: string[], unknownName: string): string | null {
  const normalize = (value: string): string =>
    value.replace(/^(is|has|should|can)/, '').toLowerCase();
  const wanted = normalize(unknownName);
  const hits = declared.filter(name => normalize(name) === wanted);
  return hits.length === 1 ? hits[0]! : null;
}

/**
 * TS2322 against `IntrinsicAttributes & Props` — an attribute the component
 * never declared. A near-miss on the component's own props is adopted at the
 * call site (`loading` -> `isLoading`); anything else is dropped, which is
 * provably inert because an undeclared prop cannot reach a component that
 * does not forward a rest element.
 */
function repairUnknownJsxProp(ctx: RepairContext, errors: ParsedError[]): void {
  for (const err of errors) {
    if (err.code !== 'TS2322') continue;
    const match = err.message.match(NOT_ASSIGNABLE);
    if (!match) continue;
    const targetMatch = match[2]!.match(JSX_PROPS_TARGET);
    if (!targetMatch) continue;
    const used = parseObjectTypeMembers(stripNullish(match[1]!));
    if (used.length === 0) continue;

    const abs = path.resolve(ctx.projectDir, err.file);
    const shape = readShape(abs);
    if (!shape) continue;
    const offset = offsetOf(shape.sf, err.line, err.col);
    if (offset < 0) continue;
    const attribute = jsxAttributeAt(shape.sf, offset);
    if (!attribute) continue;
    const attributes = attribute.parent;
    if (!ts.isJsxAttributes(attributes)) continue;
    const element = attributes.parent;
    if (!ts.isJsxOpeningElement(element) && !ts.isJsxSelfClosingElement(element)) continue;

    const tagName = element.tagName.getText(shape.sf);
    if (tagName.includes('.') || tagName[0] !== tagName[0]!.toUpperCase()) continue;

    let declaredNames: string[] = [];
    for (const file of ctx.index.files) {
      const candidate = ctx.index.shapes.get(file) ?? readShape(file);
      const decl = candidate?.decls.get(targetMatch[1]!);
      const members = decl ? typeMembersOf(decl.node) : null;
      if (candidate && members) {
        declaredNames = members
          .map(member => (member.name ? member.name.getText(candidate.sf) : ''))
          .filter(name => name !== '');
        break;
      }
    }
    if (declaredNames.length === 0) continue;
    const unknown = used
      .map(prop => prop.name)
      .filter(name => !declaredNames.includes(name) && name !== 'key' && name !== 'ref');
    if (unknown.length === 0) continue;

    const edits: Array<{ start: number; end: number; text: string }> = [];
    for (const name of unknown) {
      const attr = element.attributes.properties.find(
        prop => ts.isJsxAttribute(prop) && prop.name.getText(shape.sf) === name,
      );
      if (!attr || !ts.isJsxAttribute(attr)) continue;
      const rename = nearMissMember(declaredNames, name);
      if (rename) {
        edits.push({ start: attr.name.getStart(shape.sf), end: attr.name.getEnd(), text: rename });
        continue;
      }
      if (componentForwardsRestProps(ctx, tagName)) continue;
      let start = attr.getStart(shape.sf);
      while (start > 0 && /\s/.test(shape.content[start - 1]!)) start--;
      edits.push({ start, end: attr.getEnd(), text: '' });
    }
    if (edits.length === 0) continue;

    let next = shape.content;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.end)}`;
    }
    const rel = path.relative(ctx.projectDir, abs);
    if (writeIfChanged(abs, shape.content, next, ctx.fixes, `align <${tagName}> attributes with its props in ${rel}`)) {
      ctx.index = buildIndex(ctx.projectDir);
    }
  }
}

/**
 * Apply every cross-file contract repair implied by `errorLines` and return the
 * number of edits written to disk.
 */
export function repairCrossFileContracts(projectDir: string, errorLines: string[]): number {
  const parsed = parseErrors(errorLines);
  if (parsed.length === 0) return 0;

  const ctx: RepairContext = { projectDir, index: buildIndex(projectDir), fixes: [] };

  // A wholesale restore rewrites both shared modules, so every diagnostic
  // recorded against them refers to lines that no longer exist. Everything
  // else keeps its coordinates.
  const restored = restoreCanonicalSharedModules(ctx, parsed);
  const errors =
    restored.length > 0
      ? parsed.filter(err => !restored.includes(path.resolve(projectDir, err.file)))
      : parsed;

  // Order matters: the line-number driven passes are the only ones that must
  // run before anything inserts lines into a file.
  repairLabeledInitializer(ctx, errors);
  repairErrorMessageUnwrap(ctx, errors);
  repairUnknownJsxProp(ctx, errors);
  repairMissingExports(ctx, errors);
  repairTemplateDeclarations(ctx, errors);
  ctx.index = buildIndex(projectDir);
  repairMissingImports(ctx, errors);
  ctx.index = buildIndex(projectDir);
  repairMissingProperties(ctx, errors);
  repairSharedModuleMembers(ctx, errors);
  ctx.index = buildIndex(projectDir);
  repairSuggestedMember(ctx, errors);
  repairRequiredMember(ctx, errors);
  repairUnionLiterals(ctx, errors);
  repairNullToUndefined(ctx, errors);

  return ctx.fixes.length;
}


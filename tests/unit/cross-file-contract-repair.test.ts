import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import * as ts from 'typescript';

import { repairCrossFileContracts } from '../../benchmarks/cross-file-contract-repair.js';
import {
  CANONICAL_LIB_DB,
  CANONICAL_LIB_TYPES,
  CANONICAL_TYPES_EXPORTS,
  CANONICAL_DB_EXPORTS
} from '../../benchmarks/orchestrator-shared-templates.js';

const created: string[] = [];

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hag-contract-'));
  created.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

function read(dir: string, rel: string): string {
  return readFileSync(path.join(dir, rel), 'utf-8');
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('repairCrossFileContracts — TS2305 / TS2614 missing export', () => {
  it('sources an absent shared type from the canonical template', () => {
    const dir = project({
      'src/lib/types.ts': CANONICAL_LIB_TYPES,
      'src/app/api/auth/login/route.ts':
        "import { LoginRequest } from '@/lib/types';\nexport const schema = {} as Record<string, LoginRequest>;\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/auth/login/route.ts(1,10): error TS2305: Module '\"@/lib/types\"' has no exported member 'LoginRequest'.",
    ]);

    expect(fixes).toBe(0);
    const types = read(dir, 'src/lib/types.ts');
    expect(types).toBe(CANONICAL_LIB_TYPES);
  });

  it('exports a local declaration that exists but is not exported', () => {
    const dir = project({
      'src/lib/db.ts': 'function getWorkItems(): string[] {\n  return [];\n}\n',
      'src/app/api/ai/run/route.ts': "import { getWorkItems } from '@/lib/db';\nexport const items = getWorkItems();\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/ai/run/route.ts(1,10): error TS2305: Module '\"@/lib/db\"' has no exported member 'getWorkItems'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/lib/db.ts')).toContain('export function getWorkItems(): string[]');
  });

  it('re-exports a differently-cased default export instead of inventing a module', () => {
    const dir = project({
      'src/components/navbar.tsx': 'export default function NavBar() {\n  return null;\n}\n',
      'src/app/layout.tsx': "import { Navbar } from '@/components/navbar';\nexport const nav = Navbar;\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/layout.tsx(1,10): error TS2614: Module '\"@/components/navbar\"' has no exported member 'Navbar'. Did you mean to use 'import Navbar from \"@/components/navbar\"' instead?",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/components/navbar.tsx')).toContain('export { NavBar as Navbar };');
  });

  it('restores canonical DB member when fixture omits exported symbol', () => {
    const dir = project({
      'src/lib/types.ts': CANONICAL_LIB_TYPES,
      'src/lib/db.ts': CANONICAL_LIB_DB.replace('export function findUserByEmail', 'function findUserByEmail'),
      'src/app/api/auth/login/route.ts':
        "import { findUserByEmail } from '@/lib/db';\nexport const found = findUserByEmail('a@b.co');\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/auth/login/route.ts(1,10): error TS2305: Module '\"@/lib/db\"' has no exported member 'findUserByEmail'.",
    ]);

    expect(fixes).toBeGreaterThan(0);
    const db = read(dir, 'src/lib/db.ts');
    expect(db).toContain('export function findUserByEmail');
    expect(db).toContain('export const users');
  });
});

describe('repairCrossFileContracts — TS2339 missing property', () => {
  it('reuses the shape a sibling type already models, marked optional when literals omit it', () => {
    const dir = project({
      'src/lib/types.ts':
        'export type AiContext = {\n  inputs: {\n    description: string;\n    keywords?: string[];\n  };\n};\n\n' +
        'export type WorkItem = {\n  id: string;\n  status: string;\n};\n',
      'src/app/api/feedback/route.ts':
        "import type { WorkItem } from '@/lib/types';\n" +
        "const seed: WorkItem[] = [{ id: 'a', status: 'done' }];\n" +
        'export const description = seed[0]!.inputs?.description;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/feedback/route.ts(3,40): error TS2339: Property 'inputs' does not exist on type 'WorkItem'.",
    ]);

    expect(fixes).toBe(1);
    const types = read(dir, 'src/lib/types.ts');
    expect(types).toContain('inputs?:');
    expect(types).toContain('description: string;');
    expect(types).toContain('keywords?: string[];');
    // existing literals do not carry `inputs`, so it must stay optional
    expect(types).toContain('status: string;');
  });
});

describe('repairCrossFileContracts — TS2304 / TS2552 unresolved name', () => {
  it('imports the symbol from the single module that exports it', () => {
    const dir = project({
      'src/lib/db.ts': 'export function getWorkItems(): string[] {\n  return [];\n}\n',
      'src/app/api/ai/run/route.ts':
        "import { addWorkItem } from '@/lib/db';\nexport function add(item: string): void {\n  addWorkItem(item);\n}\n" +
        'export const items = getWorkItems();\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/ai/run/route.ts(4,31): error TS2552: Cannot find name 'getWorkItems'. Did you mean 'addWorkItem'?",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/api/ai/run/route.ts')).toContain('getWorkItems');
    expect(read(dir, 'src/app/api/ai/run/route.ts')).toMatch(/import \{[^}]*getWorkItems[^}]*\} from '@\/lib\/db';/);
  });

  it('leaves an unresolved name alone when no module exports it', () => {
    const dir = project({
      'src/lib/db.ts': 'export const seed: number = 1;\n',
      'src/app/api/x/route.ts': 'export const value = missingThing;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/x/route.ts(1,24): error TS2304: Cannot find name 'missingThing'.",
    ]);

    expect(fixes).toBe(0);
  });
});

describe('repairCrossFileContracts — TS2693 type used as a value', () => {
  const types = 'export type UserPrefs = {\n  theme: string;\n  maxResults: number;\n};\n';

  it('restores the missing const only when the identifier is also unresolved', () => {
    const dir = project({
      'src/lib/types.ts': types,
      'src/lib/db.ts':
        'import type { UserPrefs } from "@/lib/types";\n\n' +
        'demoPrefs: UserPrefs = {\n  theme: "dark",\n  maxResults: 5\n};\n\n' +
        'export function apply(): UserPrefs {\n  return demoPrefs;\n}\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      'src/lib/db.ts(3,12): error TS2693: \'UserPrefs\' only refers to a type, but is being used as a value here.',
      "src/lib/db.ts(7,10): error TS2304: Cannot find name 'demoPrefs'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/lib/db.ts')).toContain('const demoPrefs: UserPrefs = {');
  });

  it('does not touch a type-as-value error with no paired unresolved name', () => {
    const before = 'import type { UserPrefs } from "@/lib/types";\n\ndemoPrefs: UserPrefs = { theme: "dark" };\n';
    const dir = project({
      'src/lib/types.ts': types,
      'src/lib/db.ts': before,
    });

    const fixes = repairCrossFileContracts(dir, [
      'src/lib/db.ts(3,12): error TS2693: \'UserPrefs\' only refers to a type, but is being used as a value here.',
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/lib/db.ts')).toBe(before);
  });
});

describe('repairCrossFileContracts — safety', () => {
  it('returns zero for diagnostics it has no evidence for', () => {
    const dir = project({
      'src/lib/types.ts': 'export type A = { n: number };\n',
      'src/lib/types2.ts': 'export type B = { n: number };\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      'src/lib/types2.ts(1,20): error TS2322: Type \'string\' is not assignable to type \'number\'.',
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/lib/types.ts')).toBe('export type A = { n: number };\n');
  });

  it('still resolves the consumer when a UTF-8 BOM prefixes the first diagnostic', () => {
    const dir = project({
      'src/lib/db.ts': 'export function getWorkItems(): string[] {\n  return [];\n}\n',
      'src/app/api/x/route.ts': 'export const items = getWorkItems();\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "\uFEFFsrc/app/api/x/route.ts(1,31): error TS2552: Cannot find name 'getWorkItems'. Did you mean 'items'?",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/api/x/route.ts')).toMatch(/import \{ getWorkItems \} from '@\/lib\/db';/);
  });
});

describe('production template shared contract', () => {
  it('compiles the template types and db modules together', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-template-contract-'));
    created.push(dir);
    const typesPath = path.join(dir, 'types.ts');
    const dbPath = path.join(dir, 'db.ts');
    writeFileSync(typesPath, CANONICAL_LIB_TYPES, 'utf-8');
    writeFileSync(dbPath, CANONICAL_LIB_DB, 'utf-8');

    const program = ts.createProgram([typesPath, dbPath], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
    });

    const diagnostics = [
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ].filter(d => !d.file || !d.file.fileName.includes('node_modules'));

    const formatted = diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(formatted).toEqual([]);
  });
});

describe('repairCrossFileContracts — TS2322 shape drift at the consumer', () => {
  it('supplies a required member rather than relaxing the shared contract', () => {
    const dir = project({
      'src/lib/types.ts':
        "export interface Envelope<T> {\n  data?: T;\n  status: 'pending' | 'ready';\n}\n",
      'src/app/api/items/route.ts': "export const ok = () => ({ data: 'hi' });\n",
    });

    // The detail line is indented under its header; both have to be folded
    // together before this drift is visible at all.
    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,1): error TS2322: Type '{ data: string; }' is not assignable to type 'Envelope<string>'.",
      "  Property 'status' is missing in type '{ data: string; }' but required in type 'Envelope<string>'.",
    ]);

    expect(fixes).toBeGreaterThan(0);
    const route = read(dir, 'src/app/api/items/route.ts');
    expect(route).toContain("status: 'pending'");
    expect(route).toContain("data: 'hi'");
    expect(read(dir, 'src/lib/types.ts')).toContain("status: 'pending' | 'ready';");
  });

  it('leaves the shared type alone when no default can be derived', () => {
    const before = 'export const ok = () => ({ data: 1 });\n';
    const dir = project({
      'src/lib/types.ts': 'export interface Envelope<T> {\n  data?: T;\n  meta: Record<string, unknown>;\n}\n',
      'src/app/api/items/route.ts': before,
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,1): error TS2322: Type '{ data: number; }' is not assignable to type 'Envelope<number>'.",
      "  Property 'meta' is missing in type '{ data: number; }' but required in type 'Envelope<number>'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/app/api/items/route.ts')).toBe(before);
  });
});

describe('repairCrossFileContracts — TS2741 initializer literal', () => {
  const types = 'export interface SessionUser {\n  id: string;\n  email: string;\n  passwordHash: string;\n}\n';

  it('supplies the missing member in the initializer the diagnostic points at', () => {
    const dir = project({
      'src/lib/types.ts': types,
      'src/app/api/auth/login/route.ts':
        "import type { SessionUser } from '@/lib/types';\n" +
        'const response: SessionUser = { id: \'u-1\', email: \'a@b.c\' };\n' +
        'export const body = response;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/auth/login/route.ts(2,7): error TS2741: Property 'passwordHash' is missing in type '{ id: string; email: string; }' but required in type 'SessionUser'.",
    ]);

    expect(fixes).toBeGreaterThan(0);
    const route = read(dir, 'src/app/api/auth/login/route.ts');
    expect(route).toContain("passwordHash: ''");
    expect(route).toContain("email: 'a@b.c'");
    expect(read(dir, 'src/lib/types.ts')).toBe(types);
  });

  it('leaves the declaration alone when its initializer is not a literal', () => {
    const dir = project({
      'src/lib/types.ts': types,
      'src/app/api/auth/login/route.ts':
        "import type { SessionUser } from '@/lib/types';\n" +
        'declare function pick(): SessionUser;\n' +
        'const response: SessionUser = pick();\n' +
        'export const body = response;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/auth/login/route.ts(3,7): error TS2741: Property 'passwordHash' is missing in type 'SessionUser' but required in type 'SessionUser'.",
    ]);

    expect(fixes).toBe(0);
  });
});

describe('repairCrossFileContracts — TS2322 / TS2367 union literals', () => {
  const declared = "export interface State {\n  status: 'queued' | 'running' | 'finished';\n}\n";

  it('adopts the declared members, pairing first-use order with declaration order', () => {
    const dir = project({
      'src/lib/types.ts': declared,
      'src/components/panel.tsx':
        "export const a = { status: 'start' };\n" +
        "export const b = { status: 'busy' };\n" +
        "export const c = { status: 'ok' };\n" +
        "export const isBusy = (s: State) => s.status === 'busy';\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      'src/components/panel.tsx(1,20): error TS2322: Type \'"start"\' is not assignable to type \'"queued" | "running" | "finished"\'.',
      'src/components/panel.tsx(2,20): error TS2322: Type \'"busy"\' is not assignable to type \'"queued" | "running" | "finished"\'.',
      'src/components/panel.tsx(3,20): error TS2322: Type \'"ok"\' is not assignable to type \'"queued" | "running" | "finished"\'.',
      'src/components/panel.tsx(4,47): error TS2367: This comparison appears to be unintentional because the types \'"queued" | "running" | "finished"\' and \'"busy"\' have no overlap.',
    ]);

    expect(fixes).toBeGreaterThan(0);
    const panel = read(dir, 'src/components/panel.tsx');
    expect(panel).toContain("status: 'queued'");
    expect(panel).toContain("status: 'running'");
    expect(panel).toContain("status: 'finished'");
    expect(panel).toContain("s.status === 'running'");
    expect(panel).not.toContain("'start'");
    expect(read(dir, 'src/lib/types.ts')).toBe(declared);
  });

  it('refuses to guess when the used literals are not a permutation of the union', () => {
    const before =
      "export const a = { status: 'start' };\n" + "export const b = { status: 'busy' };\n";
    const dir = project({
      'src/lib/types.ts': declared,
      'src/components/panel.tsx': before,
    });

    const fixes = repairCrossFileContracts(dir, [
      'src/components/panel.tsx(1,20): error TS2322: Type \'"start"\' is not assignable to type \'"queued" | "running" | "finished"\'.',
      'src/components/panel.tsx(2,20): error TS2322: Type \'"busy"\' is not assignable to type \'"queued" | "running" | "finished"\'.',
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/components/panel.tsx')).toBe(before);
  });
});

describe('repairCrossFileContracts — TS2304 / TS2552 sourced from the template', () => {
  it('declares an absent shared type from the canonical template and imports it', () => {
    const dir = project({
      'src/lib/types.ts': CANONICAL_LIB_TYPES + 'export interface Envelope<T> {\n  data?: T;\n}\n',
      'src/lib/db.ts': 'export const contexts: ContextItem[] = [];\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/lib/db.ts(1,24): error TS2304: Cannot find name 'ContextItem'.",
    ]);

    expect(fixes).toBeGreaterThan(0);
    expect(read(dir, 'src/lib/types.ts')).toContain('export interface ContextItem');
    expect(read(dir, 'src/lib/db.ts')).toMatch(
      /import type \{[^}]*ContextItem[^}]*\} from '@\/lib\/types';/,
    );
  });

  it('does not source a name the template itself does not declare', () => {
    const before = 'export const value = missingThing;\n';
    const dir = project({
      'src/lib/types.ts': CANONICAL_LIB_TYPES + 'export interface Envelope<T> {\n  data?: T;\n}\n',
      'src/app/api/items/route.ts': before,
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,24): error TS2304: Cannot find name 'missingThing'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/app/api/items/route.ts')).toBe(before);
  });

  it('ranks an ambiguous export by basename so the import is stable', () => {
    const dir = project({
      'src/components/Badge.tsx': 'export function Badge() {\n  return null;\n}\n',
      'src/components/chip.tsx': 'export function Badge() {\n  return null;\n}\n',
      'src/app/api/items/page.tsx': 'export const view = Badge;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/page.tsx(1,24): error TS2304: Cannot find name 'Badge'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/api/items/page.tsx')).toContain("from '@/components/Badge'");
  });
});

describe('repairCrossFileContracts — shared module reconciled to the template', () => {
  it('refuses mutation of shared module with non-canonical member and preserves canonical core', () => {
    const dir = project({
      'src/lib/types.ts': CANONICAL_LIB_TYPES,
      'src/lib/db.ts': CANONICAL_LIB_DB,
      'src/app/api/items/route.ts': 'export const find = () => db.workItems.getAll();\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,25): error TS2339: Property 'findUserByEmail' does not exist on type '{ workItems: { getAll: () => string[]; }; }'.",
    ]);

    expect(fixes).toBe(0);
    const db = read(dir, 'src/lib/db.ts');
    expect(db).toContain('export function findUserByEmail');
  });

  it('never invents a member the template does not declare', () => {
    const before = 'export const db = {\n  workItems: {\n    getAll: (): string[] => [],\n  },\n};\n';
    const dir = project({
      'src/lib/types.ts': 'export interface User {\n  id: string;\n}\n',
      'src/lib/db.ts': before,
      'src/app/api/items/route.ts': 'export const rows = db.quizzes;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,24): error TS2339: Property 'quizzes' does not exist on type '{ workItems: { getAll: () => string[]; }; }'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/lib/db.ts')).toBe(before);
    expect(read(dir, 'src/lib/db.ts')).not.toContain('quizzes');
  });

  it('adopts TypeScript\'s own suggestion at the call site', () => {
    const dir = project({
      'src/lib/types.ts': 'export interface User {\n  id: string;\n}\n',
      'src/lib/db.ts': 'export const db = {\n  workItems: {\n    getAll: (): string[] => [],\n  },\n};\n',
      'src/app/api/items/route.ts': 'export const rows = db.workItem.getAll();\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,24): error TS2551: Property 'workItem' does not exist on type '{ workItems: { getAll: () => string[]; }; }'. Did you mean 'workItems'?",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/api/items/route.ts')).toContain('db.workItems.getAll()');
  });
});

describe('repairCrossFileContracts — TS2322 null where undefined is accepted', () => {
  it('replaces null at the reported position', () => {
    const dir = project({
      'src/app/api/items/route.ts': 'export const getId = (): number | undefined => null;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,1): error TS2322: Type 'null' is not assignable to type 'number | undefined'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/api/items/route.ts')).toContain('=> undefined');
    expect(read(dir, 'src/app/api/items/route.ts')).not.toContain('=> null');
  });

  it('leaves null alone when undefined is not part of the target type', () => {
    const before = 'export const getId = (): number => null;\n';
    const dir = project({ 'src/app/api/items/route.ts': before });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(1,1): error TS2322: Type 'null' is not assignable to type 'number'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/app/api/items/route.ts')).toBe(before);
  });
});

describe('repairCrossFileContracts � TS2322 object envelope read as its scalar', () => {
  it("reads the envelope's own message off the JSX attribute", () => {
    const dir = project({
      'src/components/Panel.tsx':
        'type Response = { error?: { message: string; code: string } };\n' +
        'const state: Response = {};\n' +
        '\n' +
        'export function Panel() {\n' +
        '  return <Field label="Email" error={state.error} />;\n' +
        '}\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/components/Panel.tsx(5,31): error TS2322: Type '{ message: string; code: string; } | undefined' is not assignable to type 'string | undefined'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/components/Panel.tsx')).toContain('error={state.error?.message}');
    expect(read(dir, 'src/components/Panel.tsx')).not.toContain('state.error}');
  });

  it('unwraps the envelope inside a JSX expression child', () => {
    const dir = project({
      'src/components/OutputView.tsx':
        'type Response = { error?: { message: string; code: string } };\n' +
        'const state: Response = {};\n' +
        '\n' +
        'export function OutputView() {\n' +
        '  return <p>{state.error}</p>;\n' +
        '}\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/components/OutputView.tsx(5,13): error TS2322: Type '{ message: string; code: string; } | undefined' is not assignable to type 'ReactNode'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/components/OutputView.tsx')).toContain('<p>{state.error?.message}</p>');
  });
});

describe('repairCrossFileContracts � TS2322 attributes the component never declared', () => {
  const button = {
    'src/components/Button.tsx':
      'export interface ButtonProps {\n' +
      '  children: string;\n' +
      '  isLoading?: boolean;\n' +
      '}\n' +
      'export function Button({ children, isLoading }: ButtonProps) {\n' +
      "  return <button>{isLoading ? 'Wait' : children}</button>;\n" +
      '}\n',
  };

  it('adopts the near miss on the component\'s own props', () => {
    const dir = project({
      ...button,
      'src/app/page.tsx':
        "import { Button } from './Button';\n" +
        '\n' +
        'export function Page() {\n' +
        '  return (\n' +
        '    <Button\n' +
        '      loading={true}\n' +
        '    >\n' +
        '      Go\n' +
        '    </Button>\n' +
        '  );\n' +
        '}\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/page.tsx(6,7): error TS2322: Type '{ children: Element; loading: boolean; }' is not assignable to type 'IntrinsicAttributes & ButtonProps'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/page.tsx')).toContain('isLoading={true}');
    expect(read(dir, 'src/app/page.tsx')).not.toContain('loading={');
  });

  it('drops an attribute the component does not forward', () => {
    const dir = project({
      ...button,
      'src/app/page.tsx':
        "import { Button } from './Button';\n" +
        '\n' +
        'export function Page() {\n' +
        '  return (\n' +
        '    <Button\n' +
        '      ariaLabel="Log in"\n' +
        '    >\n' +
        '      Go\n' +
        '    </Button>\n' +
        '  );\n' +
        '}\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/page.tsx(6,7): error TS2322: Type '{ children: Element; ariaLabel: string; }' is not assignable to type 'IntrinsicAttributes & ButtonProps'.",
    ]);

    expect(fixes).toBe(1);
    expect(read(dir, 'src/app/page.tsx')).not.toContain('ariaLabel');
    expect(read(dir, 'src/app/page.tsx')).not.toContain('isLoading');
    expect(read(dir, 'src/app/page.tsx')).toContain('<Button');
  });

  it('leaves the attribute alone when the component forwards a rest element', () => {
    const before =
      "import { Tag } from './Tag';\n" +
      '\n' +
      'export function Page() {\n' +
      '  return <Tag ariaLabel="Hi" />;\n' +
      '}\n';
    const dir = project({
      'src/components/Tag.tsx':
        'export interface TagProps {\n' +
        '  children?: string;\n' +
        '}\n' +
        'export function Tag({ children, ...rest }: TagProps) {\n' +
        '  return <span {...rest}>{children}</span>;\n' +
        '}\n',
      'src/app/page.tsx': before,
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/page.tsx(4,15): error TS2322: Type '{ ariaLabel: string; }' is not assignable to type 'IntrinsicAttributes & TagProps'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/app/page.tsx')).toBe(before);
  });
});

describe('repairCrossFileContracts � canonical shared contract replaced atomically', () => {
  it('replaces both shared modules when the template covers every read', () => {
    const dir = project({
      'src/lib/types.ts': 'export interface User {\n  id: string;\n  email: string;\n}\n',
      'src/lib/db.ts': 'export const db = {\n  workItems: {\n    getAll: (): string[] => [],\n  },\n};\n',
      'src/app/api/items/route.ts':
        "import { db } from '@/lib/db';\n" +
        "import { MissingTestContract } from '@/lib/types';\n" +
        'export const rows = db.workItems.getAll();\n' +
        'export const req = {} as MissingTestContract;\n',
    });

    repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(2,10): error TS2305: Module '\"@/lib/types\"' has no exported member 'MissingTestContract'.",
    ]);

    expect(read(dir, 'src/lib/types.ts')).toBe(CANONICAL_LIB_TYPES);
    expect(read(dir, 'src/lib/db.ts')).toBe(CANONICAL_LIB_DB);
  });

  it('refuses the replacement when a read is missing from the template', () => {
    const types = 'export interface User {\n  id: string;\n}\n';
    const db = 'export const db = {\n  workItems: {\n    getAll: (): string[] => [],\n  },\n};\n';
    const dir = project({
      'src/lib/types.ts': types,
      'src/lib/db.ts': db,
      'src/app/api/items/route.ts':
        "import { db } from '@/lib/db';\n" + 'export const rows = db.quizzes;\n',
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/items/route.ts(2,24): error TS2339: Property 'quizzes' does not exist on type '{ workItems: { getAll: () => string[]; }; }'.",
    ]);

    expect(fixes).toBe(0);
    expect(read(dir, 'src/lib/types.ts')).toBe(types);
    expect(read(dir, 'src/lib/db.ts')).toBe(db);
  });

  it('restores the pair for registration and lookup reads the template declares', () => {
    const dir = project({
      'src/lib/types.ts': 'export interface User {\n  id: string;\n  email: string;\n}\n',
      'src/lib/db.ts': 'export const db = {\n  workItems: {\n    getAll: (): string[] => [],\n  },\n};\n',
      'src/app/api/auth/register/route.ts':
        "import { db } from '@/lib/db';\n" +
        "import { User } from '@/lib/types';\n" +
        "export const user: User = db.createUser({ email: 'a@b.c', name: 'A' });\n" +
        "export const row = db.workItems.get('work-1');\n",
    });

    const fixes = repairCrossFileContracts(dir, [
      "src/app/api/auth/register/route.ts(3,24): error TS2339: Property 'createUser' does not exist on type '{ workItems: { getAll: () => string[]; }; }'.",
      "src/app/api/auth/register/route.ts(4,24): error TS2339: Property 'get' does not exist on type '{ getAll: () => string[]; }'.",
    ]);

    expect(fixes).toBeGreaterThan(0);
    expect(read(dir, 'src/lib/db.ts')).toBe(CANONICAL_LIB_DB);
    expect(read(dir, 'src/lib/types.ts')).toBe(CANONICAL_LIB_TYPES);
  });
});

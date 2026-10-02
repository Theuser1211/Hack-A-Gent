import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { executeImprovement } from '../../cli/improvement/improvement-executor.js';
import { getSourceSyntaxErrors } from '../../benchmarks/source-syntax-gate.js';
import { detectDomains, deriveChallengeAngles } from '../../cli/ideation/idea-library.js';
import { brainstormIdeas } from '../../cli/ideation/idea-engine.js';

function makeProject(tmp: string): string {
  const dir = join(tmp, 'integrity-project');
  mkdirSync(join(dir, 'src', 'app'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'integrity-project',
    scripts: {},
    dependencies: { next: '^14.2.35', react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { typescript: '^5.5.0' },
  }, null, 2));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'es2017', lib: ['dom', 'es2017'], module: 'commonjs', moduleResolution: 'node', jsx: 'preserve', strict: false, noEmit: true, esModuleInterop: true, skipLibCheck: true },
  }, null, 2));
  return dir;
}

/** Orchestrator with a minimal plan so phase writes land in the project dir. */
function makeOrchestrator(tmp: string): InternetHackathonOrchestrator {
  const orch = new InternetHackathonOrchestrator(tmp, undefined, 42, undefined);
  (orch as unknown as { plan: unknown }).plan = { projectName: 'integrity-project' };
  return orch;
}

type PhaseFn = (d: string, files: Array<{ path: string; content: string }>, name: string) => Promise<void>;
const asOrch = (o: InternetHackathonOrchestrator) => o as unknown as { writeAndVerifyPhase: PhaseFn; postProcessProject: (d: string) => void };

describe('final-tree integrity gate (P0e)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'hag-integrity-')); });
  afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* win */ } });

  it('passes a clean tree', () => {
    const dir = makeProject(tmp);
    writeFileSync(join(dir, 'src', 'app', 'page.tsx'), 'export default function Page() { return <div>ok</div>; }\n');
    const orch = makeOrchestrator(tmp);
    expect(() => orch.assertFinalTreeIntegrity(dir)).not.toThrow();
  });

  it('fails when any generated source file does not parse', () => {
    const dir = makeProject(tmp);
    writeFileSync(join(dir, 'src', 'app', 'page.tsx'), 'export default function Page() { return <div>ok</div>;\n');
    writeFileSync(join(dir, 'src', 'lib.ts'), 'export const ok = 1;\n');
    const orch = makeOrchestrator(tmp);
    expect(() => orch.assertFinalTreeIntegrity(dir)).toThrow(/FINAL TREE INTEGRITY GATE FAILED/);
  });

  it('ignores node_modules but checks nested src files', () => {
    const dir = makeProject(tmp);
    mkdirSync(join(dir, 'src', 'deep', 'nested'), { recursive: true });
    writeFileSync(join(dir, 'src', 'deep', 'nested', 'mod.ts'), 'export const a: string = ;\n');
    mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(dir, 'node_modules', 'pkg', 'broken.ts'), 'const = = ;');
    const orch = makeOrchestrator(tmp);
    expect(() => orch.assertFinalTreeIntegrity(dir)).toThrow(/deep.nested.mod\.ts/);
  });
});

describe('writeAndVerifyPhase rollback (P0a): valid file -> later overwrite -> failed verify -> restored', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'hag-rollback-')); });
  afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* win */ } });

  function failingTypecheck(orch: InternetHackathonOrchestrator, errorLine: string): void {
    const spy = vi.spyOn(
      orch as unknown as {
        runTypeCheckOnFiles: (
          projectDir: string,
          phaseFiles: Array<{ path: string; content: string }>,
        ) => Promise<{ success: boolean; errors: string[] }>;
      },
      'runTypeCheckOnFiles',
    );
    spy.mockResolvedValue({ success: false, errors: [errorLine] });
  }

  it('restores a previously valid file to its exact pre-phase content', async () => {
    const dir = makeProject(tmp);
    const valid = 'export const marker = "original-valid";\n';
    writeFileSync(join(dir, 'src', 'feature.ts'), valid);

    const orch = makeOrchestrator(tmp);
    // Parses cleanly (passes the pre-write syntax gate) but can never pass the
    // (stubbed) typecheck, so the phase must roll back after its repair loop.
    failingTypecheck(orch, 'src/feature.ts(1,24): error TS2322: Type \'string\' is not assignable to type \'number\'.');
    await expect(
      asOrch(orch).writeAndVerifyPhase(dir, [{ path: 'src/feature.ts', content: 'export const marker: number = "overwritten-broken";\n' }], 'Test Phase'),
    ).rejects.toThrow(/ROLLED BACK/);

    expect(readFileSync(join(dir, 'src', 'feature.ts'), 'utf-8')).toBe(valid);
  });

  it('deletes files the failed phase created', async () => {
    const dir = makeProject(tmp);
    const orch = makeOrchestrator(tmp);
    failingTypecheck(orch, 'src/generated-new.ts(1,1): error TS2322: Type \'string\' is not assignable to type \'number\'.');
    await expect(
      asOrch(orch).writeAndVerifyPhase(dir, [{ path: 'src/generated-new.ts', content: 'export const marker: number = "nope";\n' }], 'Test Phase'),
    ).rejects.toThrow(/ROLLED BACK/);
    expect(existsSync(join(dir, 'src', 'generated-new.ts'))).toBe(false);
  });

  it('pre-write gate rejects unparseable content before anything touches disk', async () => {
    const dir = makeProject(tmp);
    const orch = makeOrchestrator(tmp);
    await expect(
      asOrch(orch).writeAndVerifyPhase(dir, [{ path: 'src/bad.tsx', content: 'export const x = <div>unclosed' }], 'Test Phase'),
    ).rejects.toThrow(/Syntax validation failed/);
    expect(existsSync(join(dir, 'src', 'bad.tsx'))).toBe(false);
  });
});

describe('syntax gate has no filename-specific stub (P0b)', () => {
  it('rejects a broken ai/run route exactly like every other file', () => {
    const broken = 'export async function POST(req: any) { return new Response(JSON.stringify({data:';
    expect(getSourceSyntaxErrors('src/app/api/ai/run/route.ts', broken).length).toBeGreaterThan(0);
    const valid = 'export async function POST(req: Request) { return Response.json({ data: 1 }); }\n';
    expect(getSourceSyntaxErrors('src/app/api/ai/run/route.ts', valid)).toEqual([]);
  });
});

describe('improvement write gates (P0d)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'hag-gates-')); });
  afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* win */ } });

  it('improvement pass cannot corrupt a validated file', async () => {
    const dir = makeProject(tmp);
    const page = join(dir, 'src', 'app', 'page.tsx');
    writeFileSync(page, 'export default function Page() {\n  return <div>keep me</div>;\n}\n');
    const ok = await executeImprovement({
      id: 'a1', type: 'fix_issue', target: 'src/app/page.tsx', description: 't', priority: 'low',
      expectedScoreIncrease: 1, implementation: 'step one\nstep two',
    }, dir);
    expect(ok).toBe(true);
    const after = readFileSync(page, 'utf-8');
    expect(after).toContain('keep me');
    expect(getSourceSyntaxErrors('page.tsx', after)).toEqual([]);
  });

  it('enhance_ui cannot create an invalid tsx placeholder', async () => {
    const dir = makeProject(tmp);
    const target = join(dir, 'src', 'app', 'newpage.tsx');
    await executeImprovement({
      id: 'a2', type: 'enhance_ui', target: 'src/app/newpage.tsx', description: 't', priority: 'low',
      expectedScoreIncrease: 1, implementation: 'add a hero section',
    }, dir);
    const content = existsSync(target) ? readFileSync(target, 'utf-8') : '';
    expect(getSourceSyntaxErrors('newpage.tsx', content)).toEqual([]);
  });
});

describe('api security gate (auth invariant)', () => {
  it('rejects payloads that echo a password field', () => {
    const bad = "export async function POST(req: Request) {\n  const body = await req.json();\n  return Response.json({ data: { user: { email: body.email, password: body.password } }, status: 201 });\n}\n";
    expect(() => InternetHackathonOrchestrator.assertApiSecurity('src/app/api/auth/register/route.ts', bad))
      .toThrow(/API SECURITY GATE FAILED/);
  });

  it('allows request-side password validation', () => {
    const ok = `export async function POST(req: Request) {
  const body = await req.json();
  if (!body.password) return Response.json({ error: { message: 'required' } }, { status: 400 });
  return Response.json({ data: { user: { email: body.email } } });
}
`;
    expect(() => InternetHackathonOrchestrator.assertApiSecurity('src/app/api/auth/register/route.ts', ok)).not.toThrow();
  });
});

describe('tailwind config enforcement (P1)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'hag-tw-')); });
  afterEach(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* win */ } });

  function withTailwind(tmp: string): string {
    const dir = makeProject(tmp);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'integrity-project', scripts: {},
      dependencies: { next: '^14.2.35', react: '^18.3.1', 'react-dom': '^18.3.1', tailwindcss: '^3.4.0' },
      devDependencies: { typescript: '^5.5.0' },
    }, null, 2));
    writeFileSync(join(dir, 'src', 'app', 'page.tsx'), 'export default function Page() { return <div>ok</div>; }\n');
    return dir;
  }

  it('creates missing tailwind/postcss configs and CSS entry when tailwindcss is declared', () => {
    const dir = withTailwind(tmp);
    const orch = makeOrchestrator(tmp);
    asOrch(orch).postProcessProject(dir);
    expect(existsSync(join(dir, 'tailwind.config.js'))).toBe(true);
    expect(existsSync(join(dir, 'postcss.config.js'))).toBe(true);
    const css = readFileSync(join(dir, 'src', 'app', 'globals.css'), 'utf-8');
    expect(/@tailwind\s+base/.test(css) || /@import\s+["']tailwindcss/.test(css)).toBe(true);
  });

  it('never overwrites existing configs', () => {
    const dir = withTailwind(tmp);
    const custom = 'module.exports = { content: ["./custom/**"], };';
    writeFileSync(join(dir, 'tailwind.config.js'), custom);
    const orch = makeOrchestrator(tmp);
    asOrch(orch).postProcessProject(dir);
    expect(readFileSync(join(dir, 'tailwind.config.js'), 'utf-8')).toBe(custom);
  });
});

describe('ideation contamination fixes (P1)', () => {
  it('no-match fallback derives angles from the challenge, not a fictional brand', () => {
    const domains = detectDomains('fernweh dringley', 'Build a dringley for fernweh collectors.');
    expect(domains.length).toBeGreaterThan(0);
    const titles = domains.flatMap((d) => d.angles.map((a) => a.title));
    expect(titles).not.toContain('Siftline');
  });

  it('challenge-derived angles mention the actual challenge text', () => {
    const angles = deriveChallengeAngles('fernweh dringley', 'Build a dringley for fernweh collectors. Judges value craftsmanship.');
    expect(angles.length).toBeGreaterThan(0);
    const all = angles.map((a) => `${a.title} ${a.line}`).join(' ').toLowerCase();
    expect(all).toContain('dringley');
  });

  it('key features no longer stamp an invented brand core-loop claim', () => {
    const analysis = {
      challenge: { theme: 'agents for humans', problemStatement: 'Build an agent that helps real people' },
      judgingCriteria: [{ name: 'innovation', weight: 50 }, { name: 'impact', weight: 50 }],
    } as unknown as Parameters<typeof brainstormIdeas>[0];
    const result = brainstormIdeas(analysis, null, 7);
    for (const idea of [...result.generated, ...result.shortlist]) {
      for (const feature of idea.keyFeatures) {
        expect(feature.startsWith(`${idea.title} core loop`)).toBe(false);
      }
    }
  });
});

describe('version pin (P2)', () => {
  it('generator no longer pins the vulnerable next baseline', () => {
    const orchSrc = readFileSync('benchmarks/internet-hackathon-orchestrator.ts', 'utf-8');
    expect(orchSrc.includes("next: '^14.2.0'")).toBe(false);
    expect(orchSrc.includes('next@^14.2.0')).toBe(false);
  });
});

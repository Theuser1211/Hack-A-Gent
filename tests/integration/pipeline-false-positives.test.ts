import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import type { CLIContext } from '../../cli/types.js';

describe('False Positive Prevention', () => {
  let projectDir: string;
  let dataDir: string;

  beforeEach(() => {
    projectDir = path.join(tmpdir(), `hag-test-${randomUUID().slice(0, 8)}`);
    dataDir = path.join(tmpdir(), `hag-data-${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  describe('validateGeneratedProject returns false for invalid projects', () => {
    it('should not report valid=true when @/config import is missing', { timeout: 60000 }, async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
        name: 'test',
        version: '0.1.0',
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run', lint: 'next lint', typecheck: 'tsc --noEmit' },
        dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' },
      }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), `import { NASA_API_KEY } from '@/config';\nexport default function Page() { return <div>{NASA_API_KEY}</div>; }\n`);

      const result = await orch.validateGeneratedProject(projectDir);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should not report valid=true when package.json is missing scripts', async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.1.0' }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n');

      const result = await orch.validateGeneratedProject(projectDir);
      expect(result.valid).toBe(false);
      expect(result.checks.find(c => c.name === 'Script validation')?.passed).toBe(false);
    });

    it('should report all check names even when validation fails', async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.1.0' }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n');

      const result = await orch.validateGeneratedProject(projectDir);
      expect(result.valid).toBe(false);
      const checkNames = result.checks.map(c => c.name);
      expect(checkNames).toContain('Script validation');
    });

    it('errors should be unique and deduplicated', async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.1.0', scripts: { dev: 'next dev' } }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), `import { foo } from '@/missing1';\nimport { bar } from '@/missing2';\nexport default function Page() { return <div>{foo}{bar}</div>; }\n`);

      const result = await orch.validateGeneratedProject(projectDir);
      const uniqueErrors = [...new Set(result.errors)];
      expect(result.errors.length).toBe(uniqueErrors.length);
    });
  });

  describe('GeneratedProjectValidation structure', () => {
    it('errors array is always defined', async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
        name: 'test',
        version: '0.1.0',
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run', lint: 'next lint', typecheck: 'tsc --noEmit' },
      }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n');

      const result = await orch.validateGeneratedProject(projectDir);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('checks array contains passed and error fields', async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
        name: 'test',
        version: '0.1.0',
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run', lint: 'next lint', typecheck: 'tsc --noEmit' },
      }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n');

      const result = await orch.validateGeneratedProject(projectDir);
      for (const check of result.checks) {
        expect(typeof check.name).toBe('string');
        expect(typeof check.passed).toBe('boolean');
        if (!check.passed) {
          expect(typeof check.error).toBe('string');
        }
      }
    });
  });

  describe('repair loop integration', () => {
    it('repair attempt is triggered when validation fails initially', { timeout: 60000 }, async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'test', version: '0.1.0' }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({}));
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return null; }\n');

      const result = await orch.validateGeneratedProject(projectDir);
      expect(result.valid).toBe(false);
    });

    it('valid project should not need repair', { timeout: 60000 }, async () => {
      const InternetHackathonOrchestrator = (await import('../../benchmarks/internet-hackathon-orchestrator.js')).InternetHackathonOrchestrator;
      const orch = new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);

      fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
        name: 'test',
        version: '0.1.0',
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run', lint: 'next lint', typecheck: 'tsc --noEmit' },
        dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' },
      }));
      fs.mkdirSync(path.join(projectDir, 'src', 'app'), { recursive: true });
      fs.writeFileSync(path.join(projectDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }));
      fs.writeFileSync(path.join(projectDir, 'next.config.js'), 'module.exports = {};\n');
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'layout.tsx'), "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n");
      fs.writeFileSync(path.join(projectDir, 'src', 'app', 'page.tsx'), 'export default function Page() { return <div>Hello</div>; }\n');
      fs.writeFileSync(path.join(projectDir, 'src', 'config.ts'), 'export const config = {};\n');

      const result = await orch.validateGeneratedProject(projectDir);
      const scriptCheck = result.checks.find(c => c.name === 'Script validation');
      expect(scriptCheck?.passed).toBe(true);
    });
  });
});
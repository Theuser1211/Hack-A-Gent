import { describe, it, expect } from 'vitest';
import { executeImprovement } from '../../cli/improvement/improvement-executor.js';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { ImprovementAction } from '../../cli/improvement/improvement-types.js';

function createTempProject(): string {
  const dir = join(import.meta.dirname, '__temp_improvement_executor__');
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'src', 'app'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app', 'page.tsx'), 'export default function Home() {\n  return <main>Hello</main>;\n}\n');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  return dir;
}

describe('executeImprovement', () => {
  it('adds a test file for add_tests action', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-001',
        type: 'add_tests',
        target: 'tests/Demo.test.tsx',
        description: 'Add tests for Demo component',
        priority: 'high',
        expectedScoreIncrease: 10,
        implementation: 'Write tests for the Demo component',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      expect(existsSync(join(dir, 'tests', 'Demo.test.tsx'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('appends docs for add_docs action when README exists', async () => {
    const dir = createTempProject();
    try {
      writeFileSync(join(dir, 'README.md'), '# Existing Project\n');
      const action: ImprovementAction = {
        id: 'test-002',
        type: 'add_docs',
        target: 'README.md',
        description: 'Improve maintainability',
        priority: 'medium',
        expectedScoreIncrease: 5,
        implementation: 'Add setup instructions and architecture overview',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      const content = readFileSync(join(dir, 'README.md'), 'utf-8');
      expect(content).toContain('Improve maintainability');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('creates README for add_docs when none exists', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-003',
        type: 'add_docs',
        target: 'README.md',
        description: 'Document the project',
        priority: 'medium',
        expectedScoreIncrease: 5,
        implementation: 'Full project documentation',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      expect(existsSync(join(dir, 'README.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns false for unknown action type', async () => {
    const dir = createTempProject();
    try {
      const action = {
        id: 'test-004',
        type: 'unknown_type',
        target: 'file.ts',
        description: 'Something weird',
        priority: 'low' as const,
        expectedScoreIncrease: 0,
        implementation: 'nope',
      } as unknown as ImprovementAction;
      const result = await executeImprovement(action, dir);
      expect(result).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('adds deployment config for add_deployment action', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-005',
        type: 'add_deployment',
        target: 'vercel.json',
        description: 'Deployment configuration',
        priority: 'high',
        expectedScoreIncrease: 8,
        implementation: 'Add Vercel and Docker config',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      expect(existsSync(join(dir, 'vercel.json'))).toBe(true);
      expect(existsSync(join(dir, 'Dockerfile'))).toBe(true);
      expect(existsSync(join(dir, '.env.example'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('creates a new component for add_feature action', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-006',
        type: 'add_feature',
        target: 'src/components/DemoFeature.tsx',
        description: 'Add wow moment feature',
        priority: 'critical',
        expectedScoreIncrease: 15,
        implementation: 'Add a fade-in animation component',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      expect(existsSync(join(dir, 'src', 'components', 'DemoFeature.tsx'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('modifies a file for fix_issue action', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-007',
        type: 'fix_issue',
        target: 'src/app/page.tsx',
        description: 'Fix error handling',
        priority: 'critical',
        expectedScoreIncrease: 12,
        implementation: 'Add error boundary and loading state',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      const content = readFileSync(join(dir, 'src', 'app', 'page.tsx'), 'utf-8');
      expect(content).toContain('Add error boundary');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('handles non-existent target dir gracefully', async () => {
    const dir = createTempProject();
    try {
      const action: ImprovementAction = {
        id: 'test-008',
        type: 'add_feature',
        target: 'deeply/nested/component/Feature.tsx',
        description: 'Add a nested feature',
        priority: 'medium',
        expectedScoreIncrease: 5,
        implementation: 'A deeply nested component',
      };
      const result = await executeImprovement(action, dir);
      expect(result).toBe(true);
      expect(existsSync(join(dir, 'deeply', 'nested', 'component', 'Feature.tsx'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

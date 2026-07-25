import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import { detectFramework, detectDevCommand } from '../../cli/pipeline/runtime-validation.js';

function createMockProject(deps: Record<string, string>, scripts?: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'rv-test-')));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'test-project',
    dependencies: deps,
    scripts: scripts ?? { dev: 'next dev' },
  }));
  return dir;
}

describe('detectFramework', () => {
  it('detects nextjs from next dependency', () => {
    const dir = createMockProject({ next: '^14.0.0' });
    expect(detectFramework(dir)).toBe('nextjs');
  });

  it('detects vite from vite dependency', () => {
    const dir = createMockProject({ vite: '^5.0.0' });
    expect(detectFramework(dir)).toBe('vite');
  });

  it('detects create-react-app from react-scripts', () => {
    const dir = createMockProject({ 'react-scripts': '5.0.0' });
    expect(detectFramework(dir)).toBe('create-react-app');
  });

  it('detects express from express dependency', () => {
    const dir = createMockProject({ express: '^4.18.0' });
    expect(detectFramework(dir)).toBe('express');
  });

  it('detects sveltekit from @sveltejs/kit', () => {
    const dir = createMockProject({ '@sveltejs/kit': '^2.0.0' });
    expect(detectFramework(dir)).toBe('sveltekit');
  });

  it('detects nuxt from nuxt dependency', () => {
    const dir = createMockProject({ nuxt: '^3.0.0' });
    expect(detectFramework(dir)).toBe('nuxt');
  });

  it('returns unknown for empty dependencies', () => {
    const dir = createMockProject({});
    expect(detectFramework(dir)).toBe('unknown');
  });

  it('returns unknown when no package.json', () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'rv-test-')));
    expect(detectFramework(dir)).toBe('unknown');
  });

  it('prefers next over react-scripts when both present', () => {
    const dir = createMockProject({ next: '^14.0.0', 'react-scripts': '5.0.0' });
    expect(detectFramework(dir)).toBe('nextjs');
  });
});

describe('detectDevCommand', () => {
  it('returns dev for nextjs', () => expect(detectDevCommand('nextjs')).toBe('dev'));
  it('returns dev for vite', () => expect(detectDevCommand('vite')).toBe('dev'));
  it('returns start for create-react-app', () => expect(detectDevCommand('create-react-app')).toBe('start'));
  it('returns dev for sveltekit', () => expect(detectDevCommand('sveltekit')).toBe('dev'));
  it('returns start for express', () => expect(detectDevCommand('express')).toBe('start'));
  it('returns dev for nuxt', () => expect(detectDevCommand('nuxt')).toBe('dev'));
  it('returns dev for unknown', () => expect(detectDevCommand('unknown')).toBe('dev'));
});

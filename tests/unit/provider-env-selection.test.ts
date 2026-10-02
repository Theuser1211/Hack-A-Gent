import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ homeDir: '', projDir: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mocks.homeDir };
});

import {
  getLLMConfig,
  loadEnvFileIntoProcess,
  PROVIDER_NATIVE_KEYS,
} from '../../cli/config-manager.js';

const NATIVE_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'NVIDIA_API_KEY'];

let envBackup: Record<string, string | undefined>;

function writeConfig(llm: Record<string, unknown>): void {
  mkdirSync(path.join(mocks.homeDir, '.hackagent'), { recursive: true });
  writeFileSync(
    path.join(mocks.homeDir, '.hackagent', 'config.json'),
    JSON.stringify({ llm, updatedAt: '2026-01-01T00:00:00.000Z' }),
    'utf-8',
  );
}

function writeEnv(env: Record<string, string>): void {
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(path.join(mocks.projDir, '.env'), lines.join('\n'), 'utf-8');
}

beforeEach(() => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hag-prov-'));
  mocks.homeDir = path.join(tmp, 'home');
  mocks.projDir = path.join(tmp, 'proj');
  mkdirSync(mocks.homeDir, { recursive: true });
  mkdirSync(mocks.projDir, { recursive: true });

  envBackup = {};
  for (const key of [...NATIVE_KEYS, 'HACKAGENT_PROVIDER', 'LLM_PROVIDER', 'OPENROUTER_API_KEY']) {
    envBackup[key] = process.env[key];
    delete process.env[key];
  }

  vi.spyOn(process, 'cwd').mockReturnValue(mocks.projDir);

  // Default machine state: config file says nvidia with credentials.
  writeConfig({
    provider: 'nvidia',
    apiKey: 'nvapi-config-file-key',
    model: 'google/gemma-3-12b-it',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(path.dirname(mocks.homeDir), { recursive: true, force: true });
});

describe('provider selection precedence', () => {
  it('auto-selects the provider of a native key found in .env, overriding the config file', () => {
    writeEnv({ GEMINI_API_KEY: 'gm-env-key' });

    const llm = getLLMConfig();
    expect(llm.provider).toBe('gemini');
    // Credentials from the previous provider must not leak into the new one.
    expect(llm.apiKey).toBeUndefined();
    expect(llm.model).toBeUndefined();
  });

  it('syncs .env native keys into process.env without overriding the shell', () => {
    writeEnv({ GEMINI_API_KEY: 'gm-env-key' });

    loadEnvFileIntoProcess();
    expect(process.env.GEMINI_API_KEY).toBe('gm-env-key');

    process.env.GEMINI_API_KEY = 'gm-shell-key';
    loadEnvFileIntoProcess();
    expect(process.env.GEMINI_API_KEY).toBe('gm-shell-key');
  });

  it('lets an explicit HACKAGENT_PROVIDER win over the .env native key', () => {
    writeEnv({ GEMINI_API_KEY: 'gm-env-key' });
    process.env.HACKAGENT_PROVIDER = 'anthropic';

    expect(getLLMConfig().provider).toBe('anthropic');
  });

  it('lets an explicit LLM_PROVIDER win over the .env native key', () => {
    writeEnv({ GEMINI_API_KEY: 'gm-env-key' });
    process.env.LLM_PROVIDER = 'openai';

    expect(getLLMConfig().provider).toBe('openai');
  });

  it('lets HACKAGENT_PROVIDER inside .env win over the native key in the same file', () => {
    writeEnv({ HACKAGENT_PROVIDER: 'anthropic', GEMINI_API_KEY: 'gm-env-key' });

    expect(getLLMConfig().provider).toBe('anthropic');
  });

  it('falls back to the config-file provider when no explicit provider or native key exists', () => {
    writeEnv({ UNRELATED_VAR: 'x' });

    const llm = getLLMConfig();
    expect(llm.provider).toBe('nvidia');
    expect(llm.apiKey).toBe('nvapi-config-file-key');
    expect(llm.model).toBe('google/gemma-3-12b-it');
  });

  it('never auto-detects openrouter from its native key (opt-in only)', () => {
    writeEnv({ OPENROUTER_API_KEY: 'or-key' });

    expect(getLLMConfig().provider).toBe('nvidia');
    expect(PROVIDER_NATIVE_KEYS.some((entry) => entry.provider === 'openrouter')).toBe(false);
  });

  it('detects other native keys (anthropic, openai, nvidia) from .env', () => {
    writeEnv({ ANTHROPIC_API_KEY: 'sk-ant-env' });
    expect(getLLMConfig().provider).toBe('anthropic');

    writeEnv({ OPENAI_API_KEY: 'sk-env' });
    expect(getLLMConfig().provider).toBe('openai');

    writeEnv({ NVIDIA_API_KEY: 'nvapi-env' });
    expect(getLLMConfig().provider).toBe('nvidia');
  });

  it('defaults to openai when nothing is configured anywhere', () => {
    rmSync(path.join(mocks.homeDir, '.hackagent'), { recursive: true, force: true });
    writeEnv({});

    expect(getLLMConfig().provider).toBe('openai');
  });
});

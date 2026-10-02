import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ homeDir: '', projDir: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mocks.homeDir };
});

import { getConfig, loadEnvFile } from '../../cli/config-manager.js';

// `ensureConfig` in cli/index.ts decides whether to announce template fallback
// or send the user through setup. It runs before any command, on the main
// `hag run` path, so a false "no provider" is a first-run blocker: a user who
// correctly exported GEMINI_API_KEY was told their provider was missing.
//
// The logic under test is mirrored here rather than imported because
// cli/index.ts executes main() on import.
const NATIVE_KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'NVIDIA_API_KEY', 'NEBIUS_API_KEY'];
const CUSTOM_KEYS = [...NATIVE_KEYS, 'HACKAGENT_PROVIDER', 'LLM_PROVIDER'];

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

/** Mirrors hasUsableCredential() in cli/index.ts. */
function hasUsableCredential(): boolean {
  const config = getConfig();
  const llm = config?.llm;
  if (!llm) return false;
  if (llm.apiKey) return true;

  const envVars = { ...loadEnvFile(), ...process.env };
  const nativeKeys = NATIVE_KEY_PROVIDERS.find((entry) => entry.provider === llm.provider);
  if (nativeKeys?.envVars.some((key) => envVars[key])) return true;

  if (llm.provider.startsWith('custom:')) {
    const name = llm.provider.slice('custom:'.length);
    const custom = llm.customProviders?.find((entry) => entry.name === name);
    if (custom?.apiKey) return true;
  }
  return false;
}

const NATIVE_KEY_PROVIDERS: Array<{ provider: string; envVars: string[] }> = [
  { provider: 'gemini', envVars: ['GEMINI_API_KEY'] },
  { provider: 'anthropic', envVars: ['ANTHROPIC_API_KEY'] },
  { provider: 'openai', envVars: ['OPENAI_API_KEY'] },
  { provider: 'nvidia', envVars: ['NVIDIA_API_KEY'] },
  { provider: 'nebius', envVars: ['NEBIUS_API_KEY'] },
];

beforeEach(() => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'hag-creds-'));
  mocks.homeDir = path.join(tmp, 'home');
  mocks.projDir = path.join(tmp, 'proj');
  mkdirSync(mocks.homeDir, { recursive: true });
  mkdirSync(mocks.projDir, { recursive: true });

  envBackup = {};
  for (const key of CUSTOM_KEYS) {
    envBackup[key] = process.env[key];
    delete process.env[key];
  }

  vi.spyOn(process, 'cwd').mockReturnValue(mocks.projDir);
  writeConfig({ provider: 'nvidia', apiKey: 'nvapi-config-file-key' });
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(path.dirname(mocks.homeDir), { recursive: true, force: true });
});

describe('a provider-native key counts as a configured credential', () => {
  it('does not report "no provider" when only GEMINI_API_KEY is set', () => {
    // The regression: the native key selects gemini and clears llm.apiKey, so a
    // naive `config.llm.apiKey` check concluded no provider existed.
    writeEnv({ GEMINI_API_KEY: 'gm-env-key' });

    const config = getConfig();
    expect(config?.llm.provider).toBe('gemini');
    expect(config?.llm.apiKey).toBeUndefined();
    expect(hasUsableCredential()).toBe(true);
  });

  it('accepts each supported provider-native key', () => {
    for (const [provider, key] of [
      ['gemini', 'GEMINI_API_KEY'],
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['openai', 'OPENAI_API_KEY'],
      ['nvidia', 'NVIDIA_API_KEY'],
    ] as const) {
      writeEnv({ [key]: 'native-key' });
      expect(getConfig()?.llm.provider, key).toBe(provider);
      expect(hasUsableCredential(), key).toBe(true);
    }
  });

  it('accepts the generic HACKAGENT_API_KEY form', () => {
    writeEnv({ HACKAGENT_PROVIDER: 'openai', HACKAGENT_API_KEY: 'generic-key' });
    expect(hasUsableCredential()).toBe(true);
  });

  it('accepts a custom provider that carries its own key', () => {
    writeConfig({
      provider: 'custom',
      baseUrl: 'https://api.example.com/v1',
      customProviders: [{ name: 'example', baseUrl: 'https://api.example.com/v1', apiKey: 'custom-key' }],
    });
    writeEnv({ HACKAGENT_PROVIDER: 'custom:example' });

    expect(hasUsableCredential()).toBe(true);
  });

  it('still reports no credential when nothing is configured', () => {
    writeEnv({ UNRELATED_VAR: 'x' });
    rmSync(path.join(mocks.homeDir, '.hackagent'), { recursive: true, force: true });

    expect(hasUsableCredential()).toBe(false);
  });

  it('does not treat an unrelated key as a credential', () => {
    rmSync(path.join(mocks.homeDir, '.hackagent'), { recursive: true, force: true });
    writeEnv({ SOME_OTHER_API_KEY: 'nope', HACKAGENT_PROVIDER: 'openai' });

    // The provider is named but no credential backs it.
    expect(getConfig()?.llm.provider).toBe('openai');
    expect(hasUsableCredential()).toBe(false);
  });
});
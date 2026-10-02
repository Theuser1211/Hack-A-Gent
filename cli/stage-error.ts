import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

interface StageErrorResult {
  stage: string;
  what: string;
  fix: string;
  detail?: string;
}

export function formatStageError({ stage, err }: { stage: string; err: unknown }): StageErrorResult {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes('eexist') || lower.includes('already exists')) {
    return {
      stage,
      what: `${stage}: output directory already exists.`,
      fix: 'Remove the existing directory or pass `--force` to overwrite.',
    };
  }
  if (lower.includes('enospc') || lower.includes('disk')) {
    return {
      stage,
      what: `${stage}: insufficient disk space to continue.`,
      fix: 'Free disk space and re-run the pipeline.',
    };
  }
  if (lower.includes('eacces') || lower.includes('permission') || lower.includes('access denied')) {
    return {
      stage,
      what: `${stage}: permission denied writing to the workspace.`,
      fix: 'Use a workspace you have write access to, or run from a writable directory.',
    };
  }
  if (lower.includes('enotdir') || lower.includes('no such file') || lower.includes('enoent')) {
    return {
      stage,
      what: `${stage}: required file or directory is missing.`,
      fix: 'Verify the path is correct and re-run.',
      detail: msg.slice(0, 200),
    };
  }
  if (lower.includes('api key') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
    return {
      stage,
      what: `${stage}: authentication failed — API key missing, invalid, or expired.`,
      fix: 'Run `hag setup` or `hag config --api-key <key>` to reconfigure the provider.',
    };
  }
  if (lower.includes('abort') || lower.includes('timed out')) {
    return {
      stage,
      what: `${stage}: timed out before completing.`,
      fix: 'Increase --timeout, or provider may be overloaded — try again or switch model.',
    };
  }

  const trimmed = msg.length > 200 ? `${msg.slice(0, 200).replace(/\s+\S*$/, '')}...` : msg;
  return {
    stage,
    what: `${stage}: ${trimmed || 'unexpected error'}`,
    fix: 'Re-run with --debug for the full trace. If this persists, run `hag doctor`.',
  };
}

export const ENV_VAR_HINTS: Record<string, string> = {
  OPENAI_API_KEY: 'Set OPENAI_API_KEY in your environment or .env file.',
  ANTHROPIC_API_KEY: 'Set ANTHROPIC_API_KEY in your environment or .env file.',
  GEMINI_API_KEY: 'Set GEMINI_API_KEY in your environment or .env file.',
  OPENROUTER_API_KEY: 'Set OPENROUTER_API_KEY in your environment or .env file.',
  NVIDIA_API_KEY: 'Set NVIDIA_API_KEY in your environment or .env file.',
  CUSTOM_LLM_API_KEY: 'Set CUSTOM_LLM_API_KEY in your environment or .env file.',
  GITHUB_TOKEN: 'Set GITHUB_TOKEN to enable GitHub push; optional unless you commit at the end.',
  VERCEL_TOKEN: 'Set VERCEL_TOKEN for real Vercel deployments; without it the pipeline simulates the deploy step.',
  NETLIFY_AUTH_TOKEN: 'Set NETLIFY_AUTH_TOKEN for real Netlify deployments; without it the pipeline simulates the deploy step.',
};

export function parseEnvFile(envPath?: string): { path: string | null; vars: Record<string, string> } {
  const target = envPath ?? path.resolve(process.cwd(), '.env');
  if (!existsSync(target)) return { path: null, vars: {} };
  let raw: string;
  try {
    raw = readFileSync(target, 'utf-8');
  } catch {
    return { path: target, vars: {} };
  }
  const vars: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return { path: target, vars };
}

export function envStatus(variable: string, envPath?: string): { source: string; filePath: string | null } {
  const file = parseEnvFile(envPath);
  if (process.env[variable]) return { source: 'env', filePath: file.path };
  if (file.vars[variable]) return { source: 'env-file', filePath: file.path };
  return { source: 'missing', filePath: file.path };
}

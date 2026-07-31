import { ENV_VAR_HINTS, envStatus, parseEnvFile } from './stage-error.js';

export interface ProviderEnvRequirement {
  provider: string;
  apiKeyVar: string;
  baseUrlVar?: string;
  baseUrlDefault?: string;
}

export interface EnvValidationIssue {
  variable: string;
  fix: string;
  source: string;
}

export interface EnvValidationResult {
  provider: string;
  valid: boolean;
  issues: EnvValidationIssue[];
  apiKeySource: string;
  baseUrl: string | null;
  envFilePath: string | null;
}

export const PROVIDER_ENV_REQUIREMENTS: Record<string, ProviderEnvRequirement> = {
  openai: { provider: 'openai', apiKeyVar: 'OPENAI_API_KEY' },
  anthropic: { provider: 'anthropic', apiKeyVar: 'ANTHROPIC_API_KEY' },
  gemini: { provider: 'gemini', apiKeyVar: 'GEMINI_API_KEY' },
  openrouter: { provider: 'openrouter', apiKeyVar: 'OPENROUTER_API_KEY' },
  nvidia: {
    provider: 'nvidia',
    apiKeyVar: 'NVIDIA_API_KEY',
    baseUrlVar: 'NVIDIA_BASE_URL',
    baseUrlDefault: 'https://integrate.api.nvidia.com/v1',
  },
  custom: {
    provider: 'custom',
    apiKeyVar: 'CUSTOM_LLM_API_KEY',
    baseUrlVar: 'CUSTOM_LLM_BASE_URL',
  },
};

export function getProviderEnvRequirement(provider: string): ProviderEnvRequirement | null {
  return PROVIDER_ENV_REQUIREMENTS[provider] ?? null;
}

export function validateProviderEnv(provider: string, options: { envFilePath?: string } = {}): EnvValidationResult {
  const req = getProviderEnvRequirement(provider);
  const issues: EnvValidationIssue[] = [];
  let baseUrl: string | null = null;

  if (!req) {
    const fix = `Provider "${provider}" requires OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY / NVIDIA_API_KEY / CUSTOM_LLM_API_KEY — set one of these to continue.`;
    return {
      provider,
      valid: false,
      issues: [{ variable: '*', fix, source: 'missing' }],
      apiKeySource: 'missing',
      baseUrl: null,
      envFilePath: options.envFilePath ?? null,
    };
  }

  const keyStatus = envStatus(req.apiKeyVar, options.envFilePath);
  if (keyStatus.source === 'missing') {
    issues.push({
      variable: req.apiKeyVar,
      fix: ENV_VAR_HINTS[req.apiKeyVar as keyof typeof ENV_VAR_HINTS] ?? `Set ${req.apiKeyVar} before running the pipeline.`,
      source: 'missing',
    });
  }

  if (req.baseUrlVar) {
    const baseStatus = envStatus(req.baseUrlVar, options.envFilePath);
    if (baseStatus.source !== 'missing') {
      baseUrl = (baseStatus.filePath && parseEnvFile(baseStatus.filePath).vars[req.baseUrlVar])
        ?? process.env[req.baseUrlVar]
        ?? null;
    }
  }
  if (!baseUrl && req.baseUrlDefault) {
    baseUrl = req.baseUrlDefault;
  }

  const file = parseEnvFile(options.envFilePath);

  return {
    provider,
    valid: issues.length === 0,
    issues,
    apiKeySource: keyStatus.source,
    baseUrl,
    envFilePath: file.path,
  };
}

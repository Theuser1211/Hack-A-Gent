import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { z } from 'zod';

export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'nvidia' | 'custom';
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface DeployConfig {
  githubToken?: string;
  vercelToken?: string;
  netlifyToken?: string;
}

export interface HackAgentConfig {
  llm: LLMConfig;
  deploy?: DeployConfig;
  updatedAt: string;
}

const CONFIG_DIR = '.hackagent';
const CONFIG_FILENAME = 'config.json';

function getConfigPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, CONFIG_DIR, CONFIG_FILENAME);
}

function getEnvFilePath(): string {
  return path.join(process.cwd(), '.env');
}

const PROVIDER_ALIASES: Record<string, LLMConfig['provider']> = {
  'nvidia-nims': 'nvidia',
  'nvidia-nim': 'nvidia',
  'open-ai': 'openai',
  'anthropic-claude': 'anthropic',
};

const VALID_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'nvidia', 'custom'] as const;

const LLMConfigSchema = z.object({
  provider: z.enum(VALID_PROVIDERS),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional().or(z.string().optional()),
  model: z.string().optional(),
});

const DeployConfigSchema = z.object({
  githubToken: z.string().optional(),
  vercelToken: z.string().optional(),
  netlifyToken: z.string().optional(),
});

const HackAgentConfigSchema = z.object({
  llm: LLMConfigSchema,
  deploy: DeployConfigSchema.optional(),
  updatedAt: z.string(),
});

function resolveProvider(raw: string): LLMConfig['provider'] {
  return PROVIDER_ALIASES[raw] ?? (raw as LLMConfig['provider']);
}

function ensureConfigDir(): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

const ENV_KEY_MAP: Record<string, { configKey: keyof LLMConfig; envVars: string[] }> = {
  provider: { configKey: 'provider', envVars: ['HACKAGENT_PROVIDER', 'LLM_PROVIDER'] },
  apiKey: { configKey: 'apiKey', envVars: ['HACKAGENT_API_KEY', 'LLM_API_KEY'] },
  baseUrl: { configKey: 'baseUrl', envVars: ['HACKAGENT_BASE_URL', 'LLM_BASE_URL', 'HACKAGENT_ENDPOINT'] },
  model: { configKey: 'model', envVars: ['HACKAGENT_MODEL', 'LLM_MODEL'] },
};

function loadEnvFile(): Record<string, string> {
  const envPath = getEnvFilePath();
  if (!existsSync(envPath)) return {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) vars[key] = value;
    }
    return vars;
  } catch {
    return {};
  }
}

function mergeEnvIntoConfig(config: HackAgentConfig | null): HackAgentConfig | null {
  const envVars = loadEnvFile();
  if (Object.keys(envVars).length === 0) return config;

  const llm: LLMConfig = config?.llm ?? { provider: 'openai' };

  for (const [, mapping] of Object.entries(ENV_KEY_MAP)) {
    for (const envVar of mapping.envVars) {
      const value = envVars[envVar] ?? process.env[envVar];
      if (value) {
        if (mapping.configKey === 'provider') {
          (llm as unknown as Record<string, unknown>)[mapping.configKey] = resolveProvider(value);
        } else {
          (llm as unknown as Record<string, unknown>)[mapping.configKey] ??= value;
        }
        break;
      }
    }
  }

  const deployTokens = ['GITHUB_TOKEN', 'VERCEL_TOKEN', 'NETLIFY_AUTH_TOKEN'];
  const deploy: DeployConfig = config?.deploy ?? {};
  if (!deploy.githubToken) deploy.githubToken = envVars.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!deploy.vercelToken) deploy.vercelToken = envVars.VERCEL_TOKEN ?? process.env.VERCEL_TOKEN;
  if (!deploy.netlifyToken) deploy.netlifyToken = envVars.NETLIFY_AUTH_TOKEN ?? process.env.NETLIFY_AUTH_TOKEN;

  return { ...(config ?? { llm, updatedAt: new Date().toISOString() }), llm, deploy };
}

export function getConfig(): HackAgentConfig | null {
  const configPath = getConfigPath();
  let config: HackAgentConfig | null = null;
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as HackAgentConfig;
      const result = HackAgentConfigSchema.safeParse(parsed);
      if (result.success) {
        config = result.data as HackAgentConfig;
      } else {
        console.error(`  ⚠ Invalid config file: ${result.error.issues.map(i => i.message).join(', ')}`);
        console.error('  Use: hackagent config --clear to reset');
        config = null;
      }
    } catch {
      config = null;
    }
  }
  return mergeEnvIntoConfig(config);
}

export function saveConfig(config: HackAgentConfig): void {
  ensureConfigDir();
  const configPath = getConfigPath();
  config.updatedAt = new Date().toISOString();
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function getLLMConfig(): LLMConfig {
  const config = getConfig();
  if (config?.llm) {
    return { ...config.llm, provider: resolveProvider(config.llm.provider) };
  }
  return { provider: 'openai' };
}

export function setLLMConfig(llmConfig: LLMConfig): void {
  const resolved = { ...llmConfig, provider: resolveProvider(llmConfig.provider) };
  const result = LLMConfigSchema.safeParse(resolved);
  if (!result.success) {
    throw new Error(`Invalid LLM config: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const existing = getConfig() ?? { llm: resolved, updatedAt: new Date().toISOString() };
  existing.llm = resolved;
  saveConfig(existing);
}

export function getDeployConfig(): DeployConfig {
  const config = getConfig();
  return config?.deploy ?? {};
}

export function getGitHubToken(): string | undefined {
  const config = getConfig();
  return config?.deploy?.githubToken || process.env.GITHUB_TOKEN || undefined;
}

const GITHUB_GUARD_MESSAGE = `
  GitHub token not configured.

  Run:

      hag setup

  or set:

      GITHUB_TOKEN=...
`;

export function requireGitHubToken(): string {
  const token = getGitHubToken();
  if (!token) {
    throw new Error(GITHUB_GUARD_MESSAGE);
  }
  return token;
}

export function setDeployConfig(deployConfig: DeployConfig): void {
  const existing = getConfig() ?? { llm: { provider: 'openai' }, updatedAt: new Date().toISOString() };
  existing.deploy = { ...existing.deploy, ...deployConfig };
  saveConfig(existing);
}

export function clearConfig(): void {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    unlinkSync(configPath);
  }
}

export function showConfig(): HackAgentConfig | null {
  return getConfig();
}

export function createEnvFile(config: LLMConfig): string {
  const lines: string[] = [
    '# Hack-A-Gent Configuration',
    `HACKAGENT_PROVIDER=${config.provider}`,
  ];
  if (config.apiKey) lines.push(`HACKAGENT_API_KEY=${config.apiKey}`);
  if (config.baseUrl) lines.push(`HACKAGENT_BASE_URL=${config.baseUrl}`);
  if (config.model) lines.push(`HACKAGENT_MODEL=${config.model}`);
  lines.push('');
  return lines.join('\n');
}

export const CONFIG_HELP = `
Configuration Settings:

  LLM Provider Settings:
    --provider <name>     Provider: anthropic, openai, gemini, openrouter, nvidia, custom
                          Aliases: nvidia-nims → nvidia
    --api-key <key>       API key for the provider
    --endpoint <url>      Same as --base-url (custom endpoint for NVIDIA NIMs, local models, etc.)
    --base-url <url>      Custom endpoint URL
    --model <name>        Model name (optional, uses provider default)
    --verify              Test the provider connection with current settings

  Deployment Settings:
    --github-token <token>   GitHub personal access token
    --vercel-token <token>   Vercel deployment token
    --netlify-token <token>  Netlify deployment token

  .env File Support:
    Alternative to CLI config. Create a .env file in your project root:
      HACKAGENT_PROVIDER=nvidia
      HACKAGENT_API_KEY=nvapi-xxx
      HACKAGENT_BASE_URL=https://integrate.api.nvidia.com/v1

Examples:
  hackagent config --provider nvidia --api-key nvapi-xxx
  hackagent config --provider nvidia-nims --api-key nvapi-xxx --endpoint https://integrate.api.nvidia.com/v1
  hackagent config --provider openai --api-key sk-xxx
  hackagent config --provider custom --api-key sk-xxx --endpoint http://localhost:11434/v1
  hackagent config --provider nvidia --verify
  hackagent config --show
  hackagent config --clear
`;

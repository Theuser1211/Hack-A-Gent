import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

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

const CONFIG_FILENAME = 'config.json';
const CONFIG_DIR = '.hackagent';
const CONFIG_FILE = path.join(CONFIG_DIR, CONFIG_FILENAME);

function getConfigPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, CONFIG_DIR, CONFIG_FILENAME);
}

function ensureConfigDir(): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getConfig(): HackAgentConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as HackAgentConfig;
  } catch {
    return null;
  }
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
    return config.llm;
  }
  return { provider: 'openai' };
}

export function setLLMConfig(llmConfig: LLMConfig): void {
  const existing = getConfig() ?? { llm: llmConfig, updatedAt: new Date().toISOString() };
  existing.llm = llmConfig;
  saveConfig(existing);
}

export function getDeployConfig(): DeployConfig {
  const config = getConfig();
  return config?.deploy ?? {};
}

export function setDeployConfig(deployConfig: DeployConfig): void {
  const existing = getConfig() ?? { llm: { provider: 'openai' }, updatedAt: new Date().toISOString() };
  existing.deploy = { ...existing.deploy, ...deployConfig };
  saveConfig(existing);
}

export function clearConfig(): void {
  const configPath = getConfigPath();
  if (existsSync(configPath)) {
    const fs = require('node:fs');
    fs.unlinkSync(configPath);
  }
}

export function showConfig(): HackAgentConfig | null {
  return getConfig();
}

export const CONFIG_HELP = `
Configuration Settings:

  LLM Provider Settings:
    --provider <name>     Provider: anthropic, openai, gemini, openrouter, nvidia, custom
    --api-key <key>       API key for the provider
    --base-url <url>      Custom endpoint URL (for NVIDIA NIMs, local models, etc.)
    --model <name>        Model name (optional, uses provider default)

  Deployment Settings:
    --github-token <token>   GitHub personal access token
    --vercel-token <token>   Vercel deployment token
    --netlify-token <token>  Netlify deployment token

Examples:
  hackagent config --provider nvidia --api-key nv-xxx --base-url https://integrate.api.nvidia.com/v1
  hackagent config --provider openai --api-key sk-xxx
  hackagent config --provider custom --api-key http://localhost:11434/v1 --base-url http://localhost:11434
  hackagent config --github-token ghp_xxx --vercel-token xxx
  hackagent config --show
  hackagent config --clear
`;
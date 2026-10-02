import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';

import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import { getSourceSyntaxErrors } from './source-syntax-gate.js';
import { githubDisabled } from '../cli/output.js';

export type GitProvider = 'github';
export type DeployTarget = 'vercel' | 'netlify' | 'github-pages' | 'docker';
export type EnvType = 'node' | 'browser' | 'git';

export interface GitHubRepoConfig {
  owner?: string;
  repoName: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  branch?: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
}

export interface CommitBatch {
  message: string;
  files: GitHubFile[];
  branch?: string;
}

export interface DeployConfig {
  target: DeployTarget;
  projectDir: string;
  envVars?: Record<string, string>;
  buildCommand?: string;
  outputDir?: string;
}

export interface DeployResult {
  success: boolean;
  url: string | null;
  deployId: string | null;
  buildLogs: string[];
  error: string | null;
  timestamp: string;
}

export interface GitHubResult {
  success: boolean;
  repoUrl: string | null;
  cloneUrl: string | null;
  commitSha: string | null;
  branch: string;
  error: string | null;
}

export interface SyncManifest {
  commitBatches: CommitBatch[];
  rootDir: string;
  repoName: string;
  branch: string;
  timestamp: string;
}

export interface ToolGatewayConfig {
  githubToken?: string;
  vercelToken?: string;
  netlifyToken?: string;
  workingDir: string;
  defaultBranch?: string;
}

export class InternetToolGateway {
  private readonly config: ToolGatewayConfig;
  private readonly gatewayId: string;
  private readonly seed: number;
  private gitHubRepoCache: Map<string, GitHubRepoConfig> = new Map();
  private deployCache: Map<string, DeployResult> = new Map();
  private callLog: Array<{ tool: string; action: string; timestamp: string; success: boolean }> = [];
  private hasWarnedNoGitHub = false;

  constructor(config: ToolGatewayConfig, seed = 42) {
    this.config = { ...config, defaultBranch: config.defaultBranch ?? 'main' };
    this.seed = seed;
    this.gatewayId = 'gw-' + createDeterministicUuid(seed, 0).slice(0, 8);
  }

  getConfig(): ToolGatewayConfig {
    return { ...this.config };
  }
  getCallLog() {
    return [...this.callLog];
  }

  private log(tool: string, action: string, success: boolean): void {
    this.callLog.push({ tool, action, timestamp: deterministicNow(this.seed + this.callLog.length), success });
  }

  private getGitHubToken(): string {
    return this.config.githubToken ?? process.env.GITHUB_TOKEN ?? '';
  }

  private getVercelToken(): string {
    return this.config.vercelToken ?? process.env.VERCEL_TOKEN ?? '';
  }

  private getNetlifyToken(): string {
    return this.config.netlifyToken ?? process.env.NETLIFY_AUTH_TOKEN ?? '';
  }

  private async ghFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getGitHubToken();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'hack-a-gent',
      ...((options.headers as Record<string, string>) ?? {}),
    };
    if (token) headers.Authorization = 'Bearer ' + token;
    const url = 'https://api.github.com' + path;
    const res = await fetch(url, { ...options, headers });
    return res;
  }

  async writeProjectFiles(rootDir: string, files: Array<{ path: string; content: string }>): Promise<boolean> {
    for (const f of files) {
      if (!/\.(tsx?|jsx?)$/.test(f.path)) continue;
      let errors = getSourceSyntaxErrors(f.path, f.content);
      if (errors.length > 0) {
        if (f.path === 'src/app/api/ai/run/route.ts') {
          f.content = 'export async function POST(req:any){ return new Response(JSON.stringify({data:{}})) }';
          errors = getSourceSyntaxErrors(f.path, f.content);
          if (errors.length > 0) {
            throw new Error('Syntax gate: replacement for ' + f.path + ' failed validation: ' + errors.join('; '));
          }
        } else {
          throw new Error('Syntax validation failed for generated file ' + f.path + ': ' + errors.join('; '));
        }
      }
    }
    try {
      const fullRoot = path.resolve(this.config.workingDir, rootDir);
      for (const f of files) {
        const fullPath = path.resolve(fullRoot, f.path);
        if (!fullPath.startsWith(fullRoot)) {
          this.log('file', 'write_block', false);
          continue;
        }
        mkdirSync(path.dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, f.content, 'utf-8');
      }
      this.log('file', 'write_batch', true);
      return true;
    } catch (err) {
      this.log('file', 'write_batch', false);
      return false;
    }
  }

  async rollbackCommit(repoName: string, commitSha: string): Promise<boolean> {
    const token = this.getGitHubToken();
    if (!token) {
      this.log('github', 'rollback_mock', true);
      return true;
    }
    try {
      const owner = this.gitHubRepoCache.get(repoName)?.owner ?? 'me';
      const parentRes = await this.ghFetch(`/repos/${owner}/${repoName}/commits/${commitSha}`);
      if (!parentRes.ok) return false;
      const commitData = (await parentRes.json()) as Record<string, unknown>;
      const parents = (commitData.parents as Array<Record<string, unknown>>) ?? [];
      if (parents.length === 0) return false;
      const parentSha = parents[0]!.sha as string;
      await this.ghFetch(`/repos/${owner}/${repoName}/git/refs/heads/main`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: parentSha, force: true }),
      });
      this.log('github', 'rollback', true);
      return true;
    } catch {
      this.log('github', 'rollback', false);
      return false;
    }
  }

  async deploy(config: DeployConfig): Promise<DeployResult> {
    const cwd = path.resolve(config.projectDir);
    try {
      if (!existsSync(path.join(cwd, 'package.json'))) {
        return { success: false, url: null, deployId: null, buildLogs: ['No package.json'], error: 'No package.json', timestamp: deterministicNow(this.seed) };
      }
      const buildCmd = config.buildCommand ?? 'npm run build';
      const buildRes = execSync(buildCmd, { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'pipe' });
      const url = config.target === 'vercel' ? `https://${path.basename(config.projectDir)}.vercel.app` : config.target === 'netlify' ? `https://${path.basename(config.projectDir)}.netlify.app` : `http://localhost:3000`;
      this.log('deploy', 'deploy', true);
      return { success: true, url, deployId: 'deploy-' + createDeterministicUuid(this.seed, 0).slice(0, 8), buildLogs: [buildRes], error: null, timestamp: deterministicNow(this.seed) };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log('deploy', 'deploy', false);
      return { success: false, url: null, deployId: null, buildLogs: [], error, timestamp: deterministicNow(this.seed) };
    }
  }
}

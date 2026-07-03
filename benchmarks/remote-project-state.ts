import { execSync as realExecSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export type ProjectPhase =
  | 'parsing'
  | 'requirements'
  | 'decomposition'
  | 'building'
  | 'testing'
  | 'github_sync'
  | 'deploying'
  | 'live_testing'
  | 'repairing'
  | 'complete'
  | 'failed';

export interface GitHubSnapshot {
  repoName: string;
  repoUrl: string | null;
  cloneUrl: string | null;
  branch: string;
  lastCommitSha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentSnapshot {
  target: string;
  url: string | null;
  deployId: string | null;
  status: 'pending' | 'deployed' | 'failed' | 'rolled_back';
  logs: string[];
  deployedAt: string | null;
}

export interface BuildSnapshot {
  buildNumber: number;
  status: 'pending' | 'running' | 'passed' | 'failed';
  output: string;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

export interface AgentExecutionLog {
  agentId: string;
  taskId: string;
  action: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string | null;
  output: string;
  error: string | null;
}

export interface ProjectStateSnapshot {
  projectId: string;
  projectName: string;
  phase: ProjectPhase;
  taskGraphState: Record<string, unknown> | null;
  gitHub: GitHubSnapshot | null;
  deployment: DeploymentSnapshot | null;
  buildHistory: BuildSnapshot[];
  agentLogs: AgentExecutionLog[];
  metadata: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  seed: number;
}

export interface ResumeResult {
  state: ProjectStateSnapshot;
  canResume: boolean;
  resumePoint: ProjectPhase;
  warnings: string[];
}

export class RemoteProjectState {
  private readonly stateDir: string;
  private readonly seed: number;
  private state: ProjectStateSnapshot | null = null;
  private lastSaveTime = 0;
  private autoSaveIntervalMs: number;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(stateDir: string, seed = 42, autoSaveIntervalMs = 5000) {
    this.stateDir = stateDir;
    this.seed = seed;
    this.autoSaveIntervalMs = autoSaveIntervalMs;
  }

  getState(): ProjectStateSnapshot | null {
    return this.state
      ? { ...this.state, buildHistory: [...this.state.buildHistory], agentLogs: [...this.state.agentLogs] }
      : null;
  }
  getPhase(): ProjectPhase | null {
    return this.state?.phase ?? null;
  }
  getLastCommitSha(): string | null {
    return this.state?.gitHub?.lastCommitSha ?? null;
  }
  getDeployUrl(): string | null {
    return this.state?.deployment?.url ?? null;
  }

  startProject(projectName: string, metadata: Record<string, string> = {}): ProjectStateSnapshot {
    this.state = {
      projectId: 'proj-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      projectName,
      phase: 'parsing',
      taskGraphState: null,
      gitHub: null,
      deployment: null,
      buildHistory: [],
      agentLogs: [],
      metadata,
      createdAt: deterministicNow(this.seed),
      updatedAt: deterministicNow(this.seed),
      seed: this.seed,
    };
    this.save();
    return this.state;
  }

  setPhase(phase: ProjectPhase): void {
    if (!this.state) return;
    this.state.phase = phase;
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  setGitHubSnapshot(snapshot: GitHubSnapshot): void {
    if (!this.state) return;
    this.state.gitHub = snapshot;
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  updateGitHubSnapshot(updates: Partial<GitHubSnapshot>): void {
    if (!this.state?.gitHub) return;
    Object.assign(this.state.gitHub, updates, { updatedAt: deterministicNow(this.seed) });
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  setDeploymentSnapshot(snapshot: DeploymentSnapshot): void {
    if (!this.state) return;
    this.state.deployment = snapshot;
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  updateDeploymentSnapshot(updates: Partial<DeploymentSnapshot>): void {
    if (!this.state?.deployment) return;
    Object.assign(this.state.deployment, updates);
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  addBuildRecord(build: BuildSnapshot): void {
    if (!this.state) return;
    this.state.buildHistory.push(build);
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  addAgentLog(log: AgentExecutionLog): void {
    if (!this.state) return;
    this.state.agentLogs.push(log);
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  setTaskGraphState(state: Record<string, unknown>): void {
    if (!this.state) return;
    this.state.taskGraphState = state;
    this.state.updatedAt = deterministicNow(this.seed);
    this.save();
  }

  canResume(): ResumeResult {
    if (!this.state) {
      return {
        state: null as unknown as ProjectStateSnapshot,
        canResume: false,
        resumePoint: 'parsing',
        warnings: ['No saved state found'],
      };
    }
    if (this.state.phase === 'complete') {
      return { state: this.state, canResume: false, resumePoint: 'complete', warnings: ['Project already complete'] };
    }
    const warnings: string[] = [];
    if (this.state.phase === 'deploying' && !this.state.deployment)
      warnings.push('Deployment phase but no deploy snapshot');
    if (this.state.phase === 'github_sync' && !this.state.gitHub)
      warnings.push('GitHub sync phase but no git snapshot');
    return { state: this.state, canResume: true, resumePoint: this.state.phase, warnings };
  }

  save(): boolean {
    if (!this.state) return false;
    this.lastSaveTime = Date.now();
    try {
      const fullPath = this.getStateFilePath();
      mkdirSync(path.dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, JSON.stringify(this.state, null, 2), 'utf-8');
      return true;
    } catch {
      return false;
    }
  }

  load(projectName?: string): ProjectStateSnapshot | null {
    if (projectName) {
      const fp = path.resolve(this.stateDir, `${projectName}.state.json`);
      if (!existsSync(fp)) return null;
      try {
        const data = JSON.parse(readFileSync(fp, 'utf-8')) as ProjectStateSnapshot;
        this.state = data;
        return data;
      } catch {
        return null;
      }
    }
    const fp = this.getStateFilePath();
    if (!existsSync(fp)) return null;
    try {
      const data = JSON.parse(readFileSync(fp, 'utf-8')) as ProjectStateSnapshot;
      this.state = data;
      return data;
    } catch {
      return null;
    }
  }

  loadLatest(): ProjectStateSnapshot | null {
    if (!existsSync(this.stateDir)) return null;
    const files = execSync(`dir /B /O-D "${this.stateDir}\\*.state.json" 2>nul`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    if (files.length === 0) return null;
    const latest = files[0]!.trim();
    return this.load(latest.replace('.state.json', ''));
  }

  private getStateFilePath(): string {
    const name = this.state?.projectName ?? 'project';
    return path.resolve(this.stateDir, `${name}.state.json`);
  }

  startAutoSave(): void {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.saveTimer = setInterval(() => {
      this.save();
    }, this.autoSaveIntervalMs);
  }

  stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  deleteState(): void {
    this.stopAutoSave();
    if (this.state) {
      const fp = this.getStateFilePath();
      if (existsSync(fp)) rmSync(fp);
    }
    this.state = null;
  }

  exportAsArtifact(outputPath?: string): string {
    const json = JSON.stringify(this.state, null, 2);
    const out = outputPath ?? path.resolve(this.stateDir, `${this.state?.projectName ?? 'export'}.artifact.json`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, json, 'utf-8');
    return out;
  }
}

function execSync(cmd: string, opts: { encoding: string; stdio: string[] }): string {
  try {
    return realExecSync(cmd, opts).toString();
  } catch {
    return '';
  }
}

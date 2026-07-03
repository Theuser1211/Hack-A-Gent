import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { AccessLevel, AgentType } from '../types/index.js';

// ── Permission ────────────────────────────────────────────────────────────

export interface WorkspaceAccess {
  read: boolean;
  write: boolean;
  delete: boolean;
  list: boolean;
}

export interface WorkspacePermissions {
  agent_type: AgentType | '*';
  private: WorkspaceAccess;
  shared: WorkspaceAccess;
  project_root: WorkspaceAccess;
}

// ── Scratchpad ────────────────────────────────────────────────────────────

export interface ScratchpadEntry {
  timestamp: string;
  type: 'thought' | 'observation' | 'plan' | 'question' | 'decision' | 'error';
  content: string;
  references: string[];
}

export interface Scratchpad {
  agent_id: string;
  task_id: string;
  created_at: string;
  updated_at: string;
  entries: ScratchpadEntry[];
}

// ── Workspace Manager ─────────────────────────────────────────────────────

export class WorkspaceManager {
  private readonly projectsBaseDir: string;
  private readonly permissions: Map<string, WorkspacePermissions> = new Map();

  static readonly DEFAULT_PERMISSIONS: WorkspacePermissions[] = [
    {
      agent_type: 'orchestrator',
      private: { read: true, write: true, delete: true, list: true },
      shared: { read: true, write: true, delete: true, list: true },
      project_root: { read: true, write: true, delete: false, list: true },
    },
    {
      agent_type: 'planner',
      private: { read: true, write: true, delete: true, list: true },
      shared: { read: true, write: true, delete: false, list: true },
      project_root: { read: true, write: false, delete: false, list: true },
    },
    {
      agent_type: '*',
      private: { read: true, write: true, delete: true, list: true },
      shared: { read: true, write: false, delete: false, list: true },
      project_root: { read: true, write: false, delete: false, list: true },
    },
  ];

  constructor(projectsBaseDir: string) {
    this.projectsBaseDir = projectsBaseDir;
    for (const p of WorkspaceManager.DEFAULT_PERMISSIONS) {
      this.permissions.set(p.agent_type, p);
    }
  }

  registerPermissions(perms: WorkspacePermissions): void {
    this.permissions.set(perms.agent_type, perms);
  }

  getPermissions(agentType: AgentType): WorkspacePermissions {
    return this.permissions.get(agentType) ?? this.permissions.get('*')!;
  }

  checkAccess(
    agentType: AgentType,
    workspace: 'private' | 'shared' | 'project_root',
    operation: 'read' | 'write' | 'delete' | 'list',
  ): boolean {
    const perms = this.getPermissions(agentType);
    const access = perms[workspace];
    return access[operation];
  }

  // ── Project Workspace ─────────────────────────────────────────────────

  projectPath(projectId: string): string {
    return path.join(this.projectsBaseDir, projectId);
  }

  async ensureProjectWorkspace(projectId: string): Promise<string> {
    const base = this.projectPath(projectId);
    const dirs = [
      path.join(base, '.workspace', 'shared', 'contracts'),
      path.join(base, '.workspace', 'shared', 'schemas'),
      path.join(base, '.workspace', 'shared', 'current-specs'),
      path.join(base, 'src'),
      path.join(base, 'tests'),
      path.join(base, 'plan'),
      path.join(base, 'architecture'),
      path.join(base, 'judge'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }

    return base;
  }

  // ── Agent Workspace ───────────────────────────────────────────────────

  agentWorkspacePath(projectId: string, agentId: string): string {
    return path.join(this.projectsBaseDir, projectId, '.workspace', 'agents', agentId);
  }

  async ensureAgentWorkspace(projectId: string, agentId: string): Promise<string> {
    const base = this.agentWorkspacePath(projectId, agentId);
    const dirs = [path.join(base, 'private', 'working-files'), path.join(base, 'output')];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }

    return base;
  }

  // ── Scratchpad ────────────────────────────────────────────────────────

  scratchpadPath(projectId: string, agentId: string, taskId: string): string {
    return path.join(
      this.projectsBaseDir,
      projectId,
      '.workspace',
      'agents',
      agentId,
      'private',
      `${taskId}-scratchpad.json`,
    );
  }

  async writeScratchpad(
    projectId: string,
    agentId: string,
    taskId: string,
    entry: ScratchpadEntry,
  ): Promise<Scratchpad> {
    const filePath = this.scratchpadPath(projectId, agentId, taskId);
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    let scratchpad: Scratchpad;

    if (existsSync(filePath)) {
      const content = await readFile(filePath, 'utf-8');
      scratchpad = JSON.parse(content) as Scratchpad;
    } else {
      scratchpad = {
        agent_id: agentId,
        task_id: taskId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        entries: [],
      };
    }

    scratchpad.entries.push(entry);
    scratchpad.updated_at = new Date().toISOString();

    await writeFile(filePath, JSON.stringify(scratchpad, null, 2), 'utf-8');
    return scratchpad;
  }

  async readScratchpad(projectId: string, agentId: string, taskId: string): Promise<Scratchpad | null> {
    const filePath = this.scratchpadPath(projectId, agentId, taskId);
    if (!existsSync(filePath)) return null;
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as Scratchpad;
  }

  // ── Artifact Storage ──────────────────────────────────────────────────

  agentOutputPath(projectId: string, agentId: string): string {
    return path.join(this.projectsBaseDir, projectId, '.workspace', 'agents', agentId, 'output');
  }

  async writeArtifact(projectId: string, agentId: string, fileName: string, content: string): Promise<string> {
    const outputDir = this.agentOutputPath(projectId, agentId);
    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }
    const filePath = path.join(outputDir, fileName);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }
}

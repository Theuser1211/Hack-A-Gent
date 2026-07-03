import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { WorkspaceManager } from '../../kernel/workspace/workspace-manager.js';

describe('WorkspaceManager', () => {
  let mgr: WorkspaceManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    mgr = new WorkspaceManager(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates project workspace directories', async () => {
    const projectPath = await mgr.ensureProjectWorkspace('proj-1');
    expect(existsSync(projectPath)).toBe(true);

    const sharedContracts = path.join(projectPath, '.workspace', 'shared', 'contracts');
    expect(existsSync(sharedContracts)).toBe(true);

    const srcDir = path.join(projectPath, 'src');
    expect(existsSync(srcDir)).toBe(true);
  });

  it('creates agent workspace directories', async () => {
    await mgr.ensureProjectWorkspace('proj-1');
    const agentPath = await mgr.ensureAgentWorkspace('proj-1', 'agent.test');
    expect(existsSync(agentPath)).toBe(true);

    const privateDir = path.join(agentPath, 'private', 'working-files');
    expect(existsSync(privateDir)).toBe(true);

    const outputDir = path.join(agentPath, 'output');
    expect(existsSync(outputDir)).toBe(true);
  });

  it('enforces default permissions by agent type', () => {
    const plannerPerms = mgr.getPermissions('planner');
    expect(plannerPerms.project_root.read).toBe(true);
    expect(plannerPerms.project_root.write).toBe(false);

    const orchPerms = mgr.getPermissions('orchestrator');
    expect(orchPerms.project_root.write).toBe(true);
  });

  it('checks access correctly', () => {
    expect(mgr.checkAccess('planner', 'private', 'read')).toBe(true);
    expect(mgr.checkAccess('planner', 'private', 'write')).toBe(true);
    expect(mgr.checkAccess('planner', 'project_root', 'delete')).toBe(false);
    expect(mgr.checkAccess('orchestrator', 'shared', 'delete')).toBe(true);
  });

  it('register custom permissions', () => {
    mgr.registerPermissions({
      agent_type: 'subagent',
      private: { read: true, write: true, delete: false, list: true },
      shared: { read: true, write: false, delete: false, list: true },
      project_root: { read: true, write: true, delete: false, list: true },
    });

    const perms = mgr.getPermissions('subagent');
    expect(perms.private.delete).toBe(false);
    expect(perms.project_root.write).toBe(true);
  });

  it('returns null for non-existent scratchpad', async () => {
    const read = await mgr.readScratchpad('proj-1', 'agent.test', 'nonexistent-task');
    expect(read).toBeNull();
  });

  it('writes and reads scratchpad entries', async () => {
    await mgr.ensureProjectWorkspace('proj-1');

    const entry = {
      timestamp: new Date().toISOString(),
      type: 'thought' as const,
      content: 'Need to implement auth flow',
      references: ['task-auth-1'],
    };

    const scratchpad = await mgr.writeScratchpad('proj-1', 'agent.test', 'task-auth-1', entry);
    expect(scratchpad.entries).toHaveLength(1);
    expect(scratchpad.entries[0]!.content).toBe('Need to implement auth flow');

    // Append another entry
    await mgr.writeScratchpad('proj-1', 'agent.test', 'task-auth-1', {
      timestamp: new Date().toISOString(),
      type: 'decision',
      content: 'Use JWT for auth',
      references: [],
    });

    const read = await mgr.readScratchpad('proj-1', 'agent.test', 'task-auth-1');
    expect(read).not.toBeNull();
    expect(read!.entries).toHaveLength(2);
  });

  it('falls back to wildcard permissions for unknown agent types', () => {
    const perms = mgr.getPermissions('utility');
    // '*' wildcard has private R/W/D, shared R, project_root R
    expect(perms.private.read).toBe(true);
    expect(perms.private.write).toBe(true);
    expect(perms.private.delete).toBe(true);
    expect(perms.shared.write).toBe(false);
  });

  it('writeArtifact creates output directory when it does not exist', async () => {
    await mgr.ensureProjectWorkspace('proj-1');
    // Do NOT call ensureAgentWorkspace - output dir doesn't exist yet

    const filePath = await mgr.writeArtifact(
      'proj-1',
      'agent.test',
      'direct-result.json',
      JSON.stringify({ ok: true }),
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ ok: true });
  });

  it('writes artifacts to agent output directory', async () => {
    await mgr.ensureProjectWorkspace('proj-1');
    await mgr.ensureAgentWorkspace('proj-1', 'agent.test');

    const filePath = await mgr.writeArtifact('proj-1', 'agent.test', 'result.json', JSON.stringify({ hello: 'world' }));
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual({ hello: 'world' });
  });
});

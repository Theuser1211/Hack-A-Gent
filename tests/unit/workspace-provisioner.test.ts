import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DefaultWorkspaceProvisioner } from '../../kernel/execution/workspace-provisioner.js';

describe('DefaultWorkspaceProvisioner', () => {
  let provisioner: DefaultWorkspaceProvisioner;
  let baseDir: string;
  let createdPath: string | null;

  beforeEach(() => {
    baseDir = fs.mkdtempSync('workspace-test-');
    provisioner = new DefaultWorkspaceProvisioner(baseDir);
    createdPath = null;
  });

  afterEach(async () => {
    if (createdPath && fs.existsSync(createdPath)) {
      fs.rmSync(createdPath, { recursive: true, force: true });
    }
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('creates a workspace directory', async () => {
    const workspace = await provisioner.createWorkspace('test-project');
    createdPath = workspace.root_path;

    expect(fs.existsSync(workspace.root_path)).toBe(true);
    expect(fs.existsSync(workspace.project_path)).toBe(true);
  });

  it('creates project subdirectory inside workspace', async () => {
    const workspace = await provisioner.createWorkspace('test-project');
    createdPath = workspace.root_path;

    expect(path.basename(workspace.project_path)).toBe('project');
    expect(path.dirname(workspace.project_path)).toBe(workspace.root_path);
  });

  it('uses custom prefix for workspace name', async () => {
    const workspace = await provisioner.createWorkspace('my-app');
    createdPath = workspace.root_path;

    expect(path.basename(workspace.root_path)).toMatch(/^my-app-/);
  });

  it('records creation timestamp', async () => {
    const workspace = await provisioner.createWorkspace();
    createdPath = workspace.root_path;

    expect(workspace.created_at).toBeTruthy();
    expect(new Date(workspace.created_at).getTime()).not.toBeNaN();
  });

  it('cleans up workspace directory', async () => {
    const workspace = await provisioner.createWorkspace();
    createdPath = workspace.root_path;

    expect(fs.existsSync(workspace.root_path)).toBe(true);

    await provisioner.cleanup(workspace.root_path);
    expect(fs.existsSync(workspace.root_path)).toBe(false);

    createdPath = null;
  });

  it('does not throw when cleaning non-existent path', async () => {
    await expect(provisioner.cleanup(path.join(baseDir, 'does-not-exist'))).resolves.not.toThrow();
  });

  it('blocks path traversal in cleanup', async () => {
    await expect(provisioner.cleanup(path.join(baseDir, '..', 'outside'))).resolves.not.toThrow();
  });
});

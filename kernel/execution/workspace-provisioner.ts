import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface Workspace {
  root_path: string;
  project_path: string;
  created_at: string;
}

export interface WorkspaceProvisioner {
  createWorkspace(prefix?: string): Promise<Workspace>;
  cleanup(workspacePath: string): Promise<void>;
}

export class DefaultWorkspaceProvisioner implements WorkspaceProvisioner {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(os.tmpdir(), 'opencode-workspaces');
  }

  async createWorkspace(prefix = 'workspace'): Promise<Workspace> {
    const timestamp = Date.now();
    const rootName = `${prefix}-${timestamp}`;
    const rootPath = path.resolve(this.baseDir, rootName);
    const projectPath = path.join(rootPath, 'project');

    fs.mkdirSync(projectPath, { recursive: true });

    return {
      root_path: rootPath,
      project_path: projectPath,
      created_at: new Date().toISOString(),
    };
  }

  async cleanup(workspacePath: string): Promise<void> {
    try {
      const resolved = path.resolve(this.baseDir, workspacePath);
      const relative = path.relative(this.baseDir, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return;
      }

      if (fs.existsSync(resolved)) {
        fs.rmSync(resolved, { recursive: true, force: true });
      }
    } catch {
      // best effort cleanup
    }
  }
}

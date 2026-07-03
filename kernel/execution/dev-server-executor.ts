import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import type { RunningApplication } from './execution-types.js';

export interface DevServerExecutor {
  start(projectPath: string, port?: number, timeoutMs?: number): Promise<RunningApplication>;
  stop(app: RunningApplication): Promise<void>;
  isRunning(app: RunningApplication): Promise<boolean>;
}

export class DefaultDevServerExecutor implements DevServerExecutor {
  private readonly processes: Map<number, ChildProcess> = new Map();

  async start(projectPath: string, port = 3000, timeoutMs = 60000): Promise<RunningApplication> {
    const projectType = this.detectProjectType(projectPath);
    const cmd =
      projectType === 'node'
        ? this.getNodeStartCommand(projectPath)
        : projectType === 'python'
          ? 'python app.py 2>nul || python main.py 2>nul || python -m http.server {port}'
          : 'echo "No dev server configured"';

    const resolvedCmd = cmd.replace('{port}', String(port));

    const child = spawn(resolvedCmd, {
      cwd: projectPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const pid = child.pid;
    if (pid != null) {
      this.processes.set(pid, child);
    }

    const url = `http://localhost:${port}`;
    const startedAt = new Date().toISOString();

    child.on('exit', (code) => {
      if (pid != null) {
        this.processes.delete(pid);
      }
    });

    const ready = await this.waitForReady(url, timeoutMs);

    return {
      pid: pid ?? null,
      port,
      url,
      ready,
      process_path: resolvedCmd,
      started_at: startedAt,
      project_path: projectPath,
    };
  }

  async stop(app: RunningApplication): Promise<void> {
    if (app.pid != null && this.processes.has(app.pid)) {
      const child = this.processes.get(app.pid);
      if (child && !child.killed) {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (child && !child.killed) {
              child.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          child.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      this.processes.delete(app.pid);
    }
  }

  async isRunning(app: RunningApplication): Promise<boolean> {
    if (app.pid != null && this.processes.has(app.pid)) {
      const child = this.processes.get(app.pid);
      return child != null && !child.killed;
    }
    return false;
  }

  private detectProjectType(projectPath: string): 'node' | 'python' | 'unknown' {
    if (fs.existsSync(path.join(projectPath, 'package.json'))) return 'node';
    if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) return 'python';
    if (fs.existsSync(path.join(projectPath, 'setup.py'))) return 'python';
    return 'unknown';
  }

  private getNodeStartCommand(projectPath: string): string {
    const pkgPath = path.join(projectPath, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts ?? {};
      if (scripts.start) return 'npm start';
      if (scripts.dev) return 'npm run dev';
      if (scripts.serve) return 'npm run serve';
      return 'npx serve . -l {port}';
    } catch {
      return 'npx serve . -l {port}';
    }
  }

  private async waitForReady(url: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const ready = await this.healthCheck(url);
        if (ready) return true;
      } catch {
        // server not ready yet
      }
      await this.delay(checkInterval);
    }

    return false;
  }

  private healthCheck(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        resolve(res.statusCode !== undefined);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

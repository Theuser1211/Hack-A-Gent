import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import * as http from 'node:http';

export interface RuntimeValidationResult {
  framework: string;
  depsInstalled: boolean;
  buildPassed: boolean;
  serverStarted: boolean;
  healthOk: boolean;
  error: string | null;
}

export function detectFramework(projectDir: string): string {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const names = Object.keys(deps);
    if (names.some(n => n === 'next')) return 'nextjs';
    if (names.some(n => n === 'vite')) return 'vite';
    if (names.some(n => n.includes('react-scripts') || n === 'react-scripts')) return 'create-react-app';
    if (names.some(n => n === '@sveltejs/kit' || n === 'svelte')) return 'sveltekit';
    if (names.some(n => n === 'express')) return 'express';
    if (names.some(n => n === 'nuxt' || n === '@nuxt/core')) return 'nuxt';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function detectDevCommand(framework: string): string {
  switch (framework) {
    case 'nextjs': return 'dev';
    case 'vite': return 'dev';
    case 'create-react-app': return 'start';
    case 'sveltekit': return 'dev';
    case 'express': return 'start';
    case 'nuxt': return 'dev';
    default: return 'dev';
  }
}

function hasStartScript(projectDir: string, script: string): boolean {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
    return !!pkg.scripts?.[script];
  } catch {
    return false;
  }
}

function freePort(port: number): void {
  try {
    execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe', timeout: 3000, windowsHide: true });
  } catch {
    return;
  }
}

function killProcessTree(server: ReturnType<typeof spawn>): void {
  try {
    if (server.pid === undefined) return;
    server.kill('SIGTERM');
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /T /F /PID ${server.pid}`, { stdio: 'ignore', timeout: 2000, windowsHide: true });
      } catch { /* may have already exited */ }
    } else {
      try { process.kill(-server.pid, 'SIGTERM'); } catch { /* group kill fallback */ }
    }
  } catch {
    return;
  }
}

export async function validateRuntime(projectDir: string): Promise<RuntimeValidationResult> {
  const framework = detectFramework(projectDir);

  if (framework === 'unknown') {
    return { framework, depsInstalled: false, buildPassed: false, serverStarted: false, healthOk: false, error: 'Cannot detect framework from package.json' };
  }

  const devScript = detectDevCommand(framework);

  if (!hasStartScript(projectDir, devScript)) {
    return { framework, depsInstalled: false, buildPassed: false, serverStarted: false, healthOk: false, error: `No "${devScript}" script in package.json` };
  }

  const nodeModules = path.join(projectDir, 'node_modules');
  let depsInstalled = true;
  if (!existsSync(nodeModules)) {
    try {
      execSync('npm install --legacy-peer-deps', { cwd: projectDir, stdio: 'pipe', timeout: 120000, windowsHide: true });
    } catch {
      return { framework, depsInstalled: false, buildPassed: false, serverStarted: false, healthOk: false, error: 'npm install failed' };
    }
  }

  freePort(3099);

  const server = spawn('npm', ['run', devScript], {
    cwd: projectDir,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, PORT: '3099' },
  });

  let output = '';
  let serverStarted = false;
  let healthOk = false;
  let error: string | null = null;

  return new Promise<RuntimeValidationResult>((resolve) => {
    const timeout = setTimeout(() => {
      killProcessTree(server);
      resolve({
        framework,
        depsInstalled,
        buildPassed: true,
        serverStarted,
        healthOk,
        error: serverStarted ? 'Timeout waiting for HTTP 200' : 'Server did not start within 60s',
      });
    }, 60000);

    server.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (!serverStarted && (
        output.includes('Ready in') || output.includes('started on') || output.includes('listening on') ||
        output.includes('localhost:3000') || output.includes('localhost:3099') ||
        output.includes('▲ Next.js') || output.includes('Local:')
      )) {
        serverStarted = true;
        const req = http.get('http://localhost:3099', (res: http.IncomingMessage) => {
          if (res.statusCode === 200) {
            healthOk = true;
            clearTimeout(timeout);
            killProcessTree(server);
            resolve({ framework, depsInstalled, buildPassed: true, serverStarted: true, healthOk: true, error: null });
          } else {
            clearTimeout(timeout);
            killProcessTree(server);
            error = `HTTP ${res.statusCode}`;
            resolve({ framework, depsInstalled, buildPassed: true, serverStarted: true, healthOk: false, error });
          }
        });
        req.on('error', () => {
          killProcessTree(server);
        });
        req.setTimeout(5000, () => { req.destroy(); });
      }
    });

    server.stderr?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    server.on('close', (code: number | null, signal: string | null) => {
      clearTimeout(timeout);
      if (!healthOk) {
        error = error ?? `Server exited with code ${code ?? signal ?? 'unknown'}`;
        resolve({ framework, depsInstalled, buildPassed: true, serverStarted, healthOk, error });
      }
    });

    server.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ framework, depsInstalled, buildPassed: true, serverStarted: false, healthOk: false, error: err.message });
    });
  });
}

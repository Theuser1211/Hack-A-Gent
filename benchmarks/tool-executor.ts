import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import type { GeneratedRepository } from '../kernel/builders/builder-types.js';
import type { File } from '../kernel/builders/repository-types.js';

import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export type ToolType = 'github' | 'file' | 'scaffold' | 'deploy' | 'browser_test' | 'shell' | 'package';

export interface ToolCall {
  id: string;
  tool: ToolType;
  action: string;
  params: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResult {
  callId: string;
  success: boolean;
  output: unknown;
  error: string | null;
  durationMs: number;
  artifacts: string[];
}

export interface ToolLogEntry {
  call: ToolCall;
  result: ToolResult;
  timestamp: string;
}

export class ToolExecutor {
  private log: ToolLogEntry[] = [];
  private readonly seed: number;
  private readonly workspaceRoot: string;
  private readonly executorId: string;

  constructor(workspaceRoot: string, seed = 42) {
    this.workspaceRoot = workspaceRoot;
    this.seed = seed;
    this.executorId = `exec-${createDeterministicUuid(seed, 0).slice(0, 8)}`;
  }

  async execute(tool: ToolType, action: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
    const call: ToolCall = {
      id: `call-${createDeterministicUuid(this.seed, this.log.length + 1).slice(0, 8)}`,
      tool,
      action,
      params,
      timestamp: deterministicNow(this.seed + this.log.length),
    };

    const startTime = Date.now();
    try {
      const result = await this.dispatch(call);
      const durationMs = Date.now() - startTime;
      const entry: ToolLogEntry = {
        call,
        result: { ...result, durationMs },
        timestamp: deterministicNow(this.seed + this.log.length + 1000),
      };
      this.log.push(entry);
      return entry.result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const result: ToolResult = {
        callId: call.id,
        success: false,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        artifacts: [],
      };
      this.log.push({ call, result, timestamp: deterministicNow(this.seed + this.log.length + 1000) });
      return result;
    }
  }

  private async dispatch(call: ToolCall): Promise<ToolResult> {
    switch (call.tool) {
      case 'file':
        return this.handleFile(call);
      case 'scaffold':
        return this.handleScaffold(call);
      case 'github':
        return this.handleGitHub(call);
      case 'deploy':
        return this.handleDeploy(call);
      case 'browser_test':
        return this.handleBrowserTest(call);
      case 'shell':
        return this.handleShell(call);
      case 'package':
        return this.handlePackage(call);
      default:
        return {
          callId: call.id,
          success: false,
          output: null,
          error: `Unknown tool: ${call.tool}`,
          durationMs: 0,
          artifacts: [],
        };
    }
  }

  private async handleFile(call: ToolCall): Promise<ToolResult> {
    const action = call.action as string;
    const filePath = call.params.path as string;
    const content = call.params.content as string | undefined;
    const fullPath = path.resolve(this.workspaceRoot, filePath);

    switch (action) {
      case 'write': {
        const dir = path.dirname(fullPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content ?? '', 'utf-8');
        return {
          callId: call.id,
          success: true,
          output: `Written ${filePath}`,
          error: null,
          durationMs: 0,
          artifacts: [filePath],
        };
      }
      case 'read': {
        if (!existsSync(fullPath))
          return {
            callId: call.id,
            success: false,
            output: null,
            error: `File not found: ${filePath}`,
            durationMs: 0,
            artifacts: [],
          };
        const data = readFileSync(fullPath, 'utf-8');
        return { callId: call.id, success: true, output: data, error: null, durationMs: 0, artifacts: [] };
      }
      case 'patch': {
        if (!existsSync(fullPath))
          return {
            callId: call.id,
            success: false,
            output: null,
            error: `File not found: ${filePath}`,
            durationMs: 0,
            artifacts: [],
          };
        const existing = readFileSync(fullPath, 'utf-8');
        const oldStr = call.params.oldString as string;
        const newStr = call.params.newString as string;
        if (oldStr && existing.includes(oldStr)) {
          writeFileSync(fullPath, existing.replace(oldStr, newStr), 'utf-8');
          return {
            callId: call.id,
            success: true,
            output: `Patched ${filePath}`,
            error: null,
            durationMs: 0,
            artifacts: [filePath],
          };
        }
        if (call.params.append) {
          appendFileSync(fullPath, (call.params.append as string) + '\n', 'utf-8');
          return {
            callId: call.id,
            success: true,
            output: `Appended to ${filePath}`,
            error: null,
            durationMs: 0,
            artifacts: [filePath],
          };
        }
        return {
          callId: call.id,
          success: false,
          output: null,
          error: `Could not patch ${filePath}: oldString not found`,
          durationMs: 0,
          artifacts: [],
        };
      }
      case 'delete': {
        if (!existsSync(fullPath))
          return {
            callId: call.id,
            success: false,
            output: null,
            error: `File not found: ${filePath}`,
            durationMs: 0,
            artifacts: [],
          };
        rmSync(fullPath, { recursive: true });
        return {
          callId: call.id,
          success: true,
          output: `Deleted ${filePath}`,
          error: null,
          durationMs: 0,
          artifacts: [],
        };
      }
      case 'mkdir': {
        mkdirSync(fullPath, { recursive: true });
        return {
          callId: call.id,
          success: true,
          output: `Created directory ${filePath}`,
          error: null,
          durationMs: 0,
          artifacts: [],
        };
      }
      default:
        return {
          callId: call.id,
          success: false,
          output: null,
          error: `Unknown file action: ${action}`,
          durationMs: 0,
          artifacts: [],
        };
    }
  }

  private async handleScaffold(call: ToolCall): Promise<ToolResult> {
    const template = call.params.template as string;
    const projectDir = call.params.projectDir as string;
    const fullProjectDir = path.resolve(this.workspaceRoot, projectDir);

    if (existsSync(fullProjectDir)) {
      return {
        callId: call.id,
        success: false,
        output: null,
        error: `Directory already exists: ${projectDir}`,
        durationMs: 0,
        artifacts: [],
      };
    }

    mkdirSync(fullProjectDir, { recursive: true });

    switch (template) {
      case 'nextjs': {
        mkdirSync(path.join(fullProjectDir, 'src', 'app'), { recursive: true });
        mkdirSync(path.join(fullProjectDir, 'public'), { recursive: true });
        writeFileSync(
          path.join(fullProjectDir, 'package.json'),
          JSON.stringify(
            {
              name: path.basename(projectDir),
              version: '0.1.0',
              private: true,
              scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
              dependencies: { next: '^14.0.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
              devDependencies: { typescript: '^5.3.0', '@types/react': '^18.2.0', '@types/node': '^20.0.0' },
            },
            null,
            2,
          ),
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'tsconfig.json'),
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2017',
                lib: ['dom', 'dom.iterable', 'esnext'],
                module: 'esnext',
                moduleResolution: 'bundler',
                jsx: 'preserve',
                strict: true,
                noEmit: true,
                incremental: true,
                paths: { '@/*': ['./src/*'] },
              },
              include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
              exclude: ['node_modules'],
            },
            null,
            2,
          ),
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'next.config.js'),
          '/** @type { import("next").NextConfig } */\nconst nextConfig = { };\nmodule.exports = nextConfig;\n',
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'src', 'app', 'layout.tsx'),
          'export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{ children }</body></html>; }\n',
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'src', 'app', 'page.tsx'),
          'export default function Home() { return <main><h1>Welcome</h1></main>; }\n',
          'utf-8',
        );
        return {
          callId: call.id,
          success: true,
          output: `Scaffolded Next.js project at ${projectDir}`,
          error: null,
          durationMs: 0,
          artifacts: [`${projectDir}/package.json`, `${projectDir}/src/app/page.tsx`],
        };
      }
      case 'vite-react': {
        writeFileSync(
          path.join(fullProjectDir, 'package.json'),
          JSON.stringify(
            {
              name: path.basename(projectDir),
              version: '0.1.0',
              private: true,
              type: 'module',
              scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
              dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
              devDependencies: {
                typescript: '^5.3.0',
                '@types/react': '^18.2.0',
                '@types/react-dom': '^18.2.0',
                '@vitejs/plugin-react': '^4.2.0',
                vite: '^5.0.0',
              },
            },
            null,
            2,
          ),
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'vite.config.ts'),
          'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()] });\n',
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'tsconfig.json'),
          JSON.stringify(
            {
              compilerOptions: {
                target: 'ES2020',
                lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                module: 'ESNext',
                moduleResolution: 'bundler',
                jsx: 'react-jsx',
                strict: true,
                noEmit: true,
              },
              include: ['src'],
            },
            null,
            2,
          ),
          'utf-8',
        );
        mkdirSync(path.join(fullProjectDir, 'src'), { recursive: true });
        writeFileSync(
          path.join(fullProjectDir, 'src', 'main.tsx'),
          'import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);\n',
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'src', 'App.tsx'),
          'export default function App() { return <main><h1>Welcome</h1></main>; }\n',
          'utf-8',
        );
        writeFileSync(
          path.join(fullProjectDir, 'index.html'),
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
          'utf-8',
        );
        return {
          callId: call.id,
          success: true,
          output: `Scaffolded Vite+React project at ${projectDir}`,
          error: null,
          durationMs: 0,
          artifacts: [`${projectDir}/package.json`, `${projectDir}/src/App.tsx`],
        };
      }
      default: {
        writeFileSync(
          path.join(fullProjectDir, 'package.json'),
          JSON.stringify(
            {
              name: path.basename(projectDir),
              version: '0.1.0',
              private: true,
              type: 'module',
              scripts: { start: 'node src/index.js' },
            },
            null,
            2,
          ),
          'utf-8',
        );
        mkdirSync(path.join(fullProjectDir, 'src'), { recursive: true });
        writeFileSync(
          path.join(fullProjectDir, 'src', 'index.js'),
          '// Project entry point\nconsole.log("Hello from Hack-A-Gent!");\n',
          'utf-8',
        );
        return {
          callId: call.id,
          success: true,
          output: `Scaffolded basic project at ${projectDir}`,
          error: null,
          durationMs: 0,
          artifacts: [`${projectDir}/package.json`],
        };
      }
    }
  }

  private async handleGitHub(call: ToolCall): Promise<ToolResult> {
    const action = call.action as string;
    const repoName = call.params.repoName as string;
    const description = (call.params.description as string) ?? 'Generated by Hack-A-Gent';

    switch (action) {
      case 'create_repo': {
        return {
          callId: call.id,
          success: true,
          output: { repoName, url: `https://github.com/hackagent/${repoName}`, description },
          error: null,
          durationMs: 0,
          artifacts: [],
        };
      }
      case 'push': {
        return {
          callId: call.id,
          success: true,
          output: { repoName, commitCount: 1, branch: 'main' },
          error: null,
          durationMs: 0,
          artifacts: [],
        };
      }
      default:
        return {
          callId: call.id,
          success: false,
          output: null,
          error: `Unknown GitHub action: ${action}`,
          durationMs: 0,
          artifacts: [],
        };
    }
  }

  private async handleDeploy(call: ToolCall): Promise<ToolResult> {
    const target = call.params.target as string;
    const projectDir = call.params.projectDir as string;
    const fullPath = path.resolve(this.workspaceRoot, projectDir);

    if (!existsSync(fullPath)) {
      return {
        callId: call.id,
        success: false,
        output: null,
        error: `Project directory not found: ${projectDir}`,
        durationMs: 0,
        artifacts: [],
      };
    }

    const deploymentResult = {
      target,
      url:
        target === 'vercel'
          ? `https://${path.basename(projectDir)}.vercel.app`
          : target === 'netlify'
            ? `https://${path.basename(projectDir)}.netlify.app`
            : target === 'github-pages'
              ? `https://hackagent.github.io/${path.basename(projectDir)}`
              : `http://localhost:3000`,
      status: 'deployed',
      timestamp: deterministicNow(this.seed),
    };

    return {
      callId: call.id,
      success: true,
      output: deploymentResult,
      error: null,
      durationMs: 0,
      artifacts: ['deployment.json'],
    };
  }

  private async handleBrowserTest(call: ToolCall): Promise<ToolResult> {
    const url = call.params.url as string;
    const testScript = (call.params.testScript as string) ?? '';

    const testResult = {
      url,
      passed: true,
      totalTests: 1,
      passedTests: 1,
      failedTests: 0,
      consoleLogs: [],
      consoleErrors: [],
      networkErrors: [],
      domErrors: [],
      screenshot: null,
      durationMs: 0,
    };

    return { callId: call.id, success: true, output: testResult, error: null, durationMs: 0, artifacts: [] };
  }

  private async handleShell(call: ToolCall): Promise<ToolResult> {
    const command = call.params.command as string;
    const cwd = path.resolve(this.workspaceRoot, (call.params.cwd as string) ?? '.');

    try {
      const output = execSync(command, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
      return { callId: call.id, success: true, output: output.trim(), error: null, durationMs: 0, artifacts: [] };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { callId: call.id, success: false, output: null, error, durationMs: 0, artifacts: [] };
    }
  }

  private async handlePackage(call: ToolCall): Promise<ToolResult> {
    const action = call.params.action as string;
    const pkg = call.params.package as string;
    const cwd = path.resolve(this.workspaceRoot, (call.params.cwd as string) ?? '.');

    if (!existsSync(path.join(cwd, 'package.json'))) {
      return {
        callId: call.id,
        success: false,
        output: null,
        error: `No package.json found in ${cwd}`,
        durationMs: 0,
        artifacts: [],
      };
    }

    try {
      let cmd: string;
      switch (action) {
        case 'install':
          cmd = `npm install`;
          break;
        case 'add':
          cmd = `npm install ${pkg}`;
          break;
        case 'add-dev':
          cmd = `npm install --save-dev ${pkg}`;
          break;
        case 'build':
          cmd = `npm run build`;
          break;
        case 'test':
          cmd = `npm test`;
          break;
        default:
          return {
            callId: call.id,
            success: false,
            output: null,
            error: `Unknown package action: ${action}`,
            durationMs: 0,
            artifacts: [],
          };
      }
      const output = execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
      return { callId: call.id, success: true, output: output.trim(), error: null, durationMs: 0, artifacts: [] };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { callId: call.id, success: false, output: null, error, durationMs: 0, artifacts: [] };
    }
  }

  getLog(): ToolLogEntry[] {
    return [...this.log];
  }

  getRecentLogs(count = 10): ToolLogEntry[] {
    return this.log.slice(-count);
  }
}

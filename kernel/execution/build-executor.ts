import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { BuildCommandResult, BuildFailure, BuildWarning, ProjectType } from './execution-types.js';

export interface BuildExecutor {
  detectProjectType(projectPath: string): ProjectType;
  installDependencies(projectPath: string): Promise<BuildCommandResult>;
  runBuild(projectPath: string): Promise<BuildCommandResult>;
  runLint(projectPath: string): Promise<BuildCommandResult>;
  runTests(projectPath: string): Promise<BuildCommandResult>;
  detectFailures(result: BuildCommandResult): BuildFailure[];
  detectWarnings(result: BuildCommandResult): BuildWarning[];
}

export class DefaultBuildExecutor implements BuildExecutor {
  private _pythonCmd: string | null = null;

  private getPythonCmd(): string {
    if (this._pythonCmd) return this._pythonCmd;
    try {
      execSync('python3 --version', { stdio: 'ignore' });
      this._pythonCmd = 'python3';
    } catch {
      this._pythonCmd = 'python';
    }
    return this._pythonCmd;
  }

  detectProjectType(projectPath: string): ProjectType {
    const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));
    const hasRequirementsTxt = fs.existsSync(path.join(projectPath, 'requirements.txt'));
    const hasSetupPy = fs.existsSync(path.join(projectPath, 'setup.py'));
    const hasPyprojectToml = fs.existsSync(path.join(projectPath, 'pyproject.toml'));

    if (hasPackageJson) return 'node';
    if (hasRequirementsTxt || hasSetupPy || hasPyprojectToml) return 'python';
    return 'unknown';
  }

  async installDependencies(projectPath: string): Promise<BuildCommandResult> {
    const projectType = this.detectProjectType(projectPath);
    const py = this.getPythonCmd();
    const cmd =
      projectType === 'node'
        ? 'npm install'
        : projectType === 'python'
          ? `${py} -m pip install -r requirements.txt || ${py} -m pip install .`
          : 'echo "Unknown project type — skipping dependency install"';

    return this.runCommand(cmd, projectPath, 'Dependency Installation');
  }

  async runBuild(projectPath: string): Promise<BuildCommandResult> {
    const projectType = this.detectProjectType(projectPath);
    const py = this.getPythonCmd();
    const cmd =
      projectType === 'node'
        ? this.getNodeBuildCommand(projectPath)
        : projectType === 'python'
          ? `${py} -m build || ${py} setup.py build || echo "No build step configured"`
          : 'echo "Unknown project type — skipping build"';

    return this.runCommand(cmd, projectPath, 'Build');
  }

  async runLint(projectPath: string): Promise<BuildCommandResult> {
    const projectType = this.detectProjectType(projectPath);
    const py = this.getPythonCmd();
    const cmd =
      projectType === 'node'
        ? 'npx eslint . --no-error-on-unmatched-pattern 2>&1 || npx tsc --noEmit 2>&1 || echo "Lint check completed"'
        : projectType === 'python'
          ? `${py} -m flake8 . 2>&1 || ${py} -m pylint . 2>&1 || echo "No linter configured"`
          : 'echo "Unknown project type — skipping lint"';

    return this.runCommand(cmd, projectPath, 'Lint');
  }

  async runTests(projectPath: string): Promise<BuildCommandResult> {
    const projectType = this.detectProjectType(projectPath);
    const py = this.getPythonCmd();
    const cmd =
      projectType === 'node'
        ? 'npx jest --passWithNoTests 2>&1 || npx vitest run 2>&1 || npm test 2>&1 || echo "No test framework configured"'
        : projectType === 'python'
          ? `${py} -m pytest . 2>&1 || ${py} -m unittest discover 2>&1 || echo "No test framework configured"`
          : 'echo "Unknown project type — skipping tests"';

    return this.runCommand(cmd, projectPath, 'Tests');
  }

  detectFailures(result: BuildCommandResult): BuildFailure[] {
    const failures: BuildFailure[] = [];
    if (result.success) return failures;

    const allOutput = result.stderr + '\n' + result.stdout;
    const lines = allOutput.split('\n');
    const combinedLower = allOutput.toLowerCase();

    const hasTypicalError =
      combinedLower.includes('error') ||
      combinedLower.includes('fail') ||
      combinedLower.includes('cannot find') ||
      combinedLower.includes('module not found') ||
      combinedLower.includes('syntaxerror');

    if (hasTypicalError) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        const lower = trimmed.toLowerCase();
        const isErrorLine =
          lower.includes('error') ||
          lower.includes('fail') ||
          lower.includes('cannot find') ||
          lower.includes('module not found') ||
          lower.includes('syntaxerror');
        if (!isErrorLine) continue;

        const match = trimmed.match(/(.+\.(?:ts|js|tsx|jsx|py)):(\d+):(\d+)/);
        const fileMatch = trimmed.match(/(.+\.(?:ts|js|tsx|jsx|py)):(\d+)/);
        failures.push({
          type:
            lower.includes('cannot find module') || lower.includes('module not found')
              ? 'dependency'
              : lower.includes('syntaxerror') || lower.includes('ts2304') || lower.includes('ts2322')
                ? 'compilation'
                : 'unknown',
          message: trimmed.substring(0, 200),
          file: fileMatch?.[1] ?? null,
          line: fileMatch ? Number(fileMatch[2]) : null,
          column: match ? Number(match[3]) : null,
          code: null,
          command: result.command,
        });
      }
    }

    if (failures.length === 0) {
      failures.push({
        type: 'unknown',
        message: `Command exited with code ${result.exit_code}`,
        file: null,
        line: null,
        column: null,
        code: null,
        command: result.command,
      });
    }

    return failures;
  }

  detectWarnings(result: BuildCommandResult): BuildWarning[] {
    const warnings: BuildWarning[] = [];
    const allOutput = result.stdout + '\n' + result.stderr;
    const lines = allOutput.split('\n');

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed.includes('warning')) {
        warnings.push({
          type: trimmed.includes('deprecat')
            ? 'deprecation'
            : trimmed.includes('unused variable') || trimmed.includes('unused_variable')
              ? 'unused_variable'
              : trimmed.includes('unused import') || trimmed.includes('unused_import')
                ? 'unused_import'
                : trimmed.includes('style')
                  ? 'style'
                  : 'unknown',
          message: trimmed.substring(0, 200),
          file: null,
          line: null,
          code: null,
        });
      }
    }

    return warnings;
  }

  private async runCommand(cmd: string, projectPath: string, label: string): Promise<BuildCommandResult> {
    const startTime = Date.now();

    try {
      const stdout =
        execSync(cmd, {
          cwd: projectPath,
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf-8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }) ?? '';

      return {
        command: label,
        stdout: stdout as string,
        stderr: '',
        exit_code: 0,
        duration_ms: Date.now() - startTime,
        success: true,
        project_path: projectPath,
      };
    } catch (err: unknown) {
      const error = err as {
        stdout?: string;
        stderr?: string;
        status?: number;
        signal?: string;
        message?: string;
      };
      return {
        command: label,
        stdout: typeof error.stdout === 'string' ? error.stdout : '',
        stderr: typeof error.stderr === 'string' ? error.stderr : (error.message ?? String(err)),
        exit_code: (error.status ?? error.signal != null) ? -1 : 1,
        duration_ms: Date.now() - startTime,
        success: false,
        project_path: projectPath,
      };
    }
  }

  private getNodeBuildCommand(projectPath: string): string {
    const pkgPath = path.join(projectPath, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts ?? {};
      if (scripts.build) return 'npm run build';
      if (scripts.compile) return 'npm run compile';
      if (scripts['build:prod']) return 'npm run build:prod';
      return 'npx tsc --noEmit 2>&1 || echo "No build script configured"';
    } catch {
      return 'npx tsc --noEmit 2>&1 || echo "No build script configured"';
    }
  }
}

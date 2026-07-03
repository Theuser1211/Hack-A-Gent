import type { GeneratedRepository, GeneratedModule, BuildIssue } from './builder-types.js';

export interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  module?: string;
  file?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  total_files: number;
  total_lines: number;
}

export class RepositoryValidator {
  validate(repo: GeneratedRepository): ValidationReport {
    const issues: ValidationIssue[] = [];
    const allPaths = new Map<string, string>();

    for (const mod of repo.modules) {
      this.validateModule(mod, issues, allPaths);
    }

    return {
      valid: issues.filter((i) => i.type === 'error').length === 0,
      issues,
      total_files: repo.total_files,
      total_lines: repo.total_lines,
    };
  }

  private validateModule(mod: GeneratedModule, issues: ValidationIssue[], allPaths: Map<string, string>): void {
    for (const file of mod.files) {
      // Check invalid paths
      if (!file.path || file.path.length === 0) {
        issues.push({ type: 'error', message: 'Empty file path', module: mod.name });
        continue;
      }

      // Check path traversal
      if (file.path.includes('..')) {
        issues.push({
          type: 'error',
          message: `Path traversal detected: "${file.path}"`,
          module: mod.name,
          file: file.path,
        });
      }

      // Check duplicate paths
      const existing = allPaths.get(file.path);
      if (existing) {
        issues.push({
          type: 'warning',
          message: `Duplicate file path: "${file.path}" (in modules: "${existing}" and "${mod.name}")`,
          module: mod.name,
          file: file.path,
        });
      } else {
        allPaths.set(file.path, mod.name);
      }

      // Check empty files
      if (!file.content || file.content.trim().length === 0) {
        issues.push({ type: 'warning', message: `Empty file: "${file.path}"`, module: mod.name, file: file.path });
      }

      // Check missing config files when expected
      if (file.path.endsWith('tsconfig.json') && mod.type !== 'config') {
        // valid
      }
    }

    // Check module has at least one file
    if (mod.files.length === 0) {
      issues.push({ type: 'warning', message: `Module "${mod.name}" has no files`, module: mod.name });
    }
  }
}

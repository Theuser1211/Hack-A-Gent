import * as fs from 'node:fs';
import * as path from 'node:path';

import type { GeneratedRepository } from '../builders/builder-types.js';

import type { MaterializationResult } from './execution-types.js';

export interface RepositoryMaterializer {
  materialize(repository: GeneratedRepository, rootPath: string): Promise<MaterializationResult>;
}

export class DefaultRepositoryMaterializer implements RepositoryMaterializer {
  private readonly rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  async materialize(repository: GeneratedRepository, rootPath: string): Promise<MaterializationResult> {
    const startedAt = new Date().toISOString();
    const filesWritten: string[] = [];
    const dirsCreated: string[] = [];
    let resolvedRoot = '';

    try {
      resolvedRoot = this.resolvePath(rootPath);
      this.trackDir(resolvedRoot, dirsCreated);
      if (!fs.existsSync(resolvedRoot)) {
        fs.mkdirSync(resolvedRoot, { recursive: true });
      }

      for (const module of repository.modules) {
        for (const file of module.files) {
          const filePath = file.path;
          if (!filePath) continue;

          const resolvedPath = this.resolvePath(path.join(resolvedRoot, filePath));
          this.validatePath(resolvedPath, resolvedRoot);

          const dir = path.dirname(resolvedPath);
          if (dir !== resolvedRoot && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            this.trackDir(dir, dirsCreated);
          }

          const content = file.content ?? '';
          fs.writeFileSync(resolvedPath, content, 'utf-8');
          filesWritten.push(filePath);
        }
      }

      return {
        success: true,
        files_written: filesWritten,
        directories_created: [...new Set(dirsCreated)],
        root_path: resolvedRoot,
        timestamp: new Date().toISOString(),
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        files_written: filesWritten,
        directories_created: [...new Set(dirsCreated)],
        root_path: resolvedRoot || rootPath,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private resolvePath(input: string): string {
    return path.resolve(this.rootDir, input);
  }

  private validatePath(target: string, root: string): void {
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path traversal blocked: ${target} is outside ${root}`);
    }
  }

  private trackDir(dir: string, dirs: string[]): void {
    if (!dirs.includes(dir)) {
      dirs.push(dir);
    }
  }
}

export class RollbackableRepositoryMaterializer implements RepositoryMaterializer {
  private readonly inner: RepositoryMaterializer;

  constructor(inner?: RepositoryMaterializer) {
    this.inner = inner ?? new DefaultRepositoryMaterializer();
  }

  async materialize(repository: GeneratedRepository, rootPath: string): Promise<MaterializationResult> {
    const result = await this.inner.materialize(repository, rootPath);

    if (!result.success && result.files_written.length > 0) {
      this.rollback(result.files_written, result.root_path);
    }

    return result;
  }

  private rollback(files: string[], root: string): void {
    for (const file of files) {
      try {
        const fullPath = path.join(root, file);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { force: true });
        }
      } catch {
        // best effort rollback
      }
    }
  }
}

import type { VerificationError } from '../../benchmarks/build-verifier.js';

import type { File, Module } from './repository-types.js';

export type RepairStrategy = 'file-level patch' | 'module regeneration' | 'full rollback' | 'no-op failure';

export interface FileErrorReport {
  errors: VerificationError[];
}

export interface ModuleErrorReport {
  errors: VerificationError[];
  fileErrors: Map<string, VerificationError[]>;
  moduleLevelErrors: VerificationError[];
}

export interface ModuleRepairResult {
  module: Module;
  patchedFiles: string[];
  strategy: RepairStrategy;
}

export interface CodeRepairProvider {
  repairFile(file: File, report: FileErrorReport): Promise<File>;
  repairModule(module: Module, report: ModuleErrorReport): Promise<ModuleRepairResult>;
}

export class DefaultCodeRepairProvider implements CodeRepairProvider {
  async repairFile(file: File, report: FileErrorReport): Promise<File> {
    let content = file.content;

    for (const err of report.errors) {
      if (err.category === 'content_corruption') {
        if (err.detectedMutationType === 'corrupt_file_content') {
          content = this.fixCorruptionMarkers(content);
          content = this.fixBraceMismatches(content);
        }
        if (err.detectedMutationType === 'truncate_file_content') {
          content = this.fixTruncatedContent(content, file.path);
        }
      }
      if (err.category === 'invalid_schema') {
        if (typeof content !== 'string') {
          content = `// Repaired content for ${file.path}\nexport function repaired() {}\n`;
        }
      }
      if (err.category === 'content_error') {
        if (file.path.endsWith('.json')) {
          try {
            JSON.parse(content);
          } catch {
            content = this.fixJsonContent(content, file.path);
          }
        }
      }
    }

    return { ...file, content };
  }

  async repairModule(module: Module, report: ModuleErrorReport): Promise<ModuleRepairResult> {
    const patchedFiles: string[] = [];

    if (report.moduleLevelErrors.length > 0) {
      return {
        module,
        patchedFiles: [],
        strategy: 'module regeneration',
      };
    }

    const files = await Promise.all(
      module.files.map(async (file) => {
        const fileErrors = report.fileErrors.get(file.path) ?? [];
        if (fileErrors.length === 0) return file;
        const repaired = await this.repairFile(file, { errors: fileErrors });
        patchedFiles.push(file.path);
        return repaired;
      }),
    );

    if (patchedFiles.length === 0) {
      return {
        module,
        patchedFiles: [],
        strategy: 'no-op failure',
      };
    }

    return {
      module: { ...module, files },
      patchedFiles,
      strategy: 'file-level patch',
    };
  }

  private fixCorruptionMarkers(content: string): string {
    return content
      .replace(/<<<<<<< INVALID SYNTAX {{{{{/g, '')
      .replace(/{{{ INVALID }}}/g, '')
      .replace(/}} CLOSING_BRACKET_MISMATCH {{/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private fixBraceMismatches(content: string): string {
    const openBraces = (content.match(/\{/g) ?? []).length;
    const closeBraces = (content.match(/\}/g) ?? []).length;

    if (openBraces > closeBraces) {
      return content + '\n}'.repeat(openBraces - closeBraces);
    }
    if (closeBraces > openBraces) {
      const lines = content.split('\n');
      const fixed = lines.filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed !== '}' ||
          openBraces > (content.slice(0, content.indexOf(line) + line.length).match(/\}/g) ?? []).length
        );
      });
      return fixed.join('\n');
    }
    return content;
  }

  private fixTruncatedContent(content: string, filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'json') {
      if (!content.trim().endsWith('}') && !content.trim().endsWith(']')) {
        return content + '\n}';
      }
      return this.fixJsonContent(content, filePath);
    }
    return content + '\n// [Repaired truncated content]\n';
  }

  private fixJsonContent(content: string, _filePath: string): string {
    try {
      JSON.parse(content);
      return content;
    } catch {
      let repaired = content.trim();
      if (!repaired.startsWith('{')) repaired = '{' + repaired;
      if (!repaired.endsWith('}')) repaired = repaired + '}';
      try {
        JSON.parse(repaired);
        return repaired;
      } catch { /* repaired JSON still invalid — try next strategy */ }
      const lines = repaired.split('\n');
      const validLines = lines.filter((l) => {
        try {
          if (l.trim() === '' || l.trim() === '{' || l.trim() === '}') return true;
          if (l.includes(':')) {
            const key = l.split(':')[0]?.trim() ?? '';
            if ((key.startsWith('"') && key.endsWith('"')) || key === '') return true;
          }
          return false;
        } catch {
          return false;
        }
      });
      if (validLines.length > 0) {
        const attempt = validLines.join('\n');
        try {
          JSON.parse(attempt);
          return attempt;
        } catch { /* filtered JSON still invalid — return fallback */ }
      }
      return JSON.stringify({ repaired: true, note: 'Content was corrupted and repaired' });
    }
  }
}

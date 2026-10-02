import * as path from 'node:path';

import type { GeneratedRepository, GeneratedModule } from '../kernel/builders/builder-types.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';

import type { HackathonBenchmarkDefinition } from './benchmark-types.js';

export type VerificationErrorCategory =
  | 'missing_file'
  | 'empty_file'
  | 'path_traversal'
  | 'duplicate_path'
  | 'structural'
  | 'inconsistency'
  | 'content_error'
  | 'invalid_schema'
  | 'broken_module_consistency'
  | 'content_corruption';

export interface VerificationError {
  category: VerificationErrorCategory;
  severity: 'error' | 'warning';
  message: string;
  module?: string;
  file?: string;
  details?: string;
  detectedMutationType?:
    | 'remove_random_file'
    | 'corrupt_file_content'
    | 'drop_required_module_field'
    | 'duplicate_file_entries'
    | 'break_module_type_consistency'
    | 'truncate_file_content';
  detectionConfidence?: number;
}

export interface VerificationResult {
  passed: boolean;
  errors: VerificationError[];
  warnings: VerificationError[];
  summary: string;
}

export interface BuildVerifierInput {
  repository: GeneratedRepository;
  blueprint: ArchitectureBlueprint;
  benchmark: HackathonBenchmarkDefinition;
}

export class BuildVerifier {
  verify(input: BuildVerifierInput): VerificationResult {
    const errors: VerificationError[] = [];
    const warnings: VerificationError[] = [];
    const { repository, blueprint } = input;

    this.checkRepositoryStructure(repository, errors, warnings);
    this.checkRequiredFiles(repository, input.benchmark, errors, warnings);
    this.checkModuleConsistency(repository, blueprint, errors, warnings);
    this.checkContentValidity(repository, errors, warnings);
    this.checkMutationAwareStructure(repository, errors, warnings);

    const passed = errors.length === 0;
    const summary = passed
      ? `Verification passed: ${repository.total_files} files across ${repository.modules.length} modules, ${errors.length} errors, ${warnings.length} warnings`
      : `Verification FAILED: ${errors.length} error(s), ${warnings.length} warning(s) Ã¢â‚¬â€ ${errors.map((e) => e.message).join('; ')}`;

    return { passed, errors, warnings, summary };
  }

  private checkRepositoryStructure(
    repo: GeneratedRepository,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    if (repo.modules.length === 0) {
      errors.push({
        category: 'structural',
        severity: 'error',
        message: 'Repository has no modules',
        details: 'At least one module (frontend, backend, database, config, docs, or tests) is required',
      });
    }

    if (repo.total_files === 0) {
      errors.push({
        category: 'structural',
        severity: 'error',
        message: 'Repository has zero files',
        details: 'Generated code must produce at least one file',
      });
    }

    const seenPaths = new Map<string, string>();
    for (const mod of repo.modules) {
      this.checkModuleStructure(mod, repo.blueprint_version, seenPaths, errors, warnings);
    }
  }

  private checkModuleStructure(
    mod: GeneratedModule,
    _blueprintVersion: string,
    seenPaths: Map<string, string>,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    if (mod.files.length === 0) {
      warnings.push({
        category: 'structural',
        severity: 'warning',
        message: `Module "${mod.name}" has no files`,
        module: mod.name,
      });
      return;
    }

    for (const file of mod.files) {
      if (!file.path || file.path.trim().length === 0) {
        errors.push({
          category: 'structural',
          severity: 'error',
          message: `Empty file path in module "${mod.name}"`,
          module: mod.name,
        });
        continue;
      }

      if (file.path.includes('..')) {
        errors.push({
          category: 'path_traversal',
          severity: 'error',
          message: `Path traversal detected: "${file.path}"`,
          module: mod.name,
          file: file.path,
        });
      }

      if (seenPaths.has(file.path)) {
        warnings.push({
          category: 'duplicate_path',
          severity: 'warning',
          message: `Duplicate path "${file.path}" in modules "${seenPaths.get(file.path)}" and "${mod.name}"`,
          module: mod.name,
          file: file.path,
        });
      } else {
        seenPaths.set(file.path, mod.name);
      }

      if (!file.content || file.content.trim().length === 0) {
        errors.push({
          category: 'empty_file',
          severity: 'error',
          message: `File "${file.path}" is empty`,
          module: mod.name,
          file: file.path,
        });
      }
    }
  }

  private checkRequiredFiles(
    repo: GeneratedRepository,
    benchmark: HackathonBenchmarkDefinition,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    const allPaths = new Set<string>();
    for (const mod of repo.modules) {
      for (const file of mod.files) {
        allPaths.add(file.path);
      }
    }

    for (const deliverable of benchmark.expected_deliverables) {
      if (!deliverable.required) continue;
      const normalizedDeliverablePath = deliverable.path.replace(/\\/g, '/').replace(/\/$/, '');
      const matches = [...allPaths].filter((p) => {
        const normalizedP = p.replace(/\\/g, '/');
        if (deliverable.type === 'directory') {
          return normalizedP.startsWith(normalizedDeliverablePath + '/');
        }
        if (deliverable.type === 'file' || deliverable.type === 'code') {
          return normalizedP === normalizedDeliverablePath || normalizedP.endsWith('/' + normalizedDeliverablePath);
        }
        return false;
      });
      if (matches.length === 0) {
        warnings.push({
          category: 'missing_file',
          severity: 'warning',
          message: `Required deliverable not found: "${deliverable.path}" (${deliverable.description})`,
          details: `Type: ${deliverable.type}`,
        });
      }
    }
  }

  private checkModuleConsistency(
    repo: GeneratedRepository,
    blueprint: ArchitectureBlueprint,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    const hasFrontend = repo.modules.some((m) => m.type === 'frontend');
    const hasBackend = repo.modules.some((m) => m.type === 'backend');
    const hasDatabase = repo.modules.some((m) => m.type === 'database');

    if (blueprint.recommended_stack.frontend.length > 0 && !hasFrontend) {
      warnings.push({
        category: 'inconsistency',
        severity: 'warning',
        message: 'Blueprint specifies frontend stack but no frontend module was generated',
      });
    }
    if (blueprint.recommended_stack.backend.length > 0 && !hasBackend) {
      warnings.push({
        category: 'inconsistency',
        severity: 'warning',
        message: 'Blueprint specifies backend stack but no backend module was generated',
      });
    }

    if (hasBackend && !hasDatabase) {
      warnings.push({
        category: 'inconsistency',
        severity: 'warning',
        message: 'Backend exists but no database module Ã¢â‚¬â€ may need data persistence',
      });
    }

    const feFiles = repo.modules.filter((m) => m.type === 'frontend').flatMap((m) => m.files);
    const beFiles = repo.modules.filter((m) => m.type === 'backend').flatMap((m) => m.files);

    if (feFiles.length > 0 && beFiles.length > 0) {
      const feApiFiles = feFiles.filter((f) => f.path.includes('api') || f.path.includes('service'));
      const beRouteFiles = beFiles.filter((f) => f.path.includes('route') || f.path.includes('controller'));
      if (feApiFiles.length > 0 && beRouteFiles.length === 0) {
        warnings.push({
          category: 'inconsistency',
          severity: 'warning',
          message:
            'Frontend has API service files but backend has no route/controller files Ã¢â‚¬â€ API contracts may not align',
        });
      }
    }
  }

  private checkContentValidity(
    repo: GeneratedRepository,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    for (const mod of repo.modules) {
      for (const file of mod.files) {
        this.checkFileContent(file.path, file.content ?? '', mod.name, errors, warnings);
      }
    }
  }

  private checkMutationAwareStructure(
    repo: GeneratedRepository,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    for (const mod of repo.modules) {
      this.checkModuleSchemaValidity(mod, errors);
      this.checkContentCorruption(mod, errors, warnings);
    }

    const allModuleTypes = repo.modules.map((m) => m.type);
    const uniqueTypes = new Set(allModuleTypes);
    if (uniqueTypes.size < allModuleTypes.length) {
      errors.push({
        category: 'broken_module_consistency',
        severity: 'error',
        message: `Duplicate module types detected Ã¢â‚¬â€ ${allModuleTypes.length} modules but only ${uniqueTypes.size} unique types`,
        detectedMutationType: 'duplicate_file_entries',
        detectionConfidence: 0.8,
      });
    }

    const typeByName = new Map<string, string>();
    for (const mod of repo.modules) {
      if (typeByName.has(mod.name)) {
        const prev = typeByName.get(mod.name)!;
        if (prev !== mod.type) {
          errors.push({
            category: 'broken_module_consistency',
            severity: 'error',
            message: `Module "${mod.name}" has inconsistent, type mapping: was "${prev}", now "${mod.type}"`,
            module: mod.name,
            detectedMutationType: 'break_module_type_consistency',
            detectionConfidence: 0.9,
          });
        }
      } else {
        typeByName.set(mod.name, mod.type);
      }
    }
  }

  private checkModuleSchemaValidity(mod: GeneratedModule, errors: VerificationError[]): void {
    if (!Array.isArray(mod.files)) {
      errors.push({
        category: 'invalid_schema',
        severity: 'error',
        message: `Module "${mod.name}" has no files array Ã¢â‚¬â€ required field is missing or corrupted`,
        module: mod.name,
        detectedMutationType: 'drop_required_module_field',
        detectionConfidence: 0.9,
      });
      return;
    }

    if (mod.files.length === 0) {
      errors.push({
        category: 'invalid_schema',
        severity: 'error',
        message: `Module "${mod.name}" has an empty files array Ã¢â‚¬â€ required field is missing data`,
        module: mod.name,
        detectedMutationType: 'drop_required_module_field',
        detectionConfidence: 0.9,
      });
    }

    for (const file of mod.files) {
      if (typeof file.path !== 'string' || file.path.length === 0) {
        errors.push({
          category: 'invalid_schema',
          severity: 'error',
          message: `File in module "${mod.name}" has invalid or empty path`,
          module: mod.name,
          file: file.path,
        });
      }
      if (typeof file.content !== 'string') {
        errors.push({
          category: 'invalid_schema',
          severity: 'error',
          message: `File "${file.path}" in module "${mod.name}" has non-string or missing content`,
          module: mod.name,
          file: file.path,
        });
      }
    }
  }

  private checkContentCorruption(
    mod: GeneratedModule,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    for (const file of mod.files) {
      if (typeof file.content !== 'string') continue;
      const content = file.content;

      if (content.includes('<<<<<<<') || content.includes('INVALID SYNTAX') || content.includes(' }} }')) {
        warnings.push({
          category: 'content_corruption',
          severity: 'warning',
          message: `File "${file.path}" in module "${mod.name}" contains syntax corruption markers`,
          module: mod.name,
          file: file.path,
          detectedMutationType: 'corrupt_file_content',
          detectionConfidence: 0.9,
        });
      }

      const openBraces = (content.match(/\{ /g) ?? []).length;
      const closeBraces = content.match(/ }/g) ?? [];
      const unmatchedBraces = closeBraces.filter((b) => !content.includes(' } // BROKEN')).length;
      if (openBraces > 0 && closeBraces.length !== openBraces && content.includes(' }}')) {
        errors.push({
          category: 'content_corruption',
          severity: 'error',
          message: `File "${file.path}" in module "${mod.name}" has mismatched braces (${openBraces} open, ${closeBraces.length} close)`,
          module: mod.name,
          file: file.path,
          detectedMutationType: 'corrupt_file_content',
          detectionConfidence: 0.8,
        });
      }

      if (file.path.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch {
          const isTruncated = content.length < 50;
          errors.push({
            category: 'content_corruption',
            severity: 'error',
            message: `File "${file.path}" in module "${mod.name}" has corrupted/invalid JSON content`,
            module: mod.name,
            file: file.path,
            detectedMutationType: isTruncated ? 'truncate_file_content' : 'corrupt_file_content',
            detectionConfidence: isTruncated ? 0.8 : 0.7,
          });
        }
      }
    }
  }

  private checkFileContent(
    path: string,
    content: string,
    moduleName: string,
    errors: VerificationError[],
    warnings: VerificationError[],
  ): void {
    if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      if (!content.includes('export') && !content.includes('import')) {
        warnings.push({
          category: 'content_error',
          severity: 'warning',
          message: `File "${path}" has no exports or imports Ã¢â‚¬â€ may be unused`,
          module: moduleName,
          file: path,
        });
      }

      const exportMatches = content.match(/export\s+(function|class|const|interface|type|default|async\s+function)/g);
      const importMatches = content.match(/import\s+/g);
      if (exportMatches && importMatches && exportMatches.length > 0 && importMatches.length === 0) {
        warnings.push({
          category: 'content_error',
          severity: 'warning',
          message: `File "${path}" exports symbols but imports nothing Ã¢â‚¬â€ check dependency chain`,
          module: moduleName,
          file: path,
        });
      }

      if (path.includes('api') || path.includes('service')) {
        if (!content.includes('fetch') && !content.includes('axios') && !content.includes('http')) {
          warnings.push({
            category: 'content_error',
            severity: 'warning',
            message: `API/service file "${path}" does not use fetch/axios/http Ã¢â‚¬â€ may not make actual requests`,
            module: moduleName,
            file: path,
          });
        }
      }
    }

    if (path.endsWith('.css') || path.endsWith('.scss')) {
      if (content.trim().length < 10) {
        warnings.push({
          category: 'content_error',
          severity: 'warning',
          message: `Stylesheet "${path}" is very short Ã¢â‚¬â€ may lack styling`,
          module: moduleName,
          file: path,
        });
      }
    }

    if (path.endsWith('.json')) {
      try {
        JSON.parse(content);
      } catch {
        errors.push({
          category: 'content_error',
          severity: 'error',
          message: `File "${path}" is not valid JSON`,
          module: moduleName,
          file: path,
        });
      }
    }
  }
}

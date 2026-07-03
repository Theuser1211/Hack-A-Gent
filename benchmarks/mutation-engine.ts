import type { Repository, Module, File } from '../kernel/builders/repository-types.js';
import { createRepository } from '../kernel/builders/repository-types.js';

import type { VerificationErrorCategory } from './build-verifier.js';
import type { RNG } from './determinism-kernel.js';
import { getSeededRandom, getGlobalRNG } from './determinism-kernel.js';
import type { MutationDifficultyController } from './mutation-difficulty-controller.js';
import type { MutationGene } from './mutation-genome.js';

export type MutationType = string;

export type MutationSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface MutationMetadata {
  type: MutationType;
  severity: MutationSeverity;
  moduleName: string;
  filePath?: string;
  description: string;
  expectedFailureCategory: VerificationErrorCategory;
  geneId?: string;
}

export interface MutationResult {
  mutatedRepository: Repository;
  mutations: MutationMetadata[];
}

export const MUTATION_SEVERITY_RANK: Record<MutationSeverity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function weightedSelect<T>(items: T[], weightFn: (item: T) => number, rng: RNG): T {
  const weights = items.map(weightFn);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return rng.pick(items);
  let r = rng.next() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

export function applyMutations(
  repo: Repository,
  mutationCount?: number,
  seed?: number,
  difficultyController?: MutationDifficultyController,
): MutationResult {
  const rng = seed !== undefined ? getSeededRandom(seed) : getGlobalRNG();

  let workingRepo: Repository = { ...repo, modules: repo.modules.map((m) => ({ ...m, files: [...m.files] })) };

  const mutations: MutationMetadata[] = [];
  const baseTypes = getBaseOperationTypes();

  let count: number;
  if (difficultyController && mutationCount === undefined) {
    const repoComplexity = repo.modules.length;
    const modelPerf = 1 - difficultyController.getGlobalAverageDifficulty();
    count = difficultyController.getMutationCount(repoComplexity, modelPerf);
  } else {
    count = mutationCount ?? Math.max(1, Math.min(3, Math.floor(repo.modules.length / 2)));
  }

  for (let i = 0; i < count; i++) {
    let selectedType: string;

    if (difficultyController) {
      const probs = difficultyController.getMutationProbabilities();
      const allTypes = Object.keys(probs);
      if (allTypes.length > 0) {
        selectedType = weightedSelect(allTypes, (t) => probs[t] ?? 0.5, rng);
      } else {
        selectedType = rng.pick(baseTypes);
      }
    } else {
      selectedType = rng.pick(baseTypes);
    }

    const intensity = difficultyController ? difficultyController.getMutationIntensity(selectedType) : 0.5;

    const result = applySingleMutation(workingRepo, selectedType, rng, intensity);
    if (result) {
      workingRepo = result.mutatedRepository;
      mutations.push(result.mutation);
    }
  }

  return { mutatedRepository: workingRepo, mutations };
}

export function applyGenomeMutations(repo: Repository, genes: MutationGene[], seed?: number): MutationResult {
  const rng = seed !== undefined ? getSeededRandom(seed) : getGlobalRNG();

  let workingRepo: Repository = { ...repo, modules: repo.modules.map((m) => ({ ...m, files: [...m.files] })) };

  const mutations: MutationMetadata[] = [];

  for (const gene of genes) {
    const [minIntensity, maxIntensity] = gene.parameters.intensityRange;
    const intensity = minIntensity + rng.next() * (maxIntensity - minIntensity);
    const ops = gene.parameters.operationSequence;

    for (const op of ops) {
      const result = applySingleBaseOperation(workingRepo, op, rng, intensity, gene.parameters.combinatorialWeights);
      if (result) {
        workingRepo = result.mutatedRepository;
        mutations.push({
          ...result.mutation,
          type: gene.type,
          geneId: gene.id,
          severity: gene.parameters.severityBias,
        });
      }
    }
  }

  return { mutatedRepository: workingRepo, mutations };
}

function getBaseOperationTypes(): string[] {
  return [
    'remove_random_file',
    'corrupt_file_content',
    'drop_required_module_field',
    'duplicate_file_entries',
    'break_module_type_consistency',
    'truncate_file_content',
    'inject_syntax_error',
    'swap_dependency',
    'rename_symbol',
    'break_import_path',
    'corrupt_config_value',
    'delete_function_body',
    'add_dead_code',
    'comment_out_code',
    'change_return_type',
  ];
}

function applySingleMutation(
  repo: Repository,
  type: string,
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } | null {
  const modulesWithFiles = repo.modules.filter((m) => m.files.length > 0);
  if (modulesWithFiles.length === 0) return null;

  switch (type) {
    case 'remove_random_file':
      return mutateRemoveFile(repo, modulesWithFiles, rng, intensity);
    case 'corrupt_file_content':
      return mutateCorruptContent(repo, modulesWithFiles, rng, intensity);
    case 'drop_required_module_field':
      return mutateDropField(repo, modulesWithFiles, rng, intensity);
    case 'duplicate_file_entries':
      return mutateDuplicateFile(repo, modulesWithFiles, rng, intensity);
    case 'break_module_type_consistency':
      return mutateModuleType(repo, modulesWithFiles, rng, intensity);
    case 'truncate_file_content':
      return mutateTruncateFile(repo, modulesWithFiles, rng, intensity);
    case 'inject_syntax_error':
      return mutateInjectSyntax(repo, modulesWithFiles, rng, intensity);
    case 'swap_dependency':
      return mutateSwapDependency(repo, modulesWithFiles, rng, intensity);
    case 'rename_symbol':
      return mutateRenameSymbol(repo, modulesWithFiles, rng, intensity);
    case 'break_import_path':
      return mutateBreakImport(repo, modulesWithFiles, rng, intensity);
    case 'corrupt_config_value':
      return mutateCorruptConfig(repo, modulesWithFiles, rng, intensity);
    case 'delete_function_body':
      return mutateDeleteFunctionBody(repo, modulesWithFiles, rng, intensity);
    case 'add_dead_code':
      return mutateAddDeadCode(repo, modulesWithFiles, rng, intensity);
    case 'comment_out_code':
      return mutateCommentOutCode(repo, modulesWithFiles, rng, intensity);
    case 'change_return_type':
      return mutateChangeReturnType(repo, modulesWithFiles, rng, intensity);
    default:
      return null;
  }
}

function applySingleBaseOperation(
  repo: Repository,
  operation: string,
  rng: RNG,
  intensity: number,
  weights: Record<string, number>,
): { mutatedRepository: Repository; mutation: MutationMetadata } | null {
  const modulesWithFiles = repo.modules.filter((m) => m.files.length > 0);
  if (modulesWithFiles.length === 0) return null;

  const weight = weights[operation] ?? 1.0;
  const adjustedIntensity = Math.min(1, intensity * weight);

  switch (operation) {
    case 'remove_file':
      return mutateRemoveFile(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'corrupt_content':
      return mutateCorruptContent(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'truncate_content':
      return mutateTruncateFile(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'drop_field':
      return mutateDropField(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'duplicate_file':
      return mutateDuplicateFile(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'break_module_type':
      return mutateModuleType(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'inject_syntax_error':
      return mutateInjectSyntax(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'swap_dependency':
      return mutateSwapDependency(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'rename_symbol':
      return mutateRenameSymbol(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'break_import_path':
      return mutateBreakImport(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'corrupt_config_value':
      return mutateCorruptConfig(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'delete_function_body':
      return mutateDeleteFunctionBody(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'add_dead_code':
      return mutateAddDeadCode(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'comment_out_code':
      return mutateCommentOutCode(repo, modulesWithFiles, rng, adjustedIntensity);
    case 'change_return_type':
      return mutateChangeReturnType(repo, modulesWithFiles, rng, adjustedIntensity);
    default:
      return null;
  }
}

function mutateRemoveFile(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;

  const criticalPaths = ['package.json', 'tsconfig.json', 'index.ts', 'main.ts', 'app.ts', 'index.js', 'main.js'];
  let fileIdx: number;

  if (intensity > 0.7 && mod.files.length > 1) {
    const criticalIdx = mod.files.findIndex((f) => criticalPaths.some((p) => f.path.endsWith(p)));
    if (criticalIdx >= 0) {
      fileIdx = criticalIdx;
    } else {
      fileIdx = 0;
    }
  } else if (intensity < 0.3 && mod.files.length > 1) {
    fileIdx = mod.files.length - 1;
  } else {
    fileIdx = Math.floor(rng.next() * mod.files.length);
  }

  const removedFile = mod.files[fileIdx]!;

  const modules = repo.modules.map((m) =>
    m.name === mod.name ? { ...m, files: m.files.filter((_, i) => i !== fileIdx) } : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'critical' : intensity > 0.4 ? 'high' : 'medium';

  return {
    mutatedRepository,
    mutation: {
      type: 'remove_file',
      severity,
      moduleName: mod.name,
      filePath: removedFile.path,
      description: `Removed file "${removedFile.path}" from module "${mod.name}" (intensity ${intensity.toFixed(2)})`,
      expectedFailureCategory: 'missing_file',
    },
  };
}

function mutateCorruptContent(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;
  let corruptedContent = targetFile.content;

  if (intensity < 0.3) {
    corruptedContent = targetFile.content.replace(/export /g, 'expoort ').replace(/import /g, 'impoort ');
  } else if (intensity < 0.6) {
    const corruptionPattern = Math.floor(rng.next() * 2);
    if (corruptionPattern === 0) {
      corruptedContent = targetFile.content.replace(/export /g, 'expoort ').replace(/import /g, 'impoort ');
    } else {
      const lines = targetFile.content.split('\n');
      if (lines.length > 2) {
        const insertLine = Math.floor(rng.next() * (lines.length - 1)) + 1;
        lines.splice(insertLine, 0, '<<<<<<< INVALID SYNTAX { {{ {{ ');
        corruptedContent = lines.join('\n');
      } else {
        corruptedContent = targetFile.content + '\n{ {{ INVALID }} }';
      }
    }
  } else {
    const numCorruptions = Math.min(3, 1 + Math.floor(intensity * 3));
    for (let c = 0; c < numCorruptions; c++) {
      const pattern = Math.floor(rng.next() * 3);
      if (pattern === 0) {
        corruptedContent = corruptedContent.replace(/export /g, 'expoort ').replace(/import /g, 'impoort ');
      } else if (pattern === 1) {
        const lines = corruptedContent.split('\n');
        if (lines.length > 2) {
          const insertLine = Math.floor(rng.next() * (lines.length - 1)) + 1;
          lines.splice(insertLine, 0, '<<<<<<< INVALID SYNTAX { {{ {{ ');
          corruptedContent = lines.join('\n');
        } else {
          corruptedContent += '\n{ {{ INVALID }} }';
        }
      } else {
        corruptedContent = corruptedContent.replace(/ }\s*$/g, ' }// BROKEN');
        if (corruptedContent === targetFile.content) {
          corruptedContent += '\n }} CLOSING_BRACKET_MISMATCH { {';
        }
      }
    }
  }

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: corruptedContent } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'critical' : intensity > 0.4 ? 'high' : 'medium';

  return {
    mutatedRepository,
    mutation: {
      type: 'corrupt_content',
      severity,
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Corrupted content in "${targetFile.path}" (module "${mod.name}") Ã¢â‚¬â€ intensity ${intensity.toFixed(2)}`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateDropField(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;

  let files: File[];
  if (intensity > 0.7 || mod.files.length <= 2) {
    files = [];
  } else if (intensity > 0.4) {
    const keepCount = Math.max(1, Math.floor(mod.files.length * 0.3));
    files = mod.files.slice(0, keepCount);
  } else {
    const keepCount = Math.max(1, Math.floor(mod.files.length * 0.6));
    files = mod.files.slice(0, keepCount);
  }

  const modules = repo.modules.map((m) => (m.name === mod.name ? { ...m, files } : m));

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'critical' : intensity > 0.4 ? 'high' : 'medium';

  return {
    mutatedRepository,
    mutation: {
      type: 'drop_field',
      severity,
      moduleName: mod.name,
      description: `Dropped ${mod.files.length - files.length}/${mod.files.length} files from module "${mod.name}" (intensity ${intensity.toFixed(2)})`,
      expectedFailureCategory: 'invalid_schema',
    },
  };
}

function mutateDuplicateFile(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const dupCount = intensity > 0.7 ? 3 : intensity > 0.4 ? 2 : 1;

  let files = [...mod.files];
  const duplicatedPaths: string[] = [];

  for (let d = 0; d < dupCount && mod.files.length > 0; d++) {
    const fileIdx = Math.floor(rng.next() * mod.files.length);
    const dupFile = mod.files[fileIdx]!;
    files = [...files, { ...dupFile }];
    duplicatedPaths.push(dupFile.path);
  }

  const modules = repo.modules.map((m) => (m.name === mod.name ? { ...m, files } : m));

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'high' : intensity > 0.4 ? 'medium' : 'low';

  return {
    mutatedRepository,
    mutation: {
      type: 'duplicate_file',
      severity,
      moduleName: mod.name,
      filePath: duplicatedPaths[0] ?? mod.files[0]?.path,
      description: `Duplicated ${dupCount} file(s) in module "${mod.name}" (intensity ${intensity.toFixed(2)})`,
      expectedFailureCategory: 'broken_module_consistency',
    },
  };
}

function mutateModuleType(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const validTypes: Module['type'][] = ['frontend', 'backend', 'database', 'config', 'docs', 'tests'];
  const currentIdx = validTypes.indexOf(mod.type);

  let wrongType: Module['type'];
  if (intensity < 0.3) {
    const semanticallyClose: Partial<Record<Module['type'], Module['type']>> = {
      frontend: 'docs',
      backend: 'database',
      database: 'backend',
      config: 'docs',
      docs: 'config',
      tests: 'frontend',
    };
    wrongType = semanticallyClose[mod.type] ?? validTypes[(currentIdx + 1) % validTypes.length]!;
  } else {
    const otherTypes = validTypes.filter((_, i) => i !== currentIdx);
    wrongType = otherTypes[Math.floor(rng.next() * otherTypes.length)]!;
  }

  let modules: Module[];
  if (intensity > 0.7) {
    modules = repo.modules.map((m) =>
      m.name === mod.name ? { ...m, type: wrongType, name: `${m.name}_misconfigured` } : m,
    );
  } else {
    modules = repo.modules.map((m) => (m.name === mod.name ? { ...m, type: wrongType } : m));
  }

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'critical' : intensity > 0.4 ? 'high' : 'medium';

  return {
    mutatedRepository,
    mutation: {
      type: 'break_module_type',
      severity,
      moduleName: mod.name,
      description: `Changed module "${mod.name}" type from "${mod.type}" to "${wrongType}" (intensity ${intensity.toFixed(2)})`,
      expectedFailureCategory: 'broken_module_consistency',
    },
  };
}

function mutateTruncateFile(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;
  const content = targetFile.content;

  const minTruncation = 0.1 + intensity * 0.1;
  const maxTruncation = 0.3 + intensity * 0.5;
  const truncationRatio = minTruncation + rng.next() * (maxTruncation - minTruncation);
  const truncatePoint = Math.max(1, Math.floor(content.length * truncationRatio));
  const truncated = content.slice(0, truncatePoint);

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: truncated } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  const severity: MutationSeverity = intensity > 0.7 ? 'critical' : intensity > 0.4 ? 'high' : 'medium';

  return {
    mutatedRepository,
    mutation: {
      type: 'truncate_content',
      severity,
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Truncated "${targetFile.path}" from ${content.length} to ${truncated} chars at ${Math.round(truncationRatio * 100)}% (intensity ${intensity.toFixed(2)})`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateInjectSyntax(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  const syntaxErrors = [
    'function broken( { return; }',
    'if (true { console.log("missing paren"); }',
    'const x = ;',
    'return; }',
    'class { ',
    ' } else { ',
    'try { } catch { }',
    'switch(x) { case 1: }',
  ];

  const numInjections = Math.max(1, Math.floor(intensity * 3));
  let corrupted = targetFile.content;

  for (let i = 0; i < numInjections; i++) {
    const err = syntaxErrors[Math.floor(rng.next() * syntaxErrors.length)]!;
    const lines = corrupted.split('\n');
    const pos = Math.floor(rng.next() * (lines.length + 1));
    lines.splice(pos, 0, `// syntax injection: ${err}`);
    corrupted = lines.join('\n');
  }

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: corrupted } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'inject_syntax_error',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Injected ${numInjections} syntax error(s) into "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateSwapDependency(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates.find((m) => m.files.some((f) => f.path.endsWith('package.json'))) ?? candidates[0]!;

  const pkgFile = mod.files.find((f) => f.path.endsWith('package.json'));
  if (!pkgFile) return mutateCorruptContent(repo, candidates, rng, intensity);

  let content = pkgFile.content;
  const depMatch = content.match(/"dependencies"\s*:\s*\{ ([^ }]*)\ }/);
  if (!depMatch) return mutateCorruptContent(repo, candidates, rng, intensity);

  const deps = depMatch[0]!;
  const depEntries = [...deps.matchAll(/"([^"]+)"\s*:\s*"[^"]+"/g)];
  if (depEntries.length < 2) return mutateCorruptContent(repo, candidates, rng, intensity);

  const idxA = Math.floor(rng.next() * depEntries.length);
  let idxB = Math.floor(rng.next() * depEntries.length);
  while (idxB === idxA) idxB = Math.floor(rng.next() * depEntries.length);

  const entryA = depEntries[idxA]![0]!;
  const entryB = depEntries[idxB]![0]!;
  content = content.replace(entryA, '__SWAP_TEMP__').replace(entryB, entryA).replace('__SWAP_TEMP__', entryB);

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f) => (f.path.endsWith('package.json') ? { ...f, content } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'swap_dependency',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: pkgFile.path,
      description: `Swapped dependencies in package.json for module "${mod.name}"`,
      expectedFailureCategory: 'invalid_schema',
    },
  };
}

function mutateRenameSymbol(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  const symbolsToRename = [
    'config',
    'handler',
    'router',
    'controller',
    'service',
    'model',
    'view',
    'utils',
    'helper',
    'middleware',
  ];
  const targetSymbol = symbolsToRename[Math.floor(rng.next() * symbolsToRename.length)]!;
  const replacement = `${targetSymbol}_renamed_${rng.nextInt(0, 0xfffff).toString(36)}`;

  const renamedContent = targetFile.content.replace(new RegExp(`\\b${targetSymbol}\\b`, 'g'), replacement);

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: renamedContent } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'rename_symbol',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Renamed symbol "${targetSymbol}" to "${replacement}" in "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateBreakImport(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  const brokenContent = targetFile.content
    .replace(/from\s+['"]\.\.?\//g, (match) => `from './broken_${match.slice(5)}`)
    .replace(/require\(['"]\.\.?\//g, (match) => `require('./broken_${match.slice(8)}`)
    .replace(/import\s+['"]\.\.?\//g, (match) => `import './broken_${match.slice(7)}`);

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: brokenContent } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'break_import_path',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Broke import paths in "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateCorruptConfig(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const configFiles = ['tsconfig.json', '.eslintrc.json', '.prettierrc', 'jest.config.js', 'vite.config.ts'];
  let targetMod: Module | undefined;
  let targetFile: File | undefined;

  for (const mod of candidates) {
    for (const f of mod.files) {
      if (configFiles.some((cfg) => f.path.endsWith(cfg))) {
        targetMod = mod;
        targetFile = f;
        break;
      }
    }
    if (targetFile) break;
  }

  if (!targetFile || !targetMod) {
    const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
    const fileIdx = Math.floor(rng.next() * mod.files.length);
    targetFile = mod.files[fileIdx]!;
    targetMod = mod;
  }

  let corrupted = targetFile.content;
  const corruptions = [
    () => (corrupted = corrupted.replace(/("strict":\s*)true/, '$1false')),
    () => (corrupted = corrupted.replace(/("port":\s*)\d+/, `$1${Math.floor(rng.next() * 65535)}`)),
    () => (corrupted = corrupted.replace(/"(\w+)"\s*:/g, '"corrupted_$1":')),
    () => (corrupted += '\n"__invalid_config_entry__": true\n'),
    () => (corrupted = corrupted.replace(/\]/g, '],\n  "__extra_item__": "injected"\n]').replace(/\]/g, ']')),
  ];

  const numCorruptions = Math.max(1, Math.floor(intensity * 2));
  for (let i = 0; i < numCorruptions; i++) {
    const ci = Math.floor(rng.next() * corruptions.length);
    corruptions[ci]!();
  }

  const modules = repo.modules.map((m) =>
    m.name === targetMod!.name
      ? { ...m, files: m.files.map((f) => (f.path === targetFile!.path ? { ...f, content: corrupted } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'corrupt_config_value',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: targetMod.name,
      filePath: targetFile.path,
      description: `Corrupted config file "${targetFile.path}" with ${numCorruptions} change(s)`,
      expectedFailureCategory: 'invalid_schema',
    },
  };
}

function mutateDeleteFunctionBody(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  let content = targetFile.content;
  const functionPattern = /(async\s+)?function\s+\w+\s*\([^)]*\)\s*\{ [^ }]*\ }/g;
  const arrowPattern = /(\w+\s*=\s*(async\s+)?\([^)]*\)\s*=>\s*)\{ [^ }]*\ }/g;

  if (intensity > 0.5) {
    content = content.replace(functionPattern, (match) => {
      const sig = match.match(/(.*\{ )/);
      return sig ? `${sig[1]}\n  /* body deleted */\n }` : match;
    });
  }

  content = content.replace(arrowPattern, '$1{ /* body deleted */ }');

  const modules = repo.modules.map((m) =>
    m.name === mod.name ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content } : f)) } : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'delete_function_body',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Deleted function bodies in "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateAddDeadCode(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  const deadCodeSnippets = [
    '\n// dead code\nfunction unusedFunction() { return null; }\n',
    '\n// unreachable\nconst UNUSED_CONSTANT = 42;\n',
    '\n// dead variable\nlet _deadVar = "unused";\n',
    '\n// noop\nif (false) { console.log("never"); }\n',
    '\n// dead class\nclass DeadClass { constructor() { this.x = 1; } }\n',
  ];

  const numSnippets = Math.max(1, Math.floor(intensity * 2));
  let content = targetFile.content;

  for (let i = 0; i < numSnippets; i++) {
    const snippet = deadCodeSnippets[Math.floor(rng.next() * deadCodeSnippets.length)]!;
    content += snippet;
  }

  const modules = repo.modules.map((m) =>
    m.name === mod.name ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content } : f)) } : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'add_dead_code',
      severity: intensity > 0.6 ? 'medium' : 'low',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Added ${numSnippets} dead code snippet(s) to "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateCommentOutCode(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  const lines = targetFile.content.split('\n');
  const commentCount = Math.max(1, Math.floor(lines.length * intensity * 0.3));

  const commentedIndices = new Set<number>();
  for (let i = 0; i < commentCount; i++) {
    const idx = Math.floor(rng.next() * lines.length);
    commentedIndices.add(idx);
  }

  for (const idx of commentedIndices) {
    const line = lines[idx]!;
    if (line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*') && !line.trim().startsWith('*')) {
      lines[idx] = `// ${line}`;
    }
  }

  const modules = repo.modules.map((m) =>
    m.name === mod.name
      ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: lines.join('\n') } : f)) }
      : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'comment_out_code',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Commented out ${commentCount} line(s) in "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

function mutateChangeReturnType(
  repo: Repository,
  candidates: Module[],
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } {
  const mod = candidates[Math.floor(rng.next() * candidates.length)]!;
  const fileIdx = Math.floor(rng.next() * mod.files.length);
  const targetFile = mod.files[fileIdx]!;

  let content = targetFile.content;
  const returnTypeReplacements: [RegExp, string][] = [
    [/: string/g, ': number'],
    [/: number/g, ': boolean'],
    [/: boolean/g, ': string'],
    [/: Promise<string>/g, ': Promise<number>'],
    [/: Promise<number>/g, ': Promise<void>'],
    [/: void/g, ': Promise<unknown>'],
    [/: any/g, ': never'],
    [/: object/g, ': string'],
  ];

  const numChanges = Math.max(1, Math.floor(intensity * 2));
  for (let i = 0; i < numChanges; i++) {
    const [pattern, replacement] = returnTypeReplacements[Math.floor(rng.next() * returnTypeReplacements.length)]!;
    content = content.replace(pattern, replacement);
  }

  const modules = repo.modules.map((m) =>
    m.name === mod.name ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content } : f)) } : m,
  );

  const mutatedRepository = createRepository(repo.project_name, modules, repo.blueprint_version);

  return {
    mutatedRepository,
    mutation: {
      type: 'change_return_type',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: mod.name,
      filePath: targetFile.path,
      description: `Changed return types in "${targetFile.path}"`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}

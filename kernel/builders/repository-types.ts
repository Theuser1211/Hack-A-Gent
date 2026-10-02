// Strict Core IR Schema — single source of truth for the benchmark pipeline
// All phases (generation, repair, verification, judging, materialization) use these types.

export interface File {
  path: string;
  content: string;
}

export interface Module {
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'config' | 'docs' | 'tests';
  files: File[];
}

export interface Repository {
  project_name: string;
  blueprint_version: string;
  modules: Module[];
  total_files: number;
  total_lines: number;
  generated_at: string;
}

// Factory: construct a Repository with computed totals
export function createRepository(project_name: string, modules: Module[], blueprint_version?: string): Repository {
  const total_files = modules.reduce((s, m) => s + m.files.length, 0);
  const total_lines = modules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);
  return {
    project_name,
    blueprint_version: blueprint_version ?? '1.0.0',
    modules,
    total_files,
    total_lines,
    generated_at: new Date().toISOString(),
  };
}

// Patch: replace a single module by type, returning a new Repository (immutable)
export function patchModule(repo: Repository, moduleType: Module['type'], newModule: Module): Repository {
  if (repo.modules.some((m) => m.type === moduleType)) {
    const modules = repo.modules.map((m) => (m.type === moduleType ? newModule : m));
    return createRepository(repo.project_name, modules, repo.blueprint_version);
  }
  const modules = [...repo.modules, newModule];
  return createRepository(repo.project_name, modules, repo.blueprint_version);
}

// Patch multiple modules at once (all or nothing)
export function patchModules(repo: Repository, patches: { type: Module['type']; module: Module }[]): Repository {
  const patchMap = new Map(patches.map((p) => [p.type, p.module]));
  const seen = new Set<Module['type']>();
  const modules = repo.modules.map((m) => {
    if (patchMap.has(m.type)) {
      seen.add(m.type);
      return patchMap.get(m.type)!;
    }
    return m;
  });
  for (const { type, module } of patches) {
    if (!seen.has(type)) {
      modules.push(module);
    }
  }
  return createRepository(repo.project_name, modules, repo.blueprint_version);
}

// Compute diff between old and new module (for patch logging)
export interface ModuleDiff {
  type: Module['type'];
  name: string;
  oldFileCount: number;
  newFileCount: number;
  oldLineCount: number;
  newLineCount: number;
  addedFiles: string[];
  removedFiles: string[];
  changedFiles: string[];
}

export function computeModuleDiff(oldMod: Module, newMod: Module): ModuleDiff {
  const oldPaths = new Set(oldMod.files.map((f) => f.path));
  const newPaths = new Set(newMod.files.map((f) => f.path));
  const oldLines = oldMod.files.reduce((s, f) => s + f.content.split('\n').length, 0);
  const newLines = newMod.files.reduce((s, f) => s + f.content.split('\n').length, 0);
  return {
    type: oldMod.type,
    name: oldMod.name,
    oldFileCount: oldMod.files.length,
    newFileCount: newMod.files.length,
    oldLineCount: oldLines,
    newLineCount: newLines,
    addedFiles: [...newPaths].filter((p) => !oldPaths.has(p)),
    removedFiles: [...oldPaths].filter((p) => !newPaths.has(p)),
    changedFiles: [...oldPaths].filter((p) => newPaths.has(p)),
  };
}

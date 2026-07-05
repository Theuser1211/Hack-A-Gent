import type { GeneratedRepository, GeneratedFile } from '../kernel/builders/builder-types.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';

export interface TestCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface TestSuiteResult {
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count: number;
  checks: TestCheck[];
  errors: string[];
  summary: string;
}

export interface BenchmarkTesterInput {
  repository: GeneratedRepository;
  blueprint: ArchitectureBlueprint;
}

export class BenchmarkTester {
  async run(input: BenchmarkTesterInput): Promise<TestSuiteResult> {
    const checks: TestCheck[] = [];
    const errors: string[] = [];

    this.checkImportValidity(input.repository, checks);
    this.checkModuleExports(input.repository, checks);
    this.checkFrontendBackendContract(input.repository, checks);
    this.checkDatabaseSchemaConsistency(input.repository, checks);
    this.checkConfigCompleteness(input.repository, input.blueprint, checks);
    this.checkFilePathConsistency(input.repository, checks);

    const passed = checks.filter((c) => c.passed).length;
    const failed = checks.filter((c) => !c.passed).length;
    const total = checks.length;
    const allPassed = failed === 0;

    if (!allPassed) {
      for (const c of checks.filter((c) => !c.passed)) {
        errors.push(c.message);
      }
    }

    return {
      passed: allPassed,
      total,
      passed_count: passed,
      failed_count: failed,
      checks,
      errors,
      summary: allPassed ? `All ${total} tests passed` : `${failed}/${total} tests failed: ${errors.join('; ')}`,
    };
  }

  private checkImportValidity(repo: GeneratedRepository, checks: TestCheck[]): void {
    const allFiles = repo.modules.flatMap((m) => m.files);
    const filePaths = new Set(allFiles.map((f) => f.path));

    let importIssues = 0;
    for (const file of allFiles) {
      if (!file.content) continue;
      const imports = this.extractImports(file.content);
      for (const imp of imports) {
        if (imp.startsWith('.')) {
          const resolved = this.resolveImportPath(file.path, imp);
          if (resolved && !filePaths.has(resolved)) {
            importIssues++;
          }
        }
      }
    }

    checks.push({
      name: 'import_validity',
      passed: importIssues === 0,
      message:
        importIssues === 0
          ? 'All relative imports resolve to existing files'
          : `${importIssues} relative import(s) reference non-existent files`,
      details: importIssues > 0 ? `${importIssues} unresolved import(s) detected` : undefined,
    });

    const allContent = allFiles.map((f) => f.content).join('\n');
    const hasExternalImports = allContent.includes("from '") || allContent.includes('from "');
    checks.push({
      name: 'external_dependencies',
      passed: true,
      message: hasExternalImports
        ? 'External imports detected (expected)'
        : 'No external imports â€” code uses only relative paths',
    });
  }

  private checkModuleExports(repo: GeneratedRepository, checks: TestCheck[]): void {
    const exportCounts: Record<string, number> = {};
    for (const mod of repo.modules) {
      let exports = 0;
      for (const file of mod.files) {
        const matches = file.content?.match(/export\s+(function|class|const|interface|type|default|async\s+function)/g);
        if (matches) exports += matches.length;
      }
      exportCounts[mod.name] = exports;
    }

    const modulesWithNoExports = Object.entries(exportCounts).filter(([, count]) => count === 0);
    checks.push({
      name: 'module_exports',
      passed: modulesWithNoExports.length === 0,
      message:
        modulesWithNoExports.length === 0
          ? 'All modules export symbols'
          : `Modules with no exports: ${modulesWithNoExports.map(([n]) => n).join(', ')}`,
      details:
        modulesWithNoExports.length > 0
          ? `Consider adding exports to ${modulesWithNoExports.length} module(s)`
          : undefined,
    });
  }

  private checkFrontendBackendContract(repo: GeneratedRepository, checks: TestCheck[]): void {
    const feFiles = repo.modules.filter((m) => m.type === 'frontend').flatMap((m) => m.files);
    const beFiles = repo.modules.filter((m) => m.type === 'backend').flatMap((m) => m.files);

    if (feFiles.length === 0 || beFiles.length === 0) {
      checks.push({
        name: 'frontend_backend_contract',
        passed: true,
        message: feFiles.length === 0 ? 'No frontend to check' : 'No backend to check',
      });
      return;
    }

    const feApiCalls = this.extractApiCalls(feFiles);
    const beRoutes = this.extractRoutes(beFiles);

    const unmatchedCalls = feApiCalls.filter(
      (call) => !beRoutes.some((route) => call.includes(route) || route.includes(call)),
    );
    const fuzzyMatch = feApiCalls.filter((call) => {
      const callPath = call.replace(/\/\d+/g, '/:id').replace(/\/[a-zA-Z]+$/g, '/:param');
      return !beRoutes.some((route) => route.includes(callPath) || callPath.includes(route));
    });

    const issues = unmatchedCalls.length + fuzzyMatch.length;
    checks.push({
      name: 'frontend_backend_contract',
      passed: issues === 0,
      message:
        issues === 0
          ? 'Frontend API calls appear to match backend routes'
          : `${unmatchedCalls.length} unmatched API call(s), ${fuzzyMatch.length} fuzzy mismatch(es)`,
      details:
        issues > 0
          ? `FE calls: [${feApiCalls.slice(0, 5).join(', ')}...], BE routes: [${beRoutes.slice(0, 5).join(', ')}...]`
          : undefined,
    });
  }

  private checkDatabaseSchemaConsistency(repo: GeneratedRepository, checks: TestCheck[]): void {
    const dbModules = repo.modules.filter((m) => m.type === 'database');
    const backendModules = repo.modules.filter((m) => m.type === 'backend');

    if (dbModules.length === 0 || backendModules.length === 0) {
      checks.push({
        name: 'database_schema_consistency',
        passed: true,
        message: dbModules.length === 0 ? 'No database module to check' : 'No backend to cross-reference',
      });
      return;
    }

    const dbTables = new Set<string>();
    for (const mod of dbModules) {
      for (const file of mod.files) {
        const matches = file.content?.match(/(table|model|schema|collection)\s+(\w+)/gi);
        if (matches) matches.forEach((m) => dbTables.add(m.toLowerCase()));
      }
    }

    const backendRefs = new Set<string>();
    for (const mod of backendModules) {
      for (const file of mod.files) {
        if (dbTables.size > 0) {
          for (const table of dbTables) {
            const tableName = table.split(/\s+/).pop()?.toLowerCase() ?? '';
            if (tableName && file.content?.toLowerCase().includes(tableName)) {
              backendRefs.add(tableName);
            }
          }
        }
      }
    }

    const unreferencedTables = [...dbTables].filter((t) => !backendRefs.has(t));
    checks.push({
      name: 'database_schema_consistency',
      passed: unreferencedTables.length === 0,
      message:
        unreferencedTables.length === 0
          ? 'Database schema entities are referenced in backend code'
          : `${unreferencedTables.length} database entity(ies) not referenced in backend: ${unreferencedTables.slice(0, 3).join(', ')}`,
      details:
        unreferencedTables.length > 0
          ? `Total DB entities: ${dbTables.size}, referenced in backend: ${backendRefs.size}`
          : undefined,
    });
  }

  private checkConfigCompleteness(
    repo: GeneratedRepository,
    _blueprint: ArchitectureBlueprint,
    checks: TestCheck[],
  ): void {
    const configFiles = repo.modules.filter((m) => m.type === 'config').flatMap((m) => m.files);
    const configPaths = new Set(configFiles.map((f) => f.path));

    const expectedConfigs = [
      'package.json',
      'tsconfig.json',
      '.env.example',
      '.gitignore',
      'Dockerfile',
      'docker-compose.yml',
    ];
    const missing = expectedConfigs.filter((c) => ![...configPaths].some((p) => p.endsWith(c)));

    checks.push({
      name: 'config_completeness',
      passed: missing.length <= 2,
      message:
        missing.length === 0 ? 'All standard config files present' : `Missing config files: ${missing.join(', ')}`,
      details:
        missing.length > 0 ? `${missing.length} config file(s) missing â€” project may need manual setup` : undefined,
    });

    const packageJson = configFiles.find((f) => f.path.endsWith('package.json'));
    if (packageJson?.content) {
      try {
        const pkg = JSON.parse(packageJson.content);
        const hasStart = !!(pkg.scripts?.start || pkg.scripts?.dev);
        checks.push({
          name: 'package_json_scripts',
          passed: !!hasStart,
          message: hasStart ? 'package.json has start/dev script' : 'package.json missing start or dev script',
          details: hasStart ? undefined : `Scripts found: ${Object.keys(pkg.scripts ?? {}).join(', ') || 'none'}`,
        });
      } catch {
        checks.push({ name: 'package_json_valid', passed: false, message: 'package.json is not valid JSON' });
      }
    }
  }

  private checkFilePathConsistency(repo: GeneratedRepository, checks: TestCheck[]): void {
    const allFiles = repo.modules.flatMap((m) => m.files);
    const pathCounts = new Map<string, number>();
    for (const f of allFiles) {
      pathCounts.set(f.path, (pathCounts.get(f.path) ?? 0) + 1);
    }

    const duplicates = [...pathCounts.entries()].filter(([, count]) => count > 1);
    checks.push({
      name: 'file_path_uniqueness',
      passed: duplicates.length === 0,
      message:
        duplicates.length === 0
          ? 'All file paths are unique'
          : `${duplicates.length} duplicate file path(s): ${duplicates.map(([p]) => p).join(', ')}`,
    });

    const validExts = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.css',
      '.scss',
      '.html',
      '.json',
      '.md',
      '.yml',
      '.yaml',
      '.sql',
      '.env',
      '.gitignore',
      '.dockerfile',
      '.sh',
      '.prisma',
    ];
    const invalidExts = allFiles.filter((f) => {
      const ext = '.' + f.path.split('.').pop()?.toLowerCase();
      return !validExts.includes(ext) && !f.path.endsWith('Dockerfile') && !f.path.endsWith('.gitignore');
    });
    checks.push({
      name: 'file_extension_validity',
      passed: invalidExts.length === 0,
      message:
        invalidExts.length === 0
          ? 'All file extensions are valid'
          : `${invalidExts.length} file(s) with unusual extensions: ${invalidExts.map((f) => f.path).join(', ')}`,
    });
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const regex = /from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]!);
    }
    return imports;
  }

  private resolveImportPath(filePath: string, importPath: string): string | null {
    if (!importPath.startsWith('.')) return null;
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    const normalizedImportPath = importPath.replace(/\\/g, '/');
    const parts = normalizedFilePath.split('/');
    parts.pop();
    const importParts = normalizedImportPath.split('/');
    for (const part of importParts) {
      if (part === '.') continue;
      if (part === '..') {
        if (parts.length > 0) parts.pop();
      } else {
        parts.push(part);
      }
    }
    if (parts.length === 0) return null;
    const result = parts.join('/');
    if (!result.includes('.')) {
      const tsPath = result + '.ts';
      const tsxPath = result + '.tsx';
      const indexPath = result + '/index.ts';
      return tsPath; // best guess
    }
    return result;
  }

  private extractApiCalls(files: GeneratedFile[]): string[] {
    const calls: string[] = [];
    for (const file of files) {
      if (!file.content) continue;
      const matches = file.content.matchAll(
        /(?:fetch|axios\.(?:get|post|put|delete|patch))\s*\(\s*['"`]([^'"`]+)['"`]/g,
      );
      for (const m of matches) {
        calls.push(m[1]!);
      }
    }
    return calls;
  }

  private extractRoutes(files: GeneratedFile[]): string[] {
    const routes: string[] = [];
    for (const file of files) {
      if (!file.content) continue;
      const matches = file.content.matchAll(
        /(?:router|app)\.(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      );
      for (const m of matches) {
        routes.push(m[1]!);
      }
      const decoratorMatches = file.content.matchAll(/@(?:Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]+)['"`]/g);
      for (const m of decoratorMatches) {
        routes.push(m[1]!);
      }
    }
    return routes;
  }
}

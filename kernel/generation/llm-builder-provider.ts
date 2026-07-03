import { v4 as uuid } from 'uuid';

import type { BuilderProvider } from '../builders/builder-provider.js';
import type { GeneratedModule, GeneratedFile } from '../builders/builder-types.js';
import { GeneratedModuleSchema } from '../builders/builder-types.js';
import type { LLMRequest, LLMResponse } from '../llm/llm-types.js';
import type { RouterEngine } from '../llm/router-engine.js';
import type { ArchitectureBlueprint } from '../planning/architect-types.js';

import type { GenerationMetricsTracker } from './generation-metrics.js';
import type { SelfRepairConfig, FileGenerationResult, StructuredCodeOutput } from './generation-types.js';
import { StructuredCodeOutputSchema, CodeGenerationPromptSchema } from './generation-types.js';

interface ModuleGenerationPlan {
  moduleName: string;
  moduleType: 'frontend' | 'backend' | 'database' | 'config' | 'docs' | 'tests';
  description: string;
  filePaths: string[];
}

export class LLMBuilderProvider implements BuilderProvider {
  private readonly router: RouterEngine;
  private readonly metricsTracker?: GenerationMetricsTracker;
  private readonly selfRepairConfig: SelfRepairConfig;
  private readonly taskType: string;

  constructor(config: {
    router: RouterEngine;
    metricsTracker?: GenerationMetricsTracker;
    selfRepairConfig?: Partial<SelfRepairConfig>;
    taskType?: string;
  }) {
    this.router = config.router;
    this.metricsTracker = config.metricsTracker;
    this.selfRepairConfig = {
      max_attempts: config.selfRepairConfig?.max_attempts ?? 3,
      prompt_variation_strategy: config.selfRepairConfig?.prompt_variation_strategy ?? 'more_detailed',
      use_fallback_model: config.selfRepairConfig?.use_fallback_model ?? true,
      use_alternative_provider: config.selfRepairConfig?.use_alternative_provider ?? true,
    };
    this.taskType = config.taskType ?? 'coding';
  }

  async generateFrontend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const feTech = blueprint.recommended_stack.frontend[0]?.name ?? 'React';
    const feModules = blueprint.frontend_modules;
    const apiEndpoints = blueprint.api_contracts.endpoints;
    const filePaths = this.planModuleFilePaths(blueprint, 'frontend');

    const files: GeneratedFile[] = [];
    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'frontend', filePath, {
        tech: feTech,
        components: feModules,
        endpoints: apiEndpoints,
      });
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'frontend',
      type: 'frontend',
      description: `Frontend application using ${feTech}`,
      files,
    };
  }

  async generateBackend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const beTech = blueprint.recommended_stack.backend[0]?.name ?? 'Node.js';
    const beModules = blueprint.backend_modules;
    const apiEndpoints = blueprint.api_contracts.endpoints;
    const dbSchema = blueprint.database_schema;
    const isPython = beTech.toLowerCase().includes('python');
    const filePaths = this.planModuleFilePaths(blueprint, 'backend');

    const files: GeneratedFile[] = [];
    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'backend', filePath, {
        tech: beTech,
        isPython,
        modules: beModules,
        endpoints: apiEndpoints,
        dbSchema,
      });
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'backend',
      type: 'backend',
      description: `Backend API using ${beTech}`,
      files,
    };
  }

  async generateDatabase(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const dbSchema = blueprint.database_schema;
    const engine = dbSchema.engine ?? 'PostgreSQL';
    const tables = dbSchema.tables ?? [];
    const filePaths = this.planModuleFilePaths(blueprint, 'database');

    const files: GeneratedFile[] = [];
    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'database', filePath, {
        engine,
        tables,
        relationships: dbSchema.relationships ?? [],
      });
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'database',
      type: 'database',
      description: `Database schema for ${engine}`,
      files,
    };
  }

  async generateConfig(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const filePaths = this.planModuleFilePaths(blueprint, 'config');
    const files: GeneratedFile[] = [];

    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'config', filePath, {});
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'config',
      type: 'config',
      description: 'Project configuration files',
      files,
    };
  }

  async generateDocumentation(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const filePaths = this.planModuleFilePaths(blueprint, 'docs');
    const files: GeneratedFile[] = [];

    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'docs', filePath, {});
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'docs',
      type: 'docs',
      description: 'Project documentation',
      files,
    };
  }

  async generateTests(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    const filePaths = this.planModuleFilePaths(blueprint, 'tests');
    const files: GeneratedFile[] = [];

    for (const filePath of filePaths) {
      const prompt = this.buildFilePrompt(blueprint, 'tests', filePath, {
        apiEndpoints: blueprint.api_contracts.endpoints,
        frontendModules: blueprint.frontend_modules,
        backendModules: blueprint.backend_modules,
      });
      const result = await this.generateWithRetry(prompt, filePath);
      if (result.success && result.file) {
        files.push({
          path: filePath,
          content: result.file.content,
          language: result.file.language,
        });
      }
    }

    return {
      name: 'tests',
      type: 'tests',
      description: 'Test suites',
      files,
    };
  }

  private buildFilePrompt(
    blueprint: ArchitectureBlueprint,
    moduleType: string,
    filePath: string,
    context: Record<string, unknown>,
  ): string {
    const language = this.inferLanguage(filePath);
    const techStack = blueprint.recommended_stack;

    return `You are a senior software engineer. Generate the file "${filePath}" for a project called "${blueprint.project_name}".

## Technology Stack
- Frontend: ${techStack.frontend.map((t) => `${t.name}${t.version ? ` ${t.version}` : ''} (${t.purpose})`).join(', ') || 'N/A'}
- Backend: ${techStack.backend.map((t) => `${t.name}${t.version ? ` ${t.version}` : ''} (${t.purpose})`).join(', ') || 'N/A'}
- Database: ${techStack.database.map((t) => `${t.name}${t.version ? ` ${t.version}` : ''} (${t.purpose})`).join(', ') || 'N/A'}

## Module: ${moduleType}
## File Path: ${filePath}
## Language: ${language}

${this.renderBlueprintContext(blueprint, moduleType)}

## Generation Rules
1. Output ONLY valid ${language} code — no explanations, no markdown fences, no extra commentary
2. Import all necessary dependencies at the top of the file
3. Export all public functions, components, and types
4. Use proper error handling and TypeScript types where applicable${moduleType === 'tests' ? '\n5. Use vitest for testing (describe/it/expect)' : ''}${moduleType === 'database' ? '\n5. Use proper SQL or Prisma schema syntax' : ''}
${context && Object.keys(context).length > 0 ? `\n## Context\n${JSON.stringify(context, null, 2)}` : ''}

Return a JSON object with the following structure:
{
  "path": "${filePath}",
  "content": "the complete file content as a string",
  "language": "${language}",
  "dependencies": [{"source": "module_name", "type": "import|require", "specifier": "package-name"}],
  "exports": [{"name": "exportedName", "type": "function|class|interface|type|const|default|variable"}],
  "imports": ["import statement or specifier"]
}`;
  }

  private async generateWithRetry(prompt: string, filePath: string): Promise<FileGenerationResult> {
    const startTime = Date.now();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < this.selfRepairConfig.max_attempts; attempt++) {
      try {
        const modelId =
          attempt === 0
            ? this.router.selectModel(this.taskType, prompt.length).model_id
            : this.router.selectModel(this.taskType, prompt.length, ['code_generation']).model_id;

        const adjustedPrompt = this.adjustPromptForAttempt(prompt, attempt, lastError);

        const request: LLMRequest = {
          model_id: modelId,
          provider: this.router.selectModel(this.taskType, adjustedPrompt.length).provider as unknown,
          messages: [
            {
              role: 'system',
              content: 'You are an expert code generator. Generate production-quality code. Return valid JSON.',
            },
            { role: 'user', content: adjustedPrompt },
          ],
          temperature: 0.3,
          max_tokens: 8192,
          response_format: 'json_object',
        };

        const { response } = await this.router.execute(this.taskType, request);

        const parsed = this.parseGeneratedFile(response, filePath);
        if (parsed) {
          const latency = Date.now() - startTime;
          this.metricsTracker?.recordGeneration(true, response.usage.total_tokens, latency, attempt > 0, attempt > 1);
          return {
            file: parsed,
            attempt,
            success: true,
            error: null,
            latency_ms: latency,
            tokens_used: response.usage.total_tokens,
            model_used: response.model_id,
            retried: attempt > 0,
            fallback_used: attempt > 1,
          };
        }

        lastError = 'Failed to parse generated file output';
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const latency = Date.now() - startTime;
    this.metricsTracker?.recordGeneration(false, 0, latency, true, true);
    return {
      file: null as unknown,
      attempt: this.selfRepairConfig.max_attempts - 1,
      success: false,
      error: lastError ?? 'Unknown generation error',
      latency_ms: latency,
      tokens_used: 0,
      model_used: null,
      retried: true,
      fallback_used: true,
    };
  }

  private parseGeneratedFile(response: LLMResponse, expectedPath: string): StructuredCodeOutput | null {
    try {
      let content = response.content;
      if (content.startsWith('```')) {
        content = content.replace(/```[\w]*\n?/g, '').trim();
      }

      const parsed = JSON.parse(content);
      const validated = StructuredCodeOutputSchema.safeParse(parsed);

      if (validated.success) {
        return {
          ...validated.data,
          path: validated.data.path || expectedPath,
          validated: true,
          validation_errors: [],
        };
      }

      const fallback: StructuredCodeOutput = {
        path: expectedPath,
        content: typeof parsed.content === 'string' ? parsed.content : content,
        language: this.inferLanguage(expectedPath),
        dependencies: [],
        exports: [],
        imports: [],
        validation_errors: validated.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? [],
        validated: false,
      };
      return fallback;
    } catch {
      const fallback: StructuredCodeOutput = {
        path: expectedPath,
        content: response.content,
        language: this.inferLanguage(expectedPath),
        dependencies: [],
        exports: [],
        imports: [],
        validation_errors: ['Failed to parse JSON response'],
        validated: false,
      };
      return fallback;
    }
  }

  private adjustPromptForAttempt(prompt: string, attempt: number, lastError: string | null): string {
    if (attempt === 0) return prompt;

    const strategies: string[] = [
      `IMPORTANT: The previous attempt failed. Please be more thorough and detailed. Include all necessary imports, exports, and type definitions.` +
        (lastError ? ` Error: ${lastError}` : ''),
      `SIMPLIFIED REQUEST: Generate the file with minimal complexity. Focus on getting the core functionality right.` +
        (lastError ? ` Previous error: ${lastError}` : ''),
      `EXAMPLE-DRIVEN: Generate a well-structured file following established patterns. Use proper TypeScript/Python idioms.` +
        (lastError ? ` Fix this error: ${lastError}` : ''),
    ];

    const index = Math.min(attempt - 1, strategies.length - 1);
    const instruction = strategies[index] ?? strategies[strategies.length - 1]!;
    return `${prompt}\n\n## Additional Instructions\n${instruction}`;
  }

  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      sql: 'sql',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      yml: 'yaml',
      yaml: 'yaml',
      md: 'markdown',
      dockerfile: 'dockerfile',
      sh: 'bash',
      env: 'text',
      gitignore: 'text',
      prisma: 'prisma',
    };
    return map[ext] ?? 'text';
  }

  private renderBlueprintContext(blueprint: ArchitectureBlueprint, moduleType: string): string {
    const parts: string[] = [];

    if (blueprint.api_contracts?.endpoints?.length) {
      parts.push(
        `## API Endpoints\n${blueprint.api_contracts.endpoints.map((e) => `- ${e.method} ${e.path}: ${e.description}`).join('\n')}`,
      );
    }

    if (blueprint.database_schema?.tables?.length) {
      parts.push(
        `## Database Tables\n${blueprint.database_schema.tables
          .map((t) => {
            const cols = t.columns.map(
              (c) =>
                `  - ${c.name}: ${c.type}${c.primary_key ? ' PK' : ''}${c.unique ? ' UNIQUE' : ''}${c.nullable ? '' : ' NOT NULL'}`,
            );
            return `- ${t.name}:\n${cols.join('\n')}`;
          })
          .join('\n')}`,
      );
    }

    if (blueprint.folder_structure?.entries?.length) {
      const feEntries = blueprint.folder_structure.entries.filter(
        (e) => e.path.startsWith(moduleType) || e.path.includes(moduleType),
      );
      if (feEntries.length) {
        parts.push(
          `## Folder Structure\n${feEntries.map((e) => `- ${e.path} (${e.type})${e.description ? `: ${e.description}` : ''}`).join('\n')}`,
        );
      }
    }

    return parts.join('\n\n');
  }

  private planModuleFilePaths(blueprint: ArchitectureBlueprint, moduleType: string): string[] {
    const feTech = blueprint.recommended_stack.frontend[0]?.name?.toLowerCase() ?? 'react';
    const beTech = blueprint.recommended_stack.backend[0]?.name?.toLowerCase() ?? 'node.js';
    const isNext = feTech.includes('next');
    const isPython = beTech.includes('python');

    switch (moduleType) {
      case 'frontend': {
        const paths = [
          isNext ? 'src/app/page.tsx' : 'src/frontend/App.tsx',
          isNext ? 'src/app/layout.tsx' : 'src/frontend/main.tsx',
          'src/frontend/styles/globals.css',
          'src/frontend/components/Header.tsx',
          'src/frontend/services/api.ts',
        ];

        for (const mod of blueprint.frontend_modules) {
          for (const comp of mod.components) {
            paths.push(`src/frontend/components/${comp.name}.tsx`);
          }
        }

        return [...new Set(paths)];
      }
      case 'backend': {
        const paths = isPython
          ? [
              'src/backend/main.py',
              'src/backend/requirements.txt',
              'src/backend/models.py',
              'src/backend/routes.py',
              'src/backend/config.py',
            ]
          : [
              'src/backend/src/index.ts',
              'src/backend/src/routes/index.ts',
              'src/backend/src/models/index.ts',
              'src/backend/package.json',
              'src/backend/tsconfig.json',
            ];

        for (const mod of blueprint.backend_modules) {
          for (const ep of mod.endpoints) {
            const routeName = ep.replace(/^\//, '').replace(/\//g, '-') || 'root';
            paths.push(isPython ? `src/backend/routes/${routeName}.py` : `src/backend/src/routes/${routeName}.ts`);
          }
        }

        return [...new Set(paths)];
      }
      case 'database': {
        const paths = [
          'database/migrations/001_initial.sql',
          'database/seeds/001_sample_data.sql',
          'database/schema.ts',
        ];
        for (const table of blueprint.database_schema.tables) {
          paths.push(`database/models/${table.name}.ts`);
        }
        return paths;
      }
      case 'config': {
        return ['.env.example', 'docker-compose.yml', 'Dockerfile', '.gitignore', 'tsconfig.json', 'package.json'];
      }
      case 'docs': {
        return ['README.md', 'docs/api.md', 'docs/architecture.md'];
      }
      case 'tests': {
        return [
          'tests/unit/example.test.ts',
          'tests/integration/api.test.ts',
          ...blueprint.frontend_modules.map((m) => `tests/unit/${m.name}.test.ts`),
          ...blueprint.backend_modules.map((m) => `tests/unit/${m.name}.test.ts`),
        ];
      }
      default:
        return [];
    }
  }
}

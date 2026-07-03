import type { BuilderProvider } from '../builders/builder-provider.js';
import type { GeneratedModule } from '../builders/builder-types.js';
import type { ContextEngine } from '../context/context-engine.js';
import type { LLMRequest } from '../llm/llm-types.js';
import type { RouterEngine } from '../llm/router-engine.js';
import type { ArchitectureBlueprint } from '../planning/architect-types.js';
import type { PromptEngine } from '../prompts/prompt-engine.js';

export class LLMBuilderProvider implements BuilderProvider {
  private router: RouterEngine;
  private prompts: PromptEngine;
  private context: ContextEngine;
  private taskType: string = 'coding';

  constructor(router: RouterEngine, prompts: PromptEngine, context: ContextEngine) {
    this.router = router;
    this.prompts = prompts;
    this.context = context;
  }

  async generateFrontend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'frontend');
  }

  async generateBackend(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'backend');
  }

  async generateDatabase(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'database');
  }

  async generateConfig(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'config');
  }

  async generateDocumentation(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'docs');
  }

  async generateTests(blueprint: ArchitectureBlueprint): Promise<GeneratedModule> {
    return this.generateModule(blueprint, 'tests');
  }

  private async generateModule(blueprint: ArchitectureBlueprint, moduleType: string): Promise<GeneratedModule> {
    this.prompts.setComponentContent('agent_role', `You are a ${moduleType} code generation specialist.`);
    this.prompts.setComponentContent(
      'task_instructions',
      `Generate ${moduleType} code for the project based on the architecture blueprint. Return a JSON object with name (string), type ("${moduleType}"), files array (path, content, language, description, overwrite), and description.`,
    );
    this.prompts.setComponentContent(
      'output_format',
      'Respond with valid JSON only. No markdown, no code fences, no explanation.',
    );

    const contextPackage = this.context.assemble(`Generate ${moduleType} code`, {
      taskType: this.taskType,
      modelContextWindow: 32000,
    });
    const contextText = contextPackage.items.map((i) => i.content).join('\n');

    const userContent = [contextText, `Architecture Blueprint:\n${JSON.stringify(blueprint, null, 2)}`]
      .filter(Boolean)
      .join('\n\n');

    const request: LLMRequest = {
      messages: [{ role: 'user', content: userContent }],
      model_id: '',
      provider: 'gemini',
      temperature: 0.3,
      max_tokens: 8000,
      response_format: 'json_object',
    };

    const { response } = await this.router.execute(this.taskType, request);
    const parsed = JSON.parse(response.content);

    if (parsed.name && parsed.files) {
      return parsed as GeneratedModule;
    }
    if (parsed.modules && Array.isArray(parsed.modules)) {
      return parsed.modules[0] as GeneratedModule;
    }
    return {
      name: moduleType,
      type: moduleType as GeneratedModule['type'],
      files: [],
      description: `Generated ${moduleType} module`,
    };
  }
}

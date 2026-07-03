import type { PromptComponent, PromptAssembly } from './prompt-types.js';

const DEFAULT_COMPONENTS: PromptComponent[] = [
  { id: 'agent_role', priority: 0, max_tokens: 300, required: true, content: '', rendered: '' },
  { id: 'task_instructions', priority: 0, max_tokens: 1000, required: true, content: '', rendered: '' },
  { id: 'output_format', priority: 0, max_tokens: 500, required: true, content: '', rendered: '' },
  { id: 'project_state', priority: 1, max_tokens: 400, required: true, content: '', rendered: '' },
  { id: 'skills', priority: 2, max_tokens: 6000, required: false, content: '', rendered: '' },
  { id: 'constraints', priority: 2, max_tokens: 500, required: false, content: '', rendered: '' },
  { id: 'memory_context', priority: 3, max_tokens: 4000, required: false, content: '', rendered: '' },
];

export class PromptEngine {
  private components: Map<string, PromptComponent> = new Map();
  private renderers: Map<string, (ctx: Record<string, unknown>) => Promise<string>> = new Map();

  constructor() {
    for (const c of DEFAULT_COMPONENTS) {
      this.components.set(c.id, { ...c });
    }
  }

  registerRenderer(componentId: string, renderer: (ctx: Record<string, unknown>) => Promise<string>): void {
    this.renderers.set(componentId, renderer);
  }

  setComponentContent(componentId: string, content: string): void {
    const comp = this.components.get(componentId);
    if (comp) {
      comp.content = content;
    }
  }

  getComponent(componentId: string): PromptComponent | undefined {
    return this.components.get(componentId);
  }

  async assemble(context: Record<string, unknown>, budget: number = 4096): Promise<PromptAssembly> {
    const sorted = [...this.components.values()].sort((a, b) => a.priority - b.priority);
    const systemParts: string[] = [];
    const warnings: string[] = [];
    let systemTokens = 0;
    const systemBudget = Math.round(budget * 0.3);

    for (const comp of sorted) {
      let rendered = ''; // Declare once at the top

      if (comp.required || comp.content) {
        const renderer = this.renderers.get(comp.id);
        if (renderer) {
          try {
            rendered = await renderer(context);
          } catch {
            rendered = comp.content || `[${comp.id}: render failed]`;
          }
        } else {
          rendered = comp.content || `[${comp.id}: no content]`;
        }

        const tokens = rendered.length;
        if (comp.required || systemTokens + tokens <= systemBudget) {
          systemParts.push(rendered);
          systemTokens += tokens;
        } else if (!comp.required) {
          warnings.push(`Component "${comp.id}" skipped (budget exceeded)`);
        }
      }
    }

    const systemPrompt = systemParts.filter(Boolean).join('\n\n');
    const taskInput = (context.task_description as string) ?? '';
    const userMsg = taskInput ? `Task: ${taskInput}` : '';

    const messages: PromptAssembly['messages'] = [{ role: 'system', content: systemPrompt }];
    if (userMsg) {
      messages.push({ role: 'user', content: userMsg });
    }

    const totalTokens = messages.reduce((s, m) => s + m.content.length, 0);
    const withinBudget = totalTokens <= budget;

    if (!withinBudget) {
      warnings.push(`Total tokens (${totalTokens}) exceed budget (${budget})`);
    }

    return {
      system_prompt: systemPrompt,
      messages,
      token_count: totalTokens,
      budget,
      within_budget: withinBudget,
      warnings,
    };
  }

  async validate(assembly: PromptAssembly): Promise<string[]> {
    const errors: string[] = [];

    // Check system prompt ratio
    const systemLen = assembly.messages.find((m) => m.role === 'system')?.content.length ?? 0;
    const totalLen = assembly.messages.reduce((s, m) => s + m.content.length, 0);
    if (totalLen > 0 && systemLen / totalLen > 0.4) {
      errors.push('System prompt exceeds 40% of total message content');
    }

    // Check empty required components
    for (const [id, comp] of this.components) {
      if (comp.required && !comp.content) {
        errors.push(`Required component "${id}" has no content`);
      }
    }

    // Check budget
    if (!assembly.within_budget) {
      errors.push('Prompt exceeds token budget');
    }

    return errors;
  }
}

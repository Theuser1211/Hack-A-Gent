export { PromptComponentSchema, PromptTemplateSchema, PromptAssemblySchema } from './prompt-types.js';

export type { PromptComponent, PromptTemplate, PromptAssembly } from './prompt-types.js';

export { PromptEngine } from './prompt-engine.js';

// Reusable, audited prompt template library (Objective 1).
export {
  type PromptRole,
  type PromptExample,
  type PromptOutputContract,
  type RenderContext,
  META_SYSTEM,
  TEMPLATE_REGISTRY,
  ALL_TEMPLATES,
  getTemplate,
  renderTemplate,
  renderMessages,
  wantsJsonMode,
} from './templates.js';

/**
 * Hack-A-Gent — Modular Prompt Builder
 *
 * Replaces the monolithic prompt pattern with a component-based assembly system.
 * Each pipeline stage builds a prompt from only the sections it needs,
 * with deterministic ordering, token budget management, and validation.
 */

import type {
  PromptComponent,
  PromptSection,
  PromptAssembly,
  PromptStage,
  PromptContext,
  HackathonSummaryContext,
  StrategyPlanningContext,
  ArchitectureContext,
  JudgingAlignmentContext,
  DesignLanguageContext,
  FeatureSpecContext,
  ConstraintsContext,
  OutputSchemaContext,
} from './types.js';

import type { WinningStrategy, UIDirection } from '../pipeline/types.js';
import type { CodeGenContext } from '../pipeline/strategy-adapter.js';
import type { InterviewResult } from '../interview/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import {
  renderMetaSystem,
  renderHackathonSummary,
  renderStrategyPlanning,
  renderArchitecture,
  renderJudgingAlignment,
  renderDesignLanguage,
  renderFeatureSpec,
  renderConstraints,
  renderOutputSchema,
} from './components.js';

// ── Component Registry ─────────────────────────────────────────────────────

const COMPONENT_RENDERERS: Record<
  string,
  (ctx: Record<string, unknown>) => PromptSection | string
> = {
  meta_system: () => renderMetaSystem(),
  hackathon_summary: (ctx) => renderHackathonSummary({ analysis: ctx.analysis as HackathonSummaryContext['analysis'] }),
  strategy_planning: (ctx) =>
    renderStrategyPlanning({
      analysis: ctx.analysis as StrategyPlanningContext['analysis'],
      interviewResult: ctx.interviewResult as StrategyPlanningContext['interviewResult'],
      winningStrategy: ctx.winningStrategy as StrategyPlanningContext['winningStrategy'],
    }),
  architecture_design: (ctx) =>
    renderArchitecture({
      analysis: ctx.analysis as ArchitectureContext['analysis'],
      strategy: ctx.strategy as ArchitectureContext['strategy'],
      codeGenCtx: ctx.codeGenCtx as ArchitectureContext['codeGenCtx'],
      interviewResult: ctx.interviewResult as ArchitectureContext['interviewResult'],
    }),
  judging_alignment: (ctx) =>
    renderJudgingAlignment({
      analysis: ctx.analysis as JudgingAlignmentContext['analysis'],
      strategy: ctx.strategy as JudgingAlignmentContext['strategy'],
    }),
  design_language: (ctx) =>
    renderDesignLanguage({
      analysis: ctx.analysis as DesignLanguageContext['analysis'],
      uiDirection: ctx.uiDirection as DesignLanguageContext['uiDirection'],
      theme: ctx.theme as DesignLanguageContext['theme'],
    }),
  feature_spec: (ctx) =>
    renderFeatureSpec({
      analysis: ctx.analysis as FeatureSpecContext['analysis'],
      strategy: ctx.strategy as FeatureSpecContext['strategy'],
      codeGenCtx: ctx.codeGenCtx as FeatureSpecContext['codeGenCtx'],
      fileType: ctx.fileType as FeatureSpecContext['fileType'],
      specificTask: ctx.specificTask as FeatureSpecContext['specificTask'],
    }),
  constraints: (ctx) =>
    renderConstraints({
      analysis: ctx.analysis as ConstraintsContext['analysis'],
      strategy: ctx.strategy as ConstraintsContext['strategy'],
      interviewResult: ctx.interviewResult as ConstraintsContext['interviewResult'],
    }),
  output_schema: (ctx) =>
    renderOutputSchema({
      fileType: ctx.fileType as OutputSchemaContext['fileType'],
      specificTask: ctx.specificTask as OutputSchemaContext['specificTask'],
      requiredTechs: ctx.requiredTechs as OutputSchemaContext['requiredTechs'],
    }),
};

// ── Pipeline Stage Definitions ─────────────────────────────────────────────

interface StageDefinition {
  stage: PromptStage;
  title: string;
  components: Array<{ id: string; required: boolean; maxTokens?: number }>;
  defaultBudget: number;
}

const STAGE_DEFINITIONS: Record<PromptStage, StageDefinition> = {
  hackathon_summary: {
    stage: 'hackathon_summary',
    title: 'Hackathon Summary',
    components: [{ id: 'meta_system', required: true }, { id: 'hackathon_summary', required: true }],
    defaultBudget: 4096,
  },
  strategy_planning: {
    stage: 'strategy_planning',
    title: 'Strategy Planning',
    components: [
      { id: 'meta_system', required: true },
      { id: 'hackathon_summary', required: true },
      { id: 'strategy_planning', required: true },
    ],
    defaultBudget: 6144,
  },
  architecture_design: {
    stage: 'architecture_design',
    title: 'Architecture Design',
    components: [
      { id: 'meta_system', required: true },
      { id: 'architecture_design', required: true },
    ],
    defaultBudget: 8192,
  },
  judging_alignment: {
    stage: 'judging_alignment',
    title: 'Judging Alignment',
    components: [
      { id: 'meta_system', required: true },
      { id: 'judging_alignment', required: true },
    ],
    defaultBudget: 6144,
  },
  design_language: {
    stage: 'design_language',
    title: 'Design Language',
    components: [
      { id: 'meta_system', required: true },
      { id: 'design_language', required: true },
    ],
    defaultBudget: 4096,
  },
  feature_spec: {
    stage: 'feature_spec',
    title: 'Feature Specification',
    components: [
      { id: 'meta_system', required: true },
      { id: 'hackathon_summary', required: true },
      { id: 'judging_alignment', required: true },
      { id: 'design_language', required: true },
      { id: 'feature_spec', required: true },
    ],
    defaultBudget: 8192,
  },
  constraints: {
    stage: 'constraints',
    title: 'Constraints',
    components: [{ id: 'meta_system', required: true }, { id: 'constraints', required: true }],
    defaultBudget: 4096,
  },
  output_schema: {
    stage: 'output_schema',
    title: 'Output Schema',
    components: [
      { id: 'meta_system', required: true },
      { id: 'output_schema', required: true },
    ],
    defaultBudget: 4096,
  },
  generation: {
    stage: 'generation',
    title: 'Code Generation',
    components: [
      { id: 'meta_system', required: true },
      { id: 'hackathon_summary', required: true, maxTokens: 2048 },
      { id: 'judging_alignment', required: true, maxTokens: 1536 },
      { id: 'design_language', required: true, maxTokens: 1024 },
      { id: 'feature_spec', required: true, maxTokens: 2048 },
      { id: 'constraints', required: true, maxTokens: 1024 },
      { id: 'output_schema', required: true, maxTokens: 2048 },
    ],
    defaultBudget: 16384,
  },
};

// ── PromptBuilder ──────────────────────────────────────────────────────────

export class PromptBuilder {
  private stage: PromptStage;
  private seed: number;
  private analysis: PromptContext['analysis'];
  private strategy?: PromptContext['strategy'];
  private codeGenCtx?: PromptContext['codeGenCtx'];
  private interviewResult?: PromptContext['interviewResult'];
  private uiDirection?: PromptContext['uiDirection'];
  private fileType?: PromptContext['fileType'];
  private specificTask?: PromptContext['specificTask'];
  private requiredTechs?: PromptContext['requiredTechs'];

  constructor(stage: PromptStage, seed: number, analysis: PromptContext['analysis']) {
    this.stage = stage;
    this.seed = seed;
    this.analysis = analysis;
  }

  withStrategy(strategy: WinningStrategy): this {
    this.strategy = strategy;
    return this;
  }

  withCodeGenCtx(ctx: CodeGenContext): this {
    this.codeGenCtx = ctx;
    return this;
  }

  withInterview(result: InterviewResult): this {
    this.interviewResult = result;
    return this;
  }

  withUIDirection(ui: UIDirection): this {
    this.uiDirection = ui;
    return this;
  }

  withFileType(type: OutputSchemaContext['fileType']): this {
    this.fileType = type;
    return this;
  }

  withSpecificTask(task: string): this {
    this.specificTask = task;
    return this;
  }

  withRequiredTechs(techs: string[]): this {
    this.requiredTechs = techs;
    return this;
  }

  /**
   * Build the prompt for this stage. Returns a PromptAssembly with
   * system prompt, user prompt, messages, and budget metadata.
   */
  build(budget?: number): PromptAssembly {
    const stageDef = STAGE_DEFINITIONS[this.stage];
    const actualBudget = budget ?? stageDef.defaultBudget;

    const renderContext = this.buildRenderContext();
    const sections: PromptSection[] = [];
    const warnings: string[] = [];
    let totalTokens = 0;

    for (const compDef of stageDef.components) {
      const renderer = COMPONENT_RENDERERS[compDef.id];
      if (!renderer) {
        continue;
      }

      let section: PromptSection;
      try {
        const rendered = renderer(renderContext);
        section = typeof rendered === 'string'
          ? { title: compDef.id, body: rendered }
          : rendered;
      } catch (err) {
        if (compDef.required) {
          throw new Error(`Required component "${compDef.id}" failed to render: ${err instanceof Error ? err.message : String(err)}`);
        }
        warnings.push(`Component "${compDef.id}" failed to render: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      const sectionTokens = section.body.length;
      const maxTokens = compDef.maxTokens ?? actualBudget;

      if (sectionTokens > maxTokens) {
        if (compDef.required) {
          warnings.push(`Component "${compDef.id}" exceeds max tokens (${sectionTokens} > ${maxTokens}), truncated`);
          section.body = section.body.slice(0, maxTokens);
        } else {
          warnings.push(`Component "${compDef.id}" skipped (exceeds max tokens)`);
          continue;
        }
      }

      sections.push(section);
      totalTokens += section.body.length;
    }

    const systemPrompt = sections
      .filter((s) => s.title !== 'task')
      .map((s) => `## ${s.title}\n\n${s.body}`)
      .join('\n\n---\n\n');

    const userPrompt = this.buildUserPrompt();

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    if (userPrompt) {
      messages.push({ role: 'user', content: userPrompt });
    }

    const withinBudget = totalTokens + (userPrompt?.length ?? 0) <= actualBudget;
    if (!withinBudget) {
      warnings.push(`Total tokens (${totalTokens + (userPrompt?.length ?? 0)}) exceed budget (${actualBudget})`);
    }

    return {
      systemPrompt,
      userPrompt,
      messages,
      tokenCount: totalTokens + (userPrompt?.length ?? 0),
      budget: actualBudget,
      withinBudget,
      warnings,
      sections,
    };
  }

  /**
   * Build a debug-friendly representation of the prompt assembly for logging.
   */
  buildDebugInfo(): Record<string, unknown> {
    const assembly = this.build();
    return {
      stage: this.stage,
      seed: this.seed,
      tokenCount: assembly.tokenCount,
      budget: assembly.budget,
      withinBudget: assembly.withinBudget,
      sections: assembly.sections.map((s) => ({
        title: s.title,
        bodyLength: s.body.length,
        optional: s.optional ?? false,
      })),
      warnings: assembly.warnings,
    };
  }

  private buildRenderContext(): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
      seed: this.seed,
      analysis: this.analysis,
      theme: this.analysis?.challenge?.theme ?? 'General',
    };

    if (this.strategy) ctx.strategy = this.strategy;
    if (this.codeGenCtx) ctx.codeGenCtx = this.codeGenCtx;
    if (this.interviewResult) ctx.interviewResult = this.interviewResult;
    if (this.uiDirection) ctx.uiDirection = this.uiDirection;
    else if (this.strategy?.uiDirection && !ctx.uiDirection) ctx.uiDirection = this.strategy.uiDirection;
    else if (this.codeGenCtx?.uiScaffold && !ctx.uiDirection) ctx.uiDirection = this.codeGenCtx.uiScaffold;
    if (this.fileType) ctx.fileType = this.fileType;
    if (this.specificTask) ctx.specificTask = this.specificTask;
    if (this.requiredTechs) ctx.requiredTechs = this.requiredTechs;

    return ctx;
  }

  private buildUserPrompt(): string {
    if (this.stage === 'generation' && this.fileType && this.codeGenCtx && this.strategy) {
      const taskDescs: Record<string, string> = {
        scaffold: 'Generate the full hackathon project.',
        frontend: this.specificTask
          ? `Generate frontend code for: ${this.specificTask}`
          : 'Generate frontend code for the core feature.',
        backend: this.specificTask
          ? `Generate API route for: ${this.specificTask}`
          : 'Generate API route for the core functionality.',
        database: this.specificTask
          ? `Generate database schema for: ${this.specificTask}`
          : 'Generate database schema for the core data model.',
        config: 'Generate one config file.',
      };

      const requiredSection = this.requiredTechs && this.requiredTechs.length > 0
        ? `\nREQUIRED TECHNOLOGIES:\n${this.requiredTechs.map((t) => `- ${t}: include in package.json AND use in code`).join('\n')}\n`
        : '';

      const scaffoldFiles = this.fileType === 'scaffold'
        ? '\nInclude: package.json, tsconfig.json, next.config.js, .gitignore, .env.example, src/config.ts, .eslintrc.json, tailwind.config.js, postcss.config.js, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/loading.tsx, src/app/error.tsx, README.md'
        : '';

      const focusSection = (this.fileType === 'frontend' || this.fileType === 'backend') && this.specificTask
        ? `\nFocus on: ${this.specificTask}`
        : '';

      return `Task: ${taskDescs[this.fileType] ?? 'Generate code.'}
${requiredSection}${focusSection}${scaffoldFiles}

This is a HACKATHON project. Make it stand out — judges will compare it against other projects. Solve the specific challenge, integrate sponsor APIs visibly, and make the demo work end-to-end.`;
    }

    if (this.specificTask && this.stage !== 'hackathon_summary') {
      return `Task: ${this.specificTask}`;
    }

    return '';
  }

  getStage(): PromptStage {
    return this.stage;
  }

  getSeed(): number {
    return this.seed;
  }
}

// ── Convenience: Build a generation prompt from full context ─────────────────

export function buildGenerationPrompt(
  analysis: CompetitionAnalysis,
  strategy: WinningStrategy,
  codeGenCtx: CodeGenContext,
  fileType: OutputSchemaContext['fileType'],
  options?: { seed?: number; specificTask?: string; requiredTechs?: string[] },
): PromptAssembly {
  const builder = new PromptBuilder('generation', options?.seed ?? 42, analysis)
    .withStrategy(strategy)
    .withCodeGenCtx(codeGenCtx)
    .withFileType(fileType)
    .withSpecificTask(options?.specificTask ?? '')
    .withRequiredTechs(options?.requiredTechs ?? []);

  return builder.build();
}

/**
 * Prompt assembler for hackathon code generation.
 *
 * The orchestrator previously built the LLM user prompt inline, which caused
 * three classes of defect:
 *
 *  1. Duplicated context — the same planning artifact injected two or three
 *     times (sponsor APIs ×3, differentiators ×2, judging criteria ×2, the
 *     "theme" re-stating the problem statement verbatim).
 *  2. Mislabeled context — the "Judging Criteria" line actually carried
 *     sponsor API integrations and feature priorities, and "Constraints"
 *     carried differentiators.
 *  3. No diagnostics — nothing reported which sections were included, which
 *     were removed, or how many tokens the prompt consumed.
 *
 * This module assembles the prompt from explicit sections under a single
 * canonical-source rule: a field appears exactly once. If the STRATEGY block
 * (the Product Intelligence carrier) already contains a field, the top-level
 * section for it is dropped. It also produces machine-readable diagnostics
 * (included/removed sections, per-section and total token estimates) and is
 * pure and deterministic: the same input always yields the identical prompt
 * and diagnostics.
 */

export interface PromptSection {
  id: string;
  title: string;
  /** Full rendered text that appears in the prompt (no trailing newline). */
  content: string;
  /** Which planning artifact this section came from. */
  source: string;
  /** Estimated tokens for this section. */
  tokens: number;
}

export type RemovedReason =
  | 'empty'
  | 'duplicates problem statement'
  | 'no distinct theme available'
  | 'already carried by STRATEGY block';

export interface RemovedSection {
  id: string;
  title: string;
  reason: RemovedReason;
}

export interface JudgingCriterionInput {
  name: string;
  weight: number;
}

export interface GenerationPromptInput {
  projectName: string;
  problemStatement: string;
  /** Real hackathon theme, when the parser actually found one. */
  theme?: string;
  submissionRequirements: string[];
  sponsorApis: string[];
  judgingCriteria: JudgingCriterionInput[];
  featurePriority: string[];
  keyPages: string[];
  differentiators: string[];
  optimizationBudget: string;
  /** Constraints straight from the hackathon page — not differentiators. */
  rawConstraints: string[];
  techStackDisplay: string;
  requiredTechs: string[];
  /** Rendered STRATEGY block (renderStrategyPromptBlock output, '' when absent). */
  strategyBlock: string;
  systemPrompt?: string;
  packageVersions: string;
  taskDescription: string;
  fileType: 'scaffold' | 'frontend' | 'backend' | 'database' | 'config';
  specificTask?: string;
  scaffoldIncludeList?: string;
}

export interface GenerationPromptAssembly {
  userPrompt: string;
  systemPrompt: string;
  /** Sections actually included, in prompt order. */
  sections: PromptSection[];
  /** Sections that were dropped and why. */
  removed: RemovedSection[];
  totalTokens: number;
  systemTokens: number;
  userTokens: number;
  budget: number;
  withinBudget: boolean;
  /** Distinct planning artifacts (non-template sources) that reached the prompt. */
  includedArtifacts: string[];
}

/** Conservative generation-model context window (tokens). */
export const GENERATION_CONTEXT_WINDOW = 32_000;
/** Fraction of the window reserved for the assembled input prompt. */
export const GENERATION_INPUT_BUDGET_RATIO = 0.6;

export const GENERATION_CALLOUT =
  'This is a HACKATHON project. Make it stand out — judges will compare it against other projects. Solve the specific challenge, integrate sponsor APIs visibly, and make the demo work end-to-end.';

/** Standard heuristic (~4 chars per token). Used for diagnostics only. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function assembleGenerationPrompt(input: GenerationPromptInput): GenerationPromptAssembly {
  const removed: RemovedSection[] = [];
  const sections: PromptSection[] = [];

  const add = (
    id: string,
    title: string,
    content: string,
    source: string,
  ): void => {
    if (!content.trim()) {
      removed.push({ id, title, reason: 'empty' });
      return;
    }
    sections.push({ id, title, content, source, tokens: estimateTokens(content) });
  };

  // Record exactly ONE reason per dropped section. When the STRATEGY block
  // already carries the full/equivalent content, that section is deduped;
  // otherwise an empty section is recorded as 'empty'. Never both.
  const addOrDedup = (
    id: string,
    title: string,
    content: string,
    source: string,
    carriedByStrategy: boolean,
    present: boolean,
  ): void => {
    if (present && carriedByStrategy) {
      removed.push({ id, title, reason: 'already carried by STRATEGY block' });
      return;
    }
    add(id, title, content, source);
  };

  const strategyBlock = (input.strategyBlock ?? '').trim();
  const hasStrategy = strategyBlock.length > 0;
  // The STRATEGY block always renders these lines when a strategy context
  // exists, and additionally renders "Differentiator:" and "Judging approach:"
  // when Product Intelligence ran. Top-level sections for those fields are
  // therefore redundant and dropped.
  const carriesSponsors = hasStrategy && strategyBlock.includes('Sponsor APIs to prioritize');
  const carriesKeyPages = hasStrategy && strategyBlock.includes('Key screens');
  const carriesJudging = hasStrategy && strategyBlock.includes('Judging approach');

  const problem = (input.problemStatement ?? '').trim();
  const theme = (input.theme ?? '').trim();

  add('project', 'Project', `Project: ${input.projectName}`, 'devpost');
  add('problem', 'Problem', problem ? `Problem: ${problem}` : '', 'devpost');

  // The old inline builder re-stated the (truncated) problem statement as the
  // "Hackathon Theme" — pure duplication. Only emit a theme section when the
  // parser actually found a distinct theme value.
  if (theme && theme !== problem) {
    add('theme', 'Theme', `Hackathon Theme: ${theme}`, 'devpost');
  } else if (theme && theme === problem) {
    removed.push({ id: 'theme', title: 'Theme', reason: 'duplicates problem statement' });
  } else if (!theme && problem) {
    removed.push({ id: 'theme', title: 'Theme', reason: 'no distinct theme available' });
  }

  add(
    'submission_requirements',
    'Submission Requirements',
    input.submissionRequirements.length
      ? `Submission Requirements: ${input.submissionRequirements.join(', ')}`
      : '',
    'devpost.submissionRequirements',
  );

  // Sponsor APIs: the STRATEGY block always lists the full set, so the
  // top-level section is redundant and dropped.
  addOrDedup(
    'sponsor_apis',
    'Sponsor APIs',
    input.sponsorApis.length ? `Sponsor APIs to integrate: ${input.sponsorApis.join(', ')}` : '',
    'strategy.sponsorApis',
    carriesSponsors,
    input.sponsorApis.length > 0,
  );

  // Judging criteria: the STRATEGY block's per-criterion approach lines carry
  // names AND weights, so the plain name/weight list is redundant.
  const criteriaText = input.judgingCriteria.length
    ? `Judging Criteria: ${input.judgingCriteria
        .map(c => `${c.name}${c.weight ? ` (${c.weight}%)` : ''}`)
        .join(', ')}`
    : '';
  addOrDedup(
    'judging_criteria',
    'Judging Criteria',
    criteriaText,
    'analysis.judgingCriteria',
    carriesJudging,
    input.judgingCriteria.length > 0,
  );

  // Feature priority and differentiators: the STRATEGY block only shows a
  // filtered subset (core/sponsor features; the singular PI vision
  // differentiator), so the full top-level lists stay — they are distinct,
  // additive planning artifacts.
  add(
    'feature_priority',
    'Feature Priority',
    input.featurePriority.length ? `Feature priority: ${input.featurePriority.join('; ')}` : '',
    'strategy.featurePriority',
  );

  // Key screens: the STRATEGY block lists every key screen, so the top-level
  // copy is redundant.
  addOrDedup(
    'key_pages',
    'Key Pages',
    input.keyPages.length ? `Key Pages: ${input.keyPages.join(', ')}` : '',
    'strategy.uiDirection.keyScreens',
    carriesKeyPages,
    input.keyPages.length > 0,
  );

  add(
    'differentiators',
    'Differentiators',
    input.differentiators.length ? `Differentiators: ${input.differentiators.join(', ')}` : '',
    'strategy.differentiators',
  );

  // Constraints carry the optimization budget plus the hackathon's real
  // constraints — never differentiators (the old builder mislabeled them).
  const constraintParts: string[] = [];
  if (input.optimizationBudget) constraintParts.push(`Optimization budget: ${input.optimizationBudget}`);
  constraintParts.push(...input.rawConstraints);
  add(
    'constraints',
    'Constraints',
    constraintParts.length ? `Constraints: ${constraintParts.join(', ')}` : '',
    'strategy.optimizationBudget',
  );

  add('tech_stack', 'Tech Stack', `Tech Stack: ${input.techStackDisplay}`, 'strategy.technologyStack');

  add(
    'required_technologies',
    'Required Technologies',
    input.requiredTechs.length
      ? 'REQUIRED TECHNOLOGIES (you MUST include these in your code — import them, configure them, use them in actual implementation):\n'
        + input.requiredTechs.map(t => `- ${t}: Include in package.json dependencies AND use in actual code (imports, configuration, API calls)`).join('\n')
      : '',
    'devpost.recommendedStack',
  );

  add('strategy', 'Strategy (Product Intelligence)', strategyBlock, 'product-intelligence');

  add('package_versions', 'Package Versions', input.packageVersions, 'template');

  add('task', 'Task', `Task: ${input.taskDescription}`, 'template');

  add('include_list', 'Scaffold Include List', input.scaffoldIncludeList ?? '', 'template');

  add(
    'focus',
    'Task Focus',
    (input.fileType === 'frontend' || input.fileType === 'backend' || input.fileType === 'database')
    && input.specificTask
      ? `Focus on: ${input.specificTask}`
      : '',
    'task-graph',
  );

  add('callout', 'Callout', GENERATION_CALLOUT, 'template');

  const userPrompt = sections.map(s => s.content).join('\n');
  const systemPrompt = input.systemPrompt ?? '';
  const userTokens = estimateTokens(userPrompt);
  const systemTokens = estimateTokens(systemPrompt);
  const budget = Math.round(GENERATION_CONTEXT_WINDOW * GENERATION_INPUT_BUDGET_RATIO);

  return {
    userPrompt,
    systemPrompt,
    sections,
    removed,
    totalTokens: userTokens + systemTokens,
    systemTokens,
    userTokens,
    budget,
    withinBudget: userTokens + systemTokens <= budget,
    includedArtifacts: [...new Set(sections.map(s => s.source).filter(s => s !== 'template'))],
  };
}

/** Human-readable diagnostics report for the debug log. */
export function formatGenerationPromptDiagnostics(a: GenerationPromptAssembly): string {
  const budgetFlag = a.withinBudget ? 'OK' : 'OVER BUDGET';
  const lines = [
    '── Generation Prompt Diagnostics ──',
    `Prompt size: ${a.userTokens} user + ${a.systemTokens} system = ${a.totalTokens} tokens (budget ${a.budget}, ${budgetFlag})`,
    `Included sections (${a.sections.length}): ${a.sections.map(s => `${s.id} [${s.tokens}t]`).join(', ')}`,
    `Removed sections (${a.removed.length}): ${a.removed.map(r => `${r.id} (${r.reason})`).join(', ') || 'none'}`,
    `Generation context: ${a.includedArtifacts.join(', ') || 'none'}`,
  ];
  return lines.join('\n');
}

import type { CompetitionAnalysis, FeaturePriority, RoadmapPhase, TechnologyStack, UIDirection, WinningStrategy } from './types.js';

// Spec-compliant GenerationInput — decouples code generator from analysis layer
export interface GenerationInput {
  projectName: string;
  architecture: string;
  frontend: string;
  backend: string;
  database: string;
  deployment: string;
  testing: string;
  styling: string;
  sponsorApis: string[];
  featurePriority: string[];
  keyPages: string[];
  uiDirection: string;
  differentiators: string[];
  optimizationBudget: string;
}

const DEFAULT_TECH_STACK: TechnologyStack = {
  frontend: 'Next.js',
  backend: 'Node.js',
  database: 'SQLite',
  deployment: 'Vercel',
  testing: 'Vitest',
  styling: 'Tailwind CSS',
};

const DEFAULT_UI_DIRECTION: UIDirection = {
  designLanguage: 'modern',
  layout: 'responsive',
  keyScreens: [],
  responsiveBreakpoints: 'sm:640px md:768px lg:1024px',
  componentLibrary: 'shadcn/ui',
};

export function adaptStrategyToGeneration(strategy: WinningStrategy, optimizationBudget?: string): GenerationInput {
  const ts = strategy.technologyStack ?? DEFAULT_TECH_STACK;
  const ui = strategy.uiDirection ?? DEFAULT_UI_DIRECTION;
  return {
    projectName: strategy.projectName ?? 'Hackathon Project',
    architecture: strategy.architecture ?? 'Next.js App Router',
    frontend: ts.frontend,
    backend: ts.backend,
    database: ts.database,
    deployment: ts.deployment,
    testing: ts.testing,
    styling: ts.styling,
    sponsorApis: strategy.prioritizedAPIs ?? [],
    featurePriority: (strategy.featurePriority ?? []).map(f => f.feature),
    keyPages: ui.keyScreens,
    uiDirection: `${ui.designLanguage} | Layout: ${ui.layout} | Library: ${ui.componentLibrary}`,
    differentiators: strategy.differentiators ?? [],
    optimizationBudget: optimizationBudget ?? 'balanced',
  };
}

// Internal CodeGenContext — used by orchestrator for LLM prompt enrichment
export interface CodeGenContext {
  strategyName: string;
  /** Startup-quality brand name (e.g. "Lumen") — prefer over the slug for the landing page title. */
  brandName?: string;
  oneLiner: string;
  technologyStack: TechnologyStack;
  framework: string;
  packages: Array<{ name: string; version: string }>;
  uiScaffold: UIDirection;
  taskOrder: FeaturePriority[];
  phases: RoadmapPhase[];
  sponsorApis: string[];
  judgingCriteria: Array<{ name: string; weight: number }>;
  /**
   * The Product Intelligence summary — everything the LLM needs to build the
   * winning product: the winning idea, vision, target user, wow moment, MVP
   * scope, differentiator, architecture, data model, API surfaces, risks and
   * the per-criterion judging approach. Populated from
   * `strategy.productIntelligence` when the PI pass ran.
   */
  productIntelligence?: {
    winnerTitle: string;
    visionStatement: string;
    targetUser: string;
    wowMoment: string;
    mvpScope: string[];
    differentiator: string;
    demoStrategy: string;
    risks: Array<{ risk: string; mitigation: string }>;
    architectureSummary: string;
    dataModel: string[];
    apiSurfaces: string[];
    judgingApproach: Array<{ name: string; weight: number; approach: string }>;
    sponsorOpportunities: string[];
  };
}

export function buildCodeGenContext(analysis: CompetitionAnalysis, strategy: WinningStrategy): CodeGenContext {
  const ts = strategy.technologyStack ?? DEFAULT_TECH_STACK;
  const ui = strategy.uiDirection ?? DEFAULT_UI_DIRECTION;
  const pi = strategy.productIntelligence;
  const ctx: CodeGenContext = {
    strategyName: strategy.projectName ?? 'Hackathon Project',
    brandName: strategy.brandName,
    oneLiner: strategy.oneLiner ?? '',
    technologyStack: ts,
    framework: inferFramework(ts),
    packages: inferPackages(ts, strategy.prioritizedAPIs ?? []),
    uiScaffold: ui,
    taskOrder: strategy.featurePriority ?? [],
    phases: strategy.roadmap ?? [],
    sponsorApis: strategy.prioritizedAPIs ?? [],
    judgingCriteria: (analysis.judgingCriteria ?? []).map(c => ({ name: c.name ?? '', weight: c.weight ?? 25 })),
  };

  // Carry the full Product Intelligence summary through to the LLM prompt so
  // the generated application reflects the winning idea — not just its slug.
  if (pi) {
    ctx.productIntelligence = {
      winnerTitle: pi.winner?.title ?? '',
      visionStatement: pi.vision?.visionStatement ?? '',
      targetUser: pi.vision?.targetUser ?? '',
      wowMoment: pi.vision?.wowMoment ?? pi.winner?.wowMoment ?? '',
      mvpScope: pi.vision?.mvpScope ?? pi.winner?.keyFeatures ?? [],
      differentiator: pi.vision?.differentiator ?? '',
      demoStrategy: pi.vision?.demoStrategy ?? '',
      risks: pi.vision?.risks ?? [],
      architectureSummary: pi.architecture?.summary ?? '',
      dataModel: pi.architecture?.dataModel ?? [],
      apiSurfaces: pi.architecture?.apiSurfaces ?? [],
      judgingApproach: (pi.judgingPriorities ?? []).map(p => ({ name: p.name, weight: p.weight, approach: p.approach })),
      sponsorOpportunities: (pi.sponsorOpportunities ?? []).map(s => s.name),
    };
  }

  return ctx;
}

/**
 * Render the STRATEGY block injected into every LLM code-generation prompt.
 * Carries the Product Intelligence summary verbatim so the model receives the
 * winning idea, vision, target user, wow moment, MVP scope, differentiator,
 * architecture, data model, API surfaces, risks and judging approach.
 */
export function renderStrategyPromptBlock(ctx: CodeGenContext | null): string {
  if (!ctx) return '';

  const lines: string[] = [];
  lines.push(`Project name: ${ctx.brandName ?? ctx.strategyName}`);
  lines.push(`One-liner: ${ctx.oneLiner}`);

  const pi = ctx.productIntelligence;
  if (pi) {
    if (pi.winnerTitle) lines.push(`Winning idea: ${pi.winnerTitle}`);
    if (pi.visionStatement) lines.push(`Vision: ${pi.visionStatement}`);
    if (pi.targetUser) lines.push(`Target users: ${pi.targetUser}`);
    if (pi.wowMoment) lines.push(`Wow moment: ${pi.wowMoment}`);
    if (pi.mvpScope.length > 0) lines.push(`MVP scope: ${pi.mvpScope.join('; ')}`);
    if (pi.differentiator) lines.push(`Differentiator: ${pi.differentiator}`);
    if (pi.demoStrategy) lines.push(`Demo strategy: ${pi.demoStrategy}`);
    if (pi.architectureSummary) lines.push(`Architecture: ${pi.architectureSummary}`);
    if (pi.dataModel.length > 0) lines.push(`Data model: ${pi.dataModel.join('; ')}`);
    if (pi.apiSurfaces.length > 0) lines.push(`API surfaces: ${pi.apiSurfaces.join('; ')}`);
    if (pi.risks.length > 0) {
      lines.push(`Risks: ${pi.risks.map(r => `${r.risk} → ${r.mitigation}`).join('; ')}`);
    }
    if (pi.judgingApproach.length > 0) {
      lines.push(`Judging approach: ${pi.judgingApproach.map(j => `${j.name} (${j.weight}%): ${j.approach}`).join(' | ')}`);
    }
    if (pi.sponsorOpportunities.length > 0) {
      lines.push(`Sponsor opportunities: ${pi.sponsorOpportunities.join(', ')}`);
    }
  }

  lines.push(`UI direction: ${ctx.uiScaffold.designLanguage} (layout: ${ctx.uiScaffold.layout})`);
  lines.push(`Key screens: ${ctx.uiScaffold.keyScreens.join(', ')}`);
  lines.push(`Sponsor APIs to prioritize: ${ctx.sponsorApis.join(', ') || 'none'}`);
  lines.push(`Feature priority: ${ctx.taskOrder.filter(f => ['core', 'sponsor'].includes(f.category)).map(f => f.feature).join('; ')}`);

  return `\nSTRATEGY:\n${lines.join('\n')}\n`;
}

function inferFramework(ts: TechnologyStack): string {
  const fe = (ts.frontend ?? '').toLowerCase();
  if (fe.includes('next.js')) return 'nextjs';
  if (fe.includes('react')) return 'react';
  if (fe.includes('svelte')) return 'svelte';
  if (fe.includes('vue')) return 'vue';
  return 'nextjs';
}

function inferPackages(ts: TechnologyStack, apis: string[]): Array<{ name: string; version: string }> {
  const pkgs: Array<{ name: string; version: string }> = [];

  const fe = (ts.frontend ?? '').toLowerCase();
  if (fe.includes('next.js') || fe.includes('react')) {
    pkgs.push({ name: 'next', version: '^14.2.0' });
    pkgs.push({ name: 'react', version: '^18.3.1' });
    pkgs.push({ name: 'react-dom', version: '^18.3.1' });
  }

  const db = (ts.database ?? '').toLowerCase();
  if (db.includes('sqlite')) pkgs.push({ name: 'better-sqlite3', version: '^11.0.0' });
  if (db.includes('firebase')) pkgs.push({ name: 'firebase', version: '^10.12.0' });
  if (db.includes('supabase')) pkgs.push({ name: '@supabase/supabase-js', version: '^2.43.0' });

  const be = (ts.backend ?? '').toLowerCase();
  if (be.includes('express')) {
    pkgs.push({ name: 'express', version: '^4.19.0' });
  }

  if ((ts.styling ?? '').toLowerCase().includes('tailwind')) {
    pkgs.push({ name: 'tailwindcss', version: '^3.4.0' });
  }

  for (const api of apis) {
    const a = (api ?? '').toLowerCase();
    if (a.includes('openai')) pkgs.push({ name: 'openai', version: '^4.47.0' });
    if (a.includes('twilio')) pkgs.push({ name: 'twilio', version: '^5.0.0' });
    if (a.includes('stripe')) pkgs.push({ name: 'stripe', version: '^15.0.0' });
  }

  return pkgs;
}

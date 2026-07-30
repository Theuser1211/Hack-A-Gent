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

export function adaptStrategyToGeneration(strategy: WinningStrategy, optimizationBudget?: string): GenerationInput {
  return {
    projectName: strategy.projectName,
    architecture: strategy.architecture,
    frontend: strategy.technologyStack.frontend,
    backend: strategy.technologyStack.backend,
    database: strategy.technologyStack.database,
    deployment: strategy.technologyStack.deployment,
    testing: strategy.technologyStack.testing,
    styling: strategy.technologyStack.styling,
    sponsorApis: strategy.prioritizedAPIs,
    featurePriority: strategy.featurePriority.map(f => f.feature),
    keyPages: strategy.uiDirection.keyScreens,
    uiDirection: `${strategy.uiDirection.designLanguage} | Layout: ${strategy.uiDirection.layout} | Library: ${strategy.uiDirection.componentLibrary}`,
    differentiators: strategy.differentiators,
    optimizationBudget: optimizationBudget ?? 'balanced',
  };
}

// Internal CodeGenContext — used by orchestrator for LLM prompt enrichment
export interface CodeGenContext {
  strategyName: string;
  oneLiner: string;
  technologyStack: TechnologyStack;
  framework: string;
  packages: Array<{ name: string; version: string }>;
  uiScaffold: UIDirection;
  taskOrder: FeaturePriority[];
  phases: RoadmapPhase[];
  sponsorApis: string[];
  judgingCriteria: Array<{ name: string; weight: number }>;
}

export function buildCodeGenContext(analysis: CompetitionAnalysis, strategy: WinningStrategy): CodeGenContext {
  return {
    strategyName: strategy.projectName,
    oneLiner: strategy.oneLiner,
    technologyStack: strategy.technologyStack,
    framework: inferFramework(strategy.technologyStack),
    packages: inferPackages(strategy.technologyStack, strategy.prioritizedAPIs),
    uiScaffold: strategy.uiDirection,
    taskOrder: strategy.featurePriority,
    phases: strategy.roadmap,
    sponsorApis: strategy.prioritizedAPIs,
    judgingCriteria: analysis.judgingCriteria.map(c => ({ name: c.name, weight: c.weight })),
  };
}

function inferFramework(ts: TechnologyStack): string {
  const fe = ts.frontend.toLowerCase();
  if (fe.includes('next.js')) return 'nextjs';
  if (fe.includes('react')) return 'react';
  if (fe.includes('svelte')) return 'svelte';
  if (fe.includes('vue')) return 'vue';
  return 'nextjs';
}

function inferPackages(ts: TechnologyStack, apis: string[]): Array<{ name: string; version: string }> {
  const pkgs: Array<{ name: string; version: string }> = [];

  const fe = ts.frontend.toLowerCase();
  if (fe.includes('next.js') || fe.includes('react')) {
    pkgs.push({ name: 'next', version: '^14.2.0' });
    pkgs.push({ name: 'react', version: '^18.3.1' });
    pkgs.push({ name: 'react-dom', version: '^18.3.1' });
  }

  const db = ts.database.toLowerCase();
  if (db.includes('sqlite')) pkgs.push({ name: 'better-sqlite3', version: '^11.0.0' });
  if (db.includes('firebase')) pkgs.push({ name: 'firebase', version: '^10.12.0' });
  if (db.includes('supabase')) pkgs.push({ name: '@supabase/supabase-js', version: '^2.43.0' });

  const be = ts.backend.toLowerCase();
  if (be.includes('express')) {
    pkgs.push({ name: 'express', version: '^4.19.0' });
  }

  if (ts.styling.toLowerCase().includes('tailwind')) {
    pkgs.push({ name: 'tailwindcss', version: '^3.4.0' });
  }

  for (const api of apis) {
    const a = api.toLowerCase();
    if (a.includes('openai')) pkgs.push({ name: 'openai', version: '^4.47.0' });
    if (a.includes('twilio')) pkgs.push({ name: 'twilio', version: '^5.0.0' });
    if (a.includes('stripe')) pkgs.push({ name: 'stripe', version: '^15.0.0' });
  }

  return pkgs;
}

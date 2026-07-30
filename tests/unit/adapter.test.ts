import { describe, it, expect } from 'vitest';

import { buildCodeGenContext } from '../../cli/pipeline/strategy-adapter.js';
import type { CompetitionAnalysis, WinningStrategy } from '../../cli/pipeline/types.js';

function mockAnalysis(): CompetitionAnalysis {
  return {
    analysisId: 'ca-test',
    challenge: { title: 'AI Hackathon', problemStatement: 'Build AI apps', theme: 'Artificial Intelligence', difficulty: 'intermediate', estimatedParticipants: 200, organizer: 'TestOrg' },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Creativity', priority: 'critical' },
      { name: 'Technical Depth', weight: 30, weightRaw: '30%', description: 'Complexity', priority: 'high' },
    ],
    sponsorAPIs: [{ name: 'OpenAI', provider: 'OpenAI', description: 'GPT-4', strategicValue: 'must_use' }],
    deliverables: [],
    restrictions: [],
    deadlines: [],
  };
}

function mockStrategy(): WinningStrategy {
  return {
    projectName: 'ai-hackathon',
    oneLiner: 'An AI-powered platform',
    whyScoreWell: ['Innovation focus', 'Live demo'],
    targetedCriteria: [{ name: 'Innovation', weight: 40, approach: 'Lead with innovation' }],
    prioritizedAPIs: ['OpenAI'],
    architecture: 'Next.js + OpenAI API',
    differentiators: ['Live demo'],
    risks: [{ risk: 'API failure', mitigation: 'Fallback' }],
    recommendedStack: ['Next.js', 'OpenAI', 'Vercel'],
    estimatedJudgeScore: 85,
    technologyStack: {
      frontend: 'Next.js',
      backend: 'Next.js API Routes',
      database: 'SQLite (better-sqlite3)',
      deployment: 'Vercel',
      testing: 'Vitest',
      styling: 'Tailwind CSS',
    },
    uiDirection: {
      designLanguage: 'Minimal, data-focused',
      layout: 'Full-width with sidebar',
      keyScreens: ['Landing', 'Dashboard', 'Results'],
      responsiveBreakpoints: 'Mobile, Tablet, Desktop',
      componentLibrary: 'Tailwind CSS',
    },
    featurePriority: [
      { feature: 'Innovation showcase', weight: 40, effort: 'high', category: 'core' },
      { feature: 'OpenAI integration', weight: 25, effort: 'medium', category: 'sponsor' },
    ],
    roadmap: [
      { phase: 'Scaffold', tasks: ['Init project'], estimatedMinutes: 15 },
      { phase: 'Core', tasks: ['Build feature'], estimatedMinutes: 90 },
    ],
  };
}

describe('buildCodeGenContext', () => {
  it('produces CodeGenContext with all fields', () => {
    const analysis = mockAnalysis();
    const strategy = mockStrategy();
    const ctx = buildCodeGenContext(analysis, strategy);

    expect(ctx.strategyName).toBe('ai-hackathon');
    expect(ctx.oneLiner).toBe('An AI-powered platform');
    expect(ctx.framework).toBe('nextjs');
    expect(ctx.sponsorApis).toEqual(['OpenAI']);
    expect(ctx.judgingCriteria).toHaveLength(2);
    expect(ctx.judgingCriteria[0]!.name).toBe('Innovation');
    expect(ctx.judgingCriteria[0]!.weight).toBe(40);
  });

  it('infers framework from technology stack', () => {
    const nextCtx = buildCodeGenContext(mockAnalysis(), { ...mockStrategy(), technologyStack: { ...mockStrategy().technologyStack, frontend: 'Next.js' } });
    expect(nextCtx.framework).toBe('nextjs');

    const reactCtx = buildCodeGenContext(mockAnalysis(), { ...mockStrategy(), technologyStack: { ...mockStrategy().technologyStack, frontend: 'React + Vite' } });
    expect(reactCtx.framework).toBe('react');
  });

  it('includes strategy UI direction', () => {
    const ctx = buildCodeGenContext(mockAnalysis(), mockStrategy());
    expect(ctx.uiScaffold.designLanguage).toBe('Minimal, data-focused');
    expect(ctx.uiScaffold.layout).toBe('Full-width with sidebar');
    expect(ctx.uiScaffold.keyScreens).toContain('Landing');
  });

  it('includes all feature priorities', () => {
    const ctx = buildCodeGenContext(mockAnalysis(), mockStrategy());
    expect(ctx.taskOrder).toHaveLength(2);
    expect(ctx.taskOrder[0]!.feature).toBe('Innovation showcase');
    expect(ctx.taskOrder[1]!.category).toBe('sponsor');
  });

  it('includes roadmap phases', () => {
    const ctx = buildCodeGenContext(mockAnalysis(), mockStrategy());
    expect(ctx.phases).toHaveLength(2);
    expect(ctx.phases[0]!.phase).toBe('Scaffold');
    expect(ctx.phases[1]!.estimatedMinutes).toBe(90);
  });

  it('maps sponsor APIs to packages', () => {
    const strategy = mockStrategy();
    strategy.prioritizedAPIs = ['OpenAI', 'Twilio', 'Stripe'];
    const ctx = buildCodeGenContext(mockAnalysis(), strategy);

    const openaiPkg = ctx.packages.find(p => p.name === 'openai');
    expect(openaiPkg).toBeTruthy();
    expect(openaiPkg!.version).toBe('^4.47.0');

    const twilioPkg = ctx.packages.find(p => p.name === 'twilio');
    expect(twilioPkg).toBeTruthy();

    const stripePkg = ctx.packages.find(p => p.name === 'stripe');
    expect(stripePkg).toBeTruthy();
  });

  it('includes core packages for Next.js stack', () => {
    const ctx = buildCodeGenContext(mockAnalysis(), mockStrategy());
    expect(ctx.packages.some(p => p.name === 'next')).toBe(true);
    expect(ctx.packages.some(p => p.name === 'react')).toBe(true);
    expect(ctx.packages.some(p => p.name === 'tailwindcss')).toBe(true);
  });

  it('includes judging criteria with weights', () => {
    const ctx = buildCodeGenContext(mockAnalysis(), mockStrategy());
    expect(ctx.judgingCriteria).toEqual([
      { name: 'Innovation', weight: 40 },
      { name: 'Technical Depth', weight: 30 },
    ]);
  });

  it('produces deterministic output for same inputs', () => {
    const analysis = mockAnalysis();
    const strategy = mockStrategy();
    const ctx1 = buildCodeGenContext(analysis, strategy);
    const ctx2 = buildCodeGenContext(analysis, strategy);

    expect(ctx1).toEqual(ctx2);
  });
});

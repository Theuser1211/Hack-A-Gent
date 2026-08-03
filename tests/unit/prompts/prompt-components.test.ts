import { describe, it, expect } from 'vitest';
import {
  renderMetaSystem,
  renderHackathonSummary,
  renderStrategyPlanning,
  renderProjectVision,
  renderArchitectureDesign,
  renderPlanDatabase,
  renderPlanAPI,
  renderPlanFrontend,
  renderPlanBackend,
  renderJudgingAlignment,
  renderDesignLanguage,
  renderFeatureSpec,
  renderConstraints,
  renderOutputSchema,
  renderGenerationPrompt,
} from '../../../cli/prompts/components.js';
import type { CompetitionAnalysis, WinningStrategy } from '../../../cli/pipeline/types.js';
import type { CodeGenContext } from '../../../cli/pipeline/strategy-adapter.js';
import type { InterviewResult } from '../../../cli/interview/types.js';
import type { ArchitectureArtifacts, ProjectVision } from '../../../cli/prompts/types.js';
import { PromptBuilder, buildGenerationPrompt } from '../../../cli/prompts/prompt-builder.js';

function makeAnalysis(): CompetitionAnalysis {
  return {
    analysisId: 'test-001',
    challenge: {
      title: 'AI Accessibility Hack',
      problemStatement: 'Build tools that make AI more accessible',
      theme: 'AI',
      difficulty: 'intermediate',
      estimatedParticipants: 500,
      organizer: 'Test Org',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Creativity', priority: 'critical' },
      { name: 'Technical Depth', weight: 30, weightRaw: '30%', description: 'Complexity', priority: 'high' },
      { name: 'Impact', weight: 20, weightRaw: '20%', description: 'Real-world applicability', priority: 'high' },
      { name: 'UX', weight: 10, weightRaw: '10%', description: 'User experience', priority: 'medium' },
    ],
    sponsorAPIs: [
      { name: 'OpenAI', provider: 'OpenAI', description: 'GPT models', strategicValue: 'must_use' },
      { name: 'Vercel', provider: 'Vercel', description: 'Deployment', strategicValue: 'should_use' },
    ],
    deliverables: [
      { description: 'Source code', format: 'GitHub URL', required: true },
      { description: 'Demo', format: 'Live URL', required: true },
    ],
    restrictions: ['12 hour limit', 'No external APIs except sponsors'],
    deadlines: [{ label: 'Submission', date: 'Aug 15, 2026', type: 'submission' }],
    extractionConfidence: {
      title: { value: 'AI Accessibility Hack', confidence: 'confirmed', source: 'html' },
      theme: { value: 'AI', confidence: 'inferred', source: 'keyword match' },
      difficulty: { value: 'intermediate', confidence: 'inferred', source: 'keyword analysis' },
      organizer: { value: 'Test Org', confidence: 'confirmed', source: 'html' },
      participants: { value: 500, confidence: 'inferred', source: 'text match' },
      judgingCriteria: { value: ['Innovation', 'Technical Depth', 'Impact', 'UX'], confidence: 'confirmed', source: 'html' },
      sponsorAPIs: { value: ['OpenAI', 'Vercel'], confidence: 'confirmed', source: 'html' },
      restrictions: { value: ['12 hour limit', 'No external APIs except sponsors'], confidence: 'confirmed', source: 'html' },
      deadlines: { value: [{ label: 'Submission', date: 'Aug 15, 2026', type: 'submission' }], confidence: 'inferred', source: 'date patterns' },
    },
  };
}

function makeStrategy(): WinningStrategy {
  return {
    projectName: 'accessi-ai',
    oneLiner: 'AI accessibility toolkit for underrepresented users',
    whyScoreWell: [
      'Addresses top criteria: Innovation (40%), Technical Depth (30%)',
      'Live demo with OpenAI integration',
    ],
    targetedCriteria: [
      { name: 'Innovation', weight: 40, approach: 'Show unique accessibility approach' },
      { name: 'Technical Depth', weight: 30, approach: 'Demonstrate complex AI pipeline' },
    ],
    prioritizedAPIs: ['OpenAI', 'Vercel'],
    architecture: 'Next.js + OpenAI API',
    differentiators: ['Voice-to-text interface', 'Contrast optimization'],
    risks: [{ risk: 'API rate limits', mitigation: 'Implement caching' }],
    recommendedStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'Vercel'],
    estimatedJudgeScore: 85,
    technologyStack: {
      frontend: 'Next.js',
      backend: 'Next.js API Routes',
      database: 'SQLite',
      deployment: 'Vercel',
      testing: 'Vitest',
      styling: 'Tailwind CSS',
    },
    uiDirection: {
      designLanguage: 'Minimal, data-focused with emphasis on model outputs',
      layout: 'Full-width content area with sidebar navigation',
      keyScreens: ['Landing', 'Demo', 'Results'],
      responsiveBreakpoints: 'Mobile (375px), Tablet (768px), Desktop (1280px)',
      componentLibrary: 'Tailwind CSS + custom components',
    },
    featurePriority: [
      { feature: 'Innovation showcase — voice interface demo', weight: 40, effort: 'high', category: 'core' },
      { feature: 'OpenAI API integration with live demo', weight: 25, effort: 'medium', category: 'sponsor' },
    ],
    roadmap: [
      { phase: 'Scaffold', tasks: ['Init project', 'Deploy skeleton'], estimatedMinutes: 15 },
      { phase: 'Core features', tasks: ['Build voice interface'], estimatedMinutes: 90 },
    ],
  };
}

function makeCodeGenCtx(): CodeGenContext {
  return {
    strategyName: 'accessi-ai',
    oneLiner: 'AI accessibility toolkit',
    technologyStack: makeStrategy().technologyStack,
    framework: 'nextjs',
    packages: [{ name: 'next', version: '^14.2.0' }, { name: 'openai', version: '^4.47.0' }],
    uiScaffold: makeStrategy().uiDirection,
    taskOrder: [
      { feature: 'Innovation showcase', weight: 40, effort: 'high', category: 'core' },
      { feature: 'OpenAI integration', weight: 25, effort: 'medium', category: 'sponsor' },
    ],
    phases: [
      { phase: 'Scaffold', tasks: ['Init'], estimatedMinutes: 15 },
    ],
    sponsorApis: ['OpenAI', 'Vercel'],
    judgingCriteria: [
      { name: 'Innovation', weight: 40 },
      { name: 'Technical Depth', weight: 30 },
    ],
  };
}

function makeInterviewResult(): InterviewResult {
  return {
    selectedPrize: null,
    selectedSponsorApis: ['OpenAI'],
    optimizationBudget: 'balanced',
    userProjectIdea: 'Voice-controlled AI assistant',
    autoGeneratedIdea: null,
    technologyPreferences: [],
    allAnswers: {},
  };
}

function makeArchitectureArtifacts(): ArchitectureArtifacts {
  return {
    componentGraph: {
      nodes: [
        { name: 'App', type: 'layout', description: 'Root layout', imports: ['next/font'], exports: ['App'] },
        { name: 'HomePage', type: 'page', description: 'Landing page', imports: ['App'], exports: ['HomePage'] },
        { name: 'VoiceInput', type: 'component', description: 'Voice input widget', imports: [], exports: ['VoiceInput'] },
      ],
      edges: [
        { from: 'App', to: 'HomePage', type: 'import' },
        { from: 'HomePage', to: 'VoiceInput', type: 'import' },
      ],
    },
    apiGraph: {
      baseUrl: '/api',
      endpoints: [
        { method: 'POST', path: '/transcribe', purpose: 'Transcribe voice input', requestParams: ['audio'], responseShape: '{ text: string }' },
        { method: 'GET', path: '/features', purpose: 'List showcase features', requestParams: [], responseShape: 'Feature[]' },
      ],
    },
    databaseSchema: {
      tables: [
        { name: 'features', purpose: 'Store AI features', columns: [
          { name: 'id', type: 'integer', key: true },
          { name: 'title', type: 'text', key: false },
          { name: 'description', type: 'text', key: false },
        ], indexes: ['title'] },
      ],
      seedData: true,
    },
    folderStructure: `src/
  app/
    page.tsx
    layout.tsx
  components/
    VoiceInput.tsx
  lib/
    openai.ts
`,
    userFlows: [
      {
        name: 'Voice Demo Flow',
        steps: [
          { name: 'Landing', description: 'User sees landing page', components: ['HomePage'] },
          { name: 'Voice Input', description: 'User speaks into mic', components: ['VoiceInput'] },
          { name: 'Results', description: 'AI transcribes and displays results', components: ['ResultsPage'] },
        ],
      },
    ],
  };
}

function makeVision(): ProjectVision {
  return {
    projectName: 'accessi-ai',
    oneLiner: 'AI accessibility toolkit for underrepresented users',
    problemSolved: 'Make AI tools accessible to users with disabilities',
    targetUsers: ['Screen reader users', 'Motor-impaired users'],
    keyFeatures: ['Voice-to-text interface', 'Contrast optimization'],
    techFeasibility: 'High - uses established OpenAI SDK',
    demoNarrative: 'User speaks into mic, AI transcribes in real-time with visual feedback',
  };
}

describe('Prompt Component Renderers', () => {
  describe('renderMetaSystem', () => {
    it('returns deterministic system instructions', () => {
      const result = renderMetaSystem();
      expect(result).toContain('Hack-A-Gent');
      expect(result).toContain('Plan before producing');
    });

    it('is deterministic (same output every call)', () => {
      const a = renderMetaSystem();
      const b = renderMetaSystem();
      expect(a).toBe(b);
    });
  });

  describe('renderHackathonSummary', () => {
    it('includes title, theme, and judging criteria', () => {
      const analysis = makeAnalysis();
      const section = renderHackathonSummary({
        analysis,
        extractionConfidence: analysis.extractionConfidence!,
      });
      expect(section.title).toBe('Hackathon Summary');
      expect(section.body).toContain('AI Accessibility Hack');
      expect(section.body).toContain('Innovation');
      expect(section.body).toContain('40%');
      expect(section.body).toContain('OpenAI');
    });

    it('includes confidence note when extraction is partial', () => {
      const analysisWithUnknown = makeAnalysis();
      analysisWithUnknown.extractionConfidence!.judgingCriteria.confidence = 'unknown';
      const section = renderHackathonSummary({
        analysis: analysisWithUnknown,
        extractionConfidence: analysisWithUnknown.extractionConfidence!,
      });
      expect(section.body).toContain('Note');
    });

    it('includes restrictions and deadlines', () => {
      const analysis = makeAnalysis();
      const section = renderHackathonSummary({
        analysis,
        extractionConfidence: analysis.extractionConfidence!,
      });
      expect(section.body).toContain('12 hour limit');
      expect(section.body).toContain('Submission');
    });
  });

  describe('renderStrategyPlanning', () => {
    it('includes top criteria sorted by weight', () => {
      const section = renderStrategyPlanning({
        analysis: makeAnalysis(),
      });
      expect(section.title).toBe('Strategy Planning');
      expect(section.body).toContain('Top Judging Criteria');
      expect(section.body).toContain('Innovation');
      const innovationIdx = section.body.indexOf('Innovation');
      const depthIdx = section.body.indexOf('Technical Depth');
      expect(innovationIdx).toBeLessThan(depthIdx);
    });

    it('includes interview insights when provided', () => {
      const section = renderStrategyPlanning({
        analysis: makeAnalysis(),
        interviewResult: makeInterviewResult(),
      });
      expect(section.body).toContain('Interview Insights');
      expect(section.body).toContain('Voice-controlled AI assistant');
    });

    it('includes recommended strategy when provided', () => {
      const section = renderStrategyPlanning({
        analysis: makeAnalysis(),
        winningStrategy: makeStrategy(),
      });
      expect(section.body).toContain('Recommended Strategy');
      expect(section.body).toContain('accessi-ai');
    });
  });

  describe('renderProjectVision', () => {
    it('includes project name, one-liner, and key features', () => {
      const section = renderProjectVision({
        analysis: makeAnalysis(),
        vision: makeVision(),
      });
      expect(section.title).toBe('Project Vision');
      expect(section.body).toContain('accessi-ai');
      expect(section.body).toContain('AI accessibility toolkit');
      expect(section.body).toContain('Voice-to-text interface');
    });

    it('includes interview context when provided', () => {
      const section = renderProjectVision({
        analysis: makeAnalysis(),
        vision: makeVision(),
        interviewResult: makeInterviewResult(),
      });
      expect(section.body).toContain('Interview Context');
      expect(section.body).toContain('Voice-controlled AI assistant');
    });
  });

  describe('renderArchitectureDesign', () => {
    it('includes tech stack and architecture artifacts', () => {
      const section = renderArchitectureDesign({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        architectureArtifacts: makeArchitectureArtifacts(),
      });
      expect(section.title).toBe('Architecture Design');
      expect(section.body).toContain('Next.js');
      expect(section.body).toContain('Technology Stack');
      expect(section.body).toContain('Component Graph');
      expect(section.body).toContain('API Graph');
      expect(section.body).toContain('Database Schema');
      expect(section.body).toContain('Folder Structure');
      expect(section.body).toContain('User Flows');
    });

    it('includes component graph nodes and edges', () => {
      const section = renderArchitectureDesign({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        architectureArtifacts: makeArchitectureArtifacts(),
      });
      expect(section.body).toContain('HomePage');
      expect(section.body).toContain('VoiceInput');
      expect(section.body).toContain('App');
    });

    it('includes API endpoints', () => {
      const section = renderArchitectureDesign({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        architectureArtifacts: makeArchitectureArtifacts(),
      });
      expect(section.body).toContain('/transcribe');
      expect(section.body).toContain('/api');
    });
  });

  describe('renderPlanDatabase', () => {
    it('includes table definitions and seed data setting', () => {
      const section = renderPlanDatabase({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        dbSchema: makeArchitectureArtifacts().databaseSchema,
      });
      expect(section.title).toBe('Database Plan');
      expect(section.body).toContain('features');
      expect(section.body).toContain('Seed Data');
      expect(section.body).toContain('PRIMARY KEY');
    });
  });

  describe('renderPlanAPI', () => {
    it('includes endpoints with purpose and request params', () => {
      const section = renderPlanAPI({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        apiGraph: makeArchitectureArtifacts().apiGraph,
        dbSchema: makeArchitectureArtifacts().databaseSchema,
      });
      expect(section.title).toBe('API Plan');
      expect(section.body).toContain('/transcribe');
      expect(section.body).toContain('POST');
      expect(section.body).toContain('audio');
      expect(section.body).toContain('Request params');
      expect(section.body).toContain('Response shape');
    });
  });

  describe('renderPlanFrontend', () => {
    it('includes design language and component plan', () => {
      const section = renderPlanFrontend({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        uiDirection: makeStrategy().uiDirection,
        componentGraph: makeArchitectureArtifacts().componentGraph,
      });
      expect(section.title).toBe('Frontend Plan');
      expect(section.body).toContain('Minimal, data-focused');
      expect(section.body).toContain('HomePage');
      expect(section.body).toContain('Landing');
      expect(section.body).toContain('Responsive Breakpoints');
    });
  });

  describe('renderPlanBackend', () => {
    it('includes API endpoints and database tables', () => {
      const section = renderPlanBackend({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        apiGraph: makeArchitectureArtifacts().apiGraph,
        dbSchema: makeArchitectureArtifacts().databaseSchema,
      });
      expect(section.title).toBe('Backend Plan');
      expect(section.body).toContain('/transcribe');
      expect(section.body).toContain('/features');
      expect(section.body).toContain('features');
    });
  });

  describe('renderJudgingAlignment', () => {
    it('includes criteria sorted by weight with approaches', () => {
      const section = renderJudgingAlignment({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        targetedCriteria: makeStrategy().targetedCriteria,
        prioritizedAPIs: makeStrategy().prioritizedAPIs,
      });
      expect(section.title).toBe('Judging Alignment');
      expect(section.body).toContain('Innovation (40%)');
      expect(section.body).toContain('Approach');
    });

    it('includes sponsor API integration priority', () => {
      const section = renderJudgingAlignment({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        targetedCriteria: makeStrategy().targetedCriteria,
        prioritizedAPIs: makeStrategy().prioritizedAPIs,
      });
      expect(section.body).toContain('Sponsor API Integration Priority');
      expect(section.body).toContain('OpenAI');
    });
  });

  describe('renderDesignLanguage', () => {
    it('includes theme-appropriate palette', () => {
      const section = renderDesignLanguage({
        analysis: makeAnalysis(),
        uiDirection: makeStrategy().uiDirection,
        theme: 'AI',
        sponsorApis: makeAnalysis().sponsorAPIs,
      });
      expect(section.title).toBe('Design Language');
      expect(section.body).toContain('Minimal, data-focused');
      expect(section.body).toContain('Deep purples');
    });

    it('uses different palette for different themes', () => {
      const aiPalette = renderDesignLanguage({
        analysis: makeAnalysis(),
        uiDirection: makeStrategy().uiDirection,
        theme: 'AI',
        sponsorApis: makeAnalysis().sponsorAPIs,
      });
      const healthPalette = renderDesignLanguage({
        analysis: makeAnalysis(),
        uiDirection: makeStrategy().uiDirection,
        theme: 'Healthcare',
        sponsorApis: makeAnalysis().sponsorAPIs,
      });
      expect(aiPalette.body).toContain('Deep purples');
      expect(healthPalette.body).toContain('Calming teal');
    });

    it('includes sponsor API design integration', () => {
      const section = renderDesignLanguage({
        analysis: makeAnalysis(),
        uiDirection: makeStrategy().uiDirection,
        theme: 'AI',
        sponsorApis: makeAnalysis().sponsorAPIs,
      });
      expect(section.body).toContain('Sponsor API Design Integration');
      expect(section.body).toContain('OpenAI');
    });
  });

  describe('renderFeatureSpec', () => {
    it('includes tech stack and sponsor APIs', () => {
      const ctx = {
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        fileType: 'frontend' as const,
        specificTask: 'Build voice input component',
      };
      const section = renderFeatureSpec(ctx);
      expect(section.title).toBe('Feature Specification');
      expect(section.body).toContain('frontend');
      expect(section.body).toContain('OpenAI');
      expect(section.body).toContain('Build voice input component');
    });

    it('includes scaffold file list for scaffold type', () => {
      const section = renderFeatureSpec({
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        fileType: 'scaffold',
      });
      expect(section.body).toContain('package.json');
      expect(section.body).toContain('tsconfig.json');
    });
  });

  describe('renderConstraints', () => {
    it('includes restrictions and coding rules', () => {
      const section = renderConstraints({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        restrictions: makeAnalysis().restrictions,
      });
      expect(section.title).toBe('Constraints & Rules');
      expect(section.body).toContain('12 hour limit');
      expect(section.body).toContain('Export default for components');
    });

    it('includes sponsor API constraints from interview', () => {
      const section = renderConstraints({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        interviewResult: makeInterviewResult(),
        restrictions: makeAnalysis().restrictions,
      });
      expect(section.body).toContain('OpenAI');
    });
  });

  describe('renderOutputSchema', () => {
    it('includes task description for each file type', () => {
      const scaffold = renderOutputSchema({ fileType: 'scaffold' });
      expect(scaffold.body).toContain('full hackathon project');

      const frontend = renderOutputSchema({ fileType: 'frontend', specificTask: 'Build counter' });
      expect(frontend.body).toContain('Build counter');

      const backend = renderOutputSchema({ fileType: 'backend', specificTask: 'Create API endpoint' });
      expect(backend.body).toContain('Create API endpoint');

      const database = renderOutputSchema({ fileType: 'database', specificTask: 'User table' });
      expect(database.body).toContain('User table');
    });

    it('includes required technologies when provided', () => {
      const section = renderOutputSchema({
        fileType: 'frontend',
        requiredTechs: ['openai', 'stripe'],
      });
      expect(section.body).toContain('openai');
      expect(section.body).toContain('stripe');
      expect(section.body).toContain('package.json dependencies');
    });
  });

  describe('renderGenerationPrompt', () => {
    it('assembles all sections into a system prompt', () => {
      const component = renderGenerationPrompt({
        analysis: makeAnalysis(),
        strategy: makeStrategy(),
        codeGenCtx: makeCodeGenCtx(),
        fileType: 'scaffold',
        seed: 42,
      });

      expect(component.id).toBe('generation');
      expect(component.required).toBe(true);
      expect(component.content).toContain('Hackathon Summary');
      expect(component.content).toContain('Judging Alignment');
      expect(component.content).toContain('Design Language');
      expect(component.content).toContain('Feature Specification');
      expect(component.content).toContain('Constraints & Rules');
      expect(component.content).toContain('Output Schema');
    });
  });
});

describe('PromptBuilder', () => {
  const analysis = makeAnalysis();
  const strategy = makeStrategy();
  const codeGenCtx = makeCodeGenCtx();

  it('builds a prompt assembly with correct structure', () => {
    const builder = new PromptBuilder('hackathon_summary', 42, analysis);
    const assembly = builder.build();

    expect(assembly.systemPrompt).toBeTruthy();
    expect(assembly.messages.length).toBeGreaterThanOrEqual(1);
    expect(assembly.messages[0]!.role).toBe('system');
    expect(assembly.budget).toBe(4096);
    expect(assembly.sections.length).toBeGreaterThan(0);
  });

  it('builds generation prompt with user task', () => {
    const builder = new PromptBuilder('generation', 42, analysis)
      .withStrategy(strategy)
      .withCodeGenCtx(codeGenCtx)
      .withFileType('scaffold')
      .withSpecificTask('')
      .withRequiredTechs(['openai']);

    const assembly = builder.build();
    expect(assembly.messages.length).toBe(2);
    expect(assembly.messages[0]!.role).toBe('system');
    expect(assembly.messages[1]!.role).toBe('user');
    expect(assembly.messages[1]!.content).toContain('package.json');
  });

  it('produces deterministic output for same inputs', () => {
    const builder1 = new PromptBuilder('hackathon_summary', 42, analysis);
    const builder2 = new PromptBuilder('hackathon_summary', 42, analysis);

    const a1 = builder1.build();
    const a2 = builder2.build();

    expect(a1.systemPrompt).toBe(a2.systemPrompt);
    expect(a1.messages).toEqual(a2.messages);
  });

  it('omits user message when no task is set for non-generation stages', () => {
    const builder = new PromptBuilder('constraints', 42, analysis);
    const assembly = builder.build();
    expect(assembly.messages.length).toBe(1);
  });

  it('handles missing optional strategy gracefully', () => {
    const builder = new PromptBuilder('architecture_design', 42, analysis);
    expect(() => builder.build()).toThrow(/Required component/);
  });

  it('builds debug info', () => {
    const builder = new PromptBuilder('hackathon_summary', 42, analysis);
    const info = builder.buildDebugInfo();

    expect(info.stage).toBe('hackathon_summary');
    expect(info.seed).toBe(42);
    expect(info.tokenCount).toBeGreaterThan(0);
    expect(info.warnings).toBeDefined();
    expect(Array.isArray(info.sections)).toBe(true);
  });

  it('uses builder pattern with fluent chaining', () => {
    const builder = new PromptBuilder('generation', 42, analysis)
      .withStrategy(strategy)
      .withCodeGenCtx(codeGenCtx)
      .withInterview(makeInterviewResult())
      .withUIDirection(strategy.uiDirection)
      .withFileType('frontend')
      .withSpecificTask('Build feature')
      .withRequiredTechs(['openai'])
      .withArchitectureArtifacts(makeArchitectureArtifacts())
      .withVision(makeVision());

    expect(builder.getStage()).toBe('generation');
    expect(builder.getSeed()).toBe(42);
  });

  it('truncation warning when component exceeds max tokens', () => {
    const builder = new PromptBuilder('generation', 42, analysis)
      .withStrategy(strategy)
      .withCodeGenCtx(codeGenCtx)
      .withFileType('scaffold');

    const assembly = builder.build();
    expect(assembly.warnings).toBeDefined();
  });

  describe('buildGenerationPrompt', () => {
    it('builds a complete generation assembly', () => {
      const assembly = buildGenerationPrompt(
        analysis,
        strategy,
        codeGenCtx,
        'scaffold',
        { seed: 42, requiredTechs: ['openai'] },
      );

      expect(assembly.systemPrompt).toContain('Hackathon Summary');
      expect(assembly.systemPrompt).toContain('Output Schema');
      expect(assembly.messages[1]!.content).toContain('Task');
    });
  });
});

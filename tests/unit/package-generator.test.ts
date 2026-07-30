import { describe, it, expect } from 'vitest';
import { generatePackage } from '../../cli/submission/package-generator.js';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PipelineContext } from '../../cli/pipeline/types.js';

function createTempDir(): string {
  const dir = join(import.meta.dirname, '__temp_package_gen__');
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

const mockContext: PipelineContext = {
  seed: 42,
  startedAt: Date.now(),
  stages: {},
  analysis: {
    analysisId: 'test-001',
    challenge: {
      title: 'AI for Good Hack 2027',
      problemStatement: 'Build AI that helps people',
      theme: 'ai',
      difficulty: 'intermediate',
      estimatedParticipants: 500,
      organizer: 'AI Foundation',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Creative approach to solving the problem', priority: 'critical' },
      { name: 'Impact', weight: 30, weightRaw: '30%', description: 'Real-world applicability', priority: 'high' },
      { name: 'Technical Difficulty', weight: 30, weightRaw: '30%', description: 'Complexity of implementation', priority: 'high' },
    ],
    sponsorAPIs: [
      { name: 'OpenAI', provider: 'openai', description: 'GPT-4 for AI features', strategicValue: 'must_use' },
      { name: 'Vercel', provider: 'vercel', description: 'Deployment platform', strategicValue: 'should_use' },
    ],
    deliverables: [{ description: 'Demo video', format: 'mp4', required: true }],
    restrictions: [],
    deadlines: [],
  },
  strategy: {
    projectName: 'AI Assistant',
    oneLiner: 'An AI-powered assistant for hackathon participants',
    whyScoreWell: ['Strong innovation and impact'],
    targetedCriteria: [],
    prioritizedAPIs: [],
    architecture: 'Next.js App Router',
    technologyStack: { frontend: 'React', backend: 'Next.js', database: 'None', deployment: 'Vercel', testing: 'Vitest', styling: 'Tailwind CSS' },
    uiDirection: { designLanguage: 'shadcn/ui', layout: 'Dashboard', keyScreens: ['Home', 'Demo'], responsiveBreakpoints: 'sm:md:lg', componentLibrary: 'shadcn' },
    featurePriority: [{ feature: 'AI Chat', weight: 90, effort: 'medium', category: 'core' }],
    roadmap: [{ phase: 'M1', tasks: ['Scaffold'], estimatedMinutes: 420 }],
    differentiators: ['Clean UI'],
    risks: [{ risk: 'API limits', mitigation: 'Cache responses' }],
    recommendedStack: ['React', 'Next.js', 'Tailwind CSS'],
    estimatedJudgeScore: 85,
  },
  executionResult: {
    features: ['AI Chat interface', 'Real-time response', 'Seed data script'],
    errors: [],
    deployUrl: 'https://ai-assistant.vercel.app',
    taskCount: 12,
    buildSuccess: true,
    testPassRate: 0.9,
    criteriaCount: 3,
    featureCount: 3,
    errorCount: 0,
    durationMs: 300000,
  },
  reviewFeedback: null,
  feedbackConverged: true,
  feedbackIterations: 1,
  qualityChecks: null,
  report: {
    challengeSummary: 'AI for Good Hack 2027',
    chosenStrategy: null as any,
    techStack: ['React', 'Next.js', 'Tailwind CSS'],
    generatedFeatures: ['AI Chat'],
    knownWeaknesses: ['No authentication'],
    futureImprovements: ['Add auth', 'Add tests'],
    judgeScorePrediction: 85,
    innovationScore: 80,
    technicalDepthScore: 70,
    feasibilityScore: 85,
    presentationScore: 75,
    completenessScore: 65,
    maintainabilityScore: 70,
    judgeAlignmentScore: 80,
    qualityChecks: [],
  },
};

describe('generatePackage', () => {
  it('generates all 5 submission files', () => {
    const dir = createTempDir();
    try {
      const result = generatePackage(dir, mockContext);
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(5);

      const fileNames = result.files.map(f => f.file);
      expect(fileNames).toContain('README.md');
      expect(fileNames).toContain('SETUP.md');
      expect(fileNames).toContain('DEPLOY.md');
      expect(fileNames).toContain('DEMO.md');
      expect(fileNames).toContain('SUBMISSION.md');

      for (const f of result.files) {
        expect(existsSync(join(dir, f.file))).toBe(true);
        expect(f.contentLength).toBeGreaterThan(0);
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('all files have non-empty content', () => {
    const dir = createTempDir();
    try {
      const result = generatePackage(dir, mockContext);
      for (const f of result.files) {
        const content = readFileSync(join(dir, f.file), 'utf-8');
        expect(content.length).toBeGreaterThan(50);
        expect(content).toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('README includes project title and one-liner', () => {
    const dir = createTempDir();
    try {
      generatePackage(dir, mockContext);
      const readme = readFileSync(join(dir, 'README.md'), 'utf-8');
      expect(readme).toContain('AI for Good Hack 2027');
      expect(readme).toContain('AI Assistant');
      expect(readme).toContain('OpenAI');
      expect(readme).toContain('npm run dev');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('DEMO.md includes walkthrough and talking points', () => {
    const dir = createTempDir();
    try {
      generatePackage(dir, mockContext);
      const demo = readFileSync(join(dir, 'DEMO.md'), 'utf-8');
      expect(demo).toContain('Walkthrough');
      expect(demo).toContain('Innovation');
      expect(demo).toContain('No authentication');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('SUBMISSION.md includes sponsorship and criteria', () => {
    const dir = createTempDir();
    try {
      generatePackage(dir, mockContext);
      const sub = readFileSync(join(dir, 'SUBMISSION.md'), 'utf-8');
      expect(sub).toContain('OpenAI');
      expect(sub).toContain('Vercel');
      expect(sub).toContain('Innovation');
      expect(sub).toContain('AI Chat');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('works with minimal context (no analysis or strategy)', () => {
    const dir = createTempDir();
    try {
      const minimalContext: PipelineContext = {
        seed: 0,
        startedAt: Date.now(),
        stages: {},
        analysis: null,
        strategy: null,
        executionResult: null,
        reviewFeedback: null,
        feedbackConverged: false,
        feedbackIterations: 0,
        qualityChecks: null,
        report: null,
      };
      const result = generatePackage(dir, minimalContext);
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(5);
      const readme = readFileSync(join(dir, 'README.md'), 'utf-8');
      expect(readme).toContain('Hackathon Project');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('DEPLOY.md references Vercel', () => {
    const dir = createTempDir();
    try {
      generatePackage(dir, mockContext);
      const deploy = readFileSync(join(dir, 'DEPLOY.md'), 'utf-8');
      expect(deploy).toContain('Vercel');
      expect(deploy).toContain('Docker');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

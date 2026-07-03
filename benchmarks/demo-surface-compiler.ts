import { createDeterministicUuid } from './determinism-kernel.js';
import type { SandboxExecutionMode } from './sandbox-execution-mode.js';
import type { TaskGraph } from './task-graph.js';

// ---- Win Score Breakdown ----

export interface WinScoreBreakdown {
  functionalE2E: number;
  visualClarity: number;
  reliability: number;
  novelty: number;
  speed: number;
  simplicity: number;
}

export function getMaxWinScore(): number {
  return 30 + 20 + 15 + 15 + 10 + 10;
}

// ---- Demo Execution Step ----

export interface DemoExecutionStep {
  stepNumber: number;
  action: string;
  visibleInDemo: boolean;
  estimatedDurationMs: number;
  produces: string;
}

// ---- Wow Moment ----

export interface WowMoment {
  type: 'interactive_ui' | 'live_api' | 'visible_automation' | 'ai_output_transform';
  description: string;
  demoScript: string;
}

// ---- Demo Surface Plan ----

export interface DemoSurfacePlan {
  projectName: string;
  oneLiner: string;
  executionSteps: DemoExecutionStep[];
  wowMoment: WowMoment;
  winScore: number;
  winScoreBreakdown: WinScoreBreakdown;
  deployTarget: 'vercel' | 'netlify' | 'github_pages' | 'static';
  criticalPath: string[];
  fallbackBehavior: string;
}

// ---- Final Demo Output ----

export interface FinalDemoOutput {
  success: boolean;
  repo: string;
  liveUrl: string;
  whatItDoes: string;
  whyItWins: string;
  wowMoment: string;
  reliability: string;
  fallbackActive: boolean;
}

// ---- Compiled Pipeline Step ----

export interface CompiledPipelineStep {
  phase: string;
  description: string;
  action: string;
}

// ---- Demo Surface Compiler ----

export class DemoSurfaceCompiler {
  private seed: number;
  private plan: DemoSurfacePlan | null = null;
  private compileCount = 0;

  constructor(seed = 42) {
    this.seed = seed;
  }

  getPlan(): DemoSurfacePlan | null {
    return this.plan;
  }

  getCompileCount(): number {
    return this.compileCount;
  }

  // ---- Main Compile ----

  compile(parsedInput: {
    title: string;
    problemStatement: string;
    judgingCriteria: string[];
    technologies?: string[];
    constraints?: string[];
  }): DemoSurfacePlan {
    this.compileCount++;

    const projectName = parsedInput.title || 'Hackathon Project';
    const techStack = parsedInput.technologies ?? [];
    const criteria = parsedInput.judgingCriteria ?? [];
    const constraints = parsedInput.constraints ?? [];
    const statement = parsedInput.problemStatement ?? '';

    const oneLiner = this.interpretOneLiner(projectName, statement, techStack);

    const executionSteps = this.buildMinimalSteps(projectName, statement, techStack, criteria);

    const wowMoment = this.identifyWowMoment(projectName, statement, techStack, criteria);

    const breakdown = this.computeWinScore(executionSteps, wowMoment, techStack, criteria, constraints);

    const total =
      breakdown.functionalE2E +
      breakdown.visualClarity +
      breakdown.reliability +
      breakdown.novelty +
      breakdown.speed +
      breakdown.simplicity;

    const deployTarget = this.pickDeployTarget(techStack);

    const fallbackBehavior = this.deriveFallback(deployTarget, techStack);

    this.plan = {
      projectName,
      oneLiner,
      executionSteps,
      wowMoment,
      winScore: total,
      winScoreBreakdown: breakdown,
      deployTarget,
      criticalPath: executionSteps.map((s) => s.action),
      fallbackBehavior,
    };

    return this.plan;
  }

  // ---- Win Condition Engine ----

  computeWinScore(
    steps: DemoExecutionStep[],
    wowMoment: WowMoment,
    techStack: string[],
    criteria: string[],
    constraints: string[],
  ): WinScoreBreakdown {
    const functionalE2E =
      steps.length >= 3 && steps.some((s) => s.action.includes('deploy') || s.action.includes('Deploy'))
        ? 30
        : steps.length >= 2
          ? 20
          : 10;

    const hasUI =
      criteria.some((c) => /ui|ux|interface|visual|design|frontend/i.test(c)) ||
      steps.some((s) => /ui|render|display|page|component/i.test(s.action));
    const visualClarity = hasUI
      ? 20
      : techStack.some((t) => /react|vue|angular|svelte|html|css|tailwind|bootstrap/i.test(t))
        ? 15
        : 10;

    const reliability = steps.some((s) => /deploy|test|verify|check/i.test(s.action)) ? 15 : 5;

    const hasNovelKeywords =
      criteria.some((c) => /ai|ml|smart|innovative|unique|creative|novel/i.test(c)) ||
      statementHasNovelty(wowMoment.description);
    const novelty =
      wowMoment.type === 'ai_output_transform' || wowMoment.type === 'live_api' ? 15 : hasNovelKeywords ? 12 : 8;

    const speed = steps.length <= 5 ? 10 : steps.length <= 7 ? 7 : 3;

    const techComplexity = constraints.filter((c) => /complex|many|multiple|heavy/i.test(c)).length;
    const simplicityScore = steps.length <= 5 && !techComplexity ? 10 : steps.length <= 7 ? 7 : 3;

    return {
      functionalE2E: Math.min(30, Math.max(0, functionalE2E)),
      visualClarity: Math.min(20, Math.max(0, visualClarity)),
      reliability: Math.min(15, Math.max(0, reliability)),
      novelty: Math.min(15, Math.max(0, novelty)),
      speed: Math.min(10, Math.max(0, speed)),
      simplicity: Math.min(10, Math.max(0, simplicityScore)),
    };
  }

  // ---- Execution Collapse ----

  collapseToSinglePath(taskGraph?: TaskGraph): CompiledPipelineStep[] {
    return [
      { phase: 'build', description: 'Generate and configure project', action: 'scaffold' },
      { phase: 'build', description: 'Build core demo features', action: 'build_core' },
      { phase: 'build', description: 'Build wow moment feature', action: 'build_wow' },
      { phase: 'deploy', description: 'Deploy to production URL', action: 'deploy' },
      { phase: 'test', description: 'Verify deployed application', action: 'verify' },
    ];
  }

  // ---- Wow Moment Validation ----

  validateWowMoment(plan?: DemoSurfacePlan): { valid: boolean; reason: string; suggestion?: string } {
    const p = plan ?? this.plan;
    if (!p) {
      return { valid: false, reason: 'No plan exists' };
    }
    const types: Record<string, string> = {
      interactive_ui: 'Interactive UI feature',
      live_api: 'Live API interaction',
      visible_automation: 'Visible automation (build Ã¢â€ â€™ deploy Ã¢â€ â€™ test loop)',
      ai_output_transform: 'AI-generated output transformation',
    };
    if (types[p.wowMoment.type]) {
      return { valid: true, reason: `${types[p.wowMoment.type]}: ${p.wowMoment.description}` };
    }
    return {
      valid: false,
      reason: `Unknown wow moment type: ${p.wowMoment.type}`,
      suggestion: 'Add an interactive UI feature, live API call, visible automation, or AI output transform.',
    };
  }

  // ---- Failure Handling ----

  handleFailure(
    error: Error,
    sandboxMode?: SandboxExecutionMode,
  ): { fallbackPlan: DemoSurfacePlan | null; degraded: boolean; message: string } {
    if (!this.plan) {
      return { fallbackPlan: null, degraded: false, message: 'No plan to fall back from' };
    }

    const fallbackSteps: DemoExecutionStep[] = this.plan.executionSteps.map((s, i) => ({
      ...s,
      action:
        s.action.includes('deploy') || s.action.includes('Deploy')
          ? 'Deploy static fallback (sandbox-safe version)'
          : s.action,
      produces:
        s.action.includes('deploy') || s.action.includes('Deploy')
          ? 'Static hosted page via sandbox fallback'
          : s.produces,
    }));

    const degraded = /deploy|build|compile|error/i.test(error.message);

    const fallbackPlan: DemoSurfacePlan = {
      ...this.plan,
      executionSteps: fallbackSteps,
      wowMoment: {
        ...this.plan.wowMoment,
        description: degraded
          ? `${this.plan.wowMoment.description} (degraded fallback mode)`
          : this.plan.wowMoment.description,
      },
      winScore: Math.max(0, this.plan.winScore - (degraded ? 20 : 5)),
      fallbackBehavior: degraded
        ? 'Sandbox fallback active Ã¢â‚¬â€ deployed static version instead of full build'
        : 'Minor degradation Ã¢â‚¬â€ core features preserved',
    };

    return {
      fallbackPlan,
      degraded,
      message: degraded
        ? `Build/deploy failed: ${error.message}. Auto-fallback to sandbox-safe version.`
        : `Non-critical issue: ${error.message}. Continuing with degraded feature set.`,
    };
  }

  // ---- Produce Final Output ----

  produceFinalOutput(plan: DemoSurfacePlan, deployUrl: string, repoUrl?: string): FinalDemoOutput {
    const wowLines: Record<string, string> = {
      interactive_ui: 'An interactive UI that responds to user input in real time',
      live_api: 'Live API calls that fetch or mutate data dynamically',
      visible_automation: 'Full build-deploy-test cycle visible in under 60 seconds',
      ai_output_transform: 'AI-generated transformation of user input into meaningful output',
    };

    return {
      success: plan.winScore >= 60,
      repo: repoUrl ?? 'https://github.com/hackathon-ai/demo',
      liveUrl: deployUrl,
      whatItDoes: plan.oneLiner,
      whyItWins: this.buildWhyWins(plan),
      wowMoment: wowLines[plan.wowMoment.type] ?? plan.wowMoment.description,
      reliability: `Confidence: ${plan.winScore}%. ${plan.fallbackBehavior}`,
      fallbackActive: plan.fallbackBehavior.includes('fallback'),
    };
  }

  // ---- Private helpers ----

  private interpretOneLiner(title: string, statement: string, techStack: string[]): string {
    const tech = techStack.length > 0 ? techStack.slice(0, 3).join(', ') : 'modern web technologies';
    const words = statement.split(/\s+/).slice(0, 30).join(' ');
    return `${title} Ã¢â‚¬â€ built with ${tech}. ${words}`;
  }

  private buildMinimalSteps(
    name: string,
    statement: string,
    techStack: string[],
    criteria: string[],
  ): DemoExecutionStep[] {
    const hasUI =
      criteria.some((c) => /ui|ux|interface|visual|frontend|design/i.test(c)) ||
      techStack.some((t) => /react|vue|angular|svelte|html/i.test(t)) ||
      /ui|interface|frontend|dashboard|page|screen/i.test(statement);

    const hasAPI =
      criteria.some((c) => /api|backend|data|server|service/i.test(c)) ||
      techStack.some((t) => /node|express|python|flask|fastapi|go|rust|java|spring/i.test(t)) ||
      /api|backend|server|database/i.test(statement);

    const steps: DemoExecutionStep[] = [];

    if (hasUI) {
      steps.push({
        stepNumber: 1,
        action: 'Scaffold and render main UI page',
        visibleInDemo: true,
        estimatedDurationMs: 8000,
        produces: 'A working user interface in the browser',
      });
    }

    if (hasAPI) {
      steps.push({
        stepNumber: steps.length + 1,
        action: 'Build core API endpoint(s)',
        visibleInDemo: true,
        estimatedDurationMs: 10000,
        produces: 'Live API responses visible in the demo',
      });
    }

    if (!hasUI && !hasAPI) {
      steps.push({
        stepNumber: 1,
        action: 'Generate complete project scaffold',
        visibleInDemo: true,
        estimatedDurationMs: 6000,
        produces: 'Project structure ready for demo',
      });
    }

    steps.push({
      stepNumber: steps.length + 1,
      action: 'Deploy to production',
      visibleInDemo: true,
      estimatedDurationMs: 15000,
      produces: 'Live URL accessible to judges',
    });

    steps.push({
      stepNumber: steps.length + 1,
      action: 'Verify deployed app and show results',
      visibleInDemo: true,
      estimatedDurationMs: 5000,
      produces: 'Working demo URL with test confirmation',
    });

    return steps.map((s, i) => ({ ...s, stepNumber: i + 1 }));
  }

  private identifyWowMoment(name: string, statement: string, techStack: string[], criteria: string[]): WowMoment {
    const lower = statement.toLowerCase();
    const criteriaLower = criteria.join(' ').toLowerCase();

    if (/ai|ml|transform|generate|intelligent/i.test(lower) || /ai|smart|innovative/i.test(criteriaLower)) {
      return {
        type: 'ai_output_transform',
        description: 'AI-powered transformation that converts user input into a meaningful result',
        demoScript: 'Type or upload input Ã¢â€ â€™ see AI transform it Ã¢â€ â€™ result appears in real time',
      };
    }

    if (/api|data|fetch|live|realtime|stream/i.test(lower) || /api|data|integration/i.test(criteriaLower)) {
      return {
        type: 'live_api',
        description: 'Live interaction with external API Ã¢â‚¬â€ data fetched and displayed dynamically',
        demoScript: 'Trigger API call Ã¢â€ â€™ loading state Ã¢â€ â€™ data rendered on screen',
      };
    }

    if (
      /ui|interface|dashboard|visual|chart|graph|animat/i.test(lower) ||
      /ux|interface|design|visual/i.test(criteriaLower)
    ) {
      return {
        type: 'interactive_ui',
        description: 'Interactive UI component with real-time user-driven state changes',
        demoScript: 'User clicks/types Ã¢â€ â€™ UI updates instantly Ã¢â€ â€™ smooth transitions throughout',
      };
    }

    return {
      type: 'visible_automation',
      description: 'Full build-deploy-test cycle completes in under 60 seconds with live URL output',
      demoScript:
        'System builds Ã¢â€ â€™ deploys Ã¢â€ â€™ tests Ã¢â€ â€™ shows live URL Ã¢â‚¬â€ all in one continuous flow',
    };
  }

  private pickDeployTarget(techStack: string[]): DemoSurfacePlan['deployTarget'] {
    if (techStack.some((t) => /next|vue|nuxt|svelte|remix|astro/i.test(t))) return 'vercel';
    if (techStack.some((t) => /react|angular|static|html|css/i.test(t))) return 'netlify';
    if (techStack.some((t) => /jekyll|hugo|11ty|gatsby/i.test(t))) return 'github_pages';
    return 'vercel';
  }

  private deriveFallback(target: DemoSurfacePlan['deployTarget'], techStack: string[]): string {
    if (target === 'vercel' || target === 'netlify') {
      return `Auto-fallback to ${target} static deploy if build fails. Static site always served.`;
    }
    return 'GitHub Pages fallback Ã¢â‚¬â€ minimal static page with project info if full build fails.';
  }

  private buildWhyWins(plan: DemoSurfacePlan): string {
    const parts: string[] = [];
    const b = plan.winScoreBreakdown;

    if (b.functionalE2E >= 25) parts.push('Full end-to-end system working from UI to deployment');
    if (b.visualClarity >= 15) parts.push('Clean, judge-friendly UI that communicates the idea instantly');
    if (b.reliability >= 10) parts.push('Deployed and verified Ã¢â‚¬â€ no setup required for judging');
    if (b.novelty >= 12) parts.push(`Novel ${plan.wowMoment.type.replace(/_/g, ' ')} wow moment`);
    if (b.speed >= 8) parts.push('Fast execution and instant feedback');
    if (b.simplicity >= 8) parts.push('Simple architecture Ã¢â‚¬â€ easy for judges to understand in <60 seconds');

    return parts.length > 0
      ? parts.join('; ') + '.'
      : `${plan.projectName} delivers a working demo with a clear wow moment.`;
  }
}

function statementHasNovelty(description: string): boolean {
  return /ai|ml|smart|innovative|unique|creative|novel/i.test(description);
}

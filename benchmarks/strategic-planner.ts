import { DecisionLogger, type AgentRole } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface Risk {
  category: 'time' | 'scope' | 'tech' | 'team' | 'judging';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  mitigation: string;
}

export interface StrategyPlan {
  id: string;
  projectName: string;
  techStack?: string[];
  winningStrategy: string;
  mvpScope: string[];
  wowFactors: string[];
  risks: Risk[];
  scoringAlignment: Record<string, number>;
  competitionAnalysis: { judgePriorities: string[]; differentiators: string[]; commonPitfalls: string[] };
  estimatedSuccessProbability: number;
  recommendedTimeAllocation: Record<string, number>;
  createdAt: string;
}

export class StrategicPlanner {
  private readonly seed: number;
  private readonly plannerId: string;
  private readonly decisionLogger: DecisionLogger;
  private plans: StrategyPlan[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.plannerId = 'strat-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 1000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getPlans(): StrategyPlan[] {
    return [...this.plans];
  }

  analyzeCompetitionIntent(
    title: string,
    problemStatement: string,
    judgingCriteria: string[],
    constraints: string[],
    techStack: string[],
  ): StrategyPlan {
    const rng = getSeededRandom(this.seed);
    const projectName = title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const planId = 'plan-' + createDeterministicUuid(this.seed, this.plans.length).slice(0, 8);

    const judgePriorities = this.extractJudgePriorities(judgingCriteria, constraints);
    const differentiators = this.generateDifferentiators(judgingCriteria, techStack);
    const commonPitfalls = this.identifyPitfalls(constraints, techStack);

    const scoringAlignment: Record<string, number> = {};
    for (const criterion of judgingCriteria) {
      const base = 1.0 / Math.max(judgingCriteria.length, 1);
      const clarity = criterion.length > 20 ? 1.0 : 0.7;
      scoringAlignment[criterion] = Math.round(base * clarity * 100) / 100;
    }

    const mvpScope = this.determineMVP(judgingCriteria, constraints, techStack);
    const wowFactors = this.identifyWowFactors(judgingCriteria, techStack, problemStatement);

    const risks: Risk[] = this.analyzeRisks(constraints, techStack, mvpScope);
    const estimatedSuccessProbability = this.computeSuccessProbability(judgingCriteria, risks, mvpScope.length);
    const recommendedTimeAllocation = this.allocateTime(mvpScope.length, wowFactors.length);

    const winningStrategy = this.formulateStrategy(
      judgePriorities,
      differentiators,
      wowFactors,
      estimatedSuccessProbability,
    );

    this.decisionLogger.log(
      'strategy',
      'analyze_competition',
      winningStrategy,
      estimatedSuccessProbability,
      differentiators,
      { projectName, judgingCriterionCount: judgingCriteria.length, mvpTaskCount: mvpScope.length },
    );

    const plan: StrategyPlan = {
      id: planId,
      projectName,
      techStack,
      winningStrategy,
      mvpScope,
      wowFactors,
      risks,
      scoringAlignment,
      competitionAnalysis: { judgePriorities, differentiators, commonPitfalls },
      estimatedSuccessProbability,
      recommendedTimeAllocation,
      createdAt: deterministicNow(this.seed),
    };

    this.plans.push(plan);
    return plan;
  }

  private extractJudgePriorities(criteria: string[], constraints: string[]): string[] {
    const priorities: string[] = [];
    for (const c of criteria) {
      const lower = c.toLowerCase();
      if (lower.includes('impact') || lower.includes('innovation')) priorities.unshift(c);
      else priorities.push(c);
    }
    for (const c of constraints) {
      const lower = c.toLowerCase();
      if (lower.includes('must') || lower.includes('required') || lower.includes('judg')) priorities.unshift(c);
    }
    return priorities;
  }

  private generateDifferentiators(criteria: string[], stack: string[]): string[] {
    const diffs: string[] = [];
    if (criteria.some((c) => c.toLowerCase().includes('polish') || c.toLowerCase().includes('ux'))) {
      diffs.push('Production-quality UX and polish');
    }
    if (criteria.some((c) => c.toLowerCase().includes('technical'))) {
      diffs.push('Clean architecture with testing');
    }
    if (
      stack.some(
        (s) => s.toLowerCase().includes('ai') || s.toLowerCase().includes('ml') || s.toLowerCase().includes('llm'),
      )
    ) {
      diffs.push('AI-powered features beyond basic CRUD');
    }
    diffs.push('Fully deployed and accessible via live URL');
    diffs.push('Automated CI/CD pipeline with browser-tested quality');
    return diffs;
  }

  private identifyPitfalls(constraints: string[], stack: string[]): string[] {
    const pitfalls: string[] = [];
    if (constraints.length === 0) pitfalls.push('No explicit constraints Ã¢â‚¬â€ risk of scope creep');
    if (stack.length === 0) pitfalls.push('No tech stack specified Ã¢â‚¬â€ analysis paralysis risk');
    pitfalls.push('Over-engineering features judges will not see');
    pitfalls.push('Neglecting deployment until the last minute');
    pitfalls.push('Building without testing until demo day');
    return pitfalls;
  }

  private determineMVP(criteria: string[], constraints: string[], stack: string[]): string[] {
    const mvp: string[] = [];
    mvp.push('Project scaffolding with build pipeline');
    mvp.push('Core feature matching top judging criterion');
    mvp.push('Working UI with navigation');
    mvp.push('API endpoints for data operations');
    mvp.push('Deployment to production URL');
    mvp.push('Live browser verification');

    if (criteria.some((c) => c.toLowerCase().includes('auth') || c.toLowerCase().includes('user'))) {
      mvp.push('User authentication and session management');
    }
    if (criteria.some((c) => c.toLowerCase().includes('data') || c.toLowerCase().includes('storage'))) {
      mvp.push('Database integration with CRUD operations');
    }
    if (stack.some((s) => s.toLowerCase().includes('ai') || s.toLowerCase().includes('ml'))) {
      mvp.push('AI/ML feature integration');
    }
    return mvp;
  }

  private identifyWowFactors(criteria: string[], stack: string[], problemStatement: string): string[] {
    const factors: string[] = [];
    const lower = problemStatement.toLowerCase();

    factors.push('Polished responsive UI with animations');
    if (lower.includes('real') || lower.includes('live') || lower.includes('time')) {
      factors.push('Real-time updates via WebSocket or polling');
    }
    if (stack.some((s) => s.toLowerCase().includes('ai'))) {
      factors.push('AI-generated content or recommendations');
    }
    if (criteria.some((c) => c.toLowerCase().includes('demo') || c.toLowerCase().includes('presentation'))) {
      factors.push('Demo mode with pre-seeded data');
    }
    factors.push('Automated test suite visible in CI');
    return factors;
  }

  private analyzeRisks(constraints: string[], stack: string[], mvpScope: string[]): Risk[] {
    const risks: Risk[] = [];
    const rng = getSeededRandom(this.seed + 1);

    risks.push({
      category: 'scope',
      description: 'Feature creep beyond MVP',
      severity: 'high',
      probability: 0.6 + rng.next() * 0.3,
      mitigation: 'Strictly adhere to MVP scope; defer enhancements',
    });
    risks.push({
      category: 'tech',
      description: 'Build or dependency failures',
      severity: 'medium',
      probability: 0.3 + rng.next() * 0.4,
      mitigation: 'Pin dependency versions; test build early',
    });

    if (stack.length > 0 && !stack.some((s) => ['nextjs', 'react', 'node'].includes(s.toLowerCase()))) {
      risks.push({
        category: 'tech',
        description: `Unfamiliar stack: ${stack.join(', ')}`,
        severity: 'high',
        probability: 0.7,
        mitigation: 'Allocate extra time for learning curve',
      });
    }

    if (constraints.some((c) => c.toLowerCase().includes('time') || c.toLowerCase().includes('hour'))) {
      risks.push({
        category: 'time',
        description: 'Aggressive time constraint from competition',
        severity: 'critical',
        probability: 0.8,
        mitigation: 'Focus ruthlessly on MVP; skip non-essential features',
      });
    }

    risks.push({
      category: 'judging',
      description: 'Judges value different criteria than expected',
      severity: 'medium',
      probability: 0.4,
      mitigation: 'Address all judging criteria explicitly in submission',
    });

    return risks;
  }

  private computeSuccessProbability(criteria: string[], risks: Risk[], mvpCount: number): number {
    let base = 0.5;
    base += Math.min(criteria.length * 0.05, 0.2);
    base += Math.min(mvpCount * 0.03, 0.15);
    const avgRisk = risks.reduce((s, r) => s + r.probability, 0) / Math.max(risks.length, 1);
    base -= avgRisk * 0.3;
    return Math.max(0.05, Math.min(0.95, Math.round(base * 100) / 100));
  }

  private allocateTime(mvpCount: number, wowCount: number): Record<string, number> {
    const alloc: Record<string, number> = {};
    const total = mvpCount + wowCount + 4;
    alloc.planning = Math.round((2 / total) * 100);
    alloc.building = Math.round((mvpCount / total) * 100);
    alloc.polish = Math.round((wowCount / total) * 100);
    alloc.testing = Math.round((1 / total) * 100);
    alloc.deployment = Math.round((1 / total) * 100);
    return alloc;
  }

  private formulateStrategy(
    priorities: string[],
    differentiators: string[],
    wowFactors: string[],
    probability: number,
  ): string {
    const parts: string[] = [];
    parts.push(`Focus on: ${priorities.slice(0, 3).join(', ')}`);
    if (differentiators.length > 0) parts.push(`Differentiate via: ${differentiators.slice(0, 2).join(', ')}`);
    if (wowFactors.length > 0) parts.push(`Delight judges with: ${wowFactors[0]!}`);
    parts.push(probability > 0.6 ? 'Aggressive execution with parallel tracks' : 'Conservative MVP-first approach');
    return parts.join('. ');
  }
}

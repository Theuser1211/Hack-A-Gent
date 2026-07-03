import { getSeededRandom, type RNG } from './determinism-kernel.js';

// ---- Types ----

export interface JudgeScore {
  innovation: number;
  functionality: number;
  uxPolish: number;
  technicalDepth: number;
  demoReliability: number;
}

export interface JudgeVerdict {
  total: number;
  breakdown: JudgeScore;
  biasApplied: string[];
  wowMomentBonus: number;
  passFail: 'pass' | 'fail' | 'conditional_pass';
  feedback: string[];
}

export interface JudgeSimulatorConfig {
  seed: number;
  judgeBias?: JudgeBias;
}

export interface JudgeBias {
  prefersVisibleDemo: boolean;
  penalizesIncomplete: boolean;
  rewardsWowMoment: boolean;
  uxWeightMultiplier: number;
}

const DEFAULT_BIAS: JudgeBias = {
  prefersVisibleDemo: true,
  penalizesIncomplete: true,
  rewardsWowMoment: true,
  uxWeightMultiplier: 1.3,
};

export const MAX_JUDGE_SCORE = 100;

// ---- Judge Simulator ----

export class JudgeSimulator {
  private readonly seed: number;
  private readonly bias: JudgeBias;
  private readonly rng: RNG;

  constructor(config: JudgeSimulatorConfig) {
    this.seed = config.seed;
    this.bias = config.judgeBias ?? DEFAULT_BIAS;
    this.rng = getSeededRandom(this.seed);
  }

  evaluate(params: {
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
  }): JudgeVerdict {
    const scores: JudgeScore = {
      innovation: this.scoreInnovation(params),
      functionality: this.scoreFunctionality(params),
      uxPolish: this.scoreUxPolish(params),
      technicalDepth: this.scoreTechnicalDepth(params),
      demoReliability: this.scoreDemoReliability(params),
    };

    const biases: string[] = [];

    if (this.bias.prefersVisibleDemo && params.hasUI) {
      biases.push('Visible demo detected â€” UX weight increased');
    }
    if (this.bias.penalizesIncomplete && !params.buildSuccess) {
      biases.push('Build failure â€” heavy penalty applied');
    }
    if (this.bias.rewardsWowMoment && params.hasWowMoment) {
      biases.push('Wow moment detected â€” bonus applied');
    }

    let wowMomentBonus = 0;
    if (this.bias.rewardsWowMoment && params.hasWowMoment) {
      wowMomentBonus = Math.floor(5 + this.rng.next() * 5);
    }

    const total = Math.min(
      100,
      Math.max(
        0,
        Math.round(
          scores.innovation +
            scores.functionality +
            scores.uxPolish +
            scores.technicalDepth +
            scores.demoReliability +
            wowMomentBonus,
        ),
      ),
    );

    const passFail = total >= 70 ? 'pass' : total >= 45 ? 'conditional_pass' : 'fail';

    const feedback = this.generateFeedback(scores, params, total);

    return { total, breakdown: scores, biasApplied: biases, wowMomentBonus, passFail, feedback };
  }

  private scoreInnovation(params: { hasWowMoment: boolean; mockAI?: boolean }): number {
    let score = 10;
    if (params.hasWowMoment) score += 8;
    if (params.mockAI) score += 5;
    const noise = Math.floor(this.rng.next() * 4);
    return Math.min(25, score + noise);
  }

  private scoreFunctionality(params: { taskCompleteness: number; buildSuccess: boolean }): number {
    if (!params.buildSuccess) return Math.floor(this.rng.next() * 8);
    const base = Math.floor(params.taskCompleteness * 20);
    const noise = Math.floor(this.rng.next() * 5);
    return Math.min(25, base + noise);
  }

  private scoreUxPolish(params: { hasUI: boolean; hasWowMoment: boolean; testPassRate: number }): number {
    if (!params.hasUI) return Math.floor(this.rng.next() * 5);

    let score = 8;
    if (params.hasWowMoment) score += 5;
    if (params.testPassRate > 0.8) score += 4;

    score = Math.floor(score * this.bias.uxWeightMultiplier);

    const noise = Math.floor(this.rng.next() * 4);
    return Math.min(20, score + noise);
  }

  private scoreTechnicalDepth(params: { mockAI?: boolean; taskCompleteness: number }): number {
    let score = 6;
    if (params.mockAI) score += 6;
    score += Math.floor(params.taskCompleteness * 6);
    const noise = Math.floor(this.rng.next() * 4);
    return Math.min(20, score + noise);
  }

  private scoreDemoReliability(params: {
    buildSuccess: boolean;
    deploySuccess: boolean;
    crashFree: boolean;
    testPassRate: number;
  }): number {
    let score = 0;
    if (params.buildSuccess) score += 3;
    if (params.deploySuccess) score += 3;
    if (params.crashFree) score += 2;
    score += Math.floor(params.testPassRate * 2);
    const noise = Math.floor(this.rng.next() * 2);
    return Math.min(10, score + noise);
  }

  private generateFeedback(
    scores: JudgeScore,
    params: {
      hasUI: boolean;
      hasWowMoment: boolean;
      buildSuccess: boolean;
      deploySuccess: boolean;
      crashFree: boolean;
      testPassRate: number;
    },
    total: number,
  ): string[] {
    const feedback: string[] = [];

    if (!params.hasUI) feedback.push('No visible UI â€” hard to judge user experience');
    if (!params.hasWowMoment) feedback.push('Missing wow moment â€” nothing memorable for judges');
    if (!params.buildSuccess) feedback.push('Build failed â€” critical issue');
    if (!params.deploySuccess) feedback.push('Deployment failed â€” judges cannot access the demo');
    if (!params.crashFree) feedback.push('Runtime crash detected â€” reliability concern');
    if (params.testPassRate < 0.7) feedback.push('Low test pass rate â€” functionality concerns');
    if (scores.innovation >= 20) feedback.push('Strong innovation â€” novel approach');
    if (scores.uxPolish >= 15) feedback.push('Polished UX â€” judge-friendly interface');
    if (total >= 70) feedback.push('Hackathon-ready score â€” demo is competitive');
    if (total < 50) feedback.push('Score below threshold â€” significant improvements needed');

    return feedback;
  }
}

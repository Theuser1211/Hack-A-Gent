import type { ReviewScore, ImprovementAction, ReviewFeedback } from './types.js';

export class SelfReviewScorer {
  /**
   * Score a project across 7 dimensions. Each dimension 0-100.
   * Uses deterministic logic (no Math.random) so scores are reproducible.
   */
  score(params: {
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }): ReviewScore {
    // Innovation: wow moment + AI features + novelty
    const innovation = this.dimensionScore([
      40, // base
      params.hasWowMoment ? 25 : 0,
      params.mockAI ? 15 : 0,
      params.hasUI ? 10 : 0,
    ]);

    // Technical Depth: build success + task completeness + complexity
    const technicalDepth = this.dimensionScore([
      30, // base
      params.buildSuccess ? 20 : 0,
      Math.round(params.taskCompleteness * 25),
      params.testPassRate >= 0.8 ? 15 : params.testPassRate >= 0.5 ? 8 : 0,
    ]);

    // Feasibility: deployability + real-world viability
    const feasibility = this.dimensionScore([
      30, // base
      params.buildSuccess ? 20 : 0,
      params.deploySuccess ? 20 : 0,
      params.crashFree ? 15 : 0,
      params.hasLiveDeploy ? 10 : 0,
    ]);

    // Presentation: UI quality + wow moment + deployability
    const presentation = this.dimensionScore([
      25, // base
      params.hasUI ? 25 : 0,
      params.hasWowMoment ? 20 : 0,
      params.hasLiveDeploy ? 15 : 0,
      params.buildSuccess ? 10 : 0,
    ]);

    // Completeness: task completion + feature count + error-free
    const completeness = this.dimensionScore([
      20, // base
      Math.round(params.taskCompleteness * 35),
      params.featureCount && params.featureCount > 5 ? 20 : params.featureCount && params.featureCount > 3 ? 10 : 0,
      params.errorCount === 0 ? 15 : params.errorCount && params.errorCount <= 3 ? 8 : 0,
      params.testPassRate >= 0.7 ? 10 : 0,
    ]);

    // Maintainability: test pass rate + build success + error-free
    const maintainability = this.dimensionScore([
      30, // base
      params.testPassRate >= 0.8 ? 25 : params.testPassRate >= 0.5 ? 15 : 0,
      params.buildSuccess ? 20 : 0,
      params.crashFree ? 15 : 0,
      params.errorCount === 0 ? 10 : 0,
    ]);

    // Judge Alignment: criteria coverage + wow moment + deployability
    const judgeAlignment = this.dimensionScore([
      25, // base
      params.criteriaCount && params.criteriaCount >= 4 ? 25 : params.criteriaCount && params.criteriaCount >= 2 ? 15 : 5,
      params.hasWowMoment ? 15 : 0,
      params.hasLiveDeploy ? 15 : 0,
      params.hasUI ? 10 : 0,
      params.buildSuccess ? 10 : 0,
    ]);

    const overall = Math.min(100, Math.round(
      (innovation + technicalDepth + feasibility + presentation + completeness + maintainability + judgeAlignment) / 7
    ));

    return { innovation, technicalDepth, feasibility, presentation, completeness, maintainability, judgeAlignment, overall };
  }

  /**
   * Generate improvement feedback with prioritized actions.
   * Acts as the improvement feedback loop - detects weaknesses
   * and produces concrete actions to raise each score.
   */
  generateFeedback(params: {
    score: ReviewScore;
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }, iteration = 0, maxIterations = 3): ReviewFeedback {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementActions: ImprovementAction[] = [];

    // Derive strengths from high scores
    if (params.score.innovation >= 75) strengths.push('Strong innovation - project feels novel and creative');
    if (params.score.technicalDepth >= 75) strengths.push('Solid technical implementation with good depth');
    if (params.score.presentation >= 75) strengths.push('Polished presentation - judges can understand the project quickly');
    if (params.score.feasibility >= 75) strengths.push('High feasibility - project is practical and deployable');
    if (params.score.completeness >= 75) strengths.push('High completeness - most features are implemented');
    if (params.score.judgeAlignment >= 75) strengths.push('Strong judge alignment - project addresses what judges care about');

    // Detect weaknesses and generate improvements
    if (params.score.innovation < 70) {
      weaknesses.push('Innovation score below 70 - project may not stand out');
      if (!params.hasWowMoment) {
        improvementActions.push({
          category: 'innovation',
          action: 'Add a wow moment: e.g., an interactive demo, AI-powered feature, or live API integration that creates a memorable judge impression',
          expectedImpact: 20,
          effortDays: 0.5,
          priority: 'high',
        });
      }
      if (params.mockAI === false || params.mockAI === undefined) {
        improvementActions.push({
          category: 'innovation',
          action: 'Incorporate an AI/ML element: even a simulated smart recommendation or auto-complete adds perceived intelligence',
          expectedImpact: 12,
          effortDays: 0.25,
          priority: 'medium',
        });
      }
    }

    if (params.score.technicalDepth < 70) {
      weaknesses.push('Technical depth score below 70 - implementation may feel shallow');
      if (!params.buildSuccess) {
        improvementActions.push({
          category: 'technicalDepth',
          action: 'Fix build failures: ensure the project compiles and runs without errors',
          expectedImpact: 25,
          effortDays: 0.5,
          priority: 'critical',
        });
      }
      improvementActions.push({
        category: 'technicalDepth',
        action: 'Add error handling and input validation across API endpoints for production-quality code',
        expectedImpact: 10,
        effortDays: 0.3,
        priority: 'high',
      });
    }

    if (params.score.feasibility < 70) {
      weaknesses.push('Feasibility score below 70 - project may not be practical in real world');
      if (!params.deploySuccess || !params.hasLiveDeploy) {
        improvementActions.push({
          category: 'feasibility',
          action: 'Deploy the project to a live URL: judges must be able to access and interact with the demo',
          expectedImpact: 25,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
      if (!params.crashFree) {
        improvementActions.push({
          category: 'feasibility',
          action: 'Fix runtime crashes: add error boundaries, null checks, and graceful failure handling',
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    if (params.score.presentation < 70) {
      weaknesses.push('Presentation score below 70 - project may not impress at first glance');
      if (!params.hasUI) {
        improvementActions.push({
          category: 'presentation',
          action: 'Add a user interface: even a simple landing page with navigation makes the project feel complete',
          expectedImpact: 25,
          effortDays: 0.5,
          priority: 'high',
        });
      }
      if (!params.hasWowMoment) {
        improvementActions.push({
          category: 'presentation',
          action: 'Create a wow moment: a visually impressive interaction, animation, or data visualization',
          expectedImpact: 18,
          effortDays: 0.4,
          priority: 'high',
        });
      }
    }

    if (params.score.completeness < 70) {
      weaknesses.push('Completeness score below 70 - missing features may disappoint judges');
      improvementActions.push({
        category: 'completeness',
        action: 'Implement core user flows end-to-end: focus on the primary use case first',
        expectedImpact: 15,
        effortDays: 0.5,
        priority: 'high',
      });
      if (params.testPassRate < 0.7) {
        improvementActions.push({
          category: 'completeness',
          action: 'Add automated tests for core functionality to ensure features work reliably',
          expectedImpact: 10,
          effortDays: 0.3,
          priority: 'medium',
        });
      }
    }

    if (params.score.maintainability < 70) {
      weaknesses.push('Maintainability score below 70 - code quality concerns');
      if (params.testPassRate < 0.5) {
        improvementActions.push({
          category: 'maintainability',
          action: 'Add unit tests for critical functions and integration tests for API endpoints',
          expectedImpact: 15,
          effortDays: 0.4,
          priority: 'high',
        });
      }
      improvementActions.push({
        category: 'maintainability',
        action: 'Add inline documentation and README with setup, usage, and deployment instructions',
        expectedImpact: 8,
        effortDays: 0.2,
        priority: 'medium',
      });
    }

    if (params.score.judgeAlignment < 70) {
      weaknesses.push('Judge alignment score below 70 - project may miss what judges value');
      improvementActions.push({
        category: 'judgeAlignment',
        action: 'Review judging criteria and ensure the project explicitly addresses each one in the demo',
        expectedImpact: 20,
        effortDays: 0.3,
        priority: 'high',
      });
      if (!params.hasLiveDeploy) {
        improvementActions.push({
          category: 'judgeAlignment',
          action: 'Deploy to a live URL so judges can access the project without setup',
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    // Sort by priority: critical first, then high, then medium, then low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    improvementActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // If no weaknesses detected, add a generic strength
    if (weaknesses.length === 0) {
      strengths.push('Project scores well across all dimensions');
    }

    // If no improvement actions but weaknesses remain, add generic action
    if (improvementActions.length === 0 && weaknesses.length > 0) {
      improvementActions.push({
        category: 'general',
        action: 'Review project holistically and address the identified weaknesses above',
        expectedImpact: 10,
        effortDays: 0.5,
        priority: 'medium',
      });
    }

    return {
      strengths,
      weaknesses,
      improvementActions,
      score: params.score,
      iteration,
      maxIterations,
    };
  }

  /**
   * Check if the project has converged (all scores >= 70 or no critical improvements).
   */
  hasConverged(score: ReviewScore, feedback: ReviewFeedback): boolean {
    if (score.overall >= 75) return true;
    if (feedback.weaknesses.length === 0) return true;
    if (feedback.improvementActions.every(a => a.priority !== 'critical' && a.priority !== 'high')) return true;
    return false;
  }

  /**
   * Get the next priority improvement action for the feedback loop.
   */
  getNextAction(feedback: ReviewFeedback): ImprovementAction | null {
    return feedback.improvementActions.length > 0 ? feedback.improvementActions[0]! : null;
  }

  /**
   * Run the full improvement feedback loop end-to-end.
   * Scores the project, generates feedback, and iterates until convergence or max iterations.
   * Returns the final feedback with accumulated improvements across all iterations.
   */
  runImprovementLoop(params: {
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }, maxIterations = 3): { finalFeedback: ReviewFeedback; converged: boolean; iterations: number } {
    // Guard: if maxIterations is 0, score once and return immediately
    if (maxIterations <= 0) {
      const score = this.score(params);
      const feedback = this.generateFeedback({ ...params, score }, 0, 0);
      return { finalFeedback: feedback, converged: this.hasConverged(score, feedback), iterations: 0 };
    }

    let iteration = 0;
    let finalFeedback: ReviewFeedback | null = null;

    // Use a mutable copy so the function parameter is not reassigned
    const mutable = { ...params };

    for (; iteration < maxIterations; iteration++) {
      const score = this.score({
        ...mutable,
        // Simulate improvements each iteration based on previous feedback
        // In a real pipeline, the builder would apply the improvement actions here
        // For now, we model the expected improvement from applying the actions
        hasWowMoment: finalFeedback?.improvementActions.some(a => a.category === 'innovation') ? true : mutable.hasWowMoment,
      });

      const feedback = this.generateFeedback(
        { ...mutable, score },
        iteration,
        maxIterations,
      );

      finalFeedback = feedback;

      if (this.hasConverged(score, feedback)) {
        return { finalFeedback: feedback, converged: true, iterations: iteration + 1 };
      }

      // Simulate applying the top improvement action for next iteration
      const next = this.getNextAction(feedback);
      if (!next) {
        return { finalFeedback: feedback, converged: true, iterations: iteration + 1 };
      }

      // In a real pipeline, this is where the builder would apply the fix
      // For simulation, we model minimal improvement
      // Use spread to preserve other fields while updating simulated metrics
      Object.assign(mutable, {
        taskCompleteness: Math.min(1, mutable.taskCompleteness + 0.1),
        testPassRate: Math.min(1, mutable.testPassRate + 0.05),
      });
    }

    return {
      finalFeedback: finalFeedback!,
      converged: false,
      iterations: iteration,
    };
  }

  /**
   * Summarize review findings as markdown.
   */
  summarize(feedback: ReviewFeedback): string {
    const lines: string[] = [];
    lines.push('## Self-Review Results');
    lines.push('');
    lines.push('### Scores');
    lines.push('- Innovation: ' + feedback.score.innovation + '/100');
    lines.push('- Technical Depth: ' + feedback.score.technicalDepth + '/100');
    lines.push('- Feasibility: ' + feedback.score.feasibility + '/100');
    lines.push('- Presentation: ' + feedback.score.presentation + '/100');
    lines.push('- Completeness: ' + feedback.score.completeness + '/100');
    lines.push('- Maintainability: ' + feedback.score.maintainability + '/100');
    lines.push('- Judge Alignment: ' + feedback.score.judgeAlignment + '/100');
    lines.push('- **Overall: ' + feedback.score.overall + '/100**');
    lines.push('');
    if (feedback.strengths.length > 0) {
      lines.push('### Strengths');
      for (const s of feedback.strengths) lines.push('- ' + s);
      lines.push('');
    }
    if (feedback.weaknesses.length > 0) {
      lines.push('### Weaknesses');
      for (const w of feedback.weaknesses) lines.push('- ' + w);
      lines.push('');
    }
    if (feedback.improvementActions.length > 0) {
      lines.push('### Improvement Actions');
      for (const a of feedback.improvementActions) {
        const priorityTag = a.priority === 'critical' ? ' [CRITICAL]' : a.priority === 'high' ? ' [HIGH]' : '';
        lines.push('- [' + a.category + ']' + priorityTag + ' ' + a.action);
        lines.push('  - Expected impact: +' + a.expectedImpact + ' pts, Effort: ' + a.effortDays + ' day(s)');
      }
      lines.push('');
    }
    lines.push('Iteration ' + (feedback.iteration + 1) + '/' + feedback.maxIterations);
    return lines.join('\n');
  }

  /**
   * Compute a dimension score by summing weighted components and clamping to 0-100.
   */
  private dimensionScore(components: number[]): number {
    const total = components.reduce((s, c) => s + c, 0);
    return Math.min(100, Math.max(0, total));
  }
}

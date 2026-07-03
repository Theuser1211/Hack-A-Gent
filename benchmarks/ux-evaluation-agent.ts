import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid } from './determinism-kernel.js';

export type UIFailureType = 'visual_break' | 'interaction_failure' | 'api_break' | 'flow_break' | 'performance_issue';

export interface UserJourneyStep {
  id: string;
  description: string;
  url: string;
  expectedElements: string[];
  expectedTexts: string[];
  actionType: 'navigate' | 'click' | 'submit' | 'wait' | 'verify';
  timeoutMs: number;
}

export interface UserJourney {
  name: string;
  steps: UserJourneyStep[];
  critical: boolean;
}

export interface UXEvaluationResult {
  journeyName: string;
  passed: boolean;
  stepResults: Array<{
    stepId: string;
    passed: boolean;
    statusCode: number;
    foundElements: string[];
    missingElements: string[];
    foundTexts: string[];
    missingTexts: string[];
    failures: Array<{ type: UIFailureType; detail: string }>;
    durationMs: number;
  }>;
  overallFailures: Array<{ type: UIFailureType; detail: string }>;
  uiCompletenessScore: number;
  journeyFlowScore: number;
  recommendations: string[];
}

export interface UXRepairAction {
  type: 'add_element' | 'fix_route' | 'add_api_endpoint' | 'fix_flow' | 'improve_performance';
  target: string;
  description: string;
}

export class UXEvaluationAgent {
  private readonly seed: number;
  private readonly agentId: string;
  private readonly decisionLogger: DecisionLogger;
  private evaluationHistory: UXEvaluationResult[] = [];
  private readonly baseUrl: string | null;

  constructor(baseUrl: string | null = null, seed = 42) {
    this.seed = seed;
    this.agentId = 'ux-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 5000);
    this.baseUrl = baseUrl;
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getEvaluationHistory(): UXEvaluationResult[] {
    return [...this.evaluationHistory];
  }

  setBaseUrl(url: string): void {
    (this as unknown).baseUrl = url;
  }

  defineStandardJourneys(): UserJourney[] {
    return [
      {
        name: 'Homepage Load',
        critical: true,
        steps: [
          {
            id: 'step-home',
            description: 'Visit homepage',
            url: '/',
            expectedElements: ['main', 'h1', 'nav', 'a[href]'],
            expectedTexts: [],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
        ],
      },
      {
        name: 'Navigation Flow',
        critical: true,
        steps: [
          {
            id: 'step-nav-1',
            description: 'Navigate to about page',
            url: '/about',
            expectedElements: ['main', 'h1'],
            expectedTexts: [],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
          {
            id: 'step-nav-2',
            description: 'Navigate back to home',
            url: '/',
            expectedElements: ['main', 'h1'],
            expectedTexts: [],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
        ],
      },
      {
        name: 'User Authentication Flow',
        critical: false,
        steps: [
          {
            id: 'step-auth-1',
            description: 'Visit login page',
            url: '/login',
            expectedElements: ['form', 'input[type="email"]', 'input[type="password"]', 'button[type="submit"]'],
            expectedTexts: ['Sign In', 'Login'],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
          {
            id: 'step-auth-2',
            description: 'Submit login form',
            url: '/login',
            expectedElements: [],
            expectedTexts: [],
            actionType: 'submit',
            timeoutMs: 10000,
          },
        ],
      },
      {
        name: 'API Health Check',
        critical: true,
        steps: [
          {
            id: 'step-api',
            description: 'Check API health',
            url: '/api/health',
            expectedElements: [],
            expectedTexts: ['ok', 'status'],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
        ],
      },
      {
        name: 'Core Feature Flow',
        critical: true,
        steps: [
          {
            id: 'step-core-1',
            description: 'List items',
            url: '/api/items',
            expectedElements: [],
            expectedTexts: [],
            actionType: 'navigate',
            timeoutMs: 10000,
          },
          {
            id: 'step-core-2',
            description: 'Create item',
            url: '/api/items',
            expectedElements: [],
            expectedTexts: [],
            actionType: 'submit',
            timeoutMs: 10000,
          },
        ],
      },
    ];
  }

  async evaluateJourney(journey: UserJourney, baseUrlOverride?: string): Promise<UXEvaluationResult> {
    const baseUrl = baseUrlOverride ?? this.baseUrl;
    const stepResults: UXEvaluationResult['stepResults'] = [];
    const overallFailures: UXEvaluationResult['overallFailures'] = [];
    let allPassed = true;

    for (const step of journey.steps) {
      const url = baseUrl ? new URL(step.url, baseUrl).href : step.url;
      const result = await this.executeStep(step, url);
      stepResults.push(result);
      if (!result.passed) {
        allPassed = false;
        overallFailures.push(...result.failures);
      }
    }

    const uiCompletenessScore = this.computeCompleteness(stepResults);
    const journeyFlowScore = this.computeFlowScore(stepResults);
    const recommendations = this.generateRecommendations(overallFailures, uiCompletenessScore);

    const evaluation: UXEvaluationResult = {
      journeyName: journey.name,
      passed: allPassed,
      stepResults,
      overallFailures,
      uiCompletenessScore,
      journeyFlowScore,
      recommendations,
    };

    this.evaluationHistory.push(evaluation);
    this.decisionLogger.log(
      'ux',
      'evaluate_journey',
      `Journey "${journey.name}": ${allPassed ? 'PASSED' : 'FAILED'} (UI: ${uiCompletenessScore}, Flow: ${journeyFlowScore})`,
      allPassed ? 0.9 : 0.4,
      [],
      { journeyName: journey.name, uiCompletenessScore, journeyFlowScore, failureCount: overallFailures.length },
    );

    return evaluation;
  }

  private async executeStep(step: UserJourneyStep, url: string): Promise<UXEvaluationResult['stepResults'][0]> {
    const startTime = Date.now();
    const failures: Array<{ type: UIFailureType; detail: string }> = [];
    let statusCode = 0;
    let body = '';

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(step.timeoutMs) });
      statusCode = response.status;
      body = await response.text();
    } catch (err) {
      failures.push({
        type: 'api_break',
        detail: `Failed to fetch ${url}: ${err instanceof Error ? err.message : String(err)}`,
      });
      return {
        stepId: step.id,
        passed: false,
        statusCode,
        foundElements: [],
        missingElements: [...step.expectedElements],
        foundTexts: [],
        missingTexts: [...step.expectedTexts],
        failures,
        durationMs: Date.now() - startTime,
      };
    }

    const foundElements: string[] = [];
    const missingElements: string[] = [];
    for (const selector of step.expectedElements) {
      const exists = this.checkElementExists(body, selector);
      if (exists) foundElements.push(selector);
      else missingElements.push(selector);
    }

    const foundTexts: string[] = [];
    const missingTexts: string[] = [];
    for (const text of step.expectedTexts) {
      if (body.toLowerCase().includes(text.toLowerCase())) foundTexts.push(text);
      else missingTexts.push(text);
    }

    if (missingElements.length > 0) {
      const first = missingElements[0]!;
      if (first.startsWith('input') || first.startsWith('button') || first.startsWith('form')) {
        failures.push({
          type: 'interaction_failure',
          detail: `Missing interactive elements: ${missingElements.join(', ')} on ${url}`,
        });
      } else {
        failures.push({
          type: 'visual_break',
          detail: `Missing visual elements: ${missingElements.join(', ')} on ${url}`,
        });
      }
    }

    if (missingTexts.length > 0) {
      failures.push({ type: 'flow_break', detail: `Expected texts missing on ${url}: ${missingTexts.join(', ')}` });
    }

    if (statusCode >= 400) {
      failures.push({ type: 'api_break', detail: `HTTP ${statusCode} on ${url}` });
    }

    return {
      stepId: step.id,
      passed: failures.length === 0,
      statusCode,
      foundElements,
      missingElements,
      foundTexts,
      missingTexts,
      failures,
      durationMs: Date.now() - startTime,
    };
  }

  private checkElementExists(html: string, selector: string): boolean {
    const lower = html.toLowerCase();
    if (selector === 'nav')
      return lower.includes('<nav') || lower.includes(' role="navigation"') || lower.includes("role='navigation'");
    if (selector === 'main')
      return lower.includes('<main') || lower.includes(' role="main"') || lower.includes("role='main'");
    if (selector.startsWith('input[')) {
      const match = selector.match(/input\[type="([^"]+)"\]/);
      if (match) return lower.includes(`type="${match[1]}"`) && lower.includes('<input');
      return lower.includes('<input');
    }
    if (selector.startsWith('a[')) return lower.includes('<a ');
    if (selector.startsWith('button')) return lower.includes('<button');
    if (selector.startsWith('form')) return lower.includes('<form');
    if (selector.startsWith('h1')) return lower.includes('<h1');
    if (selector.startsWith('h2')) return lower.includes('<h2');
    if (selector === 'img' || selector.startsWith('img[')) return lower.includes('<img');
    return lower.includes(`<${selector}`);
  }

  private computeCompleteness(stepResults: UXEvaluationResult['stepResults']): number {
    if (stepResults.length === 0) return 0;
    let totalElements = 0;
    let totalFound = 0;
    for (const sr of stepResults) {
      totalElements += sr.foundElements.length + sr.missingElements.length;
      totalFound += sr.foundElements.length;
    }
    return totalElements > 0 ? Math.round((totalFound / totalElements) * 100) / 100 : 0;
  }

  private computeFlowScore(stepResults: UXEvaluationResult['stepResults']): number {
    if (stepResults.length === 0) return 0;
    const passed = stepResults.filter((s) => s.passed).length;
    return Math.round((passed / stepResults.length) * 100) / 100;
  }

  private generateRecommendations(failures: UXEvaluationResult['overallFailures'], completeness: number): string[] {
    const recs: string[] = [];
    const types = new Set(failures.map((f) => f.type));

    if (types.has('visual_break')) recs.push('Add missing HTML elements (nav, main, headings) to improve structure');
    if (types.has('interaction_failure')) recs.push('Add form inputs and buttons for user interaction points');
    if (types.has('api_break')) recs.push('Fix API routes to return correct status codes and data');
    if (types.has('flow_break')) recs.push('Add expected text content to match user journey expectations');

    if (completeness < 0.5) recs.push('Prioritize core page structure before adding advanced features');
    if (failures.length === 0) recs.push('Maintain current UX quality while adding new features');

    return recs;
  }

  classifyFailure(type: UIFailureType): string {
    switch (type) {
      case 'visual_break':
        return 'CSS/HTML rendering issue ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â page structure incomplete';
      case 'interaction_failure':
        return 'User interaction elements (forms, buttons) missing or broken';
      case 'api_break':
        return 'API endpoint returning errors or not responding';
      case 'flow_break':
        return 'User flow interrupted ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â expected navigation path broken';
      case 'performance_issue':
        return 'Page or API response time exceeds acceptable threshold';
    }
  }

  generateUXReport(): {
    totalJourneys: number;
    passedJourneys: number;
    avgCompleteness: number;
    avgFlowScore: number;
    topIssues: string[];
  } {
    if (this.evaluationHistory.length === 0) {
      return { totalJourneys: 0, passedJourneys: 0, avgCompleteness: 0, avgFlowScore: 0, topIssues: [] };
    }
    const passed = this.evaluationHistory.filter((e) => e.passed).length;
    const avgComp =
      this.evaluationHistory.reduce((s, e) => s + e.uiCompletenessScore, 0) / this.evaluationHistory.length;
    const avgFlow = this.evaluationHistory.reduce((s, e) => s + e.journeyFlowScore, 0) / this.evaluationHistory.length;
    const allFailures = this.evaluationHistory.flatMap((e) => e.overallFailures);
    const typeCounts = new Map<UIFailureType, number>();
    for (const f of allFailures) typeCounts.set(f.type, (typeCounts.get(f.type) ?? 0) + 1);
    const topIssues = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t, c]) => `${this.classifyFailure(t)} (${c}x)`);

    return {
      totalJourneys: this.evaluationHistory.length,
      passedJourneys: passed,
      avgCompleteness: Math.round(avgComp * 100) / 100,
      avgFlowScore: Math.round(avgFlow * 100) / 100,
      topIssues,
    };
  }
}

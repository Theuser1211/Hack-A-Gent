import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, getSeededRandom } from './determinism-kernel.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { TaskGraph } from './task-graph.js';

export interface SandboxSimulationConfig {
  simulateDeploy: boolean;
  simulateBrowserTest: boolean;
  simulateGitHub: boolean;
  simulationFidelity: 'low' | 'medium' | 'high';
}

export interface SandboxReport {
  simulationId: string;
  riskScore: number;
  deployPrediction: {
    success: boolean;
    confidence: number;
    estimatedDurationMs: number;
    failureProbability: number;
    likelyFailures: string[];
  };
  browserTestPrediction: { expectedPassRate: number; likelyFailures: string[]; estimatedFlowScore: number };
  uxPrediction: { expectedScore: number; confidence: number };
  failurePredictions: Array<{ category: string; probability: number; description: string }>;
  recommendations: string[];
  estimatedDurationsMs: Record<string, number>;
}

export class SandboxExecutionMode {
  private readonly seed: number;
  private readonly modeId: string;
  private readonly decisionLogger: DecisionLogger;
  private history: SandboxReport[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.modeId = 'sandbox-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 11000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getHistory(): SandboxReport[] {
    return [...this.history];
  }

  getDefaultConfig(): SandboxSimulationConfig {
    return { simulateDeploy: true, simulateBrowserTest: true, simulateGitHub: true, simulationFidelity: 'medium' };
  }

  async simulateExecution(
    plan: StrategyPlan,
    taskGraph: TaskGraph,
    config?: Partial<SandboxSimulationConfig>,
  ): Promise<SandboxReport> {
    const cfg = { ...this.getDefaultConfig(), ...config };
    const rng = getSeededRandom(this.seed + plan.projectName.length);

    const simId = 'sim-' + createDeterministicUuid(this.seed, this.history.length).slice(0, 8);

    // Deploy prediction
    const deploySuccess = rng.next() > 0.3;
    const deployConfidence = 0.5 + rng.next() * 0.4;
    const deployFailureProb = deploySuccess ? 0.1 + rng.next() * 0.2 : 0.5 + rng.next() * 0.3;
    const likelyDeployFailures: string[] = [];
    if (!deploySuccess || rng.next() > 0.6) likelyDeployFailures.push('Build configuration mismatch');
    if (!deploySuccess || rng.next() > 0.7) likelyDeployFailures.push('Environment variable missing');
    if (rng.next() > 0.8) likelyDeployFailures.push('Deployment timeout');

    // Browser test prediction
    const browserPassRate = cfg.simulateBrowserTest ? Math.round((0.4 + rng.next() * 0.5) * 100) / 100 : 1;
    const likelyBrowserFailures: string[] = [];
    if (browserPassRate < 0.7) likelyBrowserFailures.push('Missing UI elements');
    if (browserPassRate < 0.5) likelyBrowserFailures.push('Navigation flow broken');
    if (rng.next() > 0.7) likelyBrowserFailures.push('Responsive layout issues');

    // UX prediction
    const expectedUXScore = Math.round((0.3 + rng.next() * 0.5) * 100) / 100;
    const uxConfidence = Math.round((0.4 + rng.next() * 0.4) * 100) / 100;

    // Failure predictions
    const failurePredictions: SandboxReport['failurePredictions'] = [];
    const allTasks = taskGraph.getAllNodes();
    const baseFailureRate = Math.max(0.05, 1 - plan.estimatedSuccessProbability);

    for (const node of allTasks.slice(0, 5)) {
      const prob = Math.round(Math.min(0.9, baseFailureRate + rng.next() * 0.3) * 100) / 100;
      if (prob > 0.2) {
        failurePredictions.push({
          category: node.category,
          probability: prob,
          description: `${node.description.slice(0, 40)}: estimated ${(prob * 100).toFixed(0)}% failure probability`,
        });
      }
    }

    // Recommendations
    const recommendations: string[] = [];
    if (deployFailureProb > 0.4) recommendations.push('Add CI/CD configuration checking before deployment');
    if (browserPassRate < 0.7) recommendations.push('Increase UI test coverage for core flows');
    if (expectedUXScore < 0.6) recommendations.push('Focus on UX polish Ã¢â‚¬â€ consider polish-ux strategy');
    if (plan.risks.length > 2) recommendations.push(`Address top ${plan.risks.length} risks before execution`);
    recommendations.push('Run sandbox execution before real deployment');

    // Risk score
    const riskScore =
      Math.round(
        (deployFailureProb * 0.3 +
          (1 - browserPassRate) * 0.25 +
          (1 - expectedUXScore) * 0.25 +
          baseFailureRate * 0.2) *
          100,
      ) / 100;

    // Duration estimates
    const estimatedDurationsMs: Record<string, number> = {};
    for (const node of allTasks) {
      estimatedDurationsMs[node.id] = Math.round((2000 + rng.next() * 30000) / 1000) * 1000;
    }

    const report: SandboxReport = {
      simulationId: simId,
      riskScore,
      deployPrediction: {
        success: deploySuccess,
        confidence: deployConfidence,
        estimatedDurationMs: 60000 + rng.nextInt(0, 120000),
        failureProbability: deployFailureProb,
        likelyFailures: likelyDeployFailures,
      },
      browserTestPrediction: {
        expectedPassRate: browserPassRate,
        likelyFailures: likelyBrowserFailures,
        estimatedFlowScore: expectedUXScore,
      },
      uxPrediction: { expectedScore: expectedUXScore, confidence: uxConfidence },
      failurePredictions,
      recommendations,
      estimatedDurationsMs,
    };

    this.history.push(report);

    this.decisionLogger.log(
      'planner',
      'sandbox_sim',
      `Sandbox simulation complete: risk=${(riskScore * 100).toFixed(0)}%`,
      1 - riskScore,
      [],
      {
        simulationId: simId,
        deploySuccess,
        browserPassRate,
        expectedUXScore,
        riskScore,
        recommendations: recommendations.length,
      },
    );

    return report;
  }

  shouldSkipRealExecution(report: SandboxReport, threshold = 0.7): boolean {
    return report.riskScore > threshold;
  }

  async dryRunGitHub(): Promise<{ success: boolean; estimatedCommits: number; estimatedFiles: number }> {
    const rng = getSeededRandom(this.seed);
    return { success: true, estimatedCommits: rng.nextInt(1, 5), estimatedFiles: rng.nextInt(5, 20) };
  }

  async dryRunDeploy(): Promise<{ success: boolean; predictedUrl: string; errors: string[] }> {
    const rng = getSeededRandom(this.seed);
    const success = rng.next() > 0.2;
    return {
      success,
      predictedUrl: success ? `https://hackagent-${rng.nextInt(1000, 9999)}.vercel.app` : '',
      errors: success ? [] : ['Simulated deployment failure: build timeout'],
    };
  }
}

import * as path from 'node:path';

import { CapabilityEvolutionEngine, type FailurePatternRecord } from './capability-evolution-engine.js';
import { DecisionLogger, type AgentRole, type DecisionTrace } from './decision-trace.js';
import { DeploymentRepairController } from './deployment-repair-controller.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import { GlobalExecutionBrain, type ReplanAction } from './global-execution-brain.js';
import { HumanControlLayer, type ConstraintInjection } from './human-control-layer.js';
import { HumanInteractionStrategist, type AmbiguityGap } from './human-interaction-strategist.js';
import type { DevpostData, RequirementItem, InternetExecutionPlan } from './internet-hackathon-orchestrator.js';
import { InternetToolGateway } from './internet-tool-gateway.js';
import { LiveBrowserTestAgent } from './live-browser-test-agent.js';
import { RemoteProjectState } from './remote-project-state.js';
import { StrategicPlanner, type StrategyPlan, type Risk } from './strategic-planner.js';
import { TaskGraph, type TaskCategory } from './task-graph.js';
import { ToolExecutionGraph, type RetryPolicy } from './tool-execution-graph.js';
import { UXEvaluationAgent, type UXEvaluationResult, type UXRepairAction } from './ux-evaluation-agent.js';

export interface Phase11Report {
  strategyReport: { plan: StrategyPlan; alignmentQuality: number };
  executionGraph: {
    totalToolOperations: number;
    conflictsDetected: number;
    performanceByToolType: Array<{ toolType: string; avgDurationMs: number; successRate: number }>;
  };
  failureAnalysis: {
    categorizedBreakdown: Array<{ category: string; count: number; topError: string }>;
    resolvedByMutation: number;
  };
  uxReport: UXEvaluationResult[];
  deploymentReport: { liveUrl: string | null; status: string; repairCycles: number };
  learningUpdate: { mutationsActivated: number; failurePatternsTracked: number; strategyImprovements: string[] };
  decisionTraces: DecisionTrace[];
}

export type CompanyPhase =
  | 'analysis'
  | 'planning'
  | 'building'
  | 'testing'
  | 'deploying'
  | 'reviewing'
  | 'evolving'
  | 'complete';

export class Phase11Orchestrator {
  private readonly seed: number;
  private readonly orchestratorId: string;
  private readonly decisionLogger: DecisionLogger;
  private readonly decisionLoggers: Map<AgentRole, DecisionLogger> = new Map();

  readonly strategicPlanner: StrategicPlanner;
  readonly globalBrain: GlobalExecutionBrain;
  readonly toolGraph: ToolExecutionGraph;
  readonly interactionStrategist: HumanInteractionStrategist;
  readonly uxAgent: UXEvaluationAgent;
  readonly evolutionEngine: CapabilityEvolutionEngine;

  readonly toolGateway: InternetToolGateway;
  readonly humanControl: HumanControlLayer;
  readonly projectState: RemoteProjectState;
  readonly browserAgent: LiveBrowserTestAgent;
  readonly deployRepair: DeploymentRepairController;
  readonly taskGraph: TaskGraph;

  private companyPhase: CompanyPhase = 'analysis';
  private plan: InternetExecutionPlan | null = null;
  private strategyPlan: StrategyPlan | null = null;
  private errors: string[] = [];
  private startTime: number = Date.now();

  constructor(workspaceRoot: string, stateDir?: string, seed = 42) {
    this.seed = seed;
    this.orchestratorId = 'p11-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 7000);

    this.taskGraph = new TaskGraph('phase11-hackathon', seed);
    this.toolGateway = new InternetToolGateway({ workingDir: workspaceRoot }, seed + 1);
    this.projectState = new RemoteProjectState(stateDir ?? path.join(workspaceRoot, '.hackagent-state'), seed + 2);
    this.humanControl = new HumanControlLayer(seed + 3);
    this.browserAgent = new LiveBrowserTestAgent(this.toolGateway, seed + 4);
    this.deployRepair = new DeploymentRepairController(
      this.toolGateway,
      this.humanControl,
      this.taskGraph,
      {},
      seed + 5,
    );

    this.strategicPlanner = new StrategicPlanner(seed + 10);
    this.globalBrain = new GlobalExecutionBrain(seed + 20);
    this.toolGraph = new ToolExecutionGraph(seed + 30);
    this.interactionStrategist = new HumanInteractionStrategist(seed + 40);
    this.uxAgent = new UXEvaluationAgent(null, seed + 50);
    this.evolutionEngine = new CapabilityEvolutionEngine(seed + 60);

    this.decisionLoggers.set('planner', this.strategicPlanner.getDecisionLogger());
    this.decisionLoggers.set('strategy', this.globalBrain.getDecisionLogger());
    this.decisionLoggers.set('debug', this.toolGraph.getDecisionLogger());
    this.decisionLoggers.set('strategy', this.interactionStrategist.getDecisionLogger());
    this.decisionLoggers.set('ux', this.uxAgent.getDecisionLogger());
    this.decisionLoggers.set('strategy', this.evolutionEngine.getDecisionLogger());
  }

  logDecision(
    agent: AgentRole,
    action: string,
    reason: string,
    confidence: number,
    alternatives: string[] = [],
    metadata?: Record<string, unknown>,
  ): DecisionTrace {
    return this.decisionLogger.log(agent, action, reason, confidence, alternatives, metadata);
  }

  getAllDecisionTraces(): DecisionTrace[] {
    const all = [...this.decisionLogger.getAll()];
    for (const logger of this.decisionLoggers.values()) all.push(...logger.getAll());
    return all;
  }

  async runCompanyMode(devpostInput: string): Promise<Phase11Report> {
    this.startTime = Date.now();
    this.companyPhase = 'analysis';

    const devpost = await this.parseDevpostInput(devpostInput);
    this.logDecision('strategy', 'ingest_devpost', `Parsed: ${devpost.title}`, 0.9);

    this.strategyPlan = this.strategicPlanner.analyzeCompetitionIntent(
      devpost.title,
      devpost.problemStatement,
      devpost.judgingCriteria,
      devpost.constraints,
      devpost.recommendedStack,
    );

    this.logDecision(
      'strategy',
      'analyze_competition',
      `Success probability: ${this.strategyPlan.estimatedSuccessProbability}`,
      this.strategyPlan.estimatedSuccessProbability,
      [],
      { mvpScope: this.strategyPlan.mvpScope, wowFactors: this.strategyPlan.wowFactors },
    );

    const gaps = this.interactionStrategist.detectAmbiguityGaps(devpost);
    const questions = this.interactionStrategist.generateQuestions(gaps, this.taskGraph);
    const blockingQuestions = questions.filter((q) => q.priority === 'blocking');

    this.logDecision(
      'strategy',
      'detect_ambiguity',
      `Found ${gaps.length} gaps, ${blockingQuestions.length} blocking questions`,
      gaps.length > 0 ? 0.6 : 0.95,
      [],
      { gapCount: gaps.length, blockingCount: blockingQuestions.length },
    );

    if (blockingQuestions.length > 0) {
      this.companyPhase = 'planning';
      this.logDecision(
        'planner',
        'ask_blocking_questions',
        `Need user input for ${blockingQuestions.length} blocking issues`,
        0.5,
        blockingQuestions.map((q) => q.question),
      );
    }

    const reqs = this.generateRequirements(devpost, this.strategyPlan);
    this.plan = this.createCompanyExecutionPlan(devpost, reqs, this.strategyPlan);

    await this.executeBuildPhase();

    this.companyPhase = 'testing';
    await this.runTestingPhase();

    this.companyPhase = 'deploying';
    const deployUrl = await this.runDeploymentPhase();

    this.companyPhase = 'reviewing';
    const uxResults = await this.runUXEvaluation(deployUrl);

    this.companyPhase = 'evolving';
    this.runEvolutionPhase();

    this.trackStrategyPerformance();
    this.companyPhase = 'complete';

    return this.generateReport(deployUrl, uxResults);
  }

  private async parseDevpostInput(input: string): Promise<DevpostData> {
    const isUrl = input.startsWith('http://') || input.startsWith('https://');
    let text = input;
    if (isUrl) {
      try {
        const res = await fetch(input, { signal: AbortSignal.timeout(10000) });
        if (res.ok) text = await res.text();
      } catch { console.warn('Phase 11 input fetch failed; continuing with the original input.'); }
    }

    return {
      title: this.extractValue(text, ['Project:', 'Title:', '# ']) ?? 'Hackathon Project',
      problemStatement: text.match(/Problem[:\s]+(.+?)(?:\n\n|\n[A-Z]|$)/s)?.[1]?.trim() ?? text.slice(0, 500),
      judgingCriteria: this.extractList(text, 'Judging Criteria'),
      constraints: this.extractList(text, 'Constraints'),
      recommendedStack: this.extractList(text, 'Tech Stack'),
      submissionRequirements: this.extractList(text, 'Requirements'),
      rawText: text,
    };
  }

  private extractValue(text: string, prefixes: string[]): string | null {
    for (const p of prefixes) {
      const idx = text.indexOf(p);
      if (idx >= 0) {
        const after = text
          .slice(idx + p.length)
          .split('\n')[0]
          ?.trim();
        if (after) return after;
      }
    }
    return null;
  }

  private extractList(text: string, label: string): string[] {
    const match = text.match(new RegExp(`${label}[:\\s]+(.+?)(?:\\n\\n|\\n[A-Z]|$)`, 's'));
    if (!match) return [];
    return match[1]!
      .split(/[,;]/)
      .map((s) => s.trim().replace(/^\d+%?\s*/, ''))
      .filter(Boolean);
  }

  private generateRequirements(devpost: DevpostData, strategy: StrategyPlan): RequirementItem[] {
    const reqs: RequirementItem[] = [];
    let idx = 0;

    const add = (
      desc: string,
      cat: RequirementItem['category'],
      pri: RequirementItem['priority'],
      criteria: string[],
    ) => {
      idx++;
      reqs.push({
        id: 'req-p11-' + idx,
        description: desc,
        category: cat,
        priority: pri,
        acceptanceCriteria: criteria,
      });
    };

    for (const scope of strategy.mvpScope) {
      add(scope, 'feature', 'critical', ['Implemented per MVP scope']);
    }
    for (const factor of strategy.wowFactors) {
      add(factor, 'feature', 'high', ['Implemented as differentiator']);
    }
    add('Project scaffolding with build pipeline', 'technical', 'critical', [
      'npm/npx scaffold works',
      'Build succeeds',
    ]);
    add('Deploy to production', 'infrastructure', 'critical', ['Deploy succeeds', 'URL accessible']);
    add('Live browser verification', 'technical', 'critical', ['All journeys pass']);
    add('UX evaluation and repair', 'technical', 'high', ['UI completeness > 0.5']);

    return reqs;
  }

  private createCompanyExecutionPlan(
    devpost: DevpostData,
    requirements: RequirementItem[],
    strategy: StrategyPlan,
  ): InternetExecutionPlan {
    const framework = devpost.recommendedStack.some((s) => s.toLowerCase().includes('next'))
      ? 'nextjs'
      : devpost.recommendedStack.some((s) => s.toLowerCase().includes('vite') || s.toLowerCase().includes('react'))
        ? 'vite-react'
        : 'nextjs';

    const projectName = devpost.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const plan: InternetExecutionPlan = {
      projectName,
      requirements,
      taskGraph: this.taskGraph,
      techStack: {
        frontend: framework + '_framework',
        backend: 'node_express',
        database: 'postgres_database',
        deployment: 'vercel',
      },
      framework,
      database: 'postgres',
      deploymentTarget: 'vercel',
      gitHubRepo: projectName,
    };

    this.addCompanyTasks(plan, strategy);
    this.taskGraph.computeExecutionOrder();
    this.projectState.setTaskGraphState(this.taskGraph.toJSON() as unknown as Record<string, unknown>);
    return plan;
  }

  private addCompanyTasks(plan: InternetExecutionPlan, strategy: StrategyPlan): void {
    const addTask = (desc: string, cat: TaskCategory, deps: string[] = []): string =>
      this.taskGraph.addNode(desc, cat, deps);

    const infra: string[] = [];
    infra.push(addTask('Initialize project structure', 'infra'));
    infra.push(addTask('Configure TypeScript and build tooling', 'infra', [infra[0]!]));

    const mvpTasks: string[] = [];
    for (const scope of strategy.mvpScope) {
      const cat: TaskCategory =
        scope.toLowerCase().includes('api') || scope.toLowerCase().includes('backend')
          ? 'backend'
          : scope.toLowerCase().includes('ui') || scope.toLowerCase().includes('frontend')
            ? 'frontend'
            : scope.toLowerCase().includes('deploy')
              ? 'deployment'
              : scope.toLowerCase().includes('test')
                ? 'testing'
                : 'frontend';
      const deps = cat === 'frontend' ? [infra[0]!] : [infra[0]!];
      mvpTasks.push(addTask(scope, cat, deps));
    }

    const deploy: string[] = [];
    deploy.push(addTask('Configure production build', 'deployment', [...infra, ...mvpTasks]));
    deploy.push(addTask('Create GitHub repository and push', 'deployment', [...infra, ...mvpTasks]));
    deploy.push(addTask('Deploy to ' + plan.deploymentTarget, 'deployment', [deploy[1]!]));
    deploy.push(addTask('Verify live deployment', 'testing', [deploy[2]!]));

    const testing: string[] = [];
    const uxEval = addTask('Run UX evaluation', 'testing', [deploy[2]!]);
    testing.push(uxEval);
    testing.push(addTask('Fix UX issues', 'frontend', [uxEval]));
  }

  private async executeBuildPhase(): Promise<void> {
    this.companyPhase = 'building';
    this.logDecision('planner', 'start_build', 'Starting company-mode build phase', 0.9);

    const maxIterations = 30;
    let iter = 0;

    while (this.taskGraph.hasUnfinishedWork() && iter < maxIterations) {
      iter++;
      const bottlenecks = this.globalBrain.detectBottlenecks(this.taskGraph);

      if (bottlenecks.length > 0) {
        const criticalBottleneck = bottlenecks.find((b) => b.blockedCount > 2);
        if (criticalBottleneck) {
          this.globalBrain.reprioritize(this.taskGraph, 'bottleneck');
        }
      }

      const nextTasks = this.globalBrain.getNextOptimalTasks(this.taskGraph);
      if (nextTasks.length === 0) break;

      for (const task of nextTasks) {
        const cost = this.globalBrain.estimateCost(task);
        this.toolGraph.addNode(
          'scaffold',
          'build',
          { taskId: task.id, description: task.description },
          task.dependencies,
        );
        const conflicts = this.toolGraph.detectConflicts(this.taskGraph);

        this.taskGraph.markRunning(task.id);
        const startMs = Date.now();
        let success = false;

        try {
          if (task.category === 'deployment') {
            const result = await this.toolGateway.createGitHubRepository({ repoName: this.getPlanName() });
            success = result.success;
          } else {
            await this.toolGateway.writeProjectFiles(this.getPlanName(), [
              {
                path: `src/${task.category}/${task.id}.ts`,
                content: `// ${task.description}\nexport const ${task.id.replace(/-/g, '_')} = 'built';\n`,
              },
            ]);
            success = true;
          }
        } catch (err) {
          this.errors.push(err instanceof Error ? err.message : String(err));
          this.taskGraph.markBlocked(task.id, String(err));
          this.globalBrain.recordPerformance(task.id, Date.now() - startMs, false);
          this.toolGraph.recordResult(task.id, false, Date.now() - startMs, undefined, String(err));
          continue;
        }

        const durationMs = Date.now() - startMs;
        this.globalBrain.recordPerformance(task.id, durationMs, success);
        this.toolGraph.recordResult(task.id, success, durationMs);

        if (success) {
          this.taskGraph.markDone(task.id);
        }
      }
    }

    this.evolutionEngine.trackFailure(this.taskGraph);
  }

  private async runTestingPhase(): Promise<void> {
    this.logDecision('planner', 'start_testing', 'Starting testing phase', 0.85);
    const deployUrl = this.projectState.getDeployUrl();
    if (deployUrl) this.uxAgent.setBaseUrl(deployUrl);
  }

  private async runDeploymentPhase(): Promise<string | null> {
    this.logDecision('deployment', 'start_deploy', 'Starting deployment phase', 0.85);
    const planName = this.getPlanName();

    const deployResult = await this.deployRepair.startDeployment(planName, 'vercel', planName);
    this.projectState.setDeploymentSnapshot({
      target: 'vercel',
      url: deployResult.url,
      deployId: deployResult.deployId,
      status: deployResult.success ? 'deployed' : 'failed',
      logs: [],
      deployedAt: deployResult.success ? deterministicNow(this.seed) : null,
    });

    if (!deployResult.success) {
      const uiTaskIds = this.taskGraph.getNodesByCategory('frontend').map((n) => n.id);
      await this.deployRepair.monitorAndRepair(deployResult, this.taskGraph, uiTaskIds);
      if (this.deployRepair.shouldContinue()) {
        const retryResult = await this.deployRepair.startDeployment(planName, 'vercel', planName);
        this.projectState.updateDeploymentSnapshot({
          url: retryResult.url,
          deployId: retryResult.deployId,
          status: retryResult.success ? 'deployed' : 'failed',
          deployedAt: retryResult.success ? deterministicNow(this.seed) : null,
        });
        return retryResult.url;
      }
      return deployResult.url;
    }

    this.projectState.updateDeploymentSnapshot({ status: 'deployed' });
    return deployResult.url;
  }

  private async runUXEvaluation(deployUrl: string | null): Promise<UXEvaluationResult[]> {
    if (!deployUrl) return [];
    this.uxAgent.setBaseUrl(deployUrl);
    this.logDecision('ux', 'start_ux_eval', `Evaluating UX at ${deployUrl}`, 0.8);

    const journeys = this.uxAgent.defineStandardJourneys();
    const results: UXEvaluationResult[] = [];

    for (const journey of journeys) {
      const result = await this.uxAgent.evaluateJourney(journey, deployUrl);
      results.push(result);
    }

    for (const result of results) {
      if (!result.passed) {
        this.logDecision('ux', 'journey_failed', `Journey "${result.journeyName}" failed`, 0.4, [], {
          failures: result.overallFailures.map((f) => f.detail),
        });
      }
    }

    const uxReport = this.uxAgent.generateUXReport();
    this.logDecision(
      'ux',
      'ux_report',
      `UX: ${uxReport.passedJourneys}/${uxReport.totalJourneys} journeys passed`,
      uxReport.avgCompleteness,
      [],
      { completeness: uxReport.avgCompleteness, flowScore: uxReport.avgFlowScore },
    );

    return results;
  }

  private runEvolutionPhase(): void {
    this.logDecision('strategy', 'start_evolution', 'Starting capability evolution phase', 0.75);

    const patterns = this.evolutionEngine.getFailurePatterns();
    for (const pattern of patterns) {
      if (!pattern.fixedByMutation && pattern.frequency >= 2) {
        const mutation = this.evolutionEngine.proposeMutation(pattern);
        const sim = this.evolutionEngine.simulateMutation(mutation);
        this.logDecision('strategy', 'evaluate_mutation', sim.recommendation, mutation.simulatedSuccessRate, [], {
          mutationId: mutation.id,
          predictedImprovement: sim.predictedImprovement,
        });

        if (sim.predictedImprovement > 0.5) {
          this.evolutionEngine.activateMutation(mutation.id);
        }
      }
    }
  }

  private trackStrategyPerformance(): void {
    if (this.strategyPlan) {
      const success = this.errors.length === 0;
      const score = this.strategyPlan.estimatedSuccessProbability;
      this.evolutionEngine.recordStrategyPerformance(this.strategyPlan.winningStrategy, success, score);
    }
  }

  private generateReport(deployUrl: string | null, uxResults: UXEvaluationResult[]): Phase11Report {
    const allTraces = this.getAllDecisionTraces();
    const patterns = this.evolutionEngine.getFailurePatterns();
    const mutations = this.evolutionEngine.getMutations();

    const catBreakdown: Array<{ category: string; count: number; topError: string }> = [];
    const catMap = new Map<string, { count: number; errors: string[] }>();
    for (const p of patterns) {
      const entry = catMap.get(p.category) ?? { count: 0, errors: [] };
      entry.count += p.frequency;
      entry.errors.push(p.description);
      catMap.set(p.category, entry);
    }
    for (const [cat, data] of catMap) {
      catBreakdown.push({
        category: cat,
        count: data.count,
        topError: data.errors.sort((a, b) => b.length - a.length)[0] ?? '',
      });
    }

    const perfByTool = this.toolGraph.getPerformanceReport();

    return {
      strategyReport: {
        plan: this.strategyPlan!,
        alignmentQuality: this.strategyPlan?.estimatedSuccessProbability ?? 0,
      },
      executionGraph: {
        totalToolOperations: this.toolGraph.getAllNodes().length,
        conflictsDetected: this.toolGraph.detectConflicts(this.taskGraph).length,
        performanceByToolType: perfByTool.map((p) => ({
          toolType: p.toolType,
          avgDurationMs: p.avgDurationMs,
          successRate: p.successRate,
        })),
      },
      failureAnalysis: {
        categorizedBreakdown: catBreakdown,
        resolvedByMutation: mutations.filter((m) => m.activated).length,
      },
      uxReport: uxResults,
      deploymentReport: {
        liveUrl: deployUrl,
        status: deployUrl ? 'deployed' : 'failed',
        repairCycles: this.deployRepair.getCycles().length,
      },
      learningUpdate: {
        mutationsActivated: mutations.filter((m) => m.activated).length,
        failurePatternsTracked: patterns.length,
        strategyImprovements: this.evolutionEngine.getLearningSummary().improvements,
      },
      decisionTraces: allTraces,
    };
  }

  private getPlanName(): string {
    return this.plan?.projectName ?? 'hackathon-project';
  }

  getCompanyPhase(): CompanyPhase {
    return this.companyPhase;
  }
  getErrors(): string[] {
    return [...this.errors];
  }
  getReport(): Phase11Report | null {
    return null;
  }

  pause(reason: string): boolean {
    return this.humanControl.pause(reason);
  }
  resume(): boolean {
    return this.humanControl.resume();
  }
}

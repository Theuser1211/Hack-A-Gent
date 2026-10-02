import type { EvolutionDelta } from './company-evolution-engine.js';
import { type CompanyProfile, type CompanyResult } from './company-spawner.js';
import type { HackathonCompanyOrchestrator } from './hackathon-company-orchestrator.js';
import type { CompanyCompetitionConfig } from './hackathon-company-orchestrator.js';
import { ResourceType, ResourceAction, ResourceSource, type ResourceBudget } from './resource-ledger.js';
import { GlobalResourceLedger } from './resource-ledger.js';
import type { EconomyStats } from './resource-ledger.js';
import type { CompanyExecutionState } from './resource-ledger.js';
import { ResourceMarketModel } from './resource-market-model.js';
import type { SwarmLeaderboard } from './swarm-leaderboard.js';

export interface EconomyHooks {
  ledger: GlobalResourceLedger;
  marketModel: ResourceMarketModel;
  resourceExhaustionThresholds: Partial<Record<ResourceType, number>>;
  performanceMultipliers: Record<string, number>;
  inflationRate: number;
  deflationRate: number;
}

export class EconomyEnforcementHooks {
  public readonly economy: EconomyHooks;

  constructor(ledger: GlobalResourceLedger, marketModel: ResourceMarketModel, options?: Partial<EconomyHooks>) {
    this.economy = {
      ledger,
      marketModel,
      resourceExhaustionThresholds: {
        [ResourceType.COMPUTE_TOKENS]: 10,
        [ResourceType.MUTATION_CREDITS]: 5,
        [ResourceType.EVALUATION_CREDITS]: 5,
        [ResourceType.DEPLOYMENT_CREDITS]: 3,
      },
      performanceMultipliers: {
        high_performance: 1.5,
        medium_performance: 1.0,
        low_performance: 0.7,
        poor_performance: 0.5,
      },
      inflationRate: 0.05,
      deflationRate: 0.02,
      ...options,
    };
  }

  integrateSwarmSystem(
    companyId: string,
    budget: ResourceBudget,
    executionState: CompanyExecutionState,
    agentActions: Array<{ role: string; toolCalls: number; simulationSteps: number }>,
  ): Partial<CompanyExecutionState> {
    const degradedMode = this.checkResourceExhaustion(budget);
    const actionBias = this.calculateAgentActionCost(agentActions);

    if (degradedMode) {
      executionState.memoryUsed = Math.min(executionState.memoryUsed * 0.7, 100);
      executionState.successScore = Math.min(executionState.successScore, 0.7);
      executionState.penaltyScore = Math.max(executionState.penaltyScore, 0.3);
    }

    if (actionBias.agentCost > 0.8) {
      executionState.successScore *= 0.8;
      executionState.penaltyScore *= 1.2;
    }

    this.applyResourceConsumption(companyId, actionBias.resourceConsumed);
    this.adjustMarketPrices(budget, {
      toolCalls: actionBias.toolCalls,
      simulationSteps: 0,
      deployAttempts: 0,
      repairCycles: 0,
    });

    return { ...executionState };
  }

  integrateCompanySystem(
    companyId: string,
    budget: ResourceBudget,
    companyProfile: CompanyProfile,
    executionResult: CompanyResult,
    simulationMetrics: Partial<{
      toolCalls: number;
      simulationSteps: number;
      deployAttempts: number;
      repairCycles: number;
    }>,
  ): Partial<CompanyProfile> {
    const degradedMode = this.checkResourceExhaustion(budget);
    const inflation = this.economy.inflationRate;

    if (degradedMode) {
      companyProfile.specializationBias = companyProfile.specializationBias.slice(
        0,
        Math.max(1, companyProfile.specializationBias.length * 0.5),
      );
      companyProfile.agents = companyProfile.agents.map((agent) => ({
        ...agent,
        specializationBias: agent.specializationBias.slice(0, Math.max(1, agent.specializationBias.length * 0.5)),
        capabilityScore: Math.min(agent.capabilityScore, 0.7),
      }));
    }

    const costs = this.calculateCompanyCosts(companyProfile, executionResult, simulationMetrics);
    this.applyResourceConsumption(companyId, costs);

    this.adjustMarketPrices(budget, simulationMetrics);

    if (executionResult.deployAttempts > 2) {
      this.earnResources(companyId, ResourceType.DEPLOYMENT_CREDITS, 5, 'Strategic deployment experience');
    }

    if (executionResult.repairCycles > 1) {
      this.spendResources(
        companyId,
        ResourceType.MUTATION_CREDITS,
        executionResult.repairCycles * 2,
        'Repair cycle mutation cost',
      );
    }

    return { ...companyProfile };
  }

  integrateJudgeSystem(
    companyId: string,
    budget: ResourceBudget,
    executionResult: CompanyResult,
  ): { judgeBias: number; evaluationCost: number } {
    const degradedMode = this.checkResourceExhaustion(budget);
    const baseEvaluationCost = 2;

    let evaluationCost = baseEvaluationCost;
    let judgeBias = 0.5;

    if (degradedMode) {
      evaluationCost *= 0.5;
      judgeBias = Math.max(0.3, judgeBias - 0.2);
    }

    if (executionResult.finalScore > 0.8) {
      evaluationCost *= 0.8;
      judgeBias += 0.1;
      this.earnResources(companyId, ResourceType.EVALUATION_CREDITS, 3, 'Excellent performance reward');
    } else if (executionResult.finalScore < 0.4) {
      evaluationCost *= 1.5;
      judgeBias -= 0.1;
      this.spendResources(companyId, ResourceType.EVALUATION_CREDITS, 5, 'Poor performance penalty');
    }

    if (executionResult.totalFailures > 0) {
      this.spendResources(
        companyId,
        ResourceType.EVALUATION_CREDITS,
        executionResult.totalFailures * 2,
        'Failure penalty',
      );
      judgeBias -= executionResult.totalFailures * 0.05;
    }

    this.applyResourceConsumption(companyId, { [ResourceType.EVALUATION_CREDITS]: evaluationCost });
    this.adjustMarketPrices(budget, {
      toolCalls: executionResult.toolCallsUsed,
      simulationSteps: 0,
      deployAttempts: 0,
      repairCycles: 0,
    });

    return { judgeBias, evaluationCost };
  }

  integrateEvolutionSystem(
    companyId: string,
    budget: ResourceBudget,
    executionResult: CompanyResult,
    delta: EvolutionDelta | null,
  ): EvolutionDelta | null {
    const degradedMode = this.checkResourceExhaustion(budget);
    const baseMutationCost = 1;

    if (degradedMode && delta) {
      delta.newBestPatterns = [];
      delta.deprecatedPatterns = delta.deprecatedPatterns || [];
      delta.mutationsApplied = [];
      delta.expectedScoreImprovement = 0;
      return delta;
    }

    if (delta) {
      const mutationEfficiency = executionResult.finalScore / Math.max(executionResult.breakdown.reliability, 1);
      const mutationCost = baseMutationCost * mutationEfficiency * (1 + executionResult.totalFailures * 0.2);

      this.spendResources(companyId, ResourceType.MUTATION_CREDITS, mutationCost, 'Mutation system cost');

      if (executionResult.finalScore > 0.7 && executionResult.breakdown.wowFactor > 0.8) {
        this.earnResources(companyId, ResourceType.MUTATION_CREDITS, 5, 'Innovation mutation reward');

        if (delta.newBestPatterns) {
          delta.newBestPatterns.push(`adaptive-innovation-${executionResult.companyId}`);
        }
      }

      if (executionResult.finalScore < 0.3) {
        this.spendResources(companyId, ResourceType.MUTATION_CREDITS, 10, 'Poor performance mutation penalty');

        if (delta.deprecatedPatterns) {
          delta.deprecatedPatterns.push(`ineffective-strategy-${executionResult.companyId}`);
        }
      }

      this.adjustMarketPrices(budget, {
        toolCalls: executionResult.toolCallsUsed,
        simulationSteps: 0,
        deployAttempts: 0,
        repairCycles: 0,
      });
    }

    return delta || null;
  }

  integrateCognitiveInjectionLayer(
    companyId: string,
    budget: ResourceBudget,
    context: unknown,
    injectionImpact: number,
  ): { injectionCost: number; biasAdjustment: number } {
    const degradedMode = this.checkResourceExhaustion(budget);
    const baseInjectionCost = 5;

    let injectionCost = baseInjectionCost * injectionImpact;
    let biasAdjustment = 0;

    if (degradedMode) {
      injectionCost *= 0.6;
      biasAdjustment -= 0.2;
      this.spendResources(
        companyId,
        ResourceType.COMPUTE_TOKENS,
        injectionCost,
        'Cognitive injection in degraded mode',
      );
      return { injectionCost, biasAdjustment };
    }

    if (injectionImpact > 0.8) {
      injectionCost *= 1.5;
      biasAdjustment += 0.3;
      this.spendResources(companyId, ResourceType.COMPUTE_TOKENS, injectionCost, 'High-impact cognitive injection');
    } else if (injectionImpact < 0.3) {
      injectionCost *= 0.7;
      biasAdjustment -= 0.1;
      this.spendResources(companyId, ResourceType.COMPUTE_TOKENS, injectionCost, 'Low-impact cognitive injection');
    } else {
      this.spendResources(companyId, ResourceType.COMPUTE_TOKENS, injectionCost, 'Standard cognitive injection');
    }

    this.adjustMarketPrices(budget, { toolCalls: 0, simulationSteps: 0, deployAttempts: 0, repairCycles: 0 });

    return { injectionCost, biasAdjustment };
  }

  checkResourceExhaustion(budget: ResourceBudget): boolean {
    for (const [type, threshold] of Object.entries(this.economy.resourceExhaustionThresholds)) {
      const balance = this.getResourceBalance(budget, type as ResourceType);
      if (balance <= (threshold as number)) {
        return true;
      }
    }
    return false;
  }

  forceBankruptcy(companyId: string): any {
    return this.economy.ledger.bankruptCompany(companyId);
  }

  private getResourceBalance(budget: ResourceBudget, resourceType: ResourceType): number {
    switch (resourceType) {
      case ResourceType.COMPUTE_TOKENS:
        return budget.computeTokens;
      case ResourceType.MUTATION_CREDITS:
        return budget.mutationCredits;
      case ResourceType.EVALUATION_CREDITS:
        return budget.evaluationCredits;
      case ResourceType.DEPLOYMENT_CREDITS:
        return budget.deploymentCredits;
      default:
        return 0;
    }
  }

  private applyResourceConsumption(companyId: string, costs: Partial<Record<ResourceType, number>>): void {
    if (!costs) return;

    for (const [type, amount] of Object.entries(costs)) {
      if (amount && amount > 0) {
        this.spendResources(companyId, type as ResourceType, amount, `System consumption`);
      }
    }
  }

  private spendResources(companyId: string, resourceType: ResourceType, amount: number, description: string): boolean {
    return this.economy.ledger.spendResources(
      companyId,
      resourceType,
      amount,
      ResourceAction.SPEND,
      ResourceSource.RESOURCE_COST,
      description,
      1.0,
    );
  }

  private earnResources(companyId: string, resourceType: ResourceType, amount: number, description: string): void {
    this.economy.ledger.earnResources(
      companyId,
      resourceType,
      amount,
      ResourceAction.EARN,
      ResourceSource.COMPENSATION,
      description,
      1.0,
    );
  }

  private calculateAgentActionCost(actions: Array<{ role: string; toolCalls: number; simulationSteps: number }>): {
    toolCalls: number;
    resourceConsumed: Partial<Record<ResourceType, number>>;
    agentCost: number;
  } {
    const totalToolCalls = actions.reduce((sum, action) => sum + action.toolCalls, 0);
    const totalSimulationSteps = actions.reduce((sum, action) => sum + action.simulationSteps, 0);

    const computeCost = totalToolCalls * 0.5 + totalSimulationSteps * 0.2;
    const mutationCost = totalSimulationSteps * 0.3;
    const evaluationCost = actions.length * 1;
    const deploymentCost = 0;

    return {
      toolCalls: totalToolCalls,
      resourceConsumed: {
        [ResourceType.COMPUTE_TOKENS]: computeCost,
        [ResourceType.MUTATION_CREDITS]: mutationCost,
        [ResourceType.EVALUATION_CREDITS]: evaluationCost,
        [ResourceType.DEPLOYMENT_CREDITS]: deploymentCost,
      },
      agentCost: (computeCost + mutationCost + evaluationCost + deploymentCost) / 10,
    };
  }

  private calculateCompanyCosts(
    profile: CompanyProfile,
    result: CompanyResult,
    metrics: Partial<{ toolCalls: number; simulationSteps: number; deployAttempts: number; repairCycles: number }>,
  ): Partial<Record<ResourceType, number>> {
    const planningCost = 5;
    const deploymentCost = (metrics?.deployAttempts || 0) * 10;
    const repairCost = (metrics?.repairCycles || 0) * 5 * (1 + result.totalFailures * 0.5);
    const simulationCost = (metrics?.simulationSteps || 0) * 2;
    const toolCost = (metrics?.toolCalls || 0) * 0.5;

    return {
      [ResourceType.COMPUTE_TOKENS]: toolCost + simulationCost,
      [ResourceType.MUTATION_CREDITS]: repairCost + planningCost,
      [ResourceType.EVALUATION_CREDITS]: 2,
      [ResourceType.DEPLOYMENT_CREDITS]: deploymentCost,
    };
  }

  private adjustMarketPrices(
    budget: ResourceBudget,
    metrics: Partial<{ toolCalls: number; simulationSteps: number; deployAttempts: number; repairCycles: number }>,
  ): void {
    const inflation = this.economy.inflationRate;
    const deflation = this.economy.deflationRate;

    const prices = this.economy.marketModel.calculateOptimalPricing(budget, metrics);
    this.economy.marketModel.updatePrices(budget.companyId, budget, metrics);

    if (inflation > 0) {
      for (const type of Object.values(ResourceType)) {
        this.economy.ledger.earnResources(
          budget.companyId,
          type as ResourceType,
          Math.ceil(budget.computeTokens * inflation),
          ResourceAction.EARN,
          ResourceSource.COMPENSATION,
          `Inflation bonus`,
        );
      }
    }

    if (deflation > 0) {
      this.economy.ledger.spendResources(
        budget.companyId,
        ResourceType.COMPUTE_TOKENS,
        Math.ceil(budget.computeTokens * deflation),
        ResourceAction.SPEND,
        ResourceSource.FEE,
        `Deflation fee`,
      );
    }
  }

  integrateOrchestrator(orchestrator: HackathonCompanyOrchestrator, executor: unknown): void {
    const originalRun = orchestrator.runCompetition;

    orchestrator.runCompetition = (spec: any) => {
      const companies = spec.companyCount;
      const simulationCost = companies * 20;

      for (let i = 0; i < companies; i++) {
        const companyId = `company-${i}`;
        this.economy.ledger.spendResources(
          companyId,
          ResourceType.COMPUTE_TOKENS,
          simulationCost / companies,
          ResourceAction.SPEND,
          ResourceSource.RESOURCE_COST,
          `Competition entry cost - simulation ${i + 1}/${companies}`,
        );
      }

      const result = originalRun.call(orchestrator, spec);
      this.adjustOrchestratorEconomy(orchestrator);

      return result;
    };

    this.economy.ledger.persistToStorage();
    (this.economy.marketModel as any).persistToStorage();
  }

  private adjustOrchestratorEconomy(orchestrator: HackathonCompanyOrchestrator): void {
    const companyList = (orchestrator as any)['companies'] || [];
    for (const company of companyList) {
      const metrics = {
        toolCalls: company.agents.length * 10,
        simulationSteps: 50,
        deployAttempts: orchestrator['config']?.gatewayAvailable ? 2 : 1,
        repairCycles: 2,
      };

      const budget = this.economy.ledger.getBudget(company.id);
      if (budget) {
        this.economy.marketModel.updatePrices(company.id, budget, metrics);
      }
    }
  }

  getEconomyStatus(): {
    totalCompanies: number;
    totalResources: any;
    inflationRate: number;
    deflationRate: number;
    resourcePressure: any;
    bankruptCompanies: number;
    economicHealthScore: number;
  } {
    const budgets = this.economy.ledger.getAllBudgets();
    const economyStats = this.economy.ledger.getEconomyStats();
    const pressure = this.economy.ledger.getResourcePressure();

    return {
      totalCompanies: budgets.length,
      totalResources: {
        computeTokens: economyStats.totalComputeTokensCirculating,
        mutationCredits: economyStats.totalMutationCreditsCirculating,
        evaluationCredits: economyStats.totalEvaluationCreditsCirculating,
        deploymentCredits: economyStats.totalDeploymentCreditsCirculating,
      },
      inflationRate: this.economy.inflationRate,
      deflationRate: this.economy.deflationRate,
      resourcePressure: pressure,
      bankruptCompanies: budgets.filter((b) => this.economy.ledger.isBankrupt(b.companyId)).length,
      economicHealthScore: Math.max(
        0,
        1 - budgets.filter((b) => this.economy.ledger.isBankrupt(b.companyId)).length / Math.max(budgets.length, 1),
      ),
    };
  }

  emergencyEconomyReset(): void {
    this.economy.ledger.forceEconomyReset();
    this.economy.marketModel.resetMarketConditions();
  }

  transferResources(fromCompanyId: string, toCompanyId: string, resourceType: ResourceType, amount: number): boolean {
    return this.economy.ledger.transferResources(fromCompanyId, toCompanyId, resourceType, amount);
  }
}

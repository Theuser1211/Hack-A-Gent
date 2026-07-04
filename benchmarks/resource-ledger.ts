import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export enum ResourceAction {
  SPEND = 'spend',
  EARN = 'earn',
}

export enum ResourceSource {
  RESOURCE_COST = 'resource_cost',
  COMPENSATION = 'compensation',
  FEE = 'fee',
}

export interface ResourceBudget {
  companyId: string;
  computeTokens: number;
  mutationCredits: number;
  evaluationCredits: number;
  deploymentCredits: number;
}

export enum ResourceType {
  COMPUTE_TOKENS = 'compute_tokens',
  MUTATION_CREDITS = 'mutation_credits',
  EVALUATION_CREDITS = 'evaluation_credits',
  DEPLOYMENT_CREDITS = 'deployment_credits',
  KNOWLEDGE_SAMPLES = 'knowledge_samples',
}

export interface BudgetBreakdown {
  companyId: string;
  totalBudget: number;
  computeTokens: number;
  mutationCredits: number;
  evaluationCredits: number;
  deploymentCredits: number;
  allocated: Record<string, number>;
  remaining: number;
}

export interface TokenTransaction {
  transactionId: string;
  companyId: string;
  amount: number;
  type: 'reward' | 'penalty' | 'usage' | 'transfer';
  source: string;
  description: string;
  timestamp: string;
}

export interface EconomyStats {
  globalTokenSupply: number;
  inflationRate: number;
  deflationRate: number;
  velocityOfMoney: number;
  totalComputeTokensCirculating: number;
  totalMutationCreditsCirculating: number;
  totalEvaluationCreditsCirculating: number;
  totalDeploymentCreditsCirculating: number;
}

export interface ResourcePressure {
  [key: string]: number;
}

export interface EconomyHooks {
  ledger: GlobalResourceLedger;
  marketModel: unknown;
  resourceExhaustionThresholds: Record<string, number>;
}

export interface CompanyExecutionState {
  companyId: string;
  company: unknown;
  simulationResult: unknown;
  judgeVerdict: unknown;
  phase: string;
  iteration: number;
  memoryUsed: number;
  successScore: number;
  penaltyScore: number;
  deployAttempts: number;
  repairCycles: number;
}

export class GlobalResourceLedger {
  private readonly seed: number;
  private readonly storageKey = 'hackagent_resource_ledger';
  private budgets: Map<string, BudgetBreakdown> = new Map();
  private transactions: TokenTransaction[] = [];
  private economyStats: EconomyStats = {
    globalTokenSupply: 1000000,
    inflationRate: 0.02,
    deflationRate: 0.01,
    velocityOfMoney: 0.5,
    totalComputeTokensCirculating: 0,
    totalMutationCreditsCirculating: 0,
    totalEvaluationCreditsCirculating: 0,
    totalDeploymentCreditsCirculating: 0,
  };
  private resourcePressure: ResourcePressure = {};

  constructor(seed = 42) {
    this.seed = seed;
  }

  public createBudget(companyId: string, totalBudget: number): BudgetBreakdown {
    const budget: BudgetBreakdown = {
      companyId,
      totalBudget,
      computeTokens: totalBudget * 0.4,
      mutationCredits: totalBudget * 0.2,
      evaluationCredits: totalBudget * 0.2,
      deploymentCredits: totalBudget * 0.2,
      allocated: {},
      remaining: totalBudget,
    };
    this.budgets.set(companyId, budget);
    return budget;
  }

  public getBudget(companyId: string): BudgetBreakdown | undefined {
    return this.budgets.get(companyId);
  }

  public getAllBudgets(): BudgetBreakdown[] {
    return Array.from(this.budgets.values());
  }

  public spendResources(
    companyId: string,
    resourceType: string,
    amount: number,
    _action?: string,
    _source?: string,
    _description?: string,
    _multiplier?: number,
  ): boolean {
    const budget = this.budgets.get(companyId);
    if (!budget || budget.remaining < amount) return false;

    budget.remaining -= amount;
    budget.allocated[resourceType] = (budget.allocated[resourceType] || 0) + amount;

    this.recordTransaction({
      transactionId: createDeterministicUuid(this.seed, Date.now()),
      companyId,
      amount: -amount,
      type: 'usage',
      source: resourceType,
      description: `Spent ${amount} ${resourceType}`,
      timestamp: deterministicNow(this.seed),
    });
    return true;
  }

  public earnResources(
    companyId: string,
    resourceType: string,
    amount: number,
    _action?: string,
    _source?: string,
    _description?: string,
    _multiplier?: number,
  ): void {
    const budget = this.budgets.get(companyId);
    if (budget) {
      budget.remaining += amount;
      this.recordTransaction({
        transactionId: createDeterministicUuid(this.seed, Date.now()),
        companyId,
        amount,
        type: 'reward',
        source: resourceType,
        description: `Earned ${amount} ${resourceType}`,
        timestamp: deterministicNow(this.seed),
      });
    }
  }

  public transferResources(fromCompanyId: string, toCompanyId: string, resourceType: string, amount: number): boolean {
    if (!this.spendResources(fromCompanyId, resourceType, amount)) return false;
    this.earnResources(toCompanyId, resourceType, amount);
    return true;
  }

  public recordTransaction(transaction: TokenTransaction): void {
    this.transactions.push(transaction);
    const budget = this.budgets.get(transaction.companyId);
    if (budget) {
      budget.remaining += transaction.amount;
    }
  }

  public getTransactionHistory(companyId?: string): TokenTransaction[] {
    if (companyId) {
      return this.transactions.filter((t) => t.companyId === companyId);
    }
    return [...this.transactions];
  }

  public updateEconomyStats(stats: Partial<EconomyStats>): void {
    this.economyStats = { ...this.economyStats, ...stats };
  }

  public getEconomyStats(): EconomyStats {
    return { ...this.economyStats };
  }

  public setResourcePressure(resource: string, pressure: number): void {
    this.resourcePressure[resource] = pressure;
  }

  public getResourcePressure(resource?: string): number {
    if (!resource) return 1.0;
    return this.resourcePressure[resource] ?? 1.0;
  }

  public getTotalResources(): number {
    return Array.from(this.budgets.values()).reduce((sum, b) => sum + b.remaining, 0);
  }

  public setEconomyScale(value: number): void {}

  public setScarcity(value: number): void {}

  public isBankrupt(companyId: string): boolean {
    const budget = this.budgets.get(companyId);
    return !budget || budget.remaining <= 0;
  }

  public bankruptCompany(companyId: string): void {
    const budget = this.budgets.get(companyId);
    if (budget) {
      budget.remaining = 0;
    }
  }

  public forceEconomyReset(): void {
    this.budgets.clear();
    this.transactions = [];
    this.economyStats = {
      globalTokenSupply: 1000000,
      inflationRate: 0.02,
      deflationRate: 0.01,
      velocityOfMoney: 0.5,
      totalComputeTokensCirculating: 0,
      totalMutationCreditsCirculating: 0,
      totalEvaluationCreditsCirculating: 0,
      totalDeploymentCreditsCirculating: 0,
    };
  }

  persistToStorage(): void {
    try {
      const data = JSON.stringify(this.toJSON());
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }

  toJSON(): Record<string, unknown> {
    return {
      budgets: Array.from(this.budgets.entries()),
      transactions: this.transactions,
      economyStats: this.economyStats,
      resourcePressure: this.resourcePressure,
    };
  }

  computeTokens(companyId: string): number {
    const budget = this.budgets.get(companyId);
    return budget?.computeTokens ?? 0;
  }
}

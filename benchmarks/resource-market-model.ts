import { deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import { ResourceType, type ResourceBudget } from './resource-ledger.js';

export interface MarketPrice {
  resourceType: ResourceType;
  basePrice: number;
  currentPrice: number;
  volatility: number;
  lastUpdated: string;
  supply: number;
  demand: number;
  priceHistory: { price: number; timestamp: string; quantity: number }[];
}

export interface ResourceMarket {
  name: string;
  totalSupply: number;
  totalDemand: number;
  price: number;
  elasticity: number;
  scarcityLevel: number;
}

export interface MarketState {
  timestamp: string;
  prices: Record<ResourceType, MarketPrice>;
  markets: Record<string, ResourceMarket>;
  priceHistory: { prices: Record<ResourceType, number>; timestamp: string }[];
  resourceUtilization: Record<string, number>;
}

export class ResourceMarketModel {
  private readonly seed: number;
  private readonly rng: RNG;
  private marketState: MarketState;
  private readonly storageKey = 'hackagent-resource-market';

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 47000);
    this.marketState = {
      timestamp: deterministicNow(this.seed),
      prices: {
        [ResourceType.COMPUTE_TOKENS]: this.initializePrice(ResourceType.COMPUTE_TOKENS),
        [ResourceType.MUTATION_CREDITS]: this.initializePrice(ResourceType.MUTATION_CREDITS),
        [ResourceType.EVALUATION_CREDITS]: this.initializePrice(ResourceType.EVALUATION_CREDITS),
        [ResourceType.DEPLOYMENT_CREDITS]: this.initializePrice(ResourceType.DEPLOYMENT_CREDITS),
        [ResourceType.KNOWLEDGE_SAMPLES]: this.initializePrice(ResourceType.KNOWLEDGE_SAMPLES),
      },
      markets: {
        'tool-market': {
          name: 'Tool Market',
          totalSupply: 100,
          totalDemand: 50,
          price: 1.0,
          elasticity: 0.8,
          scarcityLevel: 0.5,
        },
        'agent-market': {
          name: 'Agent Market',
          totalSupply: 50,
          totalDemand: 60,
          price: 0.8,
          elasticity: 0.9,
          scarcityLevel: 0.6,
        },
        'eval-market': {
          name: 'Evaluation Market',
          totalSupply: 200,
          totalDemand: 100,
          price: 1.2,
          elasticity: 0.7,
          scarcityLevel: 0.4,
        },
        'deploy-market': {
          name: 'Deployment Market',
          totalSupply: 30,
          totalDemand: 40,
          price: 1.5,
          elasticity: 0.6,
          scarcityLevel: 0.7,
        },
      },
      priceHistory: [],
      resourceUtilization: {},
    };
    this.loadFromStorage();
  }

  getPrice(resourceType: ResourceType): MarketPrice {
    return { ...this.marketState.prices[resourceType] };
  }

  getMarket(marketName: string): ResourceMarket {
    return { ...this.marketState.markets[marketName]! };
  }

  updatePrices(
    companyId: string,
    budget: ResourceBudget,
    executionMetrics: Partial<{
      toolCalls: number;
      simulationSteps: number;
      deployAttempts: number;
      repairCycles: number;
    }>,
  ): void {
    this.updatePrice(ResourceType.COMPUTE_TOKENS, budget, executionMetrics);
    this.updatePrice(ResourceType.MUTATION_CREDITS, budget, executionMetrics);
    this.updatePrice(ResourceType.EVALUATION_CREDITS, budget, executionMetrics);
    this.updatePrice(ResourceType.DEPLOYMENT_CREDITS, budget, executionMetrics);

    this.recordPriceHistory();
    this.persistToStorage();
  }

  calculateOptimalPricing(budget: ResourceBudget, executionMetrics: any): Record<ResourceType, number> {
    const pressures = this.calculateMarketPressure(budget, executionMetrics);
    const optimalPrices = {} as Record<ResourceType, number>;

    for (const [resourceType, price] of Object.entries(this.marketState.prices)) {
      const pressure = pressures[resourceType as ResourceType];
      const market = this.getMarket(`${resourceType}-market`);

      let optimalPrice = price.currentPrice;

      if (pressure > 1.0) {
        optimalPrice *= 1 + (pressure - 1) * 0.5;
      } else if (pressure < 0.5) {
        optimalPrice *= 0.8 + pressure * 0.4;
      }

      optimalPrice *= 1 + (market.scarcityLevel - 0.5) * 0.3;

      optimalPrices[resourceType as ResourceType] = Math.max(0.1, Math.min(10, optimalPrice));
    }

    return optimalPrices;
  }

  calculateSupplyDemand(budget: ResourceBudget, executionMetrics: any): Record<ResourceType, number> {
    const supplyDemand = {} as Record<ResourceType, number>;

    const computeSupply = budget.computeTokens;
    const computeDemand =
      (executionMetrics?.toolCalls || 0) * 0.5 +
      (executionMetrics?.simulationSteps || 0) * 0.3 +
      (executionMetrics?.repairCycles || 0) * 1.0;

    const mutationSupply = budget.mutationCredits;
    const mutationDemand =
      (executionMetrics?.simulationSteps || 0) * 0.7 + (executionMetrics?.deployAttempts || 0) * 0.8;

    const evaluationSupply = budget.evaluationCredits;
    const evaluationDemand = 1; // Fixed evaluation demand

    const deploymentSupply = budget.deploymentCredits;
    const deploymentDemand =
      (executionMetrics?.deployAttempts || 0) * 1.5 + (executionMetrics?.repairCycles || 0) * 0.5;

    supplyDemand[ResourceType.COMPUTE_TOKENS] = computeSupply / Math.max(computeDemand, 1);
    supplyDemand[ResourceType.MUTATION_CREDITS] = mutationSupply / Math.max(mutationDemand, 1);
    supplyDemand[ResourceType.EVALUATION_CREDITS] = evaluationSupply / Math.max(evaluationDemand, 1);
    supplyDemand[ResourceType.DEPLOYMENT_CREDITS] = deploymentSupply / Math.max(deploymentDemand, 1);

    return supplyDemand;
  }

  recordResourceUtilization(companyId: string, resourceType: ResourceType, utilization: number): void {
    if (!this.marketState.resourceUtilization[companyId]) {
      this.marketState.resourceUtilization[companyId] = {} as any;
    }
    (this.marketState.resourceUtilization[companyId] as any)[resourceType] = utilization;
  }

  getResourceUtilization(companyId: string, resourceType: ResourceType): number {
    return (this.marketState.resourceUtilization[companyId] as any)[resourceType] || 0;
  }

  calculateInflation(budget: ResourceBudget): number {
    const totalResources =
      budget.computeTokens + budget.mutationCredits + budget.evaluationCredits + budget.deploymentCredits;
    const normalizedUtilization = totalResources / 400;
    return Math.max(0, Math.min(1, normalizedUtilization)) * 0.15;
  }

  calculateDeflation(budget: ResourceBudget): number {
    const totalResources =
      budget.computeTokens + budget.mutationCredits + budget.evaluationCredits + budget.deploymentCredits;
    const normalizedSatisfaction = Math.min(1, totalResources / 200);
    return Math.max(0, Math.min(1, normalizedSatisfaction)) * 0.1;
  }

  getMarketState(): MarketState {
    return { ...this.marketState, timestamp: deterministicNow(this.seed) };
  }

  resetMarketConditions(): void {
    for (const [type, price] of Object.entries(this.marketState.prices)) {
      price.currentPrice = price.basePrice;
      price.supply = 100;
      price.demand = 50;
      price.lastUpdated = deterministicNow(this.seed);
    }

    this.persistToStorage();
  }

  private initializePrice(resourceType: ResourceType): MarketPrice {
    const basePrices: Partial<Record<ResourceType, number>> = {
      [ResourceType.COMPUTE_TOKENS]: 1.0,
      [ResourceType.MUTATION_CREDITS]: 0.5,
      [ResourceType.EVALUATION_CREDITS]: 1.5,
      [ResourceType.DEPLOYMENT_CREDITS]: 2.0,
    };

    return {
      resourceType,
      basePrice: basePrices[resourceType]!,
      currentPrice: basePrices[resourceType]!,
      volatility: 0.2,
      lastUpdated: deterministicNow(this.seed),
      supply: 100,
      demand: 50,
      priceHistory: [],
    };
  }

  private updatePrice(resourceType: ResourceType, budget: ResourceBudget, executionMetrics: any): void {
    const price = this.marketState.prices[resourceType];
    const pressure = this.calculateMarketPressure(budget, executionMetrics);
    const market = this.getMarket(`${resourceType}-market`);

    let newPrice = price.currentPrice;

    switch (resourceType) {
      case ResourceType.COMPUTE_TOKENS:
        newPrice = this.calculateComputePrice(pressure, executionMetrics);
        break;
      case ResourceType.MUTATION_CREDITS:
        newPrice = this.calculateMutationPrice(pressure, executionMetrics);
        break;
      case ResourceType.EVALUATION_CREDITS:
        newPrice = this.calculateEvaluationPrice(pressure, executionMetrics);
        break;
      case ResourceType.DEPLOYMENT_CREDITS:
        newPrice = this.calculateDeploymentPrice(pressure, executionMetrics);
        break;
    }

    price.currentPrice = newPrice;
    price.lastUpdated = deterministicNow(this.seed);
    price.supply = this.getResourceBalance(budget, resourceType);
    price.demand = this.getResourceDemand(resourceType, executionMetrics);
    price.volatility = Math.max(0.1, Math.min(1, 1 - price.supply / price.demand));
  }

  private calculateComputePrice(pressure: any, executionMetrics: any): number {
    const basePrice = 1.0;
    const usageMultiplier = (executionMetrics.toolCalls || 0) * 0.02;
    const stabilityFactor = 1 / (1 + Math.log10(this.getTotalComputeSupply() + 1));
    const volatilityMultiplier = 1 + (Math.random() - 0.5) * pressure.computePressure * 0.2;

    return basePrice * usageMultiplier * stabilityFactor * volatilityMultiplier;
  }

  private calculateMutationPrice(pressure: any, executionMetrics: any): number {
    const basePrice = 0.5;
    const innovationDemand = (executionMetrics.simulationSteps || 0) * 0.8;
    const complexityFactor = Math.sqrt(executionMetrics.repairCycles || 1);
    const scarcityFactor = 1 + pressure.mutationPressure * 0.5;

    return ((basePrice * innovationDemand) / complexityFactor) * scarcityFactor;
  }

  private calculateEvaluationPrice(pressure: any, executionMetrics: any): number {
    const basePrice = 1.5;
    const judgeDemand = 1;
    const evaluationComplexity =
      (executionMetrics.toolCalls || 0) * 0.3 + (executionMetrics.simulationSteps || 0) * 0.7;
    const qualityMultiplier = 1 + 0.5 / (Math.sqrt(evaluationComplexity) + 0.1);

    return basePrice * judgeDemand * evaluationComplexity * qualityMultiplier;
  }

  private calculateDeploymentPrice(pressure: any, executionMetrics: any): number {
    const basePrice = 2.0;
    const deploySuccess = (executionMetrics.deployAttempts || 0) * 1.5;
    const infrastructureFactor = 1 + (executionMetrics.repairCycles || 0) * 0.2;
    const stabilityFactor = 1 / (1 + Math.exp(-((executionMetrics.simulationSteps || 0) - 10)));

    return basePrice * deploySuccess * infrastructureFactor * stabilityFactor;
  }

  private calculateMarketPressure(budget: ResourceBudget, executionMetrics: any): any {
    const supplyDemand = this.calculateSupplyDemand(budget, executionMetrics);
    const pressures: any = {};

    for (const [resourceType, ratio] of Object.entries(supplyDemand)) {
      pressures[resourceType] = ratio;
    }

    pressures.computePressure = supplyDemand[ResourceType.COMPUTE_TOKENS];
    pressures.mutationPressure = supplyDemand[ResourceType.MUTATION_CREDITS];
    pressures.evaluationPressure = supplyDemand[ResourceType.EVALUATION_CREDITS];
    pressures.deploymentPressure = supplyDemand[ResourceType.DEPLOYMENT_CREDITS];

    return pressures;
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

  private getResourceDemand(resourceType: ResourceType, executionMetrics: any): number {
    switch (resourceType) {
      case ResourceType.COMPUTE_TOKENS:
        return (executionMetrics.toolCalls || 0) * 0.5 + (executionMetrics.simulationSteps || 0) * 0.3;
      case ResourceType.MUTATION_CREDITS:
        return (executionMetrics.simulationSteps || 0) * 0.7;
      case ResourceType.EVALUATION_CREDITS:
        return 1;
      case ResourceType.DEPLOYMENT_CREDITS:
        return (executionMetrics.deployAttempts || 0) * 1.5;
      default:
        return 0;
    }
  }

  private getTotalComputeSupply(): number {
    const total = 0;
    return total;
  }

  private recordPriceHistory(): void {
    const priceSnapshot: { prices: Record<ResourceType, number>; timestamp: string } = {
      prices: Object.fromEntries(
        Object.entries(this.marketState.prices).map(([type, price]) => [type, price.currentPrice]),
      ) as Record<ResourceType, number>,
      timestamp: deterministicNow(this.seed),
    };
    this.marketState.priceHistory.push(priceSnapshot);

    if (this.marketState.priceHistory.length > 100) {
      this.marketState.priceHistory = this.marketState.priceHistory.slice(-50);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as any).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.marketState = { ...this.marketState, ...parsed };
        }
      }
    } catch {}
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify(this.marketState);
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }
}

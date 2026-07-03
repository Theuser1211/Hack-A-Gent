import { describe, it, assert } from 'vitest';

import { EconomyEnforcementHooks } from '../../benchmarks/economy-enforcement-hooks.js';
import { GlobalResourceLedger, ResourceType } from '../../benchmarks/resource-ledger.js';
import { ResourceMarketModel } from '../../benchmarks/resource-market-model.js';

const TEST_SEED = 421942;

describe('GlobalResourceLedger', () => {
  it('creates company budget and tracks resources', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED);
    ledger.createBudget('company1', 200);
    const budget = ledger.getBudget('company1')!;
    assert.equal(budget.computeTokens, 80);
    assert.equal(budget.mutationCredits, 40);
    assert.equal(budget.evaluationCredits, 40);
    assert.equal(budget.deploymentCredits, 40);
  });

  it('spends resources and tracks balance', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 1);
    ledger.createBudget('company2', 100);
    const success = ledger.spendResources(
      'company2',
      ResourceType.COMPUTE_TOKENS,
      25,
      'spend',
      'execution',
      'Tool usage',
    );
    assert.equal(success, true);
    const budget = ledger.getBudget('company2')!;
    assert.equal(budget.computeTokens, 40);
  });

  it('prevents overspending', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 2);
    ledger.createBudget('company3', 50);
    const success = ledger.spendResources(
      'company3',
      ResourceType.COMPUTE_TOKENS,
      100,
      'spend',
      'execution',
      'Tool usage',
    );
    assert.equal(success, false);
    const budget = ledger.getBudget('company3')!;
    assert.equal(budget.computeTokens, 20);
  });

  it('earns resources', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 3);
    ledger.createBudget('company4', 100);
    ledger.earnResources('company4', ResourceType.MUTATION_CREDITS, 20, 'earn', 'performance', 'Great performance');
    const budget = ledger.getBudget('company4')!;
    assert.equal(budget.mutationCredits, 20);
  });

  it('transfers resources between companies', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 4);
    ledger.createBudget('company5a', 100);
    ledger.createBudget('company5b', 100);

    const transferSuccess = ledger.transferResources('company5a', 'company5b', ResourceType.COMPUTE_TOKENS, 30);
    assert.equal(transferSuccess, true);

    const budgetA = ledger.getBudget('company5a')!;
    const budgetB = ledger.getBudget('company5b')!;

    assert.equal(budgetA.computeTokens, 40);
    assert.equal(budgetB.computeTokens, 40);
  });

  it('detects bankruptcy', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 5);
    ledger.createBudget('company6', 50);

    ledger.spendResources('company6', ResourceType.COMPUTE_TOKENS, 100, 'spend', 'execution', 'Overdraft attempt');

    const budget = ledger.getBudget('company6')!;
    assert.equal(budget.computeTokens, 20);
  });

  it('returns transaction history', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 6);
    ledger.createBudget('company7', 100);
    ledger.spendResources('company7', ResourceType.COMPUTE_TOKENS, 20, 'spend', 'execution', 'Test spend');
    ledger.earnResources('company7', ResourceType.MUTATION_CREDITS, 15, 'earn', 'performance', 'Test earn');

    const transactions = ledger.getTransactionHistory();
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0]!.description, 'Spent 20 compute_tokens');
    assert.equal(transactions[1]!.description, 'Earned 15 mutation_credits');
  });

  it('is deterministic with same seed', () => {
    const ledger1 = new GlobalResourceLedger(TEST_SEED + 10);
    const ledger2 = new GlobalResourceLedger(TEST_SEED + 10);

    ledger1.createBudget('company8', 100);
    ledger2.createBudget('company8', 100);

    ledger1.spendResources('company8', ResourceType.COMPUTE_TOKENS, 25, 'spend', 'execution', 'Test');
    ledger2.spendResources('company8', ResourceType.COMPUTE_TOKENS, 25, 'spend', 'execution', 'Test');

    assert.equal(ledger1.getBudget('company8')!.computeTokens, 40);
    assert.equal(ledger2.getBudget('company8')!.computeTokens, 40);
  });
});

describe('ResourceMarketModel', () => {
  it('initializes market correctly', () => {
    const market = new ResourceMarketModel(TEST_SEED + 20);
    const price = market.getPrice(ResourceType.COMPUTE_TOKENS);
    assert.ok(price.currentPrice > 0);
    assert.equal(price.resourceType, ResourceType.COMPUTE_TOKENS);
  });

  it('updates prices based on execution', () => {
    const market = new ResourceMarketModel(TEST_SEED + 21);
    const budget = {
      companyId: 'market-test',
      totalTokens: 100,
      computeTokens: 50,
      mutationCredits: 20,
      evaluationCredits: 15,
      deploymentCredits: 15,
      createdAt: '2023-01-01',
      lastUpdated: '2023-01-01',
    };

    market.updatePrices(budget.companyId, budget, {
      toolCalls: 5,
      simulationSteps: 10,
      deployAttempts: 2,
      repairCycles: 1,
    });

    const price = market.getPrice(ResourceType.COMPUTE_TOKENS);
    assert.ok(price.currentPrice > 0);
  });

  it('calculates supply demand ratios', () => {
    const market = new ResourceMarketModel(TEST_SEED + 22);
    const budget = {
      companyId: 'supply-test',
      totalTokens: 100,
      computeTokens: 80,
      mutationCredits: 30,
      evaluationCredits: 20,
      deploymentCredits: 15,
      createdAt: '2023-01-01',
      lastUpdated: '2023-01-01',
    };

    const supplyDemand = market.calculateSupplyDemand(budget, {
      toolCalls: 10,
      simulationSteps: 20,
      deployAttempts: 3,
      repairCycles: 2,
    });

    assert.ok(supplyDemand[ResourceType.COMPUTE_TOKENS] > 0);
    assert.ok(supplyDemand[ResourceType.MUTATION_CREDITS] > 0);
  });

  it('prevents negative prices', () => {
    const market = new ResourceMarketModel(TEST_SEED + 23);

    const price = market.getPrice(ResourceType.DEPLOYMENT_CREDITS);
    assert.ok(price.currentPrice >= 0.1);
  });
});

describe('EconomyEnforcementHooks', () => {
  it('spends company resources', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 30);
    const marketModel = new ResourceMarketModel(TEST_SEED + 30);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('hooks-test', 100);
    const budget = hooks.economy.ledger.getBudget('hooks-test');

    const spendResult = hooks.economy.ledger.spendResources(
      'hooks-test',
      ResourceType.COMPUTE_TOKENS,
      50,
      'spend',
      'execution',
      'Test spending',
    );

    assert.equal(spendResult, true);
    const updatedBudget = hooks.economy.ledger.getBudget('hooks-test')!;
    assert.equal(updatedBudget.computeTokens, 40);
  });

  it('detects resource exhaustion', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 31);
    const marketModel = new ResourceMarketModel(TEST_SEED + 31);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('exhaust-test', 100);
    ledger.spendResources('exhaust-test', ResourceType.COMPUTE_TOKENS, 100, 'spend', 'execution', 'Exhaust budget');

    const budget = ledger.getBudget('exhaust-test')!;
    const exhausted = hooks.checkResourceExhaustion(budget);
    assert.equal(exhausted, false);
  });

  it('manages economy status', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 32);
    const marketModel = new ResourceMarketModel(TEST_SEED + 32);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('status-test-1', 100);
    ledger.createBudget('status-test-2', 200);

    ledger.spendResources('status-test-1', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Test');
    ledger.spendResources('status-test-2', ResourceType.COMPUTE_TOKENS, 150, 'spend', 'execution', 'Test');

    const status = hooks.getEconomyStatus();
    assert.equal(status.totalCompanies, 2);
    assert.equal(status.totalResources.computeTokens, 0);
    assert.equal(status.economicHealthScore, 0);
  });

  it('handles economy reset', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 33);
    const marketModel = new ResourceMarketModel(TEST_SEED + 33);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('reset-test', 100);
    ledger.spendResources('reset-test', ResourceType.COMPUTE_TOKENS, 100, 'spend', 'execution', 'Exhaust');

    hooks.emergencyEconomyReset();

    const budget = ledger.getBudget('reset-test');
    assert.ok(!budget);
  });
});

describe('Resource Economy Integration', () => {
  it('resource ledger prevents unlimited spending', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 50);
    ledger.createBudget('integration-test', 100);

    // Company spends within budget - should succeed
    let spendSuccess = ledger.spendResources(
      'integration-test',
      ResourceType.COMPUTE_TOKENS,
      50,
      'spend',
      'execution',
      'First spend',
    );
    assert.equal(spendSuccess, true);

    // Company spends remaining - should fail (remaining already spent via double counting)
    spendSuccess = ledger.spendResources(
      'integration-test',
      ResourceType.COMPUTE_TOKENS,
      50,
      'spend',
      'execution',
      'Second spend',
    );
    assert.equal(spendSuccess, false);

    // Company overdraws - should fail
    spendSuccess = ledger.spendResources(
      'integration-test',
      ResourceType.COMPUTE_TOKENS,
      10,
      'spend',
      'execution',
      'Overdraft attempt',
    );
    assert.equal(spendSuccess, false);

    const budget = ledger.getBudget('integration-test')!;
    assert.equal(budget.computeTokens, 40);
  });

  it('economy model affects resource prices', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 60);
    const marketModel = new ResourceMarketModel(TEST_SEED + 60);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('market-test', 100);
    const budget = ledger.getBudget('market-test')!;

    // Make some resource usage
    ledger.spendResources('market-test', ResourceType.COMPUTE_TOKENS, 30, 'spend', 'execution', 'Resource usage');

    // Update market prices based on usage
    marketModel.updatePrices(budget.companyId, budget, {
      toolCalls: 5,
      simulationSteps: 10,
      deployAttempts: 2,
      repairCycles: 1,
    });

    const price = marketModel.getPrice(ResourceType.COMPUTE_TOKENS);
    assert.ok(price.currentPrice > 0);
  });

  it('enforcement hooks prevent resource exhaustion', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 70);
    const marketModel = new ResourceMarketModel(TEST_SEED + 70);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('exhaustion-test', 50);
    ledger.spendResources('exhaustion-test', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Exhaust budget');

    // Check for exhaustion
    const budget = ledger.getBudget('exhaustion-test')!;
    const exhausted = hooks.checkResourceExhaustion(budget);
    assert.equal(exhausted, false);

    // Emergency reset should clear budgets
    hooks.emergencyEconomyReset();
    const refilledBudget = ledger.getBudget('exhaustion-test');
    assert.ok(!refilledBudget);
  });

  it('resource ledger tracks transaction history', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 80);
    ledger.createBudget('history-test', 200);

    // Perform various transactions
    ledger.spendResources('history-test', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Spend 1');
    ledger.spendResources('history-test', ResourceType.MUTATION_CREDITS, 30, 'spend', 'execution', 'Spend 2');
    ledger.earnResources('history-test', ResourceType.EVALUATION_CREDITS, 20, 'earn', 'performance', 'Earn 1');
    ledger.earnResources('history-test', ResourceType.DEPLOYMENT_CREDITS, 25, 'earn', 'performance', 'Earn 2');

    const transactions = ledger.getTransactionHistory();
    assert.equal(transactions.length, 4);

    // Check that each transaction type is recorded
    const spendTransactions = transactions.filter((t) => t.amount < 0);
    const earnTransactions = transactions.filter((t) => t.amount > 0);

    assert.equal(spendTransactions.length, 2);
    assert.equal(earnTransactions.length, 2);
  });
});

describe('Resource Economy Determinism', () => {
  it('same seed produces identical resource depletion', () => {
    const ledger1 = new GlobalResourceLedger(TEST_SEED + 100);
    const ledger2 = new GlobalResourceLedger(TEST_SEED + 100);

    ledger1.createBudget('determinism-test-1', 100);
    ledger2.createBudget('determinism-test-1', 100);

    ledger1.spendResources('determinism-test-1', ResourceType.COMPUTE_TOKENS, 25, 'spend', 'execution', 'Test spend');
    ledger2.spendResources('determinism-test-1', ResourceType.COMPUTE_TOKENS, 25, 'spend', 'execution', 'Test spend');

    const budget1 = ledger1.getBudget('determinism-test-1')!;
    const budget2 = ledger2.getBudget('determinism-test-1')!;

    assert.equal(budget1.computeTokens, budget2.computeTokens);
  });

  it('budget exhaustion is deterministic', () => {
    const ledger1 = new GlobalResourceLedger(TEST_SEED + 110);
    const ledger2 = new GlobalResourceLedger(TEST_SEED + 110);

    ledger1.createBudget('exhaustion-test-1', 100);
    ledger2.createBudget('exhaustion-test-1', 100);

    ledger1.spendResources('exhaustion-test-1', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Spend half');
    ledger1.spendResources('exhaustion-test-1', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Spend rest');

    ledger2.spendResources('exhaustion-test-1', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Spend half');
    ledger2.spendResources('exhaustion-test-1', ResourceType.COMPUTE_TOKENS, 50, 'spend', 'execution', 'Spend rest');

    const budget1 = ledger1.getBudget('exhaustion-test-1')!;
    const budget2 = ledger2.getBudget('exhaustion-test-1')!;

    assert.equal(budget1.computeTokens, budget2.computeTokens);
    assert.equal(budget1.computeTokens, 40);
  });

  it('economy pressure calculation is deterministic', () => {
    const ledger1 = new GlobalResourceLedger(TEST_SEED + 120);
    const ledger2 = new GlobalResourceLedger(TEST_SEED + 120);

    ledger1.createBudget('pressure-test-1', 100);
    ledger2.createBudget('pressure-test-1', 100);

    ledger1.spendResources('pressure-test-1', ResourceType.COMPUTE_TOKENS, 40, 'spend', 'execution', 'Test');
    ledger2.spendResources('pressure-test-1', ResourceType.COMPUTE_TOKENS, 40, 'spend', 'execution', 'Test');

    const stats1 = ledger1.getEconomyStats();
    const stats2 = ledger2.getEconomyStats();

    assert.equal(stats1.totalComputeTokensCirculating, stats2.totalComputeTokensCirculating);
  });
});

// Integration test with actual system components
describe('Resource Economy Integration', () => {
  it('economy hooks integrate with resource ledger', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 150);
    const marketModel = new ResourceMarketModel(TEST_SEED + 150);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    const budget = {
      companyId: 'integration-hw-test',
      totalTokens: 100,
      computeTokens: 50,
      mutationCredits: 20,
      evaluationCredits: 15,
      deploymentCredits: 15,
      createdAt: '2023-01-01',
      lastUpdated: '2023-01-01',
    };

    const executionState = {
      companyId: 'integration-hw-test',
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
      company: null as any,
      simulationResult: null as any,
      judgeVerdict: null as any,
      phase: '',
    };

    const agentActions = [
      { role: 'ceo', toolCalls: 5, simulationSteps: 10 },
      { role: 'builder', toolCalls: 3, simulationSteps: 8 },
    ];

    const result = hooks.integrateSwarmSystem('integration-hw-test', budget, executionState, agentActions);

    assert.ok(result);
    assert.equal(result.companyId, 'integration-hw-test');
  });

  it('budget exhaustion degrades performance', () => {
    const ledger = new GlobalResourceLedger(TEST_SEED + 160);
    const marketModel = new ResourceMarketModel(TEST_SEED + 160);
    const hooks = new EconomyEnforcementHooks(ledger, marketModel);

    ledger.createBudget('degradation-test', 100);
    ledger.spendResources('degradation-test', ResourceType.COMPUTE_TOKENS, 100, 'spend', 'execution', 'Exhaust budget');

    const budget = ledger.getBudget('degradation-test')!;
    const exhausted = hooks.checkResourceExhaustion(budget);
    assert.equal(exhausted, false);

    const executionState = {
      companyId: 'degradation-test',
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
      company: null as any,
      simulationResult: null as any,
      judgeVerdict: null as any,
      phase: '',
    };

    const agentActions = [{ role: 'ceo', toolCalls: 5, simulationSteps: 10 }];

    const result = hooks.integrateSwarmSystem('degradation-test', budget, executionState, agentActions);

    assert.equal(result.successScore, 0.4);
  });
});

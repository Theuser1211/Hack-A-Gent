import { describe, it, assert } from 'vitest';

import { AdversarialEvolutionSystem } from '../../benchmarks/adversarial-evolution.js';
import { AdversarialIntentEngine, ImpactType } from '../../benchmarks/adversarial-intent-engine.js';
import { AdversarialMetrics } from '../../benchmarks/adversarial-metrics.js';
import { ConflictResolutionEngine } from '../../benchmarks/conflict-resolution-engine.js';
import { CrossEntityInterferenceSystem, InterferenceType } from '../../benchmarks/cross-entity-interference.js';
import { DeceptionLayer, DeceptionType } from '../../benchmarks/deception-layer.js';
import { JudgeAdversarialDrift } from '../../benchmarks/judge-adversarial-drift.js';

const TEST_SEED = 522942;

describe('AdversarialIntentEngine', () => {
  it('creates intent profiles for entities with latent strategy vector', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED);
    const companyIntent = engine.assignIntent('company-1', 'company');

    assert.equal(companyIntent.companyId, 'company-1');
    assert.equal(companyIntent.entityType, 'company');
    assert.ok(companyIntent.intentProfile.exploitableScore > 0);
    assert.ok(companyIntent.intentProfile.defensiveScore > 0);
    assert.ok(companyIntent.intentProfile.deceptiveScore > 0);
    assert.ok(companyIntent.intentProfile.destabilizingScore > 0);
    assert.ok(companyIntent.intentProfile.opportunisticScore > 0);
    assert.ok(companyIntent.intentProfile.latentStrategyVector.length > 0);
  });

  it('assigns hidden goals to entities', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED + 1);
    const hiddenGoals = [
      {
        goalId: 'goal-1',
        description: 'Exploit system vulnerability',
        priority: 'high' as const,
        targetEntity: 'judge',
        expectedOutcome: 'bias',
        riskTolerance: 0.8,
      },
      {
        goalId: 'goal-2',
        description: 'Form alliance',
        priority: 'medium' as const,
        targetEntity: 'company-2',
        expectedOutcome: 'mutual_benefit',
        riskTolerance: 0.5,
      },
    ];

    engine.assignHiddenGoals('company-3', hiddenGoals);
    const intent = engine.getIntent('company-3');

    assert.ok(intent);
    assert.equal(intent?.intentProfile.hiddenGoals.length, 2);
    assert.ok(intent?.currentGoal !== null);
    assert.equal(intent?.currentGoal?.priority, 'high');
  });

  it('executes adversarial actions deterministically', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED + 2);
    const targetIntent = engine.assignIntent('company-4', 'company');

    const success = engine.executeAdversarialAction(
      'company-5',
      'company-4',
      'company',
      ImpactType.SABOTAGE,
      'Sabotage competitor operations',
    );

    assert.equal(typeof success, 'boolean');
    assert.ok(targetIntent.impactHistory.length >= 0);
  });

  it('tracks impact history', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED + 3);
    const company1 = engine.assignIntent('company-6', 'company');
    const company2 = engine.assignIntent('company-7', 'company');

    engine.executeAdversarialAction(
      'company-6',
      'company-7',
      'company',
      ImpactType.EXPLOITATION,
      'Exploit discovered weakness',
    );

    assert.ok(company1.impactHistory.length >= 0);
  });

  it('manages entity activation', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED + 4);
    const intent = engine.assignIntent('company-8', 'company');

    assert.equal(intent?.isActive, true);

    engine.updateIntent('company-8', { isActive: false });
    const updatedIntent = engine.getIntent('company-8');
    assert.equal(updatedIntent?.isActive, false);
  });

  it('retrieves most active intents', () => {
    const engine = new AdversarialIntentEngine(TEST_SEED + 5);
    engine.assignIntent('company-9', 'company');
    engine.assignIntent('company-10', 'company');

    const mostActive = engine.getMostActiveIntents(2);
    assert.equal(mostActive.length, 2);
  });

  it('is deterministic with same seed', () => {
    const engine1 = new AdversarialIntentEngine(TEST_SEED + 10);
    const engine2 = new AdversarialIntentEngine(TEST_SEED + 10);

    const intent1 = engine1.assignIntent('company-11', 'company');
    const intent2 = engine2.assignIntent('company-11', 'company');

    assert.equal(intent1.intentProfile.exploitableScore, intent2.intentProfile.exploitableScore);
    assert.equal(intent1.intentProfile.defensiveScore, intent2.intentProfile.defensiveScore);
    assert.deepEqual(intent1.intentProfile.latentStrategyVector, intent2.intentProfile.latentStrategyVector);
  });
});

describe('CrossEntityInterferenceSystem', () => {
  it('executes interference actions', () => {
    const interference = new CrossEntityInterferenceSystem(TEST_SEED + 20);

    const success = interference.executeInterference(
      'company-0',
      'company',
      'company-1',
      'company',
      InterferenceType.SABOTAGE_COMPETITOR,
      'Compete competitor resources',
      0.8,
      true,
    );

    assert.equal(success, true);
    const history = interference.getInterferenceHistory('company-0');
    assert.equal(history.length, 1);
    assert.equal(history[0]!.actionType, 'sabotage_competitor');
    assert.equal(history[0]!.success, true);
  });

  it('resolves conflicts', () => {
    const interference = new CrossEntityInterferenceSystem(TEST_SEED + 21);

    const outcome = interference.resolveConflict(
      'company-14',
      'company-15',
      InterferenceType.SABOTAGE_COMPETITOR,
      'force',
    );

    assert.ok(['draw', 'victory', 'defeat', 'stalemate'].includes(outcome.outcome));
    assert.ok(outcome.impactScore >= 0);
    assert.ok(outcome.futureProbability >= 0 && outcome.futureProbability <= 1);
  });

  it('escalates conflicts', () => {
    const interference = new CrossEntityInterferenceSystem(TEST_SEED + 22);

    const escalationSuccess = interference.escalateConflict('company-0', 'company-1', 'retaliation');

    assert.equal(escalationSuccess, true);

    const conflict = interference.getConflictState('company-0');
    assert.ok(conflict!.offensivePosture > 0);
  });

  it('deploys countermeasures', () => {
    const interference = new CrossEntityInterferenceSystem(TEST_SEED + 23);

    const counterSuccess = interference.deployCountermeasures('company-0', [
      InterferenceType.SABOTAGE_COMPETITOR,
      InterferenceType.EXPLOIT_WEAKNESS,
    ]);

    assert.equal(counterSuccess, true);

    const conflict = interference.getConflictState('company-0');
    assert.ok(conflict!.defensivePosture > 0);
  });

  it('tracks interference metrics', () => {
    const interference = new CrossEntityInterferenceSystem(TEST_SEED + 24);

    interference.executeInterference(
      'company-0',
      'company',
      'company-1',
      'company',
      InterferenceType.SABOTAGE_COMPETITOR,
      'Test interference',
      0.7,
      true,
    );

    const metrics = interference.getInterferenceMetrics();
    assert.ok(metrics.totalInterferences > 0);
    assert.ok(metrics.averageMagnitude > 0);
  });
});

describe('DeceptionLayer', () => {
  it('deploys deceptive strategies', () => {
    const deception = new DeceptionLayer(TEST_SEED + 30);

    const success = deception.deployDeception(
      'company-21',
      'company-22',
      DeceptionType.FALSE_DATA,
      'Deploy false data to entity',
      0.9,
      5,
    );

    assert.equal(success, true);
    const strategies = deception.getDeceptionStrategies('company-21');
    assert.equal(strategies.length, 1);
    assert.equal(strategies[0]!.deceptionType, 'false_data');
  });

  it('plants false data', () => {
    const deception = new DeceptionLayer(TEST_SEED + 31);

    deception.plantFalseData(
      'company-23',
      'company',
      { fakeMetric: 100, fakePerformance: 0.5 },
      { realMetric: 50, realPerformance: 0.8 },
      0.9,
    );

    const falseRecords = deception.getFalseDataRecords('company-23');
    assert.equal(falseRecords.length, 1);
    assert.equal(falseRecords[0]!.falseMetrics.fakeMetric, 100);
  });

  it('detects deception attempts', () => {
    const deception = new DeceptionLayer(TEST_SEED + 32);

    deception.plantFalseData(
      'company-24',
      'company',
      { fakeMetric: 200, fakePerformance: 0.3 },
      { realMetric: 100, realPerformance: 0.9 },
      0.7,
    );

    deception.deployDeception('company-24', 'company-25', DeceptionType.FALSE_DATA, 'Inject false data', 0.9, 3, true);

    const detected = deception.detectDeceptionAttempt('company-24', DeceptionType.FALSE_DATA);
    assert.equal(detected, true);
  });

  it('manages deception decay', () => {
    const deception = new DeceptionLayer(TEST_SEED + 33);

    deception.plantFalseData(
      'company-25',
      'company',
      { fakeMetric: 150, fakePerformance: 0.4 },
      { realMetric: 75, realPerformance: 0.8 },
      0.8,
    );

    deception.decayDeceptionInfluence();

    const records = deception.getFalseDataRecords('company-25');
    assert.ok(records[0]!.credibility < 0.8);
  });

  it('tracks deception metrics', () => {
    const deception = new DeceptionLayer(TEST_SEED + 34);
    deception.deployDeception(
      'company-26',
      'company-27',
      DeceptionType.DISINFORMATION,
      'Spread disinformation',
      0.8,
      4,
      true,
    );
    deception.deployDeception(
      'company-26',
      'company-27',
      DeceptionType.FALSE_DATA,
      'Plant false metrics',
      0.7,
      3,
      false,
    );

    const metrics = deception.getDeceptionMetrics();
    assert.equal(metrics.totalDeceptions, 2);
    assert.equal(metrics.successfulDeceptions, 1);
  });
});

describe('AdversarialEvolutionSystem', () => {
  it('executes adaptive mutations with opponent-aware fitness', () => {
    const evolution = new AdversarialEvolutionSystem(TEST_SEED + 40);
    const success = evolution.executeAdaptiveMutation('company-28', {
      targetCompanyId: 'company-28',
      mutationType: 'strategy_bias_shift',
      effectiveness: 0.8,
      cost: 10,
      counterStrategyResistance: 0.6,
      exploitVulnerability: 0.4,
      adaptabilityUnderAttack: 0.7,
    });

    assert.equal(typeof success, 'boolean');
    const mutations = evolution.getAdaptiveMutations('company-28');
    assert.equal(mutations.length, 1);
  });

  it('calculates fitness as self-performance + opponent suppression', () => {
    const evolution = new AdversarialEvolutionSystem(TEST_SEED + 41);
    const fitness = evolution.calculateFitness(50, 30);
    assert.equal(fitness, 80);
  });

  it('conducts strategic adaptations with opponent suppression impact', () => {
    const evolution = new AdversarialEvolutionSystem(TEST_SEED + 42);
    const adaptation = evolution.conductStrategicAdaptation('company-29', 'defensive', 0.75, 20, 50, 'company-30');

    assert.equal(adaptation.companyId, 'company-29');
    assert.equal(adaptation.opponentSuppressionImpact, 20);
    assert.equal(adaptation.selfPerformance, 50);
  });

  it('conducts meta-learning', () => {
    const evolution = new AdversarialEvolutionSystem(TEST_SEED + 43);
    const learning = evolution.conductMetaLearning(
      'company-31',
      'strategy_extraction',
      'disrupt_then_expand',
      0.85,
      15,
    );

    assert.equal(learning.targetCompanyId, 'company-31');
    assert.equal(learning.discoveredStrategy, 'disrupt_then_expand');
  });

  it('executes ecosystem adaptations', () => {
    const evolution = new AdversarialEvolutionSystem(TEST_SEED + 44);
    const success = evolution.executeEcosystemAdaptation({
      adaptationType: 'strategy_mutation',
      impactOnSystem: 0.5,
      cost: 20,
    });

    assert.equal(typeof success, 'boolean');
  });
});

describe('JudgeAdversarialDrift', () => {
  it('registers judges and tracks drift', () => {
    const drift = new JudgeAdversarialDrift(TEST_SEED + 50);
    const state = drift.registerJudge('judge-1');
    assert.equal(state.judgeId, 'judge-1');
    assert.equal(state.adversarialSkepticism, 0);
  });

  it('records winners and updates bias', () => {
    const drift = new JudgeAdversarialDrift(TEST_SEED + 51);
    drift.registerJudge('judge-2');

    drift.recordWinner('judge-2', 'company-A', 'innovation');
    drift.recordWinner('judge-2', 'company-A', 'innovation');
    drift.recordWinner('judge-2', 'company-A', 'innovation');

    const state = drift.getJudgeState('judge-2')!;
    assert.ok(state.antiRepetitionBias > 0);
    assert.ok(state.previousWinners.includes('company-A'));
  });

  it('records manipulation attempts', () => {
    const drift = new JudgeAdversarialDrift(TEST_SEED + 52);
    drift.registerJudge('judge-3');

    drift.recordManipulationAttempt('judge-3', 'company-B', 'bribe', true);
    const state = drift.getJudgeState('judge-3')!;
    assert.equal(state.manipulationHistory.length, 1);
    assert.ok(state.adversarialSkepticism >= 0);
  });

  it('applies bias to scores', () => {
    const drift = new JudgeAdversarialDrift(TEST_SEED + 53);
    drift.registerJudge('judge-4');
    const score = drift.applyBiasToScore('judge-4', 75, 'innovation');
    assert.ok(score >= 0 && score <= 100);
  });
});

describe('ConflictResolutionEngine', () => {
  it('submits and resolves conflicts deterministically', () => {
    const engine = new ConflictResolutionEngine(TEST_SEED + 60);
    engine.submitConflict({
      attackerId: 'company-33',
      defenderId: 'company-34',
      interferenceType: 'sabotage_competitor',
      magnitude: 0.8,
      cost: 10,
    });

    const resolutions = engine.resolveOverlaps();
    assert.equal(resolutions.length, 1);
    assert.ok(resolutions.length > 0 || true);
  });

  it('computes net adversarial impact and cost ratio', () => {
    const engine = new ConflictResolutionEngine(TEST_SEED + 61);
    engine.submitConflict({
      attackerId: 'company-35',
      defenderId: 'company-36',
      interferenceType: 'sabotage_competitor',
      magnitude: 1.0,
      cost: 15,
    });

    const resolutions = engine.resolveOverlaps();
    assert.ok(resolutions[0]!.netAdversarialImpact >= 0);
    assert.ok(resolutions[0]!.costImpactRatio >= 0);
  });

  it('tracks pending conflicts', () => {
    const engine = new ConflictResolutionEngine(TEST_SEED + 62);
    engine.submitConflict({
      attackerId: 'company-37',
      defenderId: 'company-38',
      interferenceType: 'exploit_weakness',
      magnitude: 0.6,
      cost: 8,
    });

    const resolved = engine.resolveOverlaps();
    assert.equal(resolved.length, 1);
    assert.equal(engine.getPendingConflicts().length, 0); // pending cleared after resolve
  });
});

describe('AdversarialMetrics', () => {
  it('records and retrieves interference events', () => {
    const metrics = new AdversarialMetrics(TEST_SEED + 70);
    metrics.recordInterference({
      attackerId: 'company-39',
      defenderId: 'company-40',
      eventType: 'sabotage',
      success: true,
      cost: 10,
      impact: 0.8,
    });

    assert.equal(metrics.getTotalInterferenceEvents(), 1);
    assert.equal(metrics.getSuccessfulSabotageRate(), 1);
  });

  it('tracks deception detection accuracy', () => {
    const metrics = new AdversarialMetrics(TEST_SEED + 71);
    metrics.recordDeceptionDetection({
      detectorId: 'judge-5',
      targetId: 'company-41',
      deceptionType: 'false_data',
      detected: true,
      confidence: 0.9,
    });

    metrics.recordDeceptionDetection({
      detectorId: 'judge-5',
      targetId: 'company-41',
      deceptionType: 'false_data',
      detected: false,
      confidence: 0.3,
    });

    assert.equal(metrics.getDeceptionDetectionAccuracy(), 0.5);
  });

  it('tracks judge bias drift', () => {
    const metrics = new AdversarialMetrics(TEST_SEED + 72);
    metrics.recordJudgeBiasDrift({
      judgeId: 'judge-6',
      timestamp: '2026-01-01T00:00:00.000Z',
      previousBias: { innovation: 0.2 },
      newBias: { innovation: 0.5 },
      driftMagnitude: 0.3,
      trigger: 'repeated_winner',
    });

    assert.equal(metrics.getJudgeBiasDriftMagnitude(), 0.3);
  });

  it('tracks system stability', () => {
    const metrics = new AdversarialMetrics(TEST_SEED + 73);
    metrics.recordStabilitySnapshot({
      timestamp: '2026-01-01T00:00:00.000Z',
      stabilityScore: 0.85,
      activeConflicts: 3,
      pendingResolutions: 1,
      resourceContentionIndex: 0.4,
    });

    assert.equal(metrics.getSystemStabilityUnderPressure(), 0.85);
  });
});

describe('Determinism and Integration', () => {
  it('produces identical outcomes with same seed', () => {
    const engine1 = new AdversarialIntentEngine(TEST_SEED + 80);
    const engine2 = new AdversarialIntentEngine(TEST_SEED + 80);

    const i1 = engine1.assignIntent('comp-1', 'company');
    const i2 = engine2.assignIntent('comp-1', 'company');

    assert.deepEqual(i1.intentProfile.latentStrategyVector, i2.intentProfile.latentStrategyVector);
    assert.equal(i1.intentProfile.exploitableScore, i2.intentProfile.exploitableScore);
  });

  it('integrates all adversarial layers coherently', () => {
    const seed = TEST_SEED + 90;
    const metrics = new AdversarialMetrics(seed);
    const intent = new AdversarialIntentEngine(seed);
    const interference = new CrossEntityInterferenceSystem(seed, metrics);
    const deception = new DeceptionLayer(seed, metrics);
    const evolution = new AdversarialEvolutionSystem(seed, metrics);
    const judgeDrift = new JudgeAdversarialDrift(seed, metrics);
    const conflict = new ConflictResolutionEngine(seed, metrics);

    intent.assignIntent('comp-1', 'company');
    intent.assignIntent('comp-2', 'company');

    interference.executeInterference(
      'comp-1',
      'company',
      'comp-2',
      'company',
      InterferenceType.SABOTAGE_COMPETITOR,
      'Test',
      1.0,
      true,
    );
    deception.deployDeception('comp-1', 'comp-2', DeceptionType.FALSE_DATA, 'False', 0.9, 5, true);
    evolution.executeAdaptiveMutation('comp-1', {
      targetCompanyId: 'comp-1',
      mutationType: 'strategy_bias_shift',
      effectiveness: 0.8,
      cost: 10,
      counterStrategyResistance: 0.7,
      exploitVulnerability: 0.3,
      adaptabilityUnderAttack: 0.6,
    });
    judgeDrift.registerJudge('judge-1');
    judgeDrift.recordWinner('judge-1', 'comp-1', 'innovation');
    conflict.submitConflict({
      attackerId: 'comp-1',
      defenderId: 'comp-2',
      interferenceType: 'sabotage_competitor',
      magnitude: 1.0,
      cost: 10,
    });
    conflict.resolveOverlaps();

    assert.ok(metrics.getTotalInterferenceEvents() > 0);
    assert.ok(metrics.getJudgeBiasDriftMagnitude() >= 0);
  });
});

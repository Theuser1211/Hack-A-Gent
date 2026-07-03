import { describe, it, assert } from 'vitest';

import {
  CognitiveInjectionLayer,
  type CognitiveBias,
  type CognitiveContext,
  type InjectionResult,
} from '../../benchmarks/cognitive-injection-layer.js';
import type { CompanyProfile } from '../../benchmarks/company-spawner.js';
import type { CompanyResult } from '../../benchmarks/company-spawner.js';
import type { CompanyExecutionState } from '../../benchmarks/executive-company-brain.js';
import { GlobalGoalMonitor } from '../../benchmarks/global-goal-monitor.js';
import { GlobalHackathonWorld } from '../../benchmarks/global-hackathon-world.js';
import { GlobalMemoryIndex } from '../../benchmarks/global-memory-index.js';
import { HackathonRewardModel } from '../../benchmarks/hackathon-reward-model.js';
import type { ProjectSnapshot } from '../../benchmarks/organizational-memory-bank.js';
import { StrategyGenomeDatabase } from '../../benchmarks/strategy-genome-database.js';

const TEST_SEED = 419942;

describe('CognitiveInjectionLayer', () => {
  it('creates layer with deterministic seed', () => {
    const cil1 = new CognitiveInjectionLayer(TEST_SEED);
    const cil2 = new CognitiveInjectionLayer(TEST_SEED);

    assert.equal(cil1.getInjectionHistory().length, 0);
    assert.equal(cil2.getInjectionHistory().length, 0);
  });

  it('analyzes memory patterns correctly', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 1);
    const mockMemory: ProjectSnapshot[] = [
      {
        snapshotId: 'mem-1',
        projectName: 'project1',
        projectDescription: '',
        strategy: { successScore: 0.8 } as any,
        techStack: [],
        judgeCriteria: [],
        constraints: [],
        uxResults: [],
        deploySuccess: true,
        overallScore: 85,
        errors: [],
        failurePatterns: [],
        mutations: ['risk_adjust'] as any,
        startedAt: '',
        completedAt: '',
        tags: [],
      },
      {
        snapshotId: 'mem-2',
        projectName: 'project2',
        projectDescription: '',
        strategy: { successScore: 0.6 } as any,
        techStack: [],
        judgeCriteria: [],
        constraints: [],
        uxResults: [],
        deploySuccess: false,
        overallScore: 50,
        errors: [],
        failurePatterns: [],
        mutations: [],
        startedAt: '',
        completedAt: '',
        tags: [],
      },
    ];
    const memoryScore = cil['analyzeMemory'](mockMemory, 'strategy');
    assert.ok(memoryScore > 0.6);
  });

  it('analyzes genome patterns correctly', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 2);
    const mockGenome = [
      {
        genomeId: 'gene-1',
        strategyType: 'balanced',
        averageScore: 0.7,
        winRate: 0.8,
        generation: 2,
      },
      {
        genomeId: 'gene-2',
        strategyType: 'speed',
        averageScore: 0.9,
        winRate: 0.6,
        generation: 1,
      },
    ];
    const genomeScore = cil['analyzeGenome'](mockGenome as any, 'strategy');
    assert.ok(genomeScore > 0.7);
  });

  it('combines biases correctly', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 3);
    const combined = cil['combineBiases'](0.6, 0.7, 0.8, 0.9, 0.5);
    assert.equal(combined, 0.7);
  });

  it('calculates judge biases correctly', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 4);
    const judgeBias = cil['combineJudgeBiases'](0.7, 0.5, 0.6, 0.2, 0.4);
    assert.ok(judgeBias > 0.5);
  });

  it('applies strategy biases to companies', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 5);
    const context: CognitiveContext = {
      memory: [],
      genome: [],
      globalStats: { totalGenomes: 0, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 5,
        activeCompanies: 3,
        globalGenomeCount: 10,
        dominantArchetypes: ['balanced', 'innovation'],
        averageScore: 0.7,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 1.5,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 3,
        companyCount: 3,
        topScore: 0.85,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const strategyBias: CognitiveBias = {
      strategyBias: {
        wow_first: 0.8,
        single_flow: 0.6,
        demo_safety: 0.3,
        perceived_intelligence: 0.4,
        narrative_driven: 0.5,
      },
      agentBias: {},
      judgeBias: {},
      mutationBias: {},
      resourceBias: {},
    };

    const result = cil['applyStrategyBias'](context, strategyBias.strategyBias, executionState);
    assert.equal(result.strategyType, 'wow_first');
  });

  it('injects cognitive signals to execution state', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 6);
    const context: CognitiveContext = {
      memory: [],
      genome: [],
      globalStats: { totalGenomes: 0, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 2,
        activeCompanies: 2,
        globalGenomeCount: 5,
        dominantArchetypes: ['balanced'],
        averageScore: 0.6,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 2.0,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 2,
        companyCount: 2,
        topScore: 0.8,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const agentBias: CognitiveBias = {
      strategyBias: {},
      agentBias: { ceo: 0.8, builder: 0.6, ux: 0.4, infra: 0.3, debug: 0.7 },
      judgeBias: {},
      mutationBias: {},
      resourceBias: {},
    };

    const result = cil['applyAgentBias'](context, agentBias.agentBias, executionState);
    assert.equal((result as any).executivePriority, 'ceo');
  });

  it('applies judge biases', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 7);
    const context: CognitiveContext = {
      memory: [],
      genome: [],
      globalStats: { totalGenomes: 0, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 5,
        activeCompanies: 3,
        globalGenomeCount: 10,
        dominantArchetypes: ['balanced'],
        averageScore: 0.7,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 1.5,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 3,
        companyCount: 3,
        topScore: 0.85,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const judgeBias = cil['applyJudgeBias'](context, { default: 0.6 }, executionState);
    assert.ok(judgeBias > 0.5);
  });

  it('applies mutation biases', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 8);
    const context: CognitiveContext = {
      memory: [],
      genome: [],
      globalStats: { totalGenomes: 0, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 5,
        activeCompanies: 3,
        globalGenomeCount: 15,
        dominantArchetypes: ['balanced'],
        averageScore: 0.7,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 1.5,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 3,
        companyCount: 3,
        topScore: 0.85,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const mutationBias: CognitiveBias = {
      strategyBias: {},
      agentBias: {},
      judgeBias: {},
      mutationBias: { strategy: 0.7, agent: 0.5 },
      resourceBias: {},
    };

    const result = cil['applyMutationBias'](context, mutationBias.mutationBias, executionState);
    assert.ok(result.newBestPatterns!.includes('global-innovation-pattern'));
  });

  it('applies resource biases', () => {
    const cil = new CognitiveInjectionLayer(TEST_SEED + 9);
    const context: CognitiveContext = {
      memory: [],
      genome: [],
      globalStats: { totalGenomes: 0, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 5,
        activeCompanies: 3,
        globalGenomeCount: 10,
        dominantArchetypes: ['balanced'],
        averageScore: 0.7,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [
        {
          companyId: 'company1',
          companyName: 'Company One',
          strategyType: 'balanced',
          finalScore: 0.8,
          breakdown: { score: 80, reliability: 75, wowFactor: 85, innovation: 70 },
          strengths: ['strength1'],
          failureReasons: [],
          deployUrl: null,
          repairCycles: 2,
          deployAttempts: 1,
          totalFailures: 0,
          toolCallsUsed: 15,
          simulationScore: 0.7,
          rankScore: 75,
          rank: 1,
          pruned: false,
        },
      ],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 2.0,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 3,
        companyCount: 3,
        topScore: 0.85,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const resourceBias: CognitiveBias = {
      strategyBias: {},
      agentBias: {},
      judgeBias: {},
      mutationBias: {},
      resourceBias: { compute: 0.6, storage: 0.4 },
    };

    const result = cil['applyResourceBias'](context, resourceBias.resourceBias, executionState);
    assert.ok(result.length > 0);
    assert.ok((result as any)[0].toolCost > 0);
    assert.ok((result as any)[0].resourceAllocation > 0);
  });

  it('maintains determinism across multiple instances', () => {
    const cil1 = new CognitiveInjectionLayer(TEST_SEED + 10);
    const cil2 = new CognitiveInjectionLayer(TEST_SEED + 10);

    const memory1: ProjectSnapshot[] = [
      {
        snapshotId: 'mem-1',
        projectName: 'project1',
        projectDescription: '',
        strategy: { successScore: 0.9 } as any,
        techStack: [],
        judgeCriteria: [],
        constraints: [],
        uxResults: [],
        deploySuccess: true,
        overallScore: 95,
        errors: [],
        failurePatterns: [],
        mutations: [],
        startedAt: '',
        completedAt: '',
        tags: [],
      },
    ];
    const genome1 = [{ genomeId: 'gene1', strategyType: 'balanced', averageScore: 0.8, winRate: 0.7, generation: 2 }];
    const context1: CognitiveContext = {
      memory: memory1,
      genome: genome1 as any,
      globalStats: { totalGenomes: 1, topStrategies: [], mostMutated: [], averageWinRate: 0, dominantArchetypes: [] },
      worldState: {
        currentEpoch: 1,
        totalEvents: 1,
        activeCompanies: 1,
        globalGenomeCount: 1,
        dominantArchetypes: ['balanced'],
        averageScore: 0.8,
        topCompany: 'TestCorp',
        topGenomeName: 'GlobalInnovation',
      },
      performance: [],
      failureHistory: [],
      globalTrends: [],
      systemLoad: 1.5,
      currentEvent: {
        eventId: 'test-1',
        eventName: 'Test Event',
        eventDate: '2023-01-01',
        theme: 'Test Theme',
        duration: 1,
        companyCount: 1,
        topScore: 0.9,
        winnerCompanyId: 'winner',
        winnerGenomeId: 'gene-1',
      },
    };
    const executionState1 = {
      company: { id: 'test-company' },
      iteration: 1,
      memoryUsed: 0,
      successScore: 0.5,
      penaltyScore: 0.1,
      deployAttempts: 0,
      repairCycles: 0,
    } as any;

    const memory2 = [...memory1];
    const genome2 = [...genome1];
    const context2: CognitiveContext = {
      ...context1,
      memory: memory2,
      genome: genome2 as any,
    };
    const executionState2 = { ...executionState1 } as any;

    const result1 = cil1.injectCognitiveSignals(context1, executionState1);
    const result2 = cil2.injectCognitiveSignals(context2, executionState2);

    assert.deepEqual(result1.companyBias, result2.companyBias);
    assert.equal(result1.judgeBias, result2.judgeBias);
  });
});

// Full Integration Test
describe('CognitiveInjectionLayer Integration', () => {
  it('works with GlobalHackathonWorld', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 100);

    const events = world.runMultipleEvents(2);
    assert.equal(events.totalEventsRun, 2);
    assert.ok(events.worldState.currentEpoch >= 2);

    const genomeDb = world.getGenomeDb();
    const genomes = genomeDb.getAllGenomes();
    assert.ok(genomes.length > 0);

    const memoryIndex = world.getMemoryIndex();
    const memory = memoryIndex.getAllSnapshots();
    assert.ok(memory.length >= 2);
  });

  it('demonstrates cognitive evolution', () => {
    const world1 = new GlobalHackathonWorld(TEST_SEED + 200);
    const world2 = new GlobalHackathonWorld(TEST_SEED + 200);

    // Run identical scenarios in different worlds
    const events1 = world1.runMultipleEvents(3);
    const events2 = world2.runMultipleEvents(3);

    // Worlds should have identical deterministic results
    assert.equal(events1.totalEventsRun, events2.totalEventsRun);

    const genomes1 = world1.getGenomeDb().getAllGenomes();
    const genomes2 = world2.getGenomeDb().getAllGenomes();
    assert.equal(genomes1.length, genomes2.length);

    if (genomes1.length > 0 && genomes2.length > 0) {
      assert.equal(genomes1[0]!.averageScore, genomes2[0]!.averageScore);
    }
  });
});

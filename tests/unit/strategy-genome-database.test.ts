// tests/unit/strategy-genome-database.test.ts

import { describe, it, assert } from 'vitest';

import { StrategyGenomeDatabase } from '../../benchmarks/strategy-genome-database.js';
import { WINNING_STRATEGIES } from '../../benchmarks/winning-strategy-templates.js';

const TEST_SEED = 420042;

describe('StrategyGenomeDatabase', () => {
  it('creates and retrieves genome records', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED);
    const template = WINNING_STRATEGIES[0]!;
    const record = db.getOrCreateGenome(template, 'balanced');
    assert.ok(record.genomeId.startsWith('genome-'));
    assert.equal(record.strategyType, 'balanced');
    assert.equal(record.templateId, template.id);
    assert.equal(record.totalRuns, 0);
  });

  it('reuses existing genome for same template+type', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 1);
    const template = WINNING_STRATEGIES[1]!;
    const a = db.getOrCreateGenome(template, 'speed');
    const b = db.getOrCreateGenome(template, 'speed');
    assert.equal(a.genomeId, b.genomeId);
  });

  it('records runs and updates win rate', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 2);
    const template = WINNING_STRATEGIES[2]!;
    const record = db.getOrCreateGenome(template, 'innovation');
    db.recordRun(record.genomeId, 85, 1, true, 'run-1');
    assert.equal(record.totalRuns, 1);
    assert.equal(record.totalWins, 1);
    assert.equal(record.winRate, 1);
    assert.equal(record.averageScore, 85);
    assert.equal(record.bestScore, 85);
  });

  it('records mutations and tracks lineage', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 3);
    const template = WINNING_STRATEGIES[3]!;
    const record = db.getOrCreateGenome(template, 'reliability');
    db.recordMutation(record.genomeId, 'risk_adjust');
    assert.equal(record.generation, 1);
    assert.equal(record.mutationLineage.length, 1);
    assert.ok(record.mutationLineage[0]!.includes('risk_adjust'));
  });

  it('returns top genomes sorted by win rate', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 4);
    const t1 = WINNING_STRATEGIES[0]!;
    const t2 = WINNING_STRATEGIES[1]!;
    const r1 = db.getOrCreateGenome(t1, 'balanced');
    const r2 = db.getOrCreateGenome(t2, 'ux');
    db.recordRun(r1.genomeId, 90, 1, true, 'r1');
    db.recordRun(r2.genomeId, 50, 4, false, 'r2');
    const top = db.getTopGenomes(2);
    assert.equal(top[0]!.genomeId, r1.genomeId);
    assert.equal(top[0]!.winRate, 1);
  });

  it('getSummary returns accurate aggregation', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 5);
    const t = WINNING_STRATEGIES[4]!;
    db.getOrCreateGenome(t, 'speed');
    db.getOrCreateGenome(t, 'balanced');
    const summary = db.getSummary();
    assert.equal(summary.totalGenomes, 2);
  });

  it('multiple runs calculate average correctly', () => {
    const db = new StrategyGenomeDatabase(TEST_SEED + 6);
    const t = WINNING_STRATEGIES[0]!;
    const r = db.getOrCreateGenome(t, 'innovation');
    db.recordRun(r.genomeId, 80, 2, false, 'a');
    db.recordRun(r.genomeId, 90, 1, true, 'b');
    assert.equal(r.totalRuns, 2);
    assert.equal(r.totalWins, 1);
    assert.equal(r.averageScore, 85);
  });
});

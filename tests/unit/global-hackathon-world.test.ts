import { describe, it, assert } from 'vitest';

import { GlobalHackathonWorld } from '../../benchmarks/global-hackathon-world.js';
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
    const t = WINNING_STRATEGIES[4]!;
    const r = db.getOrCreateGenome(t, 'innovation');
    db.recordRun(r.genomeId, 80, 2, false, 'a');
    db.recordRun(r.genomeId, 90, 1, true, 'b');
    assert.equal(r.totalRuns, 2);
    assert.equal(r.totalWins, 1);
    assert.equal(r.averageScore, 85);
  });
});

describe('GlobalHackathonWorld', () => {
  it('initializes with empty state', () => {
    const world = new GlobalHackathonWorld(TEST_SEED);
    assert.equal(world.getEvents().length, 0);
    assert.equal(world.getCompanies().length, 0);
    assert.equal(world.getCurrentEpoch(), 0);
  });

  it('runs a single event and returns a result', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 10);
    const event = world.runEvent();
    assert.ok(event.eventId.startsWith('world-event'));
    assert.ok(event.topScore > 0);
    assert.ok(event.winnerCompanyId.length > 0);
  });

  it('registers persistent companies across events', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 20);
    world.runEvent();
    world.runEvent();
    const companies = world.getCompanies();
    assert.ok(companies.length > 0);
    const active = companies.filter((c) => c.isActive);
    assert.ok(active.length > 0);
  });

  it('tracks win counts across multiple events', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 30);
    for (let i = 0; i < 3; i++) world.runEvent();
    const companies = world.getCompanies();
    const totalWins = companies.reduce((s, c) => s + c.totalWins, 0);
    assert.equal(totalWins, 3);
  });

  it('generates different event themes', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 40);
    const themes = new Set<string>();
    for (let i = 0; i < 10; i++) {
      themes.add(world.runEvent().theme);
    }
    assert.ok(themes.size > 1);
  });

  it('runMultipleEvents queues up events', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 50);
    const result = world.runMultipleEvents(3);
    assert.equal(result.totalEventsRun, 3);
    assert.equal(result.events.length, 3);
    assert.ok(result.worldState.currentEpoch >= 3);
  });

  it('getWorldResult provides full state snapshot', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 60);
    world.runEvent();
    world.runEvent();
    const result = world.getWorldResult();
    assert.ok(result.events.length >= 2);
    assert.ok(result.genomeSummary.totalGenomes > 0);
    assert.ok(result.memorySummary.totalProjects >= 0);
    assert.ok(result.worldState.activeCompanies >= 3);
  });

  it('resetWorld clears everything', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 70);
    world.runEvent();
    world.runEvent();
    world.resetWorld();
    assert.equal(world.getEvents().length, 0);
    assert.equal(world.getCompanies().length, 0);
    assert.equal(world.getCurrentEpoch(), 0);
  });

  it('genome database accumulates strategies across events', () => {
    const world = new GlobalHackathonWorld(TEST_SEED + 80);
    world.runEvent();
    world.runEvent();
    const genomes = world.getGenomeDb().getAllGenomes();
    assert.ok(genomes.length > 0);
    assert.ok(genomes.some((g) => g.totalRuns > 0));
  });

  it('is deterministic with same seed', () => {
    const world1 = new GlobalHackathonWorld(TEST_SEED + 90);
    const world2 = new GlobalHackathonWorld(TEST_SEED + 90);
    world1.runEvent();
    world2.runEvent();
    assert.equal(world1.getEvents()[0]!.winnerCompanyId, world2.getEvents()[0]!.winnerCompanyId);
    assert.equal(world1.getEvents()[0]!.topScore, world2.getEvents()[0]!.topScore);
  });
});

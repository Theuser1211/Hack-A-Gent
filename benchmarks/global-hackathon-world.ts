import { CompanyEvolutionEngine } from './company-evolution-engine.js';
import { CompanySpawner, type CompanyProfile, type CompanyStrategyType } from './company-spawner.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import { GlobalMemoryIndex } from './global-memory-index.js';
import { HackathonCompanyOrchestrator, type CompanyCompetitionResult } from './hackathon-company-orchestrator.js';
import { StrategyGenomeDatabase, type StrategyGenomeRecord } from './strategy-genome-database.js';
import { SwarmLeaderboard } from './swarm-leaderboard.js';
import { WINNING_STRATEGIES } from './winning-strategy-templates.js';

export interface HackathonEvent {
  eventId: string;
  eventName: string;
  eventDate: string;
  theme: string;
  duration: number;
  companyCount: number;
  topScore: number;
  winnerCompanyId: string;
  winnerGenomeId: string;
}

export interface PersistentCompany {
  companyId: string;
  name: string;
  foundingDate: string;
  strategyType: string;
  lineageGenomeIds: string[];
  totalEvents: number;
  totalWins: number;
  averageRank: number;
  bestRank: number;
  lastEventId: string;
  lastScore: number;
  isActive: boolean;
  eventHistory: { eventId: string; rank: number; score: number }[];
}

export interface WorldStateSnapshot {
  currentEpoch: number;
  totalEvents: number;
  activeCompanies: number;
  globalGenomeCount: number;
  dominantArchetypes: string[];
  averageScore: number;
  topCompany: string;
  topGenomeName: string;
}

export interface WorldSimulationResult {
  events: HackathonEvent[];
  companies: PersistentCompany[];
  genomeSummary: ReturnType<StrategyGenomeDatabase['getSummary']>;
  memorySummary: ReturnType<GlobalMemoryIndex['getMemorySummary']>;
  worldState: WorldStateSnapshot;
  totalEventsRun: number;
  seed: number;
}

export class GlobalHackathonWorld {
  private readonly rng: RNG;
  private readonly memoryIndex: GlobalMemoryIndex;
  private readonly genomeDb: StrategyGenomeDatabase;
  private readonly spawner: CompanySpawner;
  private readonly evolution: CompanyEvolutionEngine;
  private readonly leaderboard: SwarmLeaderboard;
  private events: HackathonEvent[] = [];
  private companies: Map<string, PersistentCompany> = new Map();
  private currentEpoch = 0;
  private readonly storageKey = 'hackagent-world-state';
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 30000);
    this.memoryIndex = new GlobalMemoryIndex(seed + 3001);
    this.genomeDb = new StrategyGenomeDatabase(seed + 3002);
    this.spawner = new CompanySpawner(seed + 3003);
    this.evolution = new CompanyEvolutionEngine(seed + 3005);
    this.leaderboard = new SwarmLeaderboard(seed + 3004);
    this.loadFromStorage();
  }

  getMemoryIndex(): GlobalMemoryIndex {
    return this.memoryIndex;
  }
  getGenomeDb(): StrategyGenomeDatabase {
    return this.genomeDb;
  }
  getSpawner(): CompanySpawner {
    return this.spawner;
  }
  getLeaderboard(): SwarmLeaderboard {
    return this.leaderboard;
  }
  getEvents(): HackathonEvent[] {
    return [...this.events];
  }
  getCompanies(): PersistentCompany[] {
    return [...this.companies.values()];
  }
  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  private judges: unknown[] = [];
  getAllJudges(): unknown[] {
    return [...this.judges];
  }
  addJudge(judge: unknown): void {
    this.judges.push(judge);
  }

  private buildSpec(theme: string): ParsedHackathonSpec {
    const specId = `world-event-${createDeterministicUuid(this.seed, this.currentEpoch).slice(0, 8)}`;
    return {
      specId,
      title: theme,
      problemStatement: `Build a solution for: ${theme}`,
      judgingCriteria: ['innovation', 'execution', 'usability', 'impact', 'technical_complexity'],
      constraints: ['time_limit', 'resource_limit', 'scope_limit'],
      techStackHints: ['TypeScript', 'React', 'Node.js', 'AI/ML', 'Cloud'],
      implicitGoals: ['working_demo', 'scalable_architecture', 'clean_ux'],
      submissionRequirements: ['github_repo', 'demo_url', 'documentation'],
      rawText: theme,
      source: 'text',
      parsedAt: deterministicNow(this.seed),
    };
  }

  private generateEventName(theme: string, eventNum: number): string {
    const names = ['Challenge', 'Hackathon', 'Grand Prix', 'Showdown', 'Summit', 'Clash', 'Cup'];
    const idx = Math.floor(this.rng.next() * names.length);
    return `Hack-A-Gent ${names[idx]} #${eventNum}: ${theme}`;
  }

  private generateTheme(): string {
    const themes: string[] = [
      'AI-powered Developer Tools',
      'Sustainable Tech Solutions',
      'Healthcare Innovation',
      'Financial Technology',
      'Education Technology',
      'Climate Tech',
      'Cybersecurity',
      'Blockchain & Web3',
      'IoT & Smart Devices',
      'AR/VR Experiences',
      'Remote Collaboration',
      'Data Privacy & Ethics',
      'Open Source Infrastructure',
      'Gaming & Entertainment',
      'Autonomous Systems',
    ];
    return themes[Math.floor(this.rng.next() * themes.length)]!;
  }

  private registerPersistentCompanies(profiles: CompanyProfile[], eventId: string): void {
    for (const profile of profiles) {
      const existing = this.companies.get(profile.id);
      if (existing) {
        existing.lastEventId = eventId;
        continue;
      }

      const matchIdx = Math.floor(this.rng.next() * WINNING_STRATEGIES.length);
      const genomeRecord = this.genomeDb.getOrCreateGenome(WINNING_STRATEGIES[matchIdx]!, profile.strategyType);

      const persistent: PersistentCompany = {
        companyId: profile.id,
        name: profile.name,
        foundingDate: deterministicNow(this.seed),
        strategyType: profile.strategyType,
        lineageGenomeIds: [genomeRecord.genomeId],
        totalEvents: 0,
        totalWins: 0,
        averageRank: 0,
        bestRank: 999,
        lastEventId: eventId,
        lastScore: 0,
        isActive: true,
        eventHistory: [],
      };
      this.companies.set(profile.id, persistent);
    }
  }

  private updateCompanyResults(result: CompanyCompetitionResult, eventId: string): void {
    const sorted = [...result.results].sort((a, b) => b.finalScore - a.finalScore);

    for (let rank = 0; rank < sorted.length; rank++) {
      const r = sorted[rank]!;
      const persistent = this.companies.get(r.companyId);
      if (!persistent) continue;

      persistent.totalEvents++;
      if (rank === 0) persistent.totalWins++;
      if (persistent.totalEvents > 1) {
        persistent.averageRank =
          (persistent.averageRank * (persistent.totalEvents - 1) + (rank + 1)) / persistent.totalEvents;
      } else {
        persistent.averageRank = rank + 1;
      }
      if (rank + 1 < persistent.bestRank) persistent.bestRank = rank + 1;
      persistent.lastEventId = eventId;
      persistent.lastScore = r.finalScore;
      persistent.eventHistory.push({ eventId, rank: rank + 1, score: r.finalScore });

      if (persistent.eventHistory.length > 20) {
        persistent.eventHistory = persistent.eventHistory.slice(-20);
      }

      for (const genomeId of persistent.lineageGenomeIds) {
        this.genomeDb.recordRun(genomeId, r.finalScore, rank + 1, rank === 0, eventId);
      }
    }
  }

  private pruneLowPerformingCompanies(): void {
    const active = [...this.companies.values()].filter((c) => c.isActive && c.totalEvents >= 2);
    if (active.length <= 3) return;

    const scored = active.map((c) => {
      const recent = c.eventHistory.slice(-3).reduce((s, e) => s + e.score, 0) / Math.min(3, c.eventHistory.length);
      return { company: c, recentAvgScore: recent };
    });
    scored.sort((a, b) => b.recentAvgScore - a.recentAvgScore);

    const keepCount = Math.max(3, Math.ceil(scored.length * 0.75));
    for (let i = keepCount; i < scored.length; i++) {
      scored[i]!.company.isActive = false;
    }
  }

  private applyEvolution(result: CompanyCompetitionResult): void {
    if (result.evolutionDelta) {
      const templateMap = new Map(WINNING_STRATEGIES.map((t) => [t.id, t]));
      this.genomeDb.applyEvolutionDelta(result.evolutionDelta, templateMap);
    }
  }

  private recordLeaderboard(result: CompanyCompetitionResult, eventId: string): void {
    const sorted = [...result.results].sort((a, b) => b.finalScore - a.finalScore);

    for (let rank = 0; rank < Math.min(4, sorted.length); rank++) {
      const r = sorted[rank]!;
      this.leaderboard.recordEntry({
        entryId: `entry-${eventId}-${r.companyId.slice(0, 6)}`,
        companyId: r.companyId,
        eventId,
        score: r.finalScore,
        rank: rank + 1,
        timestamp: deterministicNow(this.seed),
        metadata: { eventName: eventId, theme: result.hackathonTitle, totalCompanies: result.results.length },
      });
    }
  }

  runEvent(config?: { companyCount?: number; theme?: string; fastMode?: boolean }): HackathonEvent {
    this.currentEpoch++;
    const companyCount = config?.companyCount ?? Math.max(3, Math.min(7, 3 + Math.floor(this.rng.next() * 5)));
    const theme = config?.theme ?? this.generateTheme();
    const eventId = `world-event-${this.currentEpoch}`;
    const eventName = this.generateEventName(theme, this.currentEpoch);

    const spec = this.buildSpec(theme);

    const orchestrator = new HackathonCompanyOrchestrator({
      companyCount,
      seed: this.seed + this.currentEpoch * 117,
      fastMode: config?.fastMode ?? false,
      simulateOnly: false,
      gatewayAvailable: false,
    });

    const result = orchestrator.runCompetition(spec);

    this.registerPersistentCompanies(result.companies, eventId);

    const sorted = [...result.results].sort((a, b) => b.finalScore - a.finalScore);
    const topScore = sorted.length > 0 ? sorted[0]!.finalScore : 0;
    const winnerId = sorted.length > 0 ? sorted[0]!.companyId : '';

    this.updateCompanyResults(result, eventId);
    this.pruneLowPerformingCompanies();
    this.applyEvolution(result);
    this.recordLeaderboard(result, eventId);

    const winnerPersistent = this.companies.get(winnerId);
    const winnerGenomeId = winnerPersistent?.lineageGenomeIds[0] ?? '';

    const event: HackathonEvent = {
      eventId,
      eventName,
      eventDate: deterministicNow(this.seed),
      theme,
      duration: Math.floor(this.rng.next() * 5) + 1,
      companyCount: result.companies.length,
      topScore,
      winnerCompanyId: winnerId,
      winnerGenomeId,
    };

    this.events.push(event);
    this.persistToStorage();

    this.memoryIndex.store({
      snapshotId: `snap-${eventId}`,
      projectName: eventName,
      projectDescription: `Hackathon event: ${theme}`,
      strategy: {
        id: `strat-${eventId}`,
        projectName: eventName,
        winningStrategy: winnerPersistent?.strategyType ?? 'balanced',
        mvpScope: ['core'],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: topScore,
        recommendedTimeAllocation: {},
        createdAt: deterministicNow(this.seed),
      },
      techStack: ['TypeScript', 'React', 'Node.js'],
      judgeCriteria: ['innovation', 'execution', 'usability', 'impact', 'technical_complexity'],
      constraints: ['time_limit', 'resource_limit', 'scope_limit'],
      uxResults: [],
      deploySuccess: true,
      overallScore: topScore,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: deterministicNow(this.seed),
      completedAt: deterministicNow(this.seed + 1),
      tags: [theme, eventName],
    });

    return event;
  }

  runMultipleEvents(count: number): WorldSimulationResult {
    for (let i = 0; i < count; i++) {
      this.runEvent();
    }
    return this.getWorldResult();
  }

  getWorldResult(): WorldSimulationResult {
    const genomeSummary = this.genomeDb.getSummary();
    const memorySummary = this.memoryIndex.getMemorySummary();
    const allCompanies = [...this.companies.values()];
    const activeCompanies = allCompanies.filter((c) => c.isActive);
    const sortedActive = [...activeCompanies].sort(
      (a, b) => b.totalWins - a.totalWins || a.averageRank - b.averageRank,
    );

    const worldState: WorldStateSnapshot = {
      currentEpoch: this.currentEpoch,
      totalEvents: this.events.length,
      activeCompanies: activeCompanies.length,
      globalGenomeCount: genomeSummary.totalGenomes,
      dominantArchetypes: genomeSummary.dominantArchetypes,
      averageScore:
        activeCompanies.length > 0 ? activeCompanies.reduce((s, c) => s + c.lastScore, 0) / activeCompanies.length : 0,
      topCompany: sortedActive.length > 0 ? sortedActive[0]!.name : '',
      topGenomeName: genomeSummary.topStrategies[0]?.templateName ?? '',
    };

    return {
      events: [...this.events],
      companies: allCompanies,
      genomeSummary,
      memorySummary,
      worldState,
      totalEventsRun: this.events.length,
      seed: this.seed,
    };
  }

  resetWorld(): void {
    this.events = [];
    this.companies.clear();
    this.currentEpoch = 0;
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.removeItem(this.storageKey);
      }
    } catch {}
  }

  toJSON(): string {
    return JSON.stringify(this.getWorldResult(), null, 2);
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify({
        events: this.events,
        companies: [...this.companies.entries()].map(([id, c]) => [id, c]),
        currentEpoch: this.currentEpoch,
        updatedAt: deterministicNow(this.seed),
      });
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as any).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.events)) this.events = parsed.events;
          if (Array.isArray(parsed.companies)) {
            for (const [id, c] of parsed.companies) {
              this.companies.set(id, c as PersistentCompany);
            }
          }
          if (typeof parsed.currentEpoch === 'number') this.currentEpoch = parsed.currentEpoch;
        }
      }
    } catch {}
  }
}

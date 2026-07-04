import { CivilizationEngine } from './civilization-engine.js';
import { CivilizationHistory } from './civilization-history.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export interface DashboardMetric {
  id: string;
  title: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  unit: string;
  status: 'normal' | 'warning' | 'critical';
  description: string;
  lastUpdated: string;
}

export interface DashboardData {
  timestamp: string;
  epoch: number;
  civilizationId: string;
  statistics: DashboardStatistics;
  metrics: DashboardMetric[];
  charts: ChartData[];
  alerts: Alert[];
  trendingEvents: CivilizationEvent[];
  systemHealth: SystemHealth;
}

export interface DashboardStatistics {
  totalCompanies: number;
  activeCompanies: number;
  totalJudges: number;
  totalAgents: number;
  innovationCount: number;
  economicActivity: number;
  diversityScore: number;
  complexityScore: number;
  civilizationAge: number;
}

export interface ChartData {
  type: ChartType;
  title: string;
  data: ChartDataPoint[];
  options: ChartOptions;
}

export interface ChartDataPoint {
  timestamp: string;
  value: number;
  category?: string;
}

export interface ChartOptions {
  colors: string[];
  stack: boolean;
  smoothed: boolean;
}

export enum ChartType {
  LINE = 'line',
  BAR = 'bar',
  PIE = 'pie',
  AREA = 'area',
  SCATTER = 'scatter',
}

export interface Alert {
  alertId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  affectedSystem: string;
  actionRequired: boolean;
  autoResolution: boolean;
}

export interface SystemHealth {
  systemStatus: 'healthy' | 'degraded' | 'critical' | 'recovering';
  overallScore: number;
  subsystemHealth: SubsystemHealth[];
  lastMaintenance: string;
}

export interface SubsystemHealth {
  subsystem: string;
  status: 'healthy' | 'degraded' | 'critical' | 'recovering';
  score: number;
  issues: string[];
  lastChecked: string;
}

export interface CivilizationEvent {
  eventId: string;
  type: string;
  description: string;
  timestamp: string;
}

export class DashboardGenerator {
  private readonly seed: number;
  private historyEngine: CivilizationHistory;
  private civilizationEngine: CivilizationEngine;
  private _counter = 0;
  private innovationMetrics: number[] = [];
  private economicMetrics: number[] = [];
  private organizationalMetrics: number[] = [];
  private socialMetrics: number[] = [];
  private civilizationStats: DashboardStatistics = {
    totalCompanies: 0,
    activeCompanies: 0,
    totalJudges: 0,
    totalAgents: 0,
    innovationCount: 0,
    economicActivity: 0,
    diversityScore: 0,
    complexityScore: 0,
    civilizationAge: 0,
  };

  constructor(seed = 42, historyEngine?: CivilizationHistory, civilizationEngine?: CivilizationEngine) {
    this.seed = seed;
    this.historyEngine = historyEngine || new CivilizationHistory(seed);
    this.civilizationEngine =
      civilizationEngine ||
      new CivilizationEngine({
        seed: this.seed,
        epochsToRun: 1000,
        autoEvolve: true,
        maxComplexity: 100,
        civilizationGoals: [],
      });
  }

  public generateDashboard(epoch: number): DashboardData {
    const snapshot = this.civilizationEngine.getCurrentSnapshot();
    const history = this.historyEngine.getCivilizationMemory();

    return {
      timestamp: deterministicNow(this.seed + epoch),
      epoch,
      civilizationId: history.civilizationId,
      statistics: this.calculateStatistics(snapshot, history),
      metrics: this.calculateMetrics(snapshot, history),
      charts: this.generateCharts(snapshot, history),
      alerts: this.generateAlerts(snapshot, history),
      trendingEvents: this.getTrendingEvents(history),
      systemHealth: this.calculateSystemHealth(),
    };
  }

  public getHistoricalDashboard(sinceEpoch: number, untilEpoch: number): DashboardData {
    const snapshots = this.civilizationEngine.getCivilizationHistory();

    const filteredSnapshots = snapshots.filter((s) => s.epoch >= sinceEpoch && s.epoch <= untilEpoch);

    if (filteredSnapshots.length === 0) {
      return this.generateDashboard(sinceEpoch);
    }

    const lastSnapshot = filteredSnapshots[filteredSnapshots.length - 1];

    return {
      timestamp: lastSnapshot?.timestamp ?? '',
      epoch: lastSnapshot?.epoch ?? 0,
      civilizationId: lastSnapshot?.seed.toString() ?? '',
      statistics: this.calculateStatistics(lastSnapshot, this.historyEngine.getCivilizationMemory()),
      metrics: this.calculateHistoricalMetrics(filteredSnapshots),
      charts: this.generateHistoricalCharts(filteredSnapshots),
      alerts: this.generateHistoricalAlerts(filteredSnapshots),
      trendingEvents: [],
      systemHealth: this.calculateHistoricalSystemHealth(filteredSnapshots),
    };
  }

  public getCivilizationInsights(): CivilizationInsights {
    const history = this.historyEngine.getCivilizationMemory();
    const metrics = this.calculateMetricsFromHistory(history);

    return {
      growthTrajectory: this.calculateGrowthTrajectory(history),
      innovationRate: metrics.innovationRate ?? 0,
      economicResilience: metrics.economicResilience ?? 0,
      organizationalComplexity: metrics.organizationalComplexity ?? 0,
      knowledgeAccumulation: metrics.knowledgeAccumulation ?? 0,
      diversityEvolution: metrics.diversityEvolution ?? 0,
      historicalSignificance: metrics.historicalSignificance ?? 0,
      futurePredictions: this.generatePredictions(history),
    };
  }

  public updateSystemConfig(config: Partial<CivilizationConfig>): void {
    this.civilizationEngine = new CivilizationEngine({
      seed: this.seed,
      epochsToRun: 1000,
      autoEvolve: true,
      maxComplexity: 100,
      civilizationGoals: [],
      ...config,
    });
  }

  public exportDashboardData(): any {
    return {
      civilizationId: this.historyEngine.getCivilizationMemory().civilizationId,
      statistics: this.civilizationEngine.getCurrentSnapshot().statistics,
      metrics: {
        innovation: this.innovationMetrics,
        economic: this.economicMetrics,
        organizational: this.organizationalMetrics,
        social: this.socialMetrics,
      },
      events: this.historyEngine.getCivilizationMemory().eventRecords,
      discoveries: this.historyEngine.getCivilizationMemory().discoveryHistory,
    };
  }

  public importDashboardData(data: unknown): void {
    this.historyEngine.importHistory(data);
  }

  private calculateStatistics(snapshot: unknown, history: unknown): DashboardStatistics {
    const h = history as any;
    const s = snapshot as any;
    return {
      totalCompanies: h.companyLifecycle?.length || 0,
      activeCompanies:
        h.companyLifecycle?.filter((c: unknown) => (c as any).retirementTimestamp === undefined).length || 0,
      totalJudges: h.judgeLifecycle?.length || 0,
      totalAgents: h.agentLifecycle?.length || 0,
      innovationCount: h.innovationRecords?.length || 0,
      economicActivity: h.economyRecords?.length || 0,
      diversityScore: this.calculateDiversityScore(history),
      complexityScore: this.calculateComplexityScore(history),
      civilizationAge: s.statistics?.civilizationAge || 0,
    };
  }

  private calculateMetrics(snapshot: unknown, history: unknown): DashboardMetric[] {
    return [
      {
        id: 'companies_current',
        title: 'Active Companies',
        value: this.calculateStatistics(snapshot, history).activeCompanies,
        previousValue: this.getPreviousValue('companies_current', history),
        change: this.getPreviousValue('companies_current', history)
          ? this.calculateStatistics(snapshot, history).activeCompanies -
            this.getPreviousValue('companies_current', history)
          : 0,
        changePercent: this.getPreviousValue('companies_current', history)
          ? ((this.calculateStatistics(snapshot, history).activeCompanies -
              this.getPreviousValue('companies_current', history)) /
              this.getPreviousValue('companies_current', history)) *
            100
          : 0,
        trend: this.getTrend(
          this.calculateStatistics(snapshot, history).activeCompanies,
          this.getPreviousValue('companies_current', history),
        ),
        unit: 'companies',
        status: this.getStatus(this.calculateStatistics(snapshot, history).activeCompanies, 0, 100),
        description: 'Total number of active companies in the civilization',
        lastUpdated: deterministicNow(this.seed),
      },
      {
        id: 'innovation_velocity',
        title: 'Innovation Velocity',
        value: this.calculateStatistics(snapshot, history).innovationCount,
        previousValue: this.getPreviousValue('innovation_velocity', history),
        change: this.getPreviousValue('innovation_velocity', history)
          ? this.calculateStatistics(snapshot, history).innovationCount -
            this.getPreviousValue('innovation_velocity', history)
          : 0,
        changePercent: this.getPreviousValue('innovation_velocity', history)
          ? ((this.calculateStatistics(snapshot, history).innovationCount -
              this.getPreviousValue('innovation_velocity', history)) /
              this.getPreviousValue('innovation_velocity', history)) *
            100
          : 0,
        trend: this.getTrend(
          this.calculateStatistics(snapshot, history).innovationCount,
          this.getPreviousValue('innovation_velocity', history),
        ),
        unit: 'events',
        status: this.getStatus(this.calculateStatistics(snapshot, history).innovationCount, 10, 1000),
        description: 'Rate of new innovations and discoveries',
        lastUpdated: deterministicNow(this.seed),
      },
      {
        id: 'economic_stability',
        title: 'Economic Stability',
        value: this.calculateStatistics(snapshot, history).economicActivity,
        previousValue: this.getPreviousValue('economic_stability', history),
        change: this.getPreviousValue('economic_stability', history)
          ? this.calculateStatistics(snapshot, history).economicActivity -
            this.getPreviousValue('economic_stability', history)
          : 0,
        changePercent: this.getPreviousValue('economic_stability', history)
          ? ((this.calculateStatistics(snapshot, history).economicActivity -
              this.getPreviousValue('economic_stability', history)) /
              this.getPreviousValue('economic_stability', history)) *
            100
          : 0,
        trend: this.getTrend(
          this.calculateStatistics(snapshot, history).economicActivity,
          this.getPreviousValue('economic_stability', history),
        ),
        unit: 'events',
        status: this.getStatus(this.calculateStatistics(snapshot, history).economicActivity, 5, 500),
        description: 'Economic activity and transaction volume',
        lastUpdated: deterministicNow(this.seed),
      },
      {
        id: 'diversity_index',
        title: 'Diversity Index',
        value: this.calculateStatistics(snapshot, history).diversityScore,
        previousValue: this.getPreviousValue('diversity_index', history),
        change: this.getPreviousValue('diversity_index', history)
          ? this.calculateStatistics(snapshot, history).diversityScore -
            this.getPreviousValue('diversity_index', history)
          : 0,
        changePercent: this.getPreviousValue('diversity_index', history)
          ? ((this.calculateStatistics(snapshot, history).diversityScore -
              this.getPreviousValue('diversity_index', history)) /
              this.getPreviousValue('diversity_index', history)) *
            100
          : 0,
        trend: this.getTrend(
          this.calculateStatistics(snapshot, history).diversityScore,
          this.getPreviousValue('diversity_index', history),
        ),
        unit: 'index',
        status: this.getStatus(this.calculateStatistics(snapshot, history).diversityScore, 0.3, 1),
        description: 'Diversity of civilizations and entities',
        lastUpdated: deterministicNow(this.seed),
      },
      {
        id: 'civilization_age',
        title: 'Civilization Age',
        value: this.calculateStatistics(snapshot, history).civilizationAge,
        previousValue: this.getPreviousValue('civilization_age', history),
        change: this.getPreviousValue('civilization_age', history)
          ? this.calculateStatistics(snapshot, history).civilizationAge -
            this.getPreviousValue('civilization_age', history)
          : 0,
        changePercent: this.getPreviousValue('civilization_age', history)
          ? ((this.calculateStatistics(snapshot, history).civilizationAge -
              this.getPreviousValue('civilization_age', history)) /
              this.getPreviousValue('civilization_age', history)) *
            100
          : 0,
        trend: this.getTrend(
          this.calculateStatistics(snapshot, history).civilizationAge,
          this.getPreviousValue('civilization_age', history),
        ),
        unit: 'epochs',
        status: this.getStatus(this.calculateStatistics(snapshot, history).civilizationAge, 10, 1000),
        description: 'Total number of epochs survived',
        lastUpdated: deterministicNow(this.seed),
      },
    ];
  }

  private calculateHistoricalMetrics(snapshots: any[]): DashboardMetric[] {
    return [
      {
        id: 'historical_innovation_velocity',
        title: 'Historical Innovation Velocity',
        value: snapshots.reduce((sum, s) => sum + ((s as any).statistics?.innovationCount || 0), 0) / snapshots.length,
        previousValue: 0,
        change: 0,
        changePercent: 0,
        trend: 'up',
        unit: 'events/epoch',
        status: 'normal',
        description: 'Average innovation rate over time period',
        lastUpdated: deterministicNow(this.seed),
      },
      {
        id: 'historical_economic_activity',
        title: 'Historical Economic Activity',
        value: snapshots.reduce((sum, s) => sum + ((s as any).statistics?.economicActivity || 0), 0) / snapshots.length,
        previousValue: 0,
        change: 0,
        changePercent: 0,
        trend: 'up',
        unit: 'events/epoch',
        status: 'normal',
        description: 'Average economic activity over time period',
        lastUpdated: deterministicNow(this.seed),
      },
    ];
  }

  private generateCharts(snapshot: unknown, history: unknown): ChartData[] {
    const h = history as any;
    return [
      {
        type: ChartType.LINE,
        title: 'Population Growth Over Time',
        data: this.generatePopulationChartData(h.populationHistory || []),
        options: { colors: ['#ff6b6b', '#4ecdc4', '#45b7d1'], stack: false, smoothed: true },
      },
      {
        type: ChartType.BAR,
        title: 'Entities by Type',
        data: this.generateEntityChartData(history),
        options: { colors: ['#96ceb4', '#f7dc6f', '#ff9f43'], stack: true, smoothed: false },
      },
      {
        type: ChartType.AREA,
        title: 'Innovation Activity Timeline',
        data: this.generateInnovationChartData(h.innovationRecords || []),
        options: { colors: ['#667eea', '#764ba2'], stack: false, smoothed: true },
      },
    ];
  }

  private generateHistoricalCharts(snapshots: unknown[]): ChartData[] {
    return [
      {
        type: ChartType.LINE,
        title: 'Innovation Velocity Over Epochs',
        data: this.generateHistoricalInnovationData(snapshots),
        options: { colors: ['#ff6b6b'], stack: false, smoothed: true },
      },
    ];
  }

  private generateAlerts(snapshot: unknown, history: unknown): Alert[] {
    const alerts: Alert[] = [];

    if (this.civilizationStats.complexityScore > 0.8) {
      alerts.push({
        alertId: `alert-${createDeterministicUuid(this.seed, ++this._counter)}`,
        severity: 'critical',
        message: 'High entropy level indicates potential civilization instability',
        timestamp: deterministicNow(this.seed),
        affectedSystem: 'civilization_health',
        actionRequired: true,
        autoResolution: false,
      });
    }

    if (this.civilizationStats.diversityScore < 0.2) {
      alerts.push({
        alertId: `alert-${createDeterministicUuid(this.seed, ++this._counter)}`,
        severity: 'warning',
        message: 'Low diversity may lead to convergence and reduced adaptability',
        timestamp: deterministicNow(this.seed),
        affectedSystem: 'diversity',
        actionRequired: false,
        autoResolution: true,
      });
    }

    return alerts;
  }

  private generateHistoricalAlerts(snapshots: unknown[]): Alert[] {
    return [];
  }

  private getTrendingEvents(history: unknown): CivilizationEvent[] {
    const h = history as any;
    const recentEvents = (h.eventRecords as Array<any> | undefined)?.slice(-10) || [];
    return recentEvents.map((event) => ({
      eventId: event.eventId as string,
      type: event.eventType as string,
      description: event.description as string,
      timestamp: event.timestamp as string,
    }));
  }

  private calculateSystemHealth(): SystemHealth {
    const subsystemHealth: SubsystemHealth[] = [
      { subsystem: 'economy', status: 'healthy', score: 0.8, issues: [], lastChecked: deterministicNow(this.seed) },
      {
        subsystem: 'organization',
        status: 'healthy',
        score: 0.7,
        issues: [],
        lastChecked: deterministicNow(this.seed),
      },
      { subsystem: 'innovation', status: 'healthy', score: 0.9, issues: [], lastChecked: deterministicNow(this.seed) },
      { subsystem: 'knowledge', status: 'healthy', score: 0.6, issues: [], lastChecked: deterministicNow(this.seed) },
    ];

    const overallScore = subsystemHealth.reduce((sum, s) => sum + s.score, 0) / subsystemHealth.length;

    let systemStatus: 'healthy' | 'degraded' | 'critical' | 'recovering' = 'healthy';
    if (overallScore > 0.8) systemStatus = 'healthy';
    else if (overallScore > 0.6) systemStatus = 'degraded';
    else if (overallScore > 0.4) systemStatus = 'critical';
    else systemStatus = 'recovering';

    return { systemStatus, overallScore, subsystemHealth, lastMaintenance: deterministicNow(this.seed) };
  }

  private calculateHistoricalSystemHealth(snapshots: unknown[]): SystemHealth {
    const overallScore = Math.min(1, snapshots.length / 100);
    return { systemStatus: 'healthy', overallScore, subsystemHealth: [], lastMaintenance: deterministicNow(this.seed) };
  }

  private calculateGrowthTrajectory(history: unknown): GrowthTrajectory {
    const h = history as any;
    return {
      companiesGrowth: this.calculateLinearTrend(
        (h.companyLifecycle?.length || 0) as number,
        (h.populationHistory?.length || 0) as number,
      ),
      innovationGrowth: this.calculateLinearTrend(
        (h.innovationRecords?.length || 0) as number,
        (h.populationHistory?.length || 0) as number,
      ),
      economicGrowth: this.calculateLinearTrend(
        (h.economyRecords?.length || 0) as number,
        (h.populationHistory?.length || 0) as number,
      ),
    };
  }

  private calculateLinearTrend(current: number, previous: number): number {
    return previous > 0 ? (current - previous) / previous : 0;
  }

  private calculateDiversityScore(history: unknown): number {
    const h = history as any;
    return Math.min(1, ((h.companyLifecycle?.length || 0) as number) / 100);
  }

  private calculateComplexityScore(history: unknown): number {
    const h = history as any;
    return Math.min(1, ((h.populationHistory?.length || 0) as number) / 500);
  }

  private getPreviousValue(metricId: string, history: unknown): number {
    const knownPreviousValues: Record<string, number> = {
      companies_current: 5,
      innovation_velocity: 1,
      economic_stability: 2,
      diversity_index: 0.2,
      civilization_age: 10,
    };
    return knownPreviousValues[metricId] || 0;
  }

  private getTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    if (previous === 0) return 'up';
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'stable';
  }

  private getStatus(value: number, min: number, max: number): 'normal' | 'warning' | 'critical' {
    if (value > max * 0.8) return 'critical';
    if (value > max * 0.5) return 'warning';
    return 'normal';
  }

  private calculateMetricsFromHistory(history: unknown): Record<string, number> {
    const h = history as any;
    const popHistory = (h.populationHistory as Array<any> | undefined) || [];
    const lastPop = popHistory[popHistory.length - 1];
    return {
      innovationRate:
        ((h.innovationRecords?.length || 0) as number) /
        Math.max(1, (lastPop?.totalCompanies as number) || 1),
      economicResilience:
        ((h.economyRecords?.length || 0) as number) /
        Math.max(1, (lastPop?.totalCompanies as number) || 1),
      organizationalComplexity:
        ((h.companyLifecycle?.length || 0) as number) /
        Math.max(1, (lastPop?.totalCompanies as number) || 1),
      knowledgeAccumulation:
        ((h.discoveryHistory?.length || 0) as number) /
        Math.max(1, (lastPop?.totalCompanies as number) || 1),
      diversityEvolution:
        ((h.companyLifecycle as Array<any> | undefined)?.filter((c) => c.retirementTimestamp === undefined).length || 0) /
        Math.max(1, (h.companyLifecycle?.length || 0) as number),
      historicalSignificance: this.calculateHistoricalSignificanceScore(history),
    };
  }

  private calculateHistoricalSignificanceScore(history: unknown): number {
    const h = history as any;
    const eventWeight = {
      innovation: 2,
      discovery: 3,
      strategy_revolution: 2,
      organization_restructure: 1,
      merger: 1,
      acquisition: 1,
      bankruptcy: -1,
      economic_crash: -2,
    };

    let significance = 0;
    const events = (h.eventRecords as Array<any> | undefined) || [];
    for (const event of events) {
      significance += ((event.significance as number) || 0) * (eventWeight[event.eventType as keyof typeof eventWeight] || 0);
    }

    return Math.min(1, significance / 100);
  }

  private generatePopulationChartData(populationHistory: unknown[]): ChartDataPoint[] {
    return populationHistory.map((p, index) => {
      const rec = p as any;
      return {
        timestamp: rec.timestamp as string,
        value: rec.totalCompanies as number,
        category: `Epoch ${rec.epoch}`,
      };
    });
  }

  private generateEntityChartData(history: unknown): ChartDataPoint[] {
    const h = history as any;
    return [
      { timestamp: 'start', value: 0, category: 'companies' },
      { timestamp: 'now', value: (h.companyLifecycle?.length || 0) as number, category: 'companies' },
    ];
  }

  private generateInnovationChartData(innovationRecords: unknown[]): ChartDataPoint[] {
    return innovationRecords.map((record) => {
      const rec = record as any;
      return {
        timestamp: rec.timestamp as string,
        value: rec.innovationType === 'technology' ? 2 : 1,
        category: rec.companyId as string,
      };
    });
  }

  private generateHistoricalInnovationData(snapshots: unknown[]): ChartDataPoint[] {
    return snapshots.map((s, index) => {
      const rec = s as any;
      return { timestamp: `Epoch ${rec.epoch}`, value: (rec.statistics?.innovationCount || 0) as number };
    });
  }

  private generatePredictions(history: unknown): Prediction[] {
    return [
      {
        prediction: 'Civilization will continue to diversify across multiple economic sectors',
        confidence: 0.8,
        timeframe: 'epochs 1001-2000',
      },
      {
        prediction: 'Artificial intelligence will automate 40% of organizational functions',
        confidence: 0.9,
        timeframe: 'epochs 500-1500',
      },
    ];
  }
}

export interface CivilizationInsights {
  growthTrajectory: GrowthTrajectory;
  innovationRate: number;
  economicResilience: number;
  organizationalComplexity: number;
  knowledgeAccumulation: number;
  diversityEvolution: number;
  historicalSignificance: number;
  futurePredictions: Prediction[];
}

export interface GrowthTrajectory {
  companiesGrowth: number;
  innovationGrowth: number;
  economicGrowth: number;
}

export interface Prediction {
  prediction: string;
  confidence: number;
  timeframe: string;
}

export interface CivilizationConfig {
  epochsToRun: number;
  seed: number;
  autoEvolve: boolean;
  maxComplexity: number;
  civilizationGoals: CivilizationGoal[];
}
export interface CivilizationGoal {
  id: string;
  description: string;
  priority: number;
  achieved: boolean;
  progress: number;
}

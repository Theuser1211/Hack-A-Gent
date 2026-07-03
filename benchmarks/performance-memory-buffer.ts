export interface PerformanceRecord {
  detection_rate: number;
  repair_success_rate: number;
  robustness_score: number;
  per_mutation_type_stats: Record<string, { applied: number; detected: number; repaired: number }>;
  bdi: number;
  curriculum_state: string;
  global_difficulty: number;
  timestamp: string;
}

export class PerformanceMemoryBuffer {
  private records: PerformanceRecord[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  addRecord(record: PerformanceRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxSize) {
      this.records = this.records.slice(this.records.length - this.maxSize);
    }
  }

  getAverageMetrics(): { avgDetectionRate: number; avgRepairRate: number; avgRobustness: number; avgBDI: number } {
    if (this.records.length === 0) {
      return { avgDetectionRate: 0, avgRepairRate: 0, avgRobustness: 0, avgBDI: 0 };
    }
    const n = this.records.length;
    return {
      avgDetectionRate: this.records.reduce((s, r) => s + r.detection_rate, 0) / n,
      avgRepairRate: this.records.reduce((s, r) => s + r.repair_success_rate, 0) / n,
      avgRobustness: this.records.reduce((s, r) => s + r.robustness_score, 0) / n,
      avgBDI: this.records.reduce((s, r) => s + r.bdi, 0) / n,
    };
  }

  getTrend(
    metric: 'detection_rate' | 'repair_success_rate' | 'robustness_score' | 'bdi',
  ): 'rising' | 'falling' | 'stable' {
    if (this.records.length < 3) return 'stable';

    const recent = this.records.slice(-3);
    const first = recent[0]![metric];
    const last = recent[recent.length - 1]![metric];
    const diff = last - first;

    if (diff > 5) return 'rising';
    if (diff < -5) return 'falling';
    return 'stable';
  }

  getRecentRecords(n: number): PerformanceRecord[] {
    return this.records.slice(-Math.min(n, this.records.length));
  }

  getSize(): number {
    return this.records.length;
  }

  isWarm(): boolean {
    return this.records.length >= 3;
  }

  getAllRecords(): readonly PerformanceRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
  }
}

import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { createDeterministicUuid } from './determinism-kernel.js';
import { OrganizationalMemoryBank, type ProjectSnapshot, type WinningPattern } from './organizational-memory-bank.js';

export interface GlobalMemoryQuery {
  text: string;
  limit?: number;
  minSimilarity?: number;
}

export interface GlobalMemoryQueryResult {
  snapshots: ProjectSnapshot[];
  winningPatterns: WinningPattern[];
  similarity: number;
  totalProjects: number;
}

export class GlobalMemoryIndex {
  private readonly bank: OrganizationalMemoryBank;
  private readonly decisionLogger: DecisionLogger;
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
    this.bank = new OrganizationalMemoryBank(seed + 1000);
    this.decisionLogger = new DecisionLogger(seed + 1001);
  }

  getBank(): OrganizationalMemoryBank {
    return this.bank;
  }

  store(project: ProjectSnapshot): void {
    this.bank.addProjectSnapshot(project);
    this.decisionLogger.log('planner', 'store_memory', `Stored project: ${project.projectName}`, 0.9, [], {
      projectId: project.snapshotId,
      score: project.overallScore,
    });
  }

  querySimilar(text: string, limit = 5): GlobalMemoryQueryResult {
    const results = this.bank.querySimilarProjects(text, limit);
    const winningPatterns = this.bank.getWinningPatterns();
    const summary = this.bank.getMemorySummary();

    return {
      snapshots: results.snapshots,
      winningPatterns,
      similarity: results.similarity,
      totalProjects: summary.totalProjects,
    };
  }

  querySimilarProjects(input: string, limit = 5): { snapshots: ProjectSnapshot[]; similarity: number } {
    return this.bank.querySimilarProjects(input, limit);
  }

  extractWinningPatterns(): WinningPattern[] {
    return this.bank.getWinningPatterns();
  }

  extractFailurePatterns(): Array<{ category: string; description: string; frequency: number }> {
    return this.bank.getFailurePatterns();
  }

  getMemorySummary() {
    return this.bank.getMemorySummary();
  }

  getSnapshotCount(): number {
    return this.bank.getSnapshotCount();
  }

  getAllSnapshots(): ProjectSnapshot[] {
    return this.bank.getAllSnapshots();
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
}

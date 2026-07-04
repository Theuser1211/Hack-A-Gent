import { deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import { JudgeCalibrationEngine } from './judge-calibration-engine.js';
import { Judge, JudgeIdentity, createJudge } from './judge-identity.js';
import { MetaJudge } from './meta-judge.js';
export interface JudgeDatabaseStats {
  totalJudges: number;
  activeJudges: number;
  retiredJudges: number;
  averageReputation: number;
  averageAccuracy: number;
  judgesBySpecialization: Record<string, number>;
}
export interface JudgeArchive {
  archivedJudge: JudgeIdentity;
  retirementTimestamp: string;
  successorId?: string;
  finalAuditScore: number;
  legacyScore: number;
}
export class JudgeDatabase {
  private readonly seed: number;
  private readonly rng: RNG;
  private judges: Map<string, Judge> = new Map();
  private archives: Map<string, JudgeArchive> = new Map();
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(seed + 60000);
  }

  createJudge(builder: any): Judge {
    const judge = createJudge(builder);
    this.judges.set(judge.getIdentity().id, judge);
    return judge;
  }

  loadJudge(id: string): Judge | undefined {
    return this.judges.get(id);
  }

  saveJudge(judge: Judge): void {
    this.judges.set(judge.getIdentity().id, judge);
  }

  retireJudge(judgeId: string, metaJudge: MetaJudge): JudgeArchive {
    const judge = this.judges.get(judgeId);
    if (!judge) {
      throw new Error(`Judge not found: ${judgeId}`);
    }

    const identity = judge.getIdentity();
    const archive: JudgeArchive = {
      archivedJudge: identity,
      retirementTimestamp: deterministicNow(this.seed + ++this._counter),
      finalAuditScore: identity.auditScore,
      legacyScore: calculateLegacyScore(identity),
    };

    const successor = this.spawnSuccessor(judge);
    archive.successorId = successor.getIdentity().id;

    this.judges.delete(judgeId);
    this.judges.set(successor.getIdentity().id, successor);
    this.archives.set(judgeId, archive);

    metaJudge.auditJudge(identity);

    return archive;
  }

  spawnSuccessor(retiringJudge: Judge): Judge {
    const parentIdentity = retiringJudge.getIdentity();

    const inheritanceFactor = 0.7;
    const mutationFactor = 0.3;

    const inheritedSpecialization = parentIdentity.specialization;
    const inheritedPersonality = { ...parentIdentity.personality };
    const inheritedCalibration = { ...parentIdentity.calibration };

    const rand = this.rng.next();

    const newPersonality: Record<string, number> = {};
    for (const [key, value] of Object.entries(inheritedPersonality)) {
      const mutation = (rand - 0.5) * 2 * mutationFactor * 0.1;
      newPersonality[key] = Math.max(0, Math.min(1, value + mutation));
    }

    const newCalibrationAccuracy = Math.max(
      0,
      Math.min(
        1,
        parentIdentity.calibration.calibrationAccuracy * inheritanceFactor + (0.5 + rand * 0.5) * mutationFactor,
      ),
    );

    const newReputation = Math.max(
      0,
      Math.min(1, parentIdentity.reputation * inheritanceFactor + (0.4 + rand * 0.3) * mutationFactor),
    );

    const biasIncrements: Record<string, number> = {};
    for (const [key, value] of Object.entries(parentIdentity.biasVector)) {
      const mutation = (rand - 0.5) * 2 * mutationFactor * 0.05;
      biasIncrements[key] = mutation;
    }

    const name = `${parentIdentity.name}'s Successor ${Date.now()}`;

    return createJudge({
      name,
      specialization: inheritedSpecialization,
      personality: newPersonality,
      baseCalibrationAccuracy: newCalibrationAccuracy,
      baseConsistencyScore: parentIdentity.calibration.consistencyScore,
      baseStrictness: parentIdentity.strictness,
      baseCreativityPreference: parentIdentity.creativityPreference,
      baseInnovationBias: parentIdentity.innovationBias,
      baseEngineeringBias: parentIdentity.engineeringBias,
      baseSpeedBias: parentIdentity.speedBias,
      baseRiskTolerance: parentIdentity.riskTolerance,
      baseReputation: newReputation,
      baseExperience: parentIdentity.experience * 0.5,
      biasIncrements,
    });
  }

  getJudgeHistory(judgeId: string): unknown[] {
    const judge = this.judges.get(judgeId);
    if (!judge) return [];

    const identity = judge.getIdentity();
    return [
      { timestamp: identity.lastUpdateTimestamp, reputation: identity.reputation, accuracy: identity.accuracyScore },
      ...identity.memory.rewardHistory.map((r) => ({
        timestamp: r.timestamp,
        score: r.score,
        rewardType: r.rewardType,
      })),
      ...identity.memory.failures.map((f) => ({ type: f.failureType, severity: f.severity, timestamp: f.detectedAt })),
    ];
  }

  getTopJudges(limit: number = 10): Judge[] {
    return Array.from(this.judges.values())
      .filter((j) => !j.getIsRetired())
      .sort((a, b) => b.getIdentity().auditScore - a.getIdentity().auditScore)
      .slice(0, limit);
  }

  getWeakJudges(limit: number = 10): Judge[] {
    return Array.from(this.judges.values())
      .filter((j) => !j.getIsRetired())
      .sort((a, b) => a.getIdentity().auditScore - b.getIdentity().auditScore)
      .slice(0, limit);
  }

  updateCalibration(judgeId: string, engine: JudgeCalibrationEngine): boolean {
    const judge = this.judges.get(judgeId);
    if (!judge) return false;

    const identity = judge.getIdentity();
    const comparisonJudges = engine.compareJudge(identity);

    const comparisons = [comparisonJudges];
    for (const comparison of comparisons) {
      if (comparison.biasMagnitude > 0.1) {
        const firstBiasKey = Object.keys(comparison.systematicBias)[0];
        const biasKey = firstBiasKey
          ? Object.keys(identity.biasVector).find((k) => k.includes(firstBiasKey))
          : undefined;
        if (biasKey) {
          identity.biasVector[biasKey as keyof typeof identity.biasVector] = Math.max(
            -1,
            Math.min(
              1,
              (identity.biasVector[biasKey as keyof typeof identity.biasVector] || 0) + comparison.biasMagnitude * 0.1,
            ),
          );
        }
      }
    }

    identity.calibration.calibrationAccuracy = engine.calculateCalibrationAccuracy(identity);
    identity.calibration.consistencyScore = engine.calculateConsistencyScore(identity);
    identity.calibration.varianceScore = 1 - identity.calibration.consistencyScore;
    identity.calibration.lastCalibrationTimestamp = deterministicNow(this.seed);

    return true;
  }

  updateReputation(judgeId: string, newReputation: number): boolean {
    const judge = this.judges.get(judgeId);
    if (!judge) return false;

    const identity = judge.getIdentity();
    identity.reputation = Math.max(0, Math.min(1, newReputation));

    return true;
  }

  getStats(): JudgeDatabaseStats {
    const judges = Array.from(this.judges.values());

    const activeJudges = judges.filter((j) => !j.getIsRetired()).length;
    const retiredJudges = judges.filter((j) => j.getIsRetired()).length;

    const totalReputation = judges.reduce((sum, j) => sum + j.getIdentity().reputation, 0);
    const totalAccuracy = judges.reduce((sum, j) => sum + j.getIdentity().accuracyScore, 0);

    const specializationCount: Record<string, number> = {};
    judges.forEach((j) => {
      const spec = j.getIdentity().specialization;
      specializationCount[spec] = (specializationCount[spec] || 0) + 1;
    });

    return {
      totalJudges: judges.length,
      activeJudges,
      retiredJudges,
      averageReputation: totalReputation / Math.max(1, judges.length),
      averageAccuracy: totalAccuracy / Math.max(1, judges.length),
      judgesBySpecialization: specializationCount,
    };
  }

  getAllJudges(): Judge[] {
    return Array.from(this.judges.values());
  }

  getArchives(): JudgeArchive[] {
    return Array.from(this.archives.values());
  }

  exportDatabase(): Record<string, unknown> {
    return {
      judges: Array.from(this.judges.values()).map((j) => j.toJSON()),
      archives: Array.from(this.archives.entries()).map(([id, archive]) => ({ id, ...archive })),
    };
  }

  importDatabase(data: any): void {
    this.judges.clear();
    this.archives.clear();

    if (data.judges) {
      for (const judgeData of data.judges) {
        this.judges.set(judgeData.id, new Judge(judgeData));
      }
    }

    if (data.archives) {
      for (const archiveData of data.archives) {
        this.archives.set(archiveData.id, archiveData);
      }
    }
  }
}

function calculateLegacyScore(identity: JudgeIdentity): number {
  const weights = { accuracy: 0.4, reputation: 0.3, consistency: 0.2, auditScore: 0.1 };

  return (
    identity.accuracyScore * weights.accuracy +
    identity.reputation * weights.reputation +
    identity.calibration.consistencyScore * weights.consistency +
    identity.auditScore * weights.auditScore
  );
}

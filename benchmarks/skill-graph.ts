import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface SkillRecord {
  technology: string;
  category: 'framework' | 'language' | 'database' | 'deploy' | 'tool' | 'ai';
  successCount: number;
  failureCount: number;
  avgUxScore: number;
  avgDeployScore: number;
  compatibilityScores: Map<string, number>;
  lastUsed: string;
  strengthScore: number;
}

export interface StackRecommendation {
  technologies: string[];
  predictedSuccess: number;
  compatibilityScore: number;
  rationale: string;
}

export class SkillGraph {
  private readonly seed: number;
  private readonly graphId: string;
  private readonly decisionLogger: DecisionLogger;
  private skills: Map<string, SkillRecord> = new Map();

  constructor(seed = 42) {
    this.seed = seed;
    this.graphId = 'skill-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8400);
    this.initializeDefaults();
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getAllSkills(): SkillRecord[] {
    return Array.from(this.skills.values());
  }

  private initializeDefaults(): void {
    const defaults: Array<{ tech: string; cat: SkillRecord['category'] }> = [
      { tech: 'React', cat: 'framework' },
      { tech: 'Next.js', cat: 'framework' },
      { tech: 'Vue', cat: 'framework' },
      { tech: 'Svelte', cat: 'framework' },
      { tech: 'Node.js', cat: 'language' },
      { tech: 'Python', cat: 'language' },
      { tech: 'TypeScript', cat: 'language' },
      { tech: 'PostgreSQL', cat: 'database' },
      { tech: 'MongoDB', cat: 'database' },
      { tech: 'SQLite', cat: 'database' },
      { tech: 'Vercel', cat: 'deploy' },
      { tech: 'Netlify', cat: 'deploy' },
      { tech: 'Docker', cat: 'deploy' },
      { tech: 'GitHub Pages', cat: 'deploy' },
      { tech: 'Tailwind CSS', cat: 'tool' },
      { tech: 'D3.js', cat: 'tool' },
      { tech: 'TensorFlow', cat: 'ai' },
      { tech: 'OpenAI', cat: 'ai' },
      { tech: 'Express', cat: 'framework' },
    ];
    for (const d of defaults) {
      this.skills.set(d.tech, {
        technology: d.tech,
        category: d.cat,
        successCount: 1,
        failureCount: 0,
        avgUxScore: 0.6,
        avgDeployScore: 0.7,
        compatibilityScores: new Map(),
        lastUsed: deterministicNow(this.seed),
        strengthScore: 0.65,
      });
    }
    this.buildCompatibilityMatrix();
  }

  private buildCompatibilityMatrix(): void {
    const frameworks = ['React', 'Next.js', 'Vue', 'Svelte'];
    const backends = ['Express', 'Node.js', 'Python'];
    const databases = ['PostgreSQL', 'MongoDB', 'SQLite'];
    const deploys = ['Vercel', 'Netlify', 'Docker', 'GitHub Pages'];

    for (const skill of this.skills.values()) {
      for (const other of this.skills.values()) {
        if (skill.technology === other.technology) continue;
        let compat = 0.5;
        if (skill.technology === 'Next.js' && other.technology === 'Vercel') compat = 0.95;
        if (skill.technology === 'Netlify' && other.technology === 'Vue') compat = 0.85;
        if (frameworks.includes(skill.technology) && backends.includes(other.technology)) compat = 0.8;
        if (frameworks.includes(skill.technology) && databases.includes(other.technology)) compat = 0.7;
        if (skill.category === 'ai' && other.category === 'language') compat = 0.85;
        skill.compatibilityScores.set(other.technology, compat);
      }
    }
  }

  recordProjectOutcome(techStack: string[], uxScore: number, deploySuccess: boolean, buildSuccess: boolean): void {
    for (const tech of techStack) {
      const existing = this.skills.get(tech);
      if (existing) {
        if (buildSuccess) existing.successCount++;
        else existing.failureCount++;
        existing.avgUxScore =
          (existing.avgUxScore * (existing.successCount + existing.failureCount - 1) + uxScore) /
          (existing.successCount + existing.failureCount);
        existing.avgDeployScore = deploySuccess
          ? (existing.avgDeployScore * (existing.successCount - 1) + 1) / existing.successCount
          : existing.avgDeployScore * 0.9;
        existing.lastUsed = deterministicNow(this.seed);
        existing.strengthScore = this.computeStrength(existing);
      } else {
        const cat = this.inferCategory(tech);
        const record: SkillRecord = {
          technology: tech,
          category: cat,
          successCount: buildSuccess ? 1 : 0,
          failureCount: buildSuccess ? 0 : 1,
          avgUxScore: uxScore,
          avgDeployScore: deploySuccess ? 0.8 : 0.3,
          compatibilityScores: new Map(),
          lastUsed: deterministicNow(this.seed),
          strengthScore: 0.5,
        };
        for (const other of this.skills.values()) {
          record.compatibilityScores.set(other.technology, 0.5);
          other.compatibilityScores.set(tech, 0.5);
        }
        this.skills.set(tech, record);
      }
    }
  }

  private inferCategory(tech: string): SkillRecord['category'] {
    const lower = tech.toLowerCase();
    if (['react', 'next', 'vue', 'svelte', 'angular', 'express'].some((k) => lower.includes(k))) return 'framework';
    if (['python', 'node', 'typescript', 'javascript', 'rust', 'go'].some((k) => lower.includes(k))) return 'language';
    if (['postgres', 'mongo', 'sqlite', 'mysql', 'redis'].some((k) => lower.includes(k))) return 'database';
    if (['vercel', 'netlify', 'docker', 'github pages', 'aws'].some((k) => lower.includes(k))) return 'deploy';
    if (['tensorflow', 'openai', 'llm', 'ai', 'ml'].some((k) => lower.includes(k))) return 'ai';
    return 'tool';
  }

  private computeStrength(record: SkillRecord): number {
    const total = record.successCount + record.failureCount;
    if (total === 0) return 0.5;
    const successRate = record.successCount / total;
    const uxFactor = record.avgUxScore * 0.2;
    const deployFactor = record.avgDeployScore * 0.2;
    return Math.round(Math.min(1, successRate * 0.6 + uxFactor + deployFactor) * 100) / 100;
  }

  recommendStack(projectContext: string, preferredTechs: string[] = []): StackRecommendation {
    const rng = getSeededRandom(this.seed + projectContext.length);
    const scored = Array.from(this.skills.values())
      .filter((s) => s.strengthScore > 0.4)
      .sort((a, b) => b.strengthScore - a.strengthScore);

    const preferred = preferredTechs.filter((t) => this.skills.has(t));
    const selected = new Set(preferred);

    const categories: SkillRecord['category'][] = ['framework', 'language', 'database', 'deploy', 'tool', 'ai'];
    for (const cat of categories) {
      const best = scored.find((s) => s.category === cat && !selected.has(s.technology));
      if (best && selected.size < 6) selected.add(best.technology);
    }

    while (selected.size < 4 && scored.length > selected.size) {
      const next = scored.find((s) => !selected.has(s.technology));
      if (next) selected.add(next.technology);
      else break;
    }

    const techs = Array.from(selected);
    let compatScore = 1;
    for (let i = 0; i < techs.length; i++) {
      for (let j = i + 1; j < techs.length; j++) {
        const a = this.skills.get(techs[i]!)!;
        compatScore *= a.compatibilityScores.get(techs[j]!) ?? 0.5;
      }
    }

    const predictedSuccess = Math.round(Math.min(1, compatScore + rng.next() * 0.1) * 100) / 100;

    this.decisionLogger.log(
      'strategy',
      'recommend_stack',
      `Recommended stack (${techs.join(', ')}) with ${predictedSuccess} predicted success`,
      predictedSuccess,
      [],
      { technologies: techs, compatibilityScore: compatScore },
    );

    return {
      technologies: techs,
      predictedSuccess,
      compatibilityScore: Math.round(compatScore * 100) / 100,
      rationale: `Selected highest-strength technologies across categories with compatibility score ${Math.round(compatScore * 100)}%`,
    };
  }

  getSkillStrength(technology: string): number {
    return this.skills.get(technology)?.strengthScore ?? 0.3;
  }

  getSkillSummary(): Array<{ technology: string; strength: number; successRate: number; category: string }> {
    return Array.from(this.skills.values())
      .map((s) => ({
        technology: s.technology,
        strength: s.strengthScore,
        successRate:
          s.successCount + s.failureCount > 0
            ? Math.round((s.successCount / (s.successCount + s.failureCount)) * 100) / 100
            : 0,
        category: s.category,
      }))
      .sort((a, b) => b.strength - a.strength);
  }
}

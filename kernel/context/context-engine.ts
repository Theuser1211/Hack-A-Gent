import type { ContextItem, ContextPackage, ContextOptions } from './context-types.js';

const DEFAULT_BUDGET_RATIOS: Record<string, Record<string, number>> = {
  defaults: { system: 1500, task: 1000, skills: 3000, files: 0.3, memory: 0.15, output: 0.1, buffer: 1500 },
  coding: { system: 1000, task: 500, skills: 4000, files: 0.5, memory: 2000, output: 2000, buffer: 1000 },
  planning: { system: 2000, task: 1000, skills: 2000, files: 0.1, memory: 0.3, output: 0.2, buffer: 2000 },
};

export class ContextEngine {
  private items: ContextItem[] = [];

  addItem(item: ContextItem): void {
    this.items.push(item);
  }

  addItems(items: ContextItem[]): void {
    this.items.push(...items);
  }

  clear(): void {
    this.items = [];
  }

  getAll(): ContextItem[] {
    return [...this.items];
  }

  scoreRelevance(candidate: ContextItem, taskDescription: string): number {
    let score = 0;

    // Direct reference match (0-40)
    const desc = taskDescription.toLowerCase();
    const id = candidate.id.toLowerCase();
    const content = candidate.content.toLowerCase();
    if (desc.includes(id)) score += 40;
    else if (desc.split(' ').some((w) => content.includes(w) && w.length > 3)) score += 20;

    // Recency (0-15)
    if (candidate.timestamp) {
      const ageHours = (Date.now() - new Date(candidate.timestamp).getTime()) / 3600000;
      score += Math.max(0, 15 - ageHours);
    } else {
      score += 5;
    }

    // Type affinity (0-20)
    if (candidate.source === 'file' && desc.includes('file')) score += 15;
    else if (candidate.source === 'memory' && desc.includes('memory')) score += 15;
    else if (candidate.source === 'skill' && desc.includes('skill')) score += 15;
    else score += 5;

    // Semantic keyword overlap (0-15)
    const taskWords = new Set(desc.split(/\s+/).filter((w) => w.length > 3));
    const contentWords = new Set(content.split(/\s+/).filter((w) => w.length > 3));
    const overlap = [...taskWords].filter((w) => contentWords.has(w)).length;
    score += Math.min(15, overlap * 3);

    return Math.min(100, Math.max(0, score));
  }

  rank(taskDescription: string): ContextItem[] {
    for (const item of this.items) {
      item.relevance_score = this.scoreRelevance(item, taskDescription);
    }
    return [...this.items].sort((a, b) => b.relevance_score - a.relevance_score);
  }

  compress(items: ContextItem[], budget: number): { items: ContextItem[]; warnings: string[] } {
    const warnings: string[] = [];
    let totalTokens = items.reduce((s, i) => s + i.content.length, 0);

    // Sort by relevance
    const sorted = [...items].sort((a, b) => b.relevance_score - a.relevance_score);

    // Drop low relevance items
    const filtered = sorted.filter((item) => {
      if (item.relevance_score < 10 && totalTokens > budget) {
        totalTokens -= item.content.length;
        warnings.push(`Dropped low-relevance item "${item.id}" (score: ${item.relevance_score})`);
        return false;
      }
      return true;
    });

    // Summarize medium relevance items
    for (const item of filtered) {
      if (totalTokens <= budget) break;
      if (item.relevance_score < 40 && item.content.length > 200) {
        const summary = this.summarize(item.content);
        const saved = item.content.length - summary.length;
        if (saved > 0) {
          item.content = summary;
          totalTokens -= saved;
          warnings.push(`Summarized "${item.id}" (saved ${saved} tokens)`);
        }
      }
    }

    // Truncate oldest items if still over budget
    if (totalTokens > budget) {
      const byAge = [...filtered].sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      for (const item of byAge) {
        if (totalTokens <= budget) break;
        if (item.content.length > 500) {
          const truncated = item.content.slice(0, 300) + '\n...[truncated]' + item.content.slice(-150);
          const saved = item.content.length - truncated.length;
          item.content = truncated;
          totalTokens -= saved;
          warnings.push(`Truncated "${item.id}" (saved ${saved} tokens)`);
        }
      }
    }

    // Re-sort by relevance
    const final = filtered.sort((a, b) => b.relevance_score - a.relevance_score);

    return { items: final, warnings };
  }

  assemble(taskDescription: string, options: ContextOptions): ContextPackage {
    const budget = Math.round(options.modelContextWindow * 0.8);
    const ratios = DEFAULT_BUDGET_RATIOS[options.taskType] ?? DEFAULT_BUDGET_RATIOS.defaults!;
    const ranked = this.rank(taskDescription);

    const { items: compressed, warnings } = this.compress(ranked, budget);

    const totalTokens = compressed.reduce((s, i) => s + i.content.length, 0);

    return {
      items: compressed,
      total_tokens: totalTokens,
      budget,
      sufficient: totalTokens <= budget,
      warnings,
    };
  }

  private summarize(text: string): string {
    const lines = text.split('\n');
    if (lines.length <= 5) return text;
    const first = lines.slice(0, 3).join('\n');
    const last = lines.slice(-2).join('\n');
    return `${first}\n...[summarized ${lines.length - 5} lines]...\n${last}`;
  }
}

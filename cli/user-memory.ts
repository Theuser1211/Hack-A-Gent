import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

export interface UserMemoryData {
  /** Tech stacks the user has used before (deduplicated, most recent first) */
  usedStacks: string[];
  /** Deployment targets used before */
  usedDeployTargets: string[];
  /** Previous hackathon project names */
  previousHackathons: string[];
  /** LLM providers the user has configured */
  knownProviders: string[];
  /** Most recently used framework */
  lastFramework: string;
  /** Number of completed runs */
  totalRuns: number;
  /** Last updated timestamp */
  updatedAt: string;
}

const DEFAULT_MEMORY: UserMemoryData = {
  usedStacks: [],
  usedDeployTargets: [],
  previousHackathons: [],
  knownProviders: [],
  lastFramework: '',
  totalRuns: 0,
  updatedAt: new Date(0).toISOString(),
};

/**
 * Persistent user memory that remembers preferences across CLI runs.
 *
 * - Stores preferences in a JSON file under `<dataDir>/user-memory.json`
 * - Never stores API keys, tokens, or sensitive information
 * - Only records what the user explicitly provides or what we observe from successful runs
 * - Provides `apply()` to fill in missing context from history
 * - Provides `explain()` to describe what was reused and why
 */
export class UserMemory {
  private readonly filePath: string;
  private data: UserMemoryData;

  constructor(dataDir: string) {
    const dir = path.resolve(dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, 'user-memory.json');
    this.data = this.load();
  }

  /** Load memory from disk, or return defaults if file doesn't exist */
  private load(): UserMemoryData {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<UserMemoryData>;
        return { ...DEFAULT_MEMORY, ...parsed };
      }
    } catch {
      // Corrupted file — reset to defaults
    }
    return { ...DEFAULT_MEMORY };
  }

  /** Persist current data to disk */
  private save(): void {
    this.data.updatedAt = new Date().toISOString();
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {
      // Silently fail — memory is non-critical
    }
  }

  // ── Record methods ─────────────────────────────────────────────────────────

  /** Record a stack the user chose for a project */
  recordStack(stack: string): void {
    if (!stack) return;
    this.data.usedStacks = [stack, ...this.data.usedStacks.filter(s => s !== stack)].slice(0, 10);
    this.save();
  }

  /** Record a deployment target used */
  recordDeployTarget(target: string): void {
    if (!target || target.includes('/mock/')) return;
    this.data.usedDeployTargets = [target, ...this.data.usedDeployTargets.filter(t => t !== target)].slice(0, 5);
    this.save();
  }

  /** Record a completed hackathon project */
  recordHackathon(projectName: string): void {
    if (!projectName) return;
    this.data.previousHackathons = [projectName, ...this.data.previousHackathons.filter(p => p !== projectName)].slice(0, 20);
    this.data.totalRuns++;
    this.save();
  }

  /** Record a framework used */
  recordFramework(framework: string): void {
    if (!framework) return;
    this.data.lastFramework = framework;
    this.save();
  }

  /** Record an LLM provider the user has configured */
  recordProvider(provider: string): void {
    if (!provider) return;
    this.data.knownProviders = [provider, ...this.data.knownProviders.filter(p => p !== provider)].slice(0, 5);
    this.save();
  }

  // ── Query methods ──────────────────────────────────────────────────────────

  /** Get the most frequently used stack, or null */
  getMostUsedStack(): string | null {
    if (this.data.usedStacks.length === 0) return null;
    return this.data.usedStacks[0]!;
  }

  /** Get the most recently used deployment target, or null */
  getLastDeployTarget(): string | null {
    if (this.data.usedDeployTargets.length === 0) return null;
    return this.data.usedDeployTargets[0]!;
  }

  /** Get the last used framework, or null */
  getLastFramework(): string | null {
    return this.data.lastFramework || null;
  }

  /** Get total completed runs */
  getTotalRuns(): number {
    return this.data.totalRuns;
  }

  /** Get known providers */
  getKnownProviders(): string[] {
    return [...this.data.knownProviders];
  }

  /** Get previous hackathon names (most recent first) */
  getRecentHackathons(limit = 5): string[] {
    return this.data.previousHackathons.slice(0, limit);
  }

  /**
   * Apply user memory to fill in missing context.
   * Returns a list of preferences that were reused, so callers can show them.
   */
  apply(context: {
    preferredStack?: string | null;
    deployTarget?: string | null;
    framework?: string | null;
  }): { stackReused: boolean; deployReused: boolean; messages: string[] } {
    const messages: string[] = [];
    let stackReused = false;
    let deployReused = false;

    // Fill in preferred stack from memory if not provided
    if (!context.preferredStack && this.data.usedStacks.length > 0) {
      stackReused = true;
    }

    // Fill in deploy target from memory if not provided
    if (!context.deployTarget && this.data.usedDeployTargets.length > 0) {
      deployReused = true;
    }

    // Generate explain messages
    if (stackReused) {
      const stack = this.data.usedStacks[0]!;
      const count = this.data.usedStacks.length;
      messages.push(`Using your preferred stack: ${stack} (used in ${count} previous ${count === 1 ? 'project' : 'projects'})`);
    }
    if (deployReused) {
      const target = this.data.usedDeployTargets[0]!;
      messages.push(`Using your last deployment target: ${target}`);
    }
    if (this.data.totalRuns > 0 && messages.length === 0) {
      messages.push(`${this.data.totalRuns} previous run(s) recorded — preferences available for future projects`);
    }

    return { stackReused, deployReused, messages };
  }

  /**
   * Generate a human-readable summary of what was reused from memory.
   * Used by `hag explain` to show preference reuse.
   */
  explain(): string[] {
    const lines: string[] = [];
    if (this.data.totalRuns === 0) return ['No previous runs recorded yet.'];

    lines.push(`Total runs: ${this.data.totalRuns}`);
    if (this.data.usedStacks.length > 0) {
      lines.push(`Preferred stacks: ${this.data.usedStacks.join(', ')}`);
    }
    if (this.data.lastFramework) {
      lines.push(`Last framework: ${this.data.lastFramework}`);
    }
    if (this.data.usedDeployTargets.length > 0) {
      lines.push(`Deployment targets: ${this.data.usedDeployTargets.join(', ')}`);
    }
    if (this.data.knownProviders.length > 0) {
      lines.push(`Configured providers: ${this.data.knownProviders.join(', ')}`);
    }
    if (this.data.previousHackathons.length > 0) {
      const recent = this.data.previousHackathons.slice(0, 3);
      lines.push(`Recent projects: ${recent.join(', ')}`);
    }
    return lines;
  }

  /** Get the raw data (for debugging) */
  toJSON(): UserMemoryData {
    return { ...this.data };
  }
}

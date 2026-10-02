import { existsSync } from 'node:fs';
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import type { MemoryFile } from '../types/index.js';

// ── Entry Types ───────────────────────────────────────────────────────────

export interface LogEntry {
  timestamp: string;
  phase: string;
  agent_id: string;
  action: string;
  task_id: string | null;
  correlation_id: string;
  body: string;
  result: 'success' | 'failure' | 'partial';
  artifacts: string[];
}

export interface BugEntry {
  id: string;
  timestamp: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  found_by: string;
  phase: string;
  task_id: string | null;
  type: 'functional' | 'security' | 'performance' | 'ux' | 'code_quality';
  description: string;
  files: string[];
  steps_to_reproduce: string;
  status: 'open' | 'in_progress' | 'fixed' | 'verified' | 'wontfix';
  assigned_to: string | null;
  fix_commit: string | null;
  retest_status: 'pending' | 'passed' | 'failed';
}

export interface DecisionEntry {
  id: string;
  timestamp: string;
  decision: string;
  agent_id: string;
  task_id: string | null;
  phase: string;
  context: string;
  alternatives: Array<{ name: string; analysis: string }>;
  rationale: string;
  consequences: string;
  status: 'active' | 'superseded' | 'revoked';
  superseded_by: string | null;
}

export interface TodoSection {
  phase: string;
  milestone: string;
  items: Array<{
    task_id: string;
    description: string;
    assigned_agent: string | null;
    status_symbol: string;
    status: string;
    dependencies: string[];
  }>;
}

// ── Memory Writer ─────────────────────────────────────────────────────────

export class MemoryWriter {
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  private filePath(file: MemoryFile): string {
    return path.join(this.projectDir, file);
  }

  private async ensureDir(): Promise<void> {
    if (!existsSync(this.projectDir)) {
      await mkdir(this.projectDir, { recursive: true });
    }
  }

  // ── AGENT_LOG.md ──────────────────────────────────────────────────────

  async appendLog(entry: LogEntry): Promise<void> {
    await this.ensureDir();
    const content = [
      `## [${entry.timestamp}] Phase: ${entry.phase} — Agent: ${entry.agent_id}`,
      `**Action:** ${entry.action}`,
      entry.task_id ? `**Task:** ${entry.task_id}` : null,
      entry.correlation_id ? `**Correlation:** ${entry.correlation_id}` : null,
      '',
      entry.body,
      '',
      `**Result:** ${entry.result}`,
      entry.artifacts.length > 0 ? `**Artifacts:** ${entry.artifacts.join(', ')}` : null,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    await appendFile(this.filePath('AGENT_LOG.md'), content, 'utf-8');
  }

  // ── BUGS.md ────────────────────────────────────────────────────────────

  async appendBug(entry: BugEntry): Promise<void> {
    await this.ensureDir();
    const content = [
      `## ${entry.id} [${entry.timestamp}]`,
      `**Severity:** ${entry.severity}`,
      `**Found By:** ${entry.found_by}`,
      `**Phase:** ${entry.phase}`,
      entry.task_id ? `**Task:** ${entry.task_id}` : null,
      `**Type:** ${entry.type}`,
      '',
      `**Description:**`,
      entry.description,
      '',
      `**File(s):**`,
      entry.files.join(', '),
      '',
      `**Steps to Reproduce:**`,
      entry.steps_to_reproduce,
      '',
      `**Status:** ${entry.status}`,
      entry.assigned_to ? `**Assigned To:** ${entry.assigned_to}` : null,
      entry.fix_commit ? `**Fix Commit:** ${entry.fix_commit}` : null,
      `**Retest Status:** ${entry.retest_status}`,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    await appendFile(this.filePath('BUGS.md'), content, 'utf-8');
  }

  // ── DECISIONS.md ──────────────────────────────────────────────────────

  async appendDecision(entry: DecisionEntry): Promise<void> {
    await this.ensureDir();
    const content = [
      `## ${entry.id} [${entry.timestamp}]`,
      `**Decision:** ${entry.decision}`,
      `**Agent:** ${entry.agent_id}`,
      entry.task_id ? `**Task:** ${entry.task_id}` : null,
      `**Phase:** ${entry.phase}`,
      '',
      `**Context:**`,
      entry.context,
      '',
      `**Alternatives Considered:**`,
      ...entry.alternatives.map((a) => `- ${a.name}: ${a.analysis}`),
      '',
      `**Decision Rationale:**`,
      entry.rationale,
      '',
      `**Consequences:**`,
      entry.consequences,
      '',
      `**Status:** ${entry.status}`,
      entry.superseded_by ? `**Superseded By:** ${entry.superseded_by}` : null,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    await appendFile(this.filePath('DECISIONS.md'), content, 'utf-8');
  }

  // ── TODO.md ────────────────────────────────────────────────────────────

  async updateTodo(sections: TodoSection[]): Promise<void> {
    await this.ensureDir();
    const lines: string[] = ['# TODO', ''];

    for (const section of sections) {
      lines.push(`## Phase: ${section.phase}`);
      lines.push('');
      lines.push(`### Milestone: ${section.milestone}`);
      for (const item of section.items) {
        const depsStr = item.dependencies.length > 0 ? ` (depends on: ${item.dependencies.join(', ')})` : '';
        const assignStr = item.assigned_agent ? ` — ${item.assigned_agent}` : '';
        lines.push(`- [${item.status_symbol}] \`${item.task_id}\`${depsStr}${assignStr}`);
        lines.push(`  - Status: ${item.status}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('**Legend:** `x` = completed, ` ` = pending, `!` = blocked, `~` = waiting, `-` = skipped');

    await appendFile(this.filePath('TODO.md'), lines.join('\n'), 'utf-8');
  }

  // ── Query Helpers ────────────────────────────────────────────────────

  async readFile(file: MemoryFile): Promise<string> {
    const fp = this.filePath(file);
    if (!existsSync(fp)) return '';
    return await readFile(fp, 'utf-8');
  }

  async searchLog(keyword: string): Promise<LogEntry[]> {
    const content = await this.readFile('AGENT_LOG.md');
    const entries: LogEntry[] = [];
    const blocks = content.split('## [');

    for (const block of blocks) {
      if (!block.trim()) continue;
      if (block.toLowerCase().includes(keyword.toLowerCase())) {
        const lines = block.split('\n');
        const firstLine = lines[0] ?? '';
        entries.push({
          timestamp: firstLine.replace(/^\[|\]$/g, ''),
          phase: '',
          agent_id: '',
          action: '',
          task_id: null,
          correlation_id: '',
          body: block,
          result: 'success',
          artifacts: [],
        });
      }
    }

    return entries;
  }
}

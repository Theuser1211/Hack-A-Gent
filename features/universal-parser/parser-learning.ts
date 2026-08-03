/**
 * Parser Learning — Structured Failure Tracking
 * ==============================================
 *
 * Records parser failures and patterns so future improvements are data-driven.
 * No ML — just structured learning data for human analysis.
 *
 * Tracks:
 * - Unknown headings (headings we don't recognize)
 * - Missing sections (judging, sponsors, rules, etc.)
 * - Malformed HTML patterns
 * - Unusual layouts
 * - Platform detection failures
 * - Extraction failures per field
 *
 * Persistence:
 * - Data is stored in .hackagent/data/parser-learning.json
 * - Auto-loads on first access, auto-saves after recording
 * - Falls back to in-memory only if disk is unavailable
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { HackathonSpec, PlatformType, FieldConfidence, UniversalExtractedSections } from './types.js';

/** Classification of parser failure */
export type FailureCategory =
  | 'unknown_heading'
  | 'missing_section'
  | 'malformed_html'
  | 'unusual_layout'
  | 'platform_mismatch'
  | 'extraction_failure'
  | 'ai_parse_error'
  | 'validation_error'
  | 'sponsor_detection_miss'
  | 'judging_detection_miss'
  | 'deadline_detection_miss'
  | 'eligibility_detection_miss'
  | 'other';

/** A single recorded failure pattern */
export interface ParserFailure {
  /** Unique identifier for this failure type */
  id: string;
  /** Category of failure */
  category: FailureCategory;
  /** Human-readable description */
  description: string;
  /** The platform this was observed on */
  platform: PlatformType;
  /** The heading or section name that caused the failure (if applicable) */
  sectionName?: string;
  /** The raw HTML snippet that was problematic (truncated) */
  rawSnippet?: string;
  /** How many times this exact failure pattern has been seen */
  occurrenceCount: number;
  /** First time this pattern was seen */
  firstSeen: string;
  /** Last time this pattern was seen */
  lastSeen: string;
  /** Whether a fix/workaround has been implemented */
  resolved: boolean;
  /** Notes about the fix (if resolved) */
  fixNotes?: string;
}

/** A learning record for a specific parse attempt */
export interface ParseLearningRecord {
  /** URL parsed */
  url: string;
  /** Platform detected */
  platform: PlatformType;
  /** Overall confidence */
  confidence: number;
  /** Fields that were successfully extracted */
  extractedFields: string[];
  /** Fields that had to be inferred */
  inferredFields: string[];
  /** Fields that were missing entirely */
  missingFields: string[];
  /** Failures observed during this parse */
  failures: ParserFailure[];
  /** Suggestions for improvement */
  suggestions: string[];
  /** Timestamp */
  timestamp: string;
}

/** Summary of all learning data */
export interface ParserLearningSummary {
  /** Total parses recorded */
  totalParses: number;
  /** Total failures recorded */
  totalFailures: number;
  /** Failure counts by category */
  failuresByCategory: Record<FailureCategory, number>;
  /** Most common unknown headings */
  topUnknownHeadings: Array<{ heading: string; count: number }>;
  /** Most common missing sections */
  topMissingSections: Array<{ section: string; count: number }>;
  /** Platform-specific failure rates */
  platformFailureRates: Record<PlatformType, { total: number; failures: number; rate: number }>;
  /** Suggestions aggregated by frequency */
  topSuggestions: Array<{ suggestion: string; count: number }>;
}

// ─── In-memory Learning Store ──────────────────────────────────────

const failureStore: Map<string, ParserFailure> = new Map();
const learningRecords: ParseLearningRecord[] = [];
const MAX_RECORDS = 1000;
const MAX_FAILURES = 500;

// ─── Disk Persistence ──────────────────────────────────────────────

let diskLoaded = false;
let diskSaveQueued = false;
let persistenceEnabled = true;

/**
 * Enable or disable disk persistence.
 * Disable for testing to avoid polluting shared state.
 */
export function setPersistenceEnabled(enabled: boolean): void {
  persistenceEnabled = enabled;
  if (!enabled) {
    diskLoaded = true; // Prevent loading from disk
  } else {
    diskLoaded = false;
  }
}

function getDataPath(): string {
  const stateDir = join(process.cwd(), '.hackagent', 'data');
  return join(stateDir, 'parser-learning.json');
}

function ensureDataDir(): void {
  try {
    const dir = dirname(getDataPath());
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  } catch {
    // Silently ignore — we'll fall back to in-memory only
  }
}

function loadFromDisk(): void {
  if (diskLoaded || !persistenceEnabled) return;
  try {
    const path = getDataPath();
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw) as { failures: ParserFailure[]; records: ParseLearningRecord[] };
      if (data.failures && Array.isArray(data.failures)) {
        for (const f of data.failures) {
          failureStore.set(f.id, f);
        }
      }
      if (data.records && Array.isArray(data.records)) {
        // Keep only recent records up to MAX_RECORDS
        const recent = data.records.slice(-MAX_RECORDS);
        learningRecords.push(...recent);
      }
    }
  } catch {
    // Silently ignore — start fresh
  }
  diskLoaded = true;
}

function saveToDisk(): void {
  if (diskSaveQueued || !persistenceEnabled) return;
  diskSaveQueued = true;
  // Debounce saves to avoid excessive I/O
  setTimeout(() => {
    try {
      ensureDataDir();
      const data = {
        failures: [...failureStore.values()],
        records: learningRecords.slice(-MAX_RECORDS),
        savedAt: new Date().toISOString(),
      };
      writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Silently ignore — data stays in memory
    }
    diskSaveQueued = false;
  }, 100);
}

// ─── Recording Functions ───────────────────────────────────────────

/**
 * Generate a deterministic ID for a failure pattern.
 */
function failureId(category: FailureCategory, sectionName: string, platform: PlatformType): string {
  const key = `${category}:${sectionName}:${platform}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  return `f-${Math.abs(hash).toString(36)}`;
}

/**
 * Record a parser failure pattern.
 */
export function recordFailure(
  category: FailureCategory,
  description: string,
  platform: PlatformType,
  sectionName?: string,
  rawSnippet?: string
): ParserFailure {
  loadFromDisk();
  const id = failureId(category, sectionName ?? 'none', platform);
  const now = new Date().toISOString();

  const existing = failureStore.get(id);
  if (existing) {
    existing.occurrenceCount++;
    existing.lastSeen = now;
    saveToDisk();
    return existing;
  }

  const failure: ParserFailure = {
    id,
    category,
    description,
    platform,
    sectionName,
    rawSnippet: rawSnippet?.slice(0, 500),
    occurrenceCount: 1,
    firstSeen: now,
    lastSeen: now,
    resolved: false,
  };

  failureStore.set(id, failure);
  saveToDisk();
  return failure;
}

/**
 * Record a complete parse learning record.
 */
export function recordParseLearning(record: ParseLearningRecord): void {
  loadFromDisk();
  learningRecords.push(record);
  // Trim old records
  if (learningRecords.length > MAX_RECORDS) {
    learningRecords.splice(0, learningRecords.length - MAX_RECORDS);
  }
  // Trim old failures
  if (failureStore.size > MAX_FAILURES) {
    const sorted = [...failureStore.values()].sort(
      (a, b) => b.occurrenceCount - a.occurrenceCount
    );
    failureStore.clear();
    for (const f of sorted.slice(0, MAX_FAILURES)) {
      failureStore.set(f.id, f);
    }
  }
  saveToDisk();
}

/**
 * Analyze a parse result and record learning data.
 */
export function analyzeAndRecord(
  spec: HackathonSpec,
  sections: UniversalExtractedSections,
  warnings: string[]
): ParseLearningRecord {
  const failures: ParserFailure[] = [];
  const suggestions: string[] = [];

  // Check for missing critical sections
  const criticalSections: Array<{ name: string; check: () => boolean; category: FailureCategory }> = [
    { name: 'judgingCriteria', check: () => spec.judgingCriteria.length > 0, category: 'judging_detection_miss' },
    { name: 'prizes', check: () => spec.prizes.length > 0 && spec.prizes[0]?.description !== 'Prizes not specified', category: 'extraction_failure' },
    { name: 'sponsorAPIs', check: () => spec.sponsorAPIs.length > 0, category: 'sponsor_detection_miss' },
    { name: 'timeline', check: () => spec.timeline.length > 0, category: 'deadline_detection_miss' },
    { name: 'eligibility', check: () => spec.eligibility.length > 0 && spec.eligibility[0]?.rule !== 'Open to all participants', category: 'eligibility_detection_miss' },
    { name: 'deliverables', check: () => spec.deliverables.length > 0, category: 'missing_section' },
  ];

  for (const { name, check, category } of criticalSections) {
    if (!check()) {
      const failure = recordFailure(
        category,
        `Missing or default ${name} after parsing`,
        spec.platform,
        name
      );
      failures.push(failure);
      suggestions.push(`Improve ${name} extraction for platform: ${spec.platform}`);
    }
  }

  // Check for unknown headings in raw sections
  const knownHeadingPatterns = [
    /judg/i, /prize/i, /sponsor/i, /rule/i, /eligib/i, /timeline/i, /deadline/i,
    /submit/i, /deliver/i, /track/i, /theme/i, /team/i, /faq/i, /resourc/i,
    /workshop/i, /schedul/i, /require/i, /restrict/i, /criteria/i, /award/i,
    /sponsor/i, /partner/i, /organiz/i, /host/i, /about/i, /desc/i, /title/i,
  ];

  for (const section of sections.rawSections) {
    const headingText = section.heading.toLowerCase();
    const isKnown = knownHeadingPatterns.some(p => p.test(headingText));
    if (!isKnown && headingText.length > 2 && headingText.length < 100) {
      const failure = recordFailure(
        'unknown_heading',
        `Unrecognized heading: "${section.heading}"`,
        spec.platform,
        section.heading,
        section.textRaw?.slice(0, 200)
      );
      failures.push(failure);
    }
  }

  // Check for low-confidence fields
  const lowConfFields = Object.entries(spec.fieldConfidence)
    .filter(([, conf]) => conf.confidence === 'low')
    .map(([field]) => field);

  if (lowConfFields.length > 3) {
    suggestions.push(`Many low-confidence fields (${lowConfFields.length}): ${lowConfFields.slice(0, 5).join(', ')}`);
  }

  // Check for warnings that indicate patterns
  for (const warning of warnings) {
    if (warning.includes('not found') || warning.includes('missing')) {
      const failure = recordFailure(
        'extraction_failure',
        warning,
        spec.platform,
        warning.split(':')[0]
      );
      failures.push(failure);
    }
  }

  const record: ParseLearningRecord = {
    url: spec.url,
    platform: spec.platform,
    confidence: spec.confidence,
    extractedFields: spec.diagnostics?.extractedFields ?? [],
    inferredFields: spec.diagnostics?.inferredFields ?? [],
    missingFields: spec.diagnostics?.missingFields ?? [],
    failures,
    suggestions,
    timestamp: new Date().toISOString(),
  };

  recordParseLearning(record);
  return record;
}

// ─── Query Functions ───────────────────────────────────────────────

/**
 * Get all unresolved failures.
 */
export function getUnresolvedFailures(): ParserFailure[] {
  return [...failureStore.values()].filter(f => !f.resolved);
}

/**
 * Get failures by category.
 */
export function getFailuresByCategory(category: FailureCategory): ParserFailure[] {
  return [...failureStore.values()].filter(f => f.category === category);
}

/**
 * Get failures for a specific platform.
 */
export function getFailuresByPlatform(platform: PlatformType): ParserFailure[] {
  return [...failureStore.values()].filter(f => f.platform === platform);
}

/**
 * Mark a failure as resolved.
 */
export function markFailureResolved(id: string, fixNotes: string): boolean {
  const failure = failureStore.get(id);
  if (failure) {
    failure.resolved = true;
    failure.fixNotes = fixNotes;
    return true;
  }
  return false;
}

/**
 * Get a summary of all learning data.
 */
export function getLearningSummary(): ParserLearningSummary {
  loadFromDisk();
  const failures = [...failureStore.values()];

  // Category counts
  const failuresByCategory: Record<FailureCategory, number> = {
    unknown_heading: 0, missing_section: 0, malformed_html: 0,
    unusual_layout: 0, platform_mismatch: 0, extraction_failure: 0,
    ai_parse_error: 0, validation_error: 0, sponsor_detection_miss: 0,
    judging_detection_miss: 0, deadline_detection_miss: 0,
    eligibility_detection_miss: 0, other: 0,
  };
  for (const f of failures) {
    failuresByCategory[f.category] = (failuresByCategory[f.category] ?? 0) + f.occurrenceCount;
  }

  // Top unknown headings
  const headingCounts = new Map<string, number>();
  for (const f of failures.filter(f => f.category === 'unknown_heading' && f.sectionName)) {
    headingCounts.set(f.sectionName!, (headingCounts.get(f.sectionName!) ?? 0) + f.occurrenceCount);
  }
  const topUnknownHeadings = [...headingCounts.entries()]
    .map(([heading, count]) => ({ heading, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Top missing sections
  const sectionCounts = new Map<string, number>();
  for (const f of failures.filter(f => f.category === 'missing_section' && f.sectionName)) {
    sectionCounts.set(f.sectionName!, (sectionCounts.get(f.sectionName!) ?? 0) + f.occurrenceCount);
  }
  const topMissingSections = [...sectionCounts.entries()]
    .map(([section, count]) => ({ section, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Platform failure rates
  const platformTotals = new Map<PlatformType, { total: number; failures: number }>();
  for (const r of learningRecords) {
    const current = platformTotals.get(r.platform) ?? { total: 0, failures: 0 };
    current.total++;
    if (r.confidence < 0.5) current.failures++;
    platformTotals.set(r.platform, current);
  }
  const platformFailureRates: Record<PlatformType, { total: number; failures: number; rate: number }> = Object.create(null) as Record<PlatformType, { total: number; failures: number; rate: number }>;
  for (const [platform, data] of platformTotals) {
    platformFailureRates[platform] = {
      ...data,
      rate: data.total > 0 ? data.failures / data.total : 0,
    };
  }

  // Top suggestions
  const suggestionCounts = new Map<string, number>();
  for (const r of learningRecords) {
    for (const s of r.suggestions) {
      suggestionCounts.set(s, (suggestionCounts.get(s) ?? 0) + 1);
    }
  }
  const topSuggestions = [...suggestionCounts.entries()]
    .map(([suggestion, count]) => ({ suggestion, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalParses: learningRecords.length,
    totalFailures: failures.reduce((sum, f) => sum + f.occurrenceCount, 0),
    failuresByCategory,
    topUnknownHeadings,
    topMissingSections,
    platformFailureRates,
    topSuggestions,
  };
}

/**
 * Get recent learning records.
 */
export function getRecentRecords(count: number = 10): ParseLearningRecord[] {
  loadFromDisk();
  return learningRecords.slice(-count);
}

/**
 * Reset all learning data (for testing).
 */
export function resetLearningData(): void {
  failureStore.clear();
  learningRecords.length = 0;
  diskLoaded = false;
}

/**
 * Export learning data as JSON (for persistence).
 */
export function exportLearningData(): string {
  loadFromDisk();
  return JSON.stringify({
    failures: [...failureStore.values()],
    records: learningRecords,
    summary: getLearningSummary(),
  }, null, 2);
}

/**
 * Import learning data from JSON (for persistence).
 */
export function importLearningData(json: string): boolean {
  loadFromDisk();
  try {
    const data = JSON.parse(json) as { failures: ParserFailure[]; records: ParseLearningRecord[] };
    if (data.failures) {
      for (const f of data.failures) {
        failureStore.set(f.id, f);
      }
    }
    if (data.records) {
      learningRecords.push(...data.records);
    }
    saveToDisk();
    return true;
  } catch {
    return false;
  }
}

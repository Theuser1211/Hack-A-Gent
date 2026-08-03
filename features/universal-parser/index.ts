/**
 * Universal Hackathon Parser — Main Entry Point
 * =============================================
 *
 * Orchestrates the complete parsing pipeline:
 * 1. Platform detection (semantic, not hostname-based)
 * 2. Universal section extraction
 * 3. AI semantic normalization (with LLM)
 * 4. Validation and fallback
 * 5. Returns canonical HackathonSpec
 */

import type { RouterEngine } from '../../kernel/llm/router-engine.js';
import type {
  HackathonSpec,
  UniversalParserOptions,
  UniversalParseResult,
  UniversalExtractedSections,
  ExtractionMeta,
  PlatformType,
  StrategyResult,
  ParseStrategy,
  MultiStrategyConfig,
} from './types.js';
import { detectHackathon, detectPlatform, isKnownNonHackathonHost } from './platform-detector.js';
import type { DetectionResult } from './platform-detector.js';
import { extractUniversalSections } from './section-extractor.js';
import { normalizeWithAIRetry, AINormalizationResult } from './ai-normalizer.js';
import { validateAndRepairSpec, createDefaultSpec } from './validator.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { analyzeAndRecord, getLearningSummary } from './parser-learning.js';
import {
  analyzeJudgingIntelligence,
  analyzeSponsorIntelligence,
  analyzeOpportunity,
  analyzeChallengeUnderstanding,
  generateWinningStrategyReport,
} from './intelligence-analyzer.js';
import type { WinningStrategyReport } from './intelligence-analyzer.js';

const PARSER_VERSION = '1.1.0';

const DEFAULT_MULTI_STRATEGY: MultiStrategyConfig = {
  enabled: true,
  minConfidence: 0.65,
  maxStrategies: 3,
  strategies: ['dom_heading', 'readable_content', 'semantic_ai'],
};

interface ParserContext {
  url: string;
  html: string;
  options: UniversalParserOptions;
  router?: RouterEngine;
  detectionResult: DetectionResult | null;
  platform: PlatformType;
  sections: UniversalExtractedSections;
  aiResult: AINormalizationResult | null;
  finalSpec: HackathonSpec;
  warnings: string[];
  inferredFields: string[];
  llmCalls: number;
  strategyResults: StrategyResult[];
  bestStrategy: ParseStrategy;
}

export async function parseHackathon(
  url: string,
  html: string,
  options: UniversalParserOptions = {}
): Promise<UniversalParseResult> {
  const startTime = Date.now();
  let aiTimeMs = 0;
  let aiRetryCount = 0;
  let detectionTimeMs = 0;
  let extractionTimeMs = 0;
  let validationTimeMs = 0;

  const multiStrategy: MultiStrategyConfig = {
    ...DEFAULT_MULTI_STRATEGY,
    ...options.multiStrategy,
  };

  const ctx: ParserContext = {
    url,
    html,
    options: {
      minConfidence: options.minConfidence ?? 0.35,
      maxHtmlLength: options.maxHtmlLength ?? 50000,
      seed: options.seed,
      forcePlatform: options.forcePlatform,
      router: options.router,
    },
    router: options.router,
    detectionResult: null,
    platform: 'generic',
    sections: createEmptySections(),
    aiResult: null,
    finalSpec: createDefaultSpec(url, html.length),
    warnings: [],
    inferredFields: [],
    llmCalls: 0,
    strategyResults: [],
    bestStrategy: 'dom_heading',
  };

  try {
    // Record HTML parse time
    const detectionStart = Date.now();

    // Step 1: Quick hostname check for known non-hackathon sites
    if (isKnownNonHackathonHost(url)) {
      ctx.warnings.push(`Known non-hackathon host: ${new URL(url).hostname}`);
      return createFailureResult(ctx, 'Known non-hackathon host (google.com, youtube.com, etc.)', 0.05);
    }

    // Step 2: Semantic platform and hackathon detection
    ctx.detectionResult = detectHackathon(html, url, ctx.options.minConfidence);
    ctx.platform = ctx.options.forcePlatform || ctx.detectionResult.platform;
    detectionTimeMs = Date.now() - detectionStart;

    // Collect detection signals for meta
    const detectionSignals = {
      isHackathon: ctx.detectionResult.isHackathon,
      confidence: ctx.detectionResult.confidence,
      platform: ctx.detectionResult.platform,
      platformConfidence: ctx.detectionResult.platformConfidence,
      warnings: ctx.detectionResult.warnings,
    };

    if (!ctx.detectionResult.isHackathon) {
      ctx.warnings.push(...ctx.detectionResult.warnings);
      return createFailureResult(
        ctx,
        `Not a hackathon: ${ctx.detectionResult.reasoning || 'Content does not match hackathon patterns'}`,
        ctx.detectionResult.confidence,
        detectionSignals
      );
    }

    ctx.warnings.push(...ctx.detectionResult.warnings);

    // Step 3: Universal section extraction
    const extractionStart = Date.now();
    ctx.sections = extractUniversalSections(html, ctx.platform);

    // Multi-strategy: Evaluate DOM heading extraction quality
    const domResult = evaluateStrategyResult('dom_heading', ctx);
    ctx.strategyResults.push(domResult);

    // If DOM extraction is weak and we have a router, try readable content
    if (domResult.confidence < multiStrategy.minConfidence && multiStrategy.strategies.includes('readable_content')) {
      const readableResult = evaluateStrategyResult('readable_content', ctx);
      ctx.strategyResults.push(readableResult);
      if (readableResult.confidence > domResult.confidence) {
        ctx.bestStrategy = 'readable_content';
      }
    }

    extractionTimeMs = Date.now() - extractionStart;

    // Step 4: AI Normalization (if router provided)
    if (ctx.router) {
      const aiStart = Date.now();
      ctx.aiResult = await normalizeWithAIRetry(
        ctx.sections,
        url,
        ctx.platform,
        ctx.router,
        ctx.options
      );
      aiTimeMs = Date.now() - aiStart;

      if (ctx.aiResult) {
        ctx.llmCalls = ctx.aiResult.extractionMeta?.llmCalls || 1;
        ctx.inferredFields.push(...(ctx.aiResult.extractionMeta?.inferredFields || []));
        ctx.warnings.push(...(ctx.aiResult.extractionMeta?.warnings || []));

        // Track AI retries based on retry logic
        if (ctx.aiResult.extractionMeta?.warnings?.length > 0) {
          aiRetryCount++;
        }

        if (ctx.aiResult.isHackathon && ctx.aiResult.spec) {
          // Merge AI result with deterministic extraction
          ctx.finalSpec = mergeSpecs(ctx.finalSpec, ctx.aiResult.spec, ctx);
        } else if (!ctx.aiResult.isHackathon) {
          // AI says it's not a hackathon - respect that with high confidence
          return createFailureResult(
            ctx,
            `AI determined not a hackathon: ${ctx.aiResult.reasoning}`,
            ctx.aiResult.confidence,
            detectionSignals
          );
        }
      }
    }

    // Step 5: Validate and repair the final spec
    const validationStart = Date.now();
    const validation = validateAndRepairSpec(ctx.finalSpec, ctx.sections, ctx.platform);
    ctx.finalSpec = validation.spec;
    ctx.warnings.push(...validation.warnings);
    ctx.inferredFields.push(...validation.inferredFields);
    validationTimeMs = Date.now() - validationStart;

    // Step 5.5: Compute intelligence (deterministic fallback if AI didn't provide it)
    computeIntelligence(ctx);

    // Step 6: Build extraction metadata
    const meta: ExtractionMeta = {
      extractedAt: new Date().toISOString(),
      parserVersion: PARSER_VERSION,
      platformNotes: [`Platform: ${ctx.platform}`, `Detection confidence: ${ctx.detectionResult.confidence.toFixed(2)}`],
      inferredFields: [...new Set(ctx.inferredFields)],
      warnings: ctx.warnings,
      llmCalls: ctx.llmCalls,
      aiNormalized: !!ctx.router && !!ctx.aiResult,
    };
    ctx.finalSpec.meta = meta;

    // Step 7: Update quality metrics and diagnostics
    const totalTimeMs = Date.now() - startTime;
    ctx.finalSpec.qualityMetrics.confidence = ctx.finalSpec.confidence;
    ctx.finalSpec.qualityMetrics.parseTimeMs = totalTimeMs;
    ctx.finalSpec.qualityMetrics.aiTimeMs = aiTimeMs;
    ctx.finalSpec.qualityMetrics.aiRetryCount = aiRetryCount;
    ctx.finalSpec.qualityMetrics.repairActionsCount = ctx.inferredFields.length;
    ctx.finalSpec.qualityMetrics.inferredFieldsCount = ctx.inferredFields.length;
    ctx.finalSpec.qualityMetrics.lowConfidenceFieldsCount = Object.values(ctx.finalSpec.fieldConfidence).filter(f => f.confidence === 'low').length;
    ctx.finalSpec.qualityMetrics.missingSectionsCount = ctx.warnings.filter(w => w.includes('not found')).length;
    ctx.finalSpec.qualityMetrics.sponsorAPIsCount = ctx.finalSpec.sponsorAPIs.length;
    ctx.finalSpec.qualityMetrics.judgingCriteriaCount = ctx.finalSpec.judgingCriteria.length;
    ctx.finalSpec.qualityMetrics.platform = ctx.platform;
    ctx.finalSpec.qualityMetrics.platformConfidence = Math.round(ctx.finalSpec.confidence * 100) / 100;
    ctx.finalSpec.qualityMetrics.warningCount = ctx.warnings.length;
    ctx.finalSpec.qualityMetrics.success = true;

    // Set diagnostics
    ctx.finalSpec.diagnostics.extractedFields = Object.keys(ctx.finalSpec.fieldConfidence).filter(k => ctx.finalSpec.fieldConfidence[k].source === 'extracted');
    ctx.finalSpec.diagnostics.aiGeneratedFields = ['judgingIntelligence', 'sponsorIntelligence', 'opportunityAnalysis', 'challengeUnderstanding'].filter(f => ctx.finalSpec.fieldConfidence[f]?.source === 'ai_interpreted');
    ctx.finalSpec.diagnostics.missingFields = Object.keys(ctx.finalSpec.fieldConfidence).filter(k => ctx.finalSpec.fieldConfidence[k].confidence === 'low');
    ctx.finalSpec.diagnostics.repairActions = ctx.inferredFields;
    ctx.finalSpec.diagnostics.fallbacksUsed = ctx.warnings.filter(w => w.includes('fallback')).map(w => w.split(':')[0]);
    ctx.finalSpec.diagnostics.strategiesAttempted = ctx.strategyResults.map(r => r.strategy);
    ctx.finalSpec.diagnostics.bestStrategy = ctx.bestStrategy;
    ctx.finalSpec.diagnostics.performance = {
      htmlParseTimeMs: detectionTimeMs,
      sectionExtractionTimeMs: extractionTimeMs,
      aiNormalizationTimeMs: aiTimeMs,
      validationTimeMs: validationTimeMs,
      repairTimeMs: 0,
    };

    // Step 8: Generate parseId
    ctx.finalSpec.parseId = createDeterministicUuid(ctx.options.seed || 0, Date.now()).slice(0, 12);

    // Step 9: Record learning data
    analyzeAndRecord(ctx.finalSpec, ctx.sections, ctx.warnings);

    return {
      spec: ctx.finalSpec,
      success: true,
      errors: [],
      rawSections: sectionsToRecord(ctx.sections),
    };
  } catch (error) {
    ctx.warnings.push(`Parser error: ${error instanceof Error ? error.message : String(error)}`);
    return createFailureResult(ctx, `Parse failed: ${error}`, 0);
  }
}

function createEmptySections(): UniversalExtractedSections {
  return {
    title: '',
    tagline: '',
    description: '',
    themes: '',
    judgingCriteria: '',
    prizes: '',
    sponsors: '',
    rules: '',
    deliverables: '',
    timeline: '',
    resources: '',
    faq: '',
    team: '',
    workshops: '',
    metadata: '',
    rawSections: [],
  };
}

function createFailureResult(
  ctx: ParserContext,
  error: string,
  confidence: number,
  detectionSignals?: DetectionResult
): UniversalParseResult {
  const spec = createDefaultSpec(ctx.url, ctx.html.length);
  spec.confidence = confidence;
  spec.platform = ctx.platform;
  spec.meta = {
    extractedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    platformNotes: detectionSignals ? [`Detection: ${JSON.stringify(detectionSignals)}`] : ['Parse failed'],
    inferredFields: [],
    warnings: ctx.warnings,
    llmCalls: ctx.llmCalls,
    aiNormalized: !!ctx.router && !!ctx.aiResult,
  };
  spec.parseId = createDeterministicUuid(ctx.options.seed || 0, Date.now()).slice(0, 12);

  return {
    spec,
    success: false,
    errors: [error],
    rawSections: sectionsToRecord(ctx.sections),
  };
}

function mergeSpecs(base: HackathonSpec, aiSpec: Partial<HackathonSpec>, ctx: ParserContext): HackathonSpec {
  const merged = { ...base };

  if (aiSpec.title) merged.title = aiSpec.title;
  if (aiSpec.tagline) merged.tagline = aiSpec.tagline;
  if (aiSpec.description) merged.description = aiSpec.description;
  if (aiSpec.organizer) merged.organizer = aiSpec.organizer;

  // Arrays - merge intelligently
  if (aiSpec.themes?.length) merged.themes = deduplicate([...base.themes, ...aiSpec.themes]);
  if (aiSpec.tracks?.length) merged.tracks = deduplicate([...base.tracks, ...aiSpec.tracks]);
  if (aiSpec.judgingCriteria?.length) merged.judgingCriteria = mergeCriteria(base.judgingCriteria, aiSpec.judgingCriteria);
  if (aiSpec.scoringMethodology) merged.scoringMethodology = aiSpec.scoringMethodology;
  if (aiSpec.prizes?.length) merged.prizes = mergePrizes(base.prizes, aiSpec.prizes);
  if (aiSpec.sponsorAPIs?.length) merged.sponsorAPIs = mergeSponsors(base.sponsorAPIs, aiSpec.sponsorAPIs);
  if (aiSpec.eligibility?.length) merged.eligibility = deduplicateObjects(base.eligibility, aiSpec.eligibility, 'rule');
  if (aiSpec.restrictions?.length) merged.restrictions = deduplicateObjects(base.restrictions, aiSpec.restrictions, 'rule');
  if (aiSpec.constraints?.length) merged.constraints = deduplicateObjects(base.constraints, aiSpec.constraints, 'rule');
  if (aiSpec.deliverables?.length) merged.deliverables = deduplicateObjects(base.deliverables, aiSpec.deliverables, 'description');
  if (aiSpec.timeline?.length) merged.timeline = mergeTimeline(base.timeline, aiSpec.timeline);
  if (aiSpec.importantLinks?.length) merged.importantLinks = deduplicateObjects(base.importantLinks, aiSpec.importantLinks, 'url');

  // Intelligence fields - AI preference
  if (aiSpec.judgingIntelligence) merged.judgingIntelligence = aiSpec.judgingIntelligence;
  if (aiSpec.sponsorIntelligence) merged.sponsorIntelligence = aiSpec.sponsorIntelligence;
  if (aiSpec.opportunityAnalysis) merged.opportunityAnalysis = aiSpec.opportunityAnalysis;
  if (aiSpec.challengeUnderstanding) merged.challengeUnderstanding = aiSpec.challengeUnderstanding;
  if (aiSpec.fieldConfidence) merged.fieldConfidence = { ...base.fieldConfidence, ...aiSpec.fieldConfidence };

  // Confidence from AI if higher
  if (aiSpec.confidence && aiSpec.confidence > merged.confidence) {
    merged.confidence = aiSpec.confidence;
  }

  return merged;
}

function deduplicate<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function deduplicateObjects<T extends Record<string, unknown>>(base: T[], ai: T[], key: string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of [...base, ...ai]) {
    const val = item[key];
    if (val && !seen.has(val)) {
      seen.add(val);
      result.push(item);
    }
  }
  return result;
}

function mergeCriteria(base: HackathonSpec['judgingCriteria'], ai: HackathonSpec['judgingCriteria']): HackathonSpec['judgingCriteria'] {
  const seen = new Set<string>();
  const result: HackathonSpec['judgingCriteria'] = [];

  for (const c of [...ai, ...base]) {
    const key = c.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
}

function mergePrizes(base: HackathonSpec['prizes'], ai: HackathonSpec['prizes']): HackathonSpec['prizes'] {
  const seen = new Set<string>();
  const result: HackathonSpec['prizes'] = [];

  for (const p of [...ai, ...base]) {
    const key = p.description.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

function mergeSponsors(base: HackathonSpec['sponsorAPIs'], ai: HackathonSpec['sponsorAPIs']): HackathonSpec['sponsorAPIs'] {
  const seen = new Set<string>();
  const result: HackathonSpec['sponsorAPIs'] = [];

  // AI sponsors first (higher confidence)
  for (const s of [...ai, ...base]) {
    const key = s.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(s);
    }
  }
  return result;
}

function mergeTimeline(base: HackathonSpec['timeline'], ai: HackathonSpec['timeline']): HackathonSpec['timeline'] {
  const seen = new Set<string>();
  const result: HackathonSpec['timeline'] = [];

  for (const t of [...ai, ...base]) {
    const key = `${t.label}|${t.date}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(t);
    }
  }
  return result;
}

function sectionsToRecord(sections: UniversalExtractedSections): Record<string, string> {
  const record: Record<string, string> = {};
  const stringKeys: Array<keyof UniversalExtractedSections> = [
    'title', 'tagline', 'description', 'themes', 'judgingCriteria', 'prizes',
    'sponsors', 'rules', 'deliverables', 'timeline', 'resources', 'faq',
    'team', 'workshops', 'metadata'
  ];
  for (const key of stringKeys) {
    const value = sections[key];
    record[key] = typeof value === 'string' ? value : '';
  }
  return record;
}

/**
 * Evaluate a parsing strategy by checking how many fields it populated.
 */
function evaluateStrategyResult(strategy: ParseStrategy, ctx: ParserContext): StrategyResult {
  const start = Date.now();
  const sections = ctx.sections;

  // Weighted field evaluation — title and description are more critical than tagline
  const fieldWeights: Array<{ field: keyof UniversalExtractedSections; weight: number; minLength?: number }> = [
    { field: 'title', weight: 0.25, minLength: 3 },
    { field: 'description', weight: 0.20, minLength: 20 },
    { field: 'judgingCriteria', weight: 0.15 },
    { field: 'prizes', weight: 0.15 },
    { field: 'timeline', weight: 0.10 },
    { field: 'organizer', weight: 0.08, minLength: 2 },
    { field: 'sponsors', weight: 0.07 },
  ];

  let weightedScore = 0;
  let fieldsExtracted = 0;
  let fieldsMissing = 0;

  for (const { field, weight, minLength } of fieldWeights) {
    const value = sections[field];
    const hasValue = typeof value === 'string'
      ? value.trim().length > (minLength ?? 1)
      : Array.isArray(value) && value.length > 0;

    if (hasValue) {
      weightedScore += weight;
      fieldsExtracted++;
    } else {
      fieldsMissing++;
    }
  }

  const timeMs = Date.now() - start;

  return {
    strategy,
    spec: {},
    confidence: Math.round(weightedScore * 100) / 100,
    fieldsExtracted,
    fieldsMissing,
    timeMs,
  };
}

/**
 * Compute intelligence fields deterministically.
 * AI can override these, but we always compute a baseline.
 */
function computeIntelligence(ctx: ParserContext): void {
  const spec = ctx.finalSpec;
  const sections = ctx.sections;

  // Only compute if AI didn't already provide intelligence
  if (!spec.judgingIntelligence || spec.judgingIntelligence.confidence.confidence === 'low') {
    spec.judgingIntelligence = analyzeJudgingIntelligence(spec, sections);
  }

  if (!spec.sponsorIntelligence || spec.sponsorIntelligence.confidence.confidence === 'low') {
    spec.sponsorIntelligence = analyzeSponsorIntelligence(spec, sections);
  }

  if (!spec.opportunityAnalysis || spec.opportunityAnalysis.confidence.confidence === 'low') {
    spec.opportunityAnalysis = analyzeOpportunity(spec, sections);
  }

  if (!spec.challengeUnderstanding || spec.challengeUnderstanding.confidence.confidence === 'low') {
    spec.challengeUnderstanding = analyzeChallengeUnderstanding(spec, sections);
  }

  // Always generate winning strategy report (primary output)
  const report = generateWinningStrategyReport(spec, sections);
  spec.winningStrategyReport = report;
}

// Re-export for backwards compatibility
export { extractUniversalSections } from './section-extractor.js';
export type { UniversalExtractedSections, UniversalParserOptions } from './types.js';
export { detectHackathon, detectPlatform } from './platform-detector.js';
export { normalizeWithAIRetry } from './ai-normalizer.js';
export {
  analyzeAndRecord,
  recordFailure,
  getLearningSummary,
  getRecentRecords,
  exportLearningData,
  importLearningData,
  resetLearningData,
} from './parser-learning.js';
export type { ParserFailure, ParseLearningRecord, ParserLearningSummary, FailureCategory } from './parser-learning.js';
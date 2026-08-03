/**
 * Validator & Repair — Schema Validation with Auto-Repair
 * ======================================================
 *
 * Validates HackathonSpec against schema, repairs common issues,
 * and provides deterministic fallbacks for missing fields.
 */

import type {
  HackathonSpec,
  UniversalExtractedSections,
  PlatformType,
  ExtractionMeta,
  JudgingIntelligence,
  SponsorIntelligence,
  OpportunityAnalysis,
  ChallengeUnderstanding,
  DetailedConstraint,
  FieldConfidence,
  WinningStrategyHint,
  SponsorValueRanking,
  SponsorResource,
  BonusPrizeSponsor,
  SponsorSynergy,
  ProjectDirection,
  RiskyDirection,
} from './types.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';

interface ValidationResult {
  spec: HackathonSpec;
  warnings: string[];
  inferredFields: string[];
}

function defaultFieldConfidence(): FieldConfidence {
  return { confidence: 'low', source: 'inferred' };
}

function defaultJudgingIntelligence(): JudgingIntelligence {
  return {
    actualPriorities: [],
    likelyWinningStrategies: [],
    expectedTechnicalDepth: 5,
    expectedInnovation: 5,
    expectedPresentation: 5,
    expectedBusinessImpact: 5,
    knownBiases: [],
    confidence: defaultFieldConfidence(),
  };
}

function defaultSponsorIntelligence(): SponsorIntelligence {
  return {
    sponsorsByValue: [],
    requiredSponsors: [],
    bonusPrizeSponsors: [],
    synergyOpportunities: [],
    overallStrategy: '',
    confidence: defaultFieldConfidence(),
  };
}

function defaultOpportunityAnalysis(): OpportunityAnalysis {
  return {
    easiestPathToWin: '',
    highestRoiTrack: '',
    strongestDirection: {
      name: '',
      rationale: '',
      keySponsors: [],
      effort: 5,
      scorePotential: 50,
      requiredCapabilities: [],
    },
    riskyDirections: [],
    overusedIdeas: [],
    underservedOpportunities: [],
    confidence: defaultFieldConfidence(),
  };
}

function defaultChallengeUnderstanding(): ChallengeUnderstanding {
  return {
    coreProblem: '',
    targetUsers: [],
    expectedImpact: '',
    organizerMotivation: '',
    successCriteria: [],
    domainKnowledge: [],
    confidence: defaultFieldConfidence(),
  };
}

export function createDefaultSpec(url: string, htmlLength: number, platform: PlatformType = 'generic'): HackathonSpec {
  return {
    parseId: createDeterministicUuid(0, Date.now()).slice(0, 12),
    url,
    platform,
    confidence: 0,
    rawHtmlLength: htmlLength,
    title: 'Untitled Hackathon',
    tagline: '',
    description: '',
    organizer: 'Unknown',
    themes: ['General'],
    tracks: [],
    judgingCriteria: [],
    scoringMethodology: '',
    judgingIntelligence: defaultJudgingIntelligence(),
    sponsorIntelligence: defaultSponsorIntelligence(),
    opportunityAnalysis: defaultOpportunityAnalysis(),
    prizes: [],
    sponsorAPIs: [],
    eligibility: [],
    restrictions: [],
    constraints: [],
    deliverables: [],
    challengeUnderstanding: defaultChallengeUnderstanding(),
    timeline: [],
    importantLinks: [],
    fieldConfidence: {},
    qualityMetrics: {
      confidence: 0,
      parseTimeMs: 0,
      aiTimeMs: 0,
      aiRetryCount: 0,
      repairActionsCount: 0,
      inferredFieldsCount: 0,
      aiInterpretedFieldsCount: 0,
      lowConfidenceFieldsCount: 0,
      missingSectionsCount: 0,
      sponsorAPIsCount: 0,
      judgingCriteriaCount: 0,
      platform: platform,
      platformConfidence: 0,
      warningCount: 0,
      success: false,
    },
    diagnostics: {
      extractedFields: [],
      inferredFields: [],
      aiGeneratedFields: [],
      missingFields: [],
      lowConfidenceFields: [],
      repairActions: [],
      fallbacksUsed: [],
      warnings: [],
      strategiesAttempted: [],
      bestStrategy: 'dom_heading',
      performance: {
        htmlParseTimeMs: 0,
        sectionExtractionTimeMs: 0,
        aiNormalizationTimeMs: 0,
        validationTimeMs: 0,
        repairTimeMs: 0,
      },
    },
    meta: {
      extractedAt: new Date().toISOString(),
      parserVersion: '1.0.0',
      platformNotes: [],
      inferredFields: [],
      warnings: [],
      llmCalls: 0,
      aiNormalized: false,
    },
  };
}

export function validateAndRepairSpec(
  spec: HackathonSpec,
  sections: UniversalExtractedSections,
  platform: PlatformType
): ValidationResult {
  const warnings: string[] = [];
  const inferredFields: string[] = [];
  const repaired = { ...spec };

  // ─── Title ─────────────────────────────────────────────────────
  if (!repaired.title || repaired.title === 'Untitled Hackathon') {
    const extractedTitle = extractTitle(sections, platform);
    if (extractedTitle) {
      repaired.title = extractedTitle;
      inferredFields.push('title');
    } else {
      warnings.push('Title not found, using default');
    }
  }

  // ─── Tagline ───────────────────────────────────────────────────
  if (!repaired.tagline) {
    const tagline = extractTagline(sections, platform);
    if (tagline) {
      repaired.tagline = tagline;
      inferredFields.push('tagline');
    }
  }

  // ─── Description ───────────────────────────────────────────────
  if (!repaired.description) {
    const desc = extractDescription(sections, platform);
    if (desc) {
      repaired.description = desc;
      inferredFields.push('description');
    } else {
      warnings.push('Description not found');
    }
  }

  // ─── Organizer ─────────────────────────────────────────────────
  if (!repaired.organizer || repaired.organizer === 'Unknown') {
    const org = extractOrganizer(sections, platform);
    if (org) {
      repaired.organizer = org;
      inferredFields.push('organizer');
    } else {
      warnings.push('Organizer not found');
    }
  }

  // ─── Themes ────────────────────────────────────────────────────
  if (!repaired.themes || repaired.themes.length === 0 || (repaired.themes.length === 1 && repaired.themes[0] === 'General')) {
    const themes = extractThemes(sections, platform);
    if (themes.length > 0) {
      repaired.themes = themes;
      inferredFields.push('themes');
    } else {
      repaired.themes = ['General'];
    }
  }

  // ─── Tracks ────────────────────────────────────────────────────
  if (!repaired.tracks || repaired.tracks.length === 0) {
    const tracks = extractTracks(sections, platform);
    if (tracks.length > 0) {
      repaired.tracks = tracks;
      inferredFields.push('tracks');
    }
  }

  // ─── Judging Criteria ──────────────────────────────────────────
  if (!repaired.judgingCriteria || repaired.judgingCriteria.length === 0) {
    const criteria = extractJudgingCriteria(sections, platform);
    if (criteria.length > 0) {
      repaired.judgingCriteria = normalizeCriteriaWeights(criteria);
      inferredFields.push('judgingCriteria');
    } else {
      // Create default criteria
      repaired.judgingCriteria = [
        { name: 'Innovation', weight: 30, description: 'Originality and creativity', inferred: true, priority: 'high' },
        { name: 'Technical Implementation', weight: 30, description: 'Code quality and complexity', inferred: true, priority: 'high' },
        { name: 'Impact', weight: 25, description: 'Real-world applicability', inferred: true, priority: 'medium' },
        { name: 'Presentation', weight: 15, description: 'Demo and pitch quality', inferred: true, priority: 'medium' },
      ];
      inferredFields.push('judgingCriteria');
      warnings.push('No judging criteria found, using defaults');
    }
  } else {
    // Normalize existing weights
    repaired.judgingCriteria = normalizeCriteriaWeights(repaired.judgingCriteria);
  }

  // ─── Scoring Methodology ──────────────────────────────────────
  if (!repaired.scoringMethodology) {
    repaired.scoringMethodology = inferScoringMethodology(repaired.judgingCriteria);
  }

  // ─── Prizes ────────────────────────────────────────────────────
  if (!repaired.prizes || repaired.prizes.length === 0) {
    const prizes = extractPrizes(sections, platform);
    if (prizes.length > 0) {
      repaired.prizes = prizes;
      inferredFields.push('prizes');
    } else {
      repaired.prizes = [{
        description: 'Prizes not specified',
        tier: 'unknown',
        rawText: 'Not found in page',
      }];
      warnings.push('No prizes found');
    }
  }

  // ─── Sponsor APIs ──────────────────────────────────────────────
  if (!repaired.sponsorAPIs || repaired.sponsorAPIs.length === 0) {
    const sponsors = extractSponsors(sections, platform);
    if (sponsors.length > 0) {
      repaired.sponsorAPIs = sponsors;
      inferredFields.push('sponsorAPIs');
    }
  }

  // ─── Eligibility ───────────────────────────────────────────────
  if (!repaired.eligibility || repaired.eligibility.length === 0) {
    const eligibility = extractEligibility(sections, platform);
    if (eligibility.length > 0) {
      repaired.eligibility = eligibility;
      inferredFields.push('eligibility');
    } else {
      // Default eligibility
      repaired.eligibility = [
        { rule: 'Open to all participants', type: 'other', required: true },
      ];
    }
  }

  // ─── Restrictions ──────────────────────────────────────────────
  if (!repaired.restrictions || repaired.restrictions.length === 0) {
    const restrictions = extractRestrictions(sections, platform);
    if (restrictions.length > 0) {
      repaired.restrictions = restrictions;
      inferredFields.push('restrictions');
    }
  }

  // ─── Deliverables ──────────────────────────────────────────────
  if (!repaired.deliverables || repaired.deliverables.length === 0) {
    const deliverables = extractDeliverables(sections, platform);
    if (deliverables.length > 0) {
      repaired.deliverables = deliverables;
      inferredFields.push('deliverables');
    } else {
      // Default deliverables
      repaired.deliverables = [
        { description: 'Source code repository (GitHub/GitLab)', format: 'repo', required: true },
        { description: 'Live demo URL', format: 'url', required: true },
        { description: 'Demo video (3-5 minutes)', format: 'video', required: false },
      ];
      inferredFields.push('deliverables');
      warnings.push('No deliverables found, using defaults');
    }
  }

  // ─── Timeline ──────────────────────────────────────────────────
  if (!repaired.timeline || repaired.timeline.length === 0) {
    const timeline = extractTimeline(sections, platform);
    if (timeline.length > 0) {
      repaired.timeline = timeline;
      inferredFields.push('timeline');
    } else {
      warnings.push('No timeline/deadlines found');
    }
  }

  // ─── Important Links ───────────────────────────────────────────
  if (!repaired.importantLinks || repaired.importantLinks.length === 0) {
    const links = extractLinks(sections, platform, repaired.url);
    if (links.length > 0) {
      repaired.importantLinks = links;
      inferredFields.push('importantLinks');
    }
  }

  // ─── Constraints (categorized) ─────────────────────────────────
  const constraints = extractDetailedConstraints(repaired, sections, platform);
  if (constraints.length > 0) {
    repaired.constraints = constraints;
    inferredFields.push('constraints');
  } else if (!repaired.constraints || repaired.constraints.length === 0) {
    repaired.constraints = [];
  }

  // ─── Challenge Understanding ────────────────────────────────────
  const challenge = inferChallengeUnderstanding(repaired);
  if (challenge.coreProblem || challenge.targetUsers.length > 0) {
    repaired.challengeUnderstanding = challenge;
    inferredFields.push('challengeUnderstanding');
  } else if (!repaired.challengeUnderstanding) {
    repaired.challengeUnderstanding = defaultChallengeUnderstanding();
  }

  // ─── Judging Intelligence ───────────────────────────────────────
  const ji = inferJudgingIntelligence(repaired);
  if (
    ji.actualPriorities.length > 0 ||
    ji.likelyWinningStrategies.length > 0 ||
    ji.confidence.source === 'extracted'
  ) {
    repaired.judgingIntelligence = ji;
    inferredFields.push('judgingIntelligence');
  } else if (!repaired.judgingIntelligence) {
    repaired.judgingIntelligence = defaultJudgingIntelligence();
  }

  // ─── Sponsor Intelligence ───────────────────────────────────────
  const si = inferSponsorIntelligence(repaired);
  if (
    si.sponsorsByValue.length > 0 ||
    si.requiredSponsors.length > 0 ||
    si.bonusPrizeSponsors.length > 0 ||
    si.synergyOpportunities.length > 0 ||
    si.overallStrategy
  ) {
    repaired.sponsorIntelligence = si;
    inferredFields.push('sponsorIntelligence');
  } else if (!repaired.sponsorIntelligence) {
    repaired.sponsorIntelligence = defaultSponsorIntelligence();
  }

  // ─── Opportunity Analysis ──────────────────────────────────────
  const oa = inferOpportunityAnalysis(repaired);
  if (oa.easiestPathToWin || oa.strongestDirection.name || oa.highestRoiTrack) {
    repaired.opportunityAnalysis = oa;
    inferredFields.push('opportunityAnalysis');
  } else if (!repaired.opportunityAnalysis) {
    repaired.opportunityAnalysis = defaultOpportunityAnalysis();
  }

  // ─── Per-Field Confidence Tracking ──────────────────────────────
  repaired.fieldConfidence = buildFieldConfidence(repaired, inferredFields);

  // ─── Confidence ────────────────────────────────────────────────
  repaired.confidence = calculateConfidence(repaired, inferredFields.length, warnings.length);

  // ─── Meta ──────────────────────────────────────────────────────
  repaired.meta = {
    ...repaired.meta,
    inferredFields: [...new Set([...repaired.meta.inferredFields, ...inferredFields])],
    warnings: [...new Set([...repaired.meta.warnings, ...warnings])],
  };

  return { spec: repaired, warnings, inferredFields };
}

function calculateConfidence(spec: HackathonSpec, inferredCount: number, warningCount: number): number {
  let confidence = 0.5; // Base

  // Boost for found fields
  const requiredFields = ['title', 'description', 'organizer', 'judgingCriteria', 'prizes', 'timeline', 'deliverables'];
  let foundRequired = 0;
  for (const field of requiredFields) {
    const value = spec[field as keyof HackathonSpec];
    if (Array.isArray(value)) {
      if (value.length > 0) foundRequired++;
    } else if (value && typeof value === 'string' && value.trim() && value !== 'Unknown' && value !== 'Untitled Hackathon') {
      foundRequired++;
    }
  }
  confidence += (foundRequired / requiredFields.length) * 0.4;

  // Penalty for inferred fields
  confidence -= Math.min(0.2, inferredCount * 0.02);

  // Penalty for warnings
  confidence -= Math.min(0.15, warningCount * 0.02);

  return Math.max(0.05, Math.min(1, confidence));
}

// ─── Field Extractors ────────────────────────────────────────────

function extractTitle(sections: UniversalExtractedSections, platform: PlatformType): string | null {
  if (sections.title) return sections.title.trim();
  if (sections.tagline) return sections.tagline.trim();
  // Try first heading in raw sections
  const firstHeading = sections.rawSections.find(s => s.level === 1 && s.field !== 'metadata');
  if (firstHeading) return firstHeading.heading.trim();
  return null;
}

function extractTagline(sections: UniversalExtractedSections, platform: PlatformType): string | null {
  if (sections.tagline) return sections.tagline.trim();
  // Try to get first sentence of description
  if (sections.description) {
    const sentences = sections.description.split(/[.!?]+/);
    const first = sentences[0];
    if (first) return first.trim() + '.';
  }
  return null;
}

function extractDescription(sections: UniversalExtractedSections, platform: PlatformType): string | null {
  if (sections.description) return sections.description.trim().slice(0, 5000);
  // Fallback to metadata or other sections
  if (sections.metadata) return sections.metadata.trim().slice(0, 5000);
  return null;
}

function extractOrganizer(sections: UniversalExtractedSections, platform: PlatformType): string | null {
  // Check metadata for organizer info
  if (sections.metadata) {
    const orgMatch = sections.metadata.match(/(?:organized by|hosted by|presented by|sponsored by)\s+([A-Z][A-Za-z0-9&.'\s-]{1,60})/i);
    if (orgMatch?.[1]) return orgMatch[1].trim();
  }
  // Check rules section
  if (sections.rules) {
    const orgMatch = sections.rules.match(/(?:organized by|hosted by|presented by)\s+([A-Z][A-Za-z0-9&.'\s-]{1,60})/i);
    if (orgMatch?.[1]) return orgMatch[1].trim();
  }
  // Check description
  if (sections.description) {
    const orgMatch = sections.description.match(/(?:organized by|hosted by|presented by)\s+([A-Z][A-Za-z0-9&.'\s-]{1,60})/i);
    if (orgMatch?.[1]) return orgMatch[1].trim();
  }
  return null;
}

function extractThemes(sections: UniversalExtractedSections, platform: PlatformType): string[] {
  const themes: string[] = [];

  // From themes section
  if (sections.themes) {
    // Look for theme-like patterns
    const themeMatches = sections.themes.match(/(?:theme|track|category|focus)[:\s]+([A-Za-z&/+\- ]{2,40})/gi);
    if (themeMatches) {
      for (const m of themeMatches) {
        const cleaned = m.replace(/^(?:theme|track|category|focus)[:\s]+/i, '').trim();
        if (cleaned.length > 1) themes.push(cleaned);
      }
    }
    // Also split by common delimiters
    const parts = sections.themes.split(/[,;\n|]/);
    for (const p of parts) {
      const cleaned = p.trim().replace(/^##\s*/, '');
      if (cleaned.length > 1 && cleaned.length < 50 && !themes.includes(cleaned)) {
        themes.push(cleaned);
      }
    }
  }

  // From tags in description
  const commonThemes = ['ai', 'ml', 'fintech', 'health', 'education', 'climate', 'web3', 'blockchain', 'ar', 'vr', 'gaming', 'social', 'productivity', 'sustainability', 'accessibility', 'developer tools', 'security', 'privacy'];
  const searchText = (sections.description + ' ' + sections.themes + ' ' + sections.metadata).toLowerCase();
  for (const theme of commonThemes) {
    if (searchText.includes(theme) && !themes.some(t => t.toLowerCase() === theme)) {
      themes.push(theme.charAt(0).toUpperCase() + theme.slice(1));
    }
  }

  return themes.slice(0, 10);
}

function extractTracks(sections: UniversalExtractedSections, platform: PlatformType): string[] {
  const tracks: string[] = [];

  if (sections.themes) {
    const trackMatches = sections.themes.match(/(?:track|category)[:\s]+([A-Za-z&/+\- ]{2,60})/gi);
    if (trackMatches) {
      for (const m of trackMatches) {
        const cleaned = m.replace(/^(?:track|category)[:\s]+/i, '').trim();
        if (cleaned.length > 1) tracks.push(cleaned);
      }
    }
  }

  if (sections.metadata) {
    const trackMatches = sections.metadata.match(/(?:track|category)[:\s]+([A-Za-z&/+\- ]{2,60})/gi);
    if (trackMatches) {
      for (const m of trackMatches) {
        const cleaned = m.replace(/^(?:track|category)[:\s]+/i, '').trim();
        if (cleaned.length > 1 && !tracks.includes(cleaned)) tracks.push(cleaned);
      }
    }
  }

  return tracks.slice(0, 8);
}

function extractJudgingCriteria(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['judgingCriteria'] {
  const criteria: HackathonSpec['judgingCriteria'] = [];

  if (!sections.judgingCriteria) return criteria;

  // Try to extract from <li> items with weights
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;
  while ((liMatch = liPattern.exec(sections.judgingCriteria)) !== null) {
    const liContent = liMatch[1] ?? '';
    const text = liContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Pattern: "Name — 40%" or "Name: 40 points"
    const weightMatch = text.match(/^([A-Za-z][\w &/+\-]{2,50}?)\s*[:\-—–]\s*(\d{1,3})\s*(?:%|pts?|points?)/i);
    if (weightMatch) {
      const name = weightMatch[1]?.trim() ?? '';
      const weight = parseInt(weightMatch[2] ?? '0', 10);
      if (name && weight > 0 && weight <= 100) {
        criteria.push({
          name: titleCase(name),
          weight,
          description: '',
          inferred: false,
          priority: weight >= 30 ? 'critical' : weight >= 20 ? 'high' : weight >= 10 ? 'medium' : 'low',
        });
      }
    } else {
      // Check for <strong> tags
      const strongMatch = liContent.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
      if (strongMatch?.[1]) {
        const name = strongMatch[1].replace(/<[^>]+>/g, '').trim();
        if (name.length >= 3) {
          criteria.push({
            name: titleCase(name),
            weight: 10, // Will be normalized
            description: liContent.replace(/<strong[^>]*>[\s\S]*?<\/strong>/i, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            inferred: false,
            priority: 'medium',
          });
        }
      }
    }
  }

  // If no criteria found, try line-by-line
  if (criteria.length === 0) {
    const lines = sections.judgingCriteria.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const weightMatch = line.match(/^([A-Za-z][\w &/+\-]{2,50}?)\s*[:\-—–]\s*(\d{1,3})\s*(?:%|pts?|points?)/i);
      if (weightMatch) {
        const name = weightMatch[1]?.trim() ?? '';
        const weight = parseInt(weightMatch[2] ?? '0', 10);
        if (name && weight > 0 && weight <= 100) {
          criteria.push({
            name: titleCase(name),
            weight,
            description: '',
            inferred: false,
            priority: weight >= 30 ? 'critical' : weight >= 20 ? 'high' : weight >= 10 ? 'medium' : 'low',
          });
        }
      }
    }
  }

  return criteria;
}

function normalizeCriteriaWeights(criteria: HackathonSpec['judgingCriteria']): HackathonSpec['judgingCriteria'] {
  if (criteria.length === 0) return criteria;

  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) {
    const equalWeight = Math.round(100 / criteria.length);
    return criteria.map(c => ({ ...c, weight: equalWeight }));
  }

  if (total >= 90 && total <= 110) return criteria; // Already normalized

  // Scale to 100
  const scaled = criteria.map(c => ({
    ...c,
    weight: Math.max(1, Math.round((c.weight / total) * 100)),
  }));

  // Fix rounding errors
  const newTotal = scaled.reduce((sum, c) => sum + c.weight, 0);
  const diff = 100 - newTotal;
  if (diff !== 0 && scaled.length > 0) {
    const idx = scaled.reduce((best, c, i) => c.weight > (scaled[best]?.weight ?? 0) ? i : best, 0);
    if (scaled[idx]) scaled[idx].weight += diff;
  }

  return scaled;
}

function inferScoringMethodology(criteria: HackathonSpec['judgingCriteria']): string {
  if (criteria.length === 0) return 'Equal weighting across criteria';

  const hasWeights = criteria.some(c => c.weight > 0 && c.weight < 100);
  if (hasWeights) {
    const sorted = [...criteria].sort((a, b) => b.weight - a.weight);
    return `Weighted scoring: ${sorted.map(c => `${c.name} (${c.weight}%)`).join(', ')}`;
  }
  return `Equal weighting across ${criteria.length} criteria`;
}

function extractPrizes(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['prizes'] {
  const prizes: HackathonSpec['prizes'] = [];

  const searchText = sections.prizes || sections.metadata || sections.description || '';

  // Cash prizes
  const cashMatches = searchText.match(/\$[\d,]+(?:\s*(?:USD|usd|prize|award|pool|fund|grant|grand|first|second|third|place))?/gi);
  if (cashMatches) {
    for (const match of cashMatches) {
      const numMatch = match.match(/[\d,]+/);
      const value = numMatch ? parseInt(numMatch[0].replace(/,/g, ''), 10) : 0;
      let tier: HackathonSpec['prizes'][0]['tier'] = 'unknown';
      const lower = match.toLowerCase();
      if (lower.includes('grand') || lower.includes('first') || lower.includes('1st')) tier = 'grand';
      else if (lower.includes('second') || lower.includes('2nd')) tier = 'second';
      else if (lower.includes('third') || lower.includes('3rd')) tier = 'third';
      else if (value >= 5000) tier = 'grand';
      else if (value >= 1000) tier = 'first';

      prizes.push({
        description: match.trim(),
        cashValueUsd: value >= 100 ? value : undefined,
        tier,
        rawText: match.trim(),
      });
    }
  }

  // Non-cash prizes
  const nonCashPatterns = [
    /certificates?/gi,
    /troph(?:y|ies)/gi,
    /swag/gi,
    /goodies?/gi,
    /credits?/gi,
    /grants?/gi,
    /mentorship/gi,
    /incubation/gi,
    /internship/gi,
    /job offer/gi,
  ];

  for (const pattern of nonCashPatterns) {
    const matches = searchText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const contextStart = Math.max(0, searchText.indexOf(match) - 100);
        const contextEnd = Math.min(searchText.length, searchText.indexOf(match) + 200);
        const context = searchText.slice(contextStart, contextEnd).trim();
        prizes.push({
          description: context,
          tier: 'non-cash',
          rawText: context,
        });
      }
    }
  }

  return prizes.slice(0, 10);
}

function extractSponsors(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['sponsorAPIs'] {
  const sponsors: HackathonSpec['sponsorAPIs'] = [];
  const knownSponsors: Record<string, { category: HackathonSpec['sponsorAPIs'][0]['category']; value: number; desc: string }> = {
    'openai': { category: 'ai', value: 5, desc: 'GPT models, embeddings, DALL-E' },
    'anthropic': { category: 'ai', value: 5, desc: 'Claude models' },
    'google': { category: 'ai', value: 4, desc: 'Gemini, Vertex AI' },
    'gemini': { category: 'ai', value: 4, desc: 'Google Gemini models' },
    'hugging face': { category: 'ml', value: 4, desc: 'Model hub, inference endpoints' },
    'twilio': { category: 'comms', value: 4, desc: 'SMS, voice, WhatsApp' },
    'stripe': { category: 'payments', value: 4, desc: 'Payments, billing' },
    'firebase': { category: 'data', value: 3, desc: 'Auth, Firestore, hosting' },
    'supabase': { category: 'data', value: 4, desc: 'Postgres, auth, realtime' },
    'aws': { category: 'hosting', value: 3, desc: 'Bedrock, Lambda, S3' },
    'azure': { category: 'hosting', value: 3, desc: 'OpenAI on Azure, cloud services' },
    'vercel': { category: 'hosting', value: 4, desc: 'Frontend deployment' },
    'netlify': { category: 'hosting', value: 3, desc: 'Edge functions, forms' },
    'auth0': { category: 'auth', value: 3, desc: 'Authentication' },
    'clerk': { category: 'auth', value: 3, desc: 'Authentication' },
    'nvidia': { category: 'ai', value: 4, desc: 'NIMs inference' },
    'cohere': { category: 'ai', value: 3, desc: 'LLM APIs' },
    'mistral': { category: 'ai', value: 3, desc: 'Open models' },
    'groq': { category: 'ai', value: 3, desc: 'Fast inference' },
    'pinecone': { category: 'data', value: 3, desc: 'Vector database' },
    'weaviate': { category: 'data', value: 3, desc: 'Vector database' },
    'langchain': { category: 'ai', value: 2, desc: 'Orchestration framework' },
    'llamaindex': { category: 'ai', value: 2, desc: 'RAG framework' },
    'sendgrid': { category: 'comms', value: 2, desc: 'Email API' },
    'resend': { category: 'comms', value: 2, desc: 'Email API' },
    'meta': { category: 'social', value: 3, desc: 'WhatsApp, Instagram APIs' },
    'replit': { category: 'hosting', value: 3, desc: 'Online IDE' },
    'render': { category: 'hosting', value: 2, desc: 'Cloud hosting' },
    'cloudflare': { category: 'hosting', value: 3, desc: 'CDN, Workers, Pages' },
    'mongodb': { category: 'data', value: 3, desc: 'Document database' },
    'datastax': { category: 'data', value: 2, desc: 'Astra DB' },
    'confluent': { category: 'data', value: 2, desc: 'Kafka streaming' },
    'algorand': { category: 'blockchain', value: 3, desc: 'Layer 1 blockchain' },
    'polygon': { category: 'blockchain', value: 3, desc: 'Ethereum L2' },
    'chainlink': { category: 'blockchain', value: 3, desc: 'Oracle network' },
    'shopify': { category: 'ecommerce', value: 3, desc: 'E-commerce APIs' },
    'coinbase': { category: 'blockchain', value: 3, desc: 'Crypto exchange' },
  };

  const searchText = (sections.sponsors + ' ' + sections.prizes + ' ' + sections.metadata + ' ' + sections.description).toLowerCase();

  for (const [name, info] of Object.entries(knownSponsors)) {
    if (searchText.includes(name.toLowerCase())) {
      sponsors.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        category: info.category,
        mustUse: false,
        strategicValue: info.value as 1 | 2 | 3 | 4 | 5,
        description: info.desc,
        confidence: 'inferred',
      });
    }
  }

  // Also check for image alt text in sponsors section
  const altMatches = sections.sponsors.match(/<img[^>]+alt=["']([^"']{2,60})["']/gi);
  if (altMatches) {
    for (const match of altMatches) {
      const altMatch = match.match(/alt=["']([^"']+)["']/i);
      if (altMatch?.[1]) {
        const alt = altMatch[1].trim();
        if (alt.length >= 3 && alt.length <= 40 && !sponsors.some(s => s.name.toLowerCase() === alt.toLowerCase())) {
          sponsors.push({
            name: alt,
            category: 'other',
            mustUse: false,
            strategicValue: 2,
            description: 'Detected from sponsor logo alt text',
            confidence: 'inferred',
          });
        }
      }
    }
  }

  return sponsors;
}

function extractEligibility(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['eligibility'] {
  const eligibility: HackathonSpec['eligibility'] = [];

  const searchText = sections.rules + ' ' + sections.metadata + ' ' + sections.description;

  const patterns = [
    { pattern: /(?:age|aged)\s*(?:18|21|\+|over|above)\s*(\d+)/gi, type: 'age' as const },
    { pattern: /(?:student|university|college|undergrad|grad)/gi, type: 'student' as const },
    { pattern: /(?:professional|working|industry|expert)/gi, type: 'professional' as const },
    { pattern: /team\s*(?:of|size|max|min|minimum|maximum)\s*(\d+)/gi, type: 'team-size' as const },
    { pattern: /(?:open to|available to|eligible).*?(?:worldwide|global|international|anyone|all)/gi, type: 'geography' as const },
    { pattern: /(?:beginner|novice|starter|no experience)/gi, type: 'skill-level' as const },
  ];

  for (const { pattern, type } of patterns) {
    const matches = searchText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.trim();
        if (!eligibility.some(e => e.rule.toLowerCase().includes(cleaned.toLowerCase()))) {
          eligibility.push({
            rule: cleaned,
            type,
            required: true,
          });
        }
      }
    }
  }

  return eligibility.slice(0, 8);
}

function extractRestrictions(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['restrictions'] {
  const restrictions: HackathonSpec['restrictions'] = [];

  const searchText = sections.rules + ' ' + sections.metadata + ' ' + sections.description;

  const patterns = [
    { pattern: /(?:must\s+(?:not|use)|required\s+to\s+use|mandatory)[^.]*?(?:api|sponsor|platform|technology|tech|stack|tool)/gi, type: 'api' as const, severity: 'hard' as const },
    { pattern: /(?:no|not|prohibited|banned|forbidden)\s+[^.]*?(?:external|third.party|commercial|paid|premium)/gi, type: 'api' as const, severity: 'hard' as const },
    { pattern: /(?:must|required)\s+[^.]*?(?:open.source|public|github|gitlab)/gi, type: 'submission' as const, severity: 'hard' as const },
    { pattern: /(?:ip|intellectual.property|ownership|rights)[^.]*?(?:retain|belong|transfer)/gi, type: 'ip' as const, severity: 'hard' as const },
    { pattern: /(?:commercial|monetiz|sell|profit)[^.]*?(?:not|prohibited|restricted)/gi, type: 'commercial' as const, severity: 'soft' as const },
    { pattern: /(?:team|individual|solo)[^.]*?(?:only|max|min|maximum|minimum)\s*\d+/gi, type: 'team' as const, severity: 'hard' as const },
  ];

  for (const { pattern, type, severity } of patterns) {
    const matches = searchText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.trim();
        if (!restrictions.some(r => r.rule.toLowerCase().includes(cleaned.toLowerCase()))) {
          restrictions.push({
            rule: cleaned,
            type,
            severity,
          });
        }
      }
    }
  }

  return restrictions.slice(0, 8);
}

function extractDeliverables(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['deliverables'] {
  const deliverables: HackathonSpec['deliverables'] = [];

  const searchText = sections.deliverables + ' ' + sections.rules + ' ' + sections.metadata + ' ' + sections.description;

  const patterns = [
    { pattern: /github|gitlab|repository|repo|source\s+code/gi, format: 'repo' as const, desc: 'Source code repository (GitHub/GitLab)' },
    { pattern: /live\s+demo|deployed|deployment|url|link|website/gi, format: 'url' as const, desc: 'Live demo URL' },
    { pattern: /video|screencast|recording|demo\s+video/gi, format: 'video' as const, desc: 'Demo video (3-5 minutes)' },
    { pattern: /readme|documentation|docs|writeup|report/gi, format: 'document' as const, desc: 'Documentation / README' },
    { pattern: /presentation|slides|pitch\s+deck/gi, format: 'document' as const, desc: 'Presentation slides / pitch deck' },
    { pattern: /apk|ipa|binary|executable|build/gi, format: 'file' as const, desc: 'Built application binary' },
  ];

  for (const { pattern, format, desc } of patterns) {
    if (pattern.test(searchText)) {
      deliverables.push({
        description: desc,
        format,
        required: format === 'repo' || format === 'url', // Repo and demo usually required
      });
    }
  }

  return deliverables.slice(0, 6);
}

function extractTimeline(sections: UniversalExtractedSections, platform: PlatformType): HackathonSpec['timeline'] {
  const timeline: HackathonSpec['timeline'] = [];

  const searchText = sections.timeline + ' ' + sections.metadata + ' ' + sections.description + ' ' + sections.rules;

  // Date patterns with labels
  const datePatterns = [
    { pattern: /(?:registration\s+(?:opens?|starts?|begins?))[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}(?:\s+@\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi, type: 'registration' as const },
    { pattern: /(?:registration\s+(?:closes?|ends?|deadline))[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}(?:\s+@\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi, type: 'registration' as const },
    { pattern: /(?:submission\s+(?:deadline|due|closes?|ends?))[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}(?:\s+@\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi, type: 'submission' as const },
    { pattern: /(?:judging|evaluation)[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}(?:\s+@\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi, type: 'judging' as const },
    { pattern: /(?:demo\s+day|final|winner\s+announcement|awards?)[:\s]+([A-Za-z]+\s+\d{1,2},?\s*\d{4}(?:\s+@\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi, type: 'demo' as const },
  ];

  for (const { pattern, type } of datePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(searchText)) !== null) {
      const label = match[0]?.split(':')[0]?.trim() ?? '';
      const date = match[1]?.trim() ?? '';
      // Extract timezone if present
      const tzMatch = date.match(/([A-Z]{2,5}(?:\/[A-Z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)$/);
      const timezone = tzMatch?.[1];
      const cleanDate = timezone ? date.replace(timezone, '').trim() : date;

      timeline.push({
        label,
        date: cleanDate,
        type,
        timezone,
      });
    }
  }

  // Also look for bare dates and infer type
  if (timeline.length === 0) {
    const bareDates = searchText.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s*\d{4}\b/gi);
    if (bareDates) {
      for (const date of bareDates.slice(0, 4)) {
        timeline.push({
          label: 'Key Date',
          date: date.trim(),
          type: 'other',
        });
      }
    }
  }

  return timeline.slice(0, 8);
}

function extractLinks(sections: UniversalExtractedSections, platform: PlatformType, baseUrl: string): HackathonSpec['importantLinks'] {
  const links: HackathonSpec['importantLinks'] = [];
  const searchHtml = sections.resources + ' ' + sections.metadata + ' ' + sections.description + ' ' + sections.rules + ' ' + sections.deliverables;

  // Extract links from HTML
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(searchHtml)) !== null) {
    const url = match[1] ?? '';
    const label = (match[2] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    if (!url || url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('mailto:')) continue;

    let absoluteUrl = url;
    try {
      absoluteUrl = new URL(url, baseUrl).toString();
    } catch {
      continue;
    }

    // Determine purpose
    let purpose: HackathonSpec['importantLinks'][0]['purpose'] = 'other';
    const lowerLabel = label.toLowerCase();
    const lowerUrl = url.toLowerCase();
    if (lowerLabel.includes('regist') || lowerUrl.includes('regist')) purpose = 'registration';
    else if (lowerLabel.includes('rule') || lowerUrl.includes('rule')) purpose = 'rules';
    else if (lowerLabel.includes('api') || lowerLabel.includes('doc') || lowerUrl.includes('api') || lowerUrl.includes('doc')) purpose = 'api-docs';
    else if (lowerLabel.includes('submit') || lowerUrl.includes('submit')) purpose = 'submission';
    else if (lowerLabel.includes('discord') || lowerUrl.includes('discord')) purpose = 'discord';
    else if (lowerLabel.includes('schedule') || lowerUrl.includes('schedule') || lowerLabel.includes('agenda')) purpose = 'schedule';
    else if (lowerLabel.includes('faq') || lowerUrl.includes('faq')) purpose = 'faq';

    if (!links.some(l => l.url === absoluteUrl)) {
      links.push({ label: label || absoluteUrl, url: absoluteUrl, purpose });
    }
  }

  return links.slice(0, 10);
}

function titleCase(str: string): string {
  return str
    .split(/\s+/)
    .map((w): string => {
      if (w.length > 2 && w[0]) return w[0].toUpperCase() + w.slice(1).toLowerCase();
      return w.toLowerCase();
    })
    .join(' ');
}

// ─── Constraint Extraction ────────────────────────────────────────

function extractDetailedConstraints(
  spec: HackathonSpec,
  sections: UniversalExtractedSections,
  _platform: PlatformType
): DetailedConstraint[] {
  const constraints: DetailedConstraint[] = [];
  const searchText = sections.rules + ' ' + sections.metadata + ' ' + sections.description + ' ' + sections.deliverables;

  const knownPatterns: Array<{ pattern: RegExp; category: DetailedConstraint['category']; severity: DetailedConstraint['severity']; note: string }> = [
    { pattern: /\b(?:\d{1,2})\s*(?:hour|hr|h)\s*(?:hack|sprint|duration|duration|event|timeline)\b/gi, category: 'time', severity: 'hard', note: 'Time constraint detected' },
    { pattern: /\b(?:\d{1,2})\s*(?:days?|d)\s*(?:hack|sprint|event|timeline|build)\b/gi, category: 'time', severity: 'hard', note: 'Time constraint detected' },
    { pattern: /\b(?:\d{1,2})\s*(?:weeks?|w)\s*(?:hack|sprint|build)\b/gi, category: 'time', severity: 'hard', note: 'Time constraint detected' },
    { pattern: /\btech\s*stack\b[^.]{0,200}/gi, category: 'technology', severity: 'soft', note: 'Required tech stack' },
    { pattern: /\b(?:must\s+use|required\s+(?:to\s+)?use|mandatory)\b[^.]{0,200}/gi, category: 'api-usage', severity: 'hard', note: 'Required API usage' },
    { pattern: /\b(?:no|not|prohibited|forbidden)\s+[^.]{0,100}(?:api|external|third.party)/gi, category: 'api-usage', severity: 'hard', note: 'API restriction' },
    { pattern: /\b(?:must|required)\s+[^.]{0,100}(?:open.source|github|gitlab|public)/gi, category: 'open-source', severity: 'hard', note: 'Open source requirement' },
    { pattern: /\b(?:(?:mit|apache|gpl|bsd|creative\s+commons|cc\s+by))\s*(?:license|licensed)/gi, category: 'license', severity: 'soft', note: 'License mentioned' },
    { pattern: /\b(?:no\s+(?:reuse|pre.?built|prior|existing))[^.]{0,100}/gi, category: 'submission', severity: 'hard', note: 'Fresh submission required' },
    { pattern: /\b(?:team|team\s*size|groups?\s+of)\s*(?:max|min|minimum|maximum|up\s+to|of)?\s*(\d{1,2})\b/gi, category: 'team', severity: 'hard', note: 'Team size constraint' },
    { pattern: /\b(?:solo|individual|alone|single)\s+entry\b/gi, category: 'team', severity: 'hard', note: 'Solo entry allowed' },
    { pattern: /\b(?:gen\s*ai|generative\s+ai|chatgpt|copilot|gpt)\s+usage[^.]{0,100}/gi, category: 'ai-usage', severity: 'advisory', note: 'AI usage policy' },
    { pattern: /\b(?:ai|llm|genai|gpt)\s*(?:must\s+(?:not|be|disclose)|prohibited|allowed|not\s+allowed)\b[^.]{0,100}/gi, category: 'ai-usage', severity: 'soft', note: 'AI usage policy' },
    { pattern: /\b(?:hardware|physical|device|raspberry\s+pi|arduino|sensor)\s+(?:provided|required|allowed|kit)/gi, category: 'hardware', severity: 'soft', note: 'Hardware constraint' },
    { pattern: /\b(?:open\s+to|eligible|available\s+in|only\s+(?:open|residents|citizens))[^.]{0,100}(?:usa|us|united\s+states|canada|uk|india|europe|eu|asia|global|worldwide|residents|citizens)/gi, category: 'geography', severity: 'hard', note: 'Geographic restriction' },
    { pattern: /\b(?:must\s+be\s+(?:18|21)|age|aged)\s*(?:\d{1,2})\+?/gi, category: 'eligibility', severity: 'hard', note: 'Age eligibility' },
    { pattern: /\b(?:student|enrolled|university|college|full.?time\s+student)\b[^.]{0,100}/gi, category: 'eligibility', severity: 'soft', note: 'Student eligibility' },
    { pattern: /\b(?:budget|spend|cost|\$)\s*(?:\d{1,3}(?:,\d{3})*|\$?\d+)/gi, category: 'budget', severity: 'soft', note: 'Budget constraint' },
    { pattern: /\b(?:ip|intellectual\s+property|ownership|rights)\s+(?:retained|belong|transfer|remain)/gi, category: 'ip-ownership', severity: 'hard', note: 'IP ownership' },
    { pattern: /\b(?:commercial|monetiz|sell|profit)(?:[.\s]+(?:prohibited|not\s+allowed|forbidden|retained))/gi, category: 'commercialization', severity: 'soft', note: 'Commercialization policy' },
  ];

  for (const { pattern, category, severity, note } of knownPatterns) {
    const matches = searchText.match(pattern);
    if (matches) {
      const deduped = Array.from(new Set(matches.map(m => m.trim())));
      for (const rule of deduped.slice(0, 3)) {
        if (!constraints.some(c => c.rule === rule)) {
          constraints.push({
            rule,
            category,
            severity,
            explicit: true,
            confidence: { confidence: 'high', source: 'extracted', notes: note },
          });
        }
      }
    }
  }

  // Add inferred constraints from existing eligibility/restrictions
  for (const e of spec.eligibility) {
    const mapped: DetailedConstraint['category'] =
      e.type === 'student' || e.type === 'age' ? 'eligibility'
      : e.type === 'geography' ? 'geography'
      : e.type === 'team-size' ? 'team'
      : e.type === 'skill-level' ? 'eligibility'
      : 'other';
    if (!constraints.some(c => c.rule === e.rule)) {
      constraints.push({
        rule: e.rule,
        category: mapped,
        severity: e.required ? 'hard' : 'soft',
        explicit: false,
        confidence: { confidence: 'medium', source: 'inferred', notes: 'Inferred from eligibility' },
      });
    }
  }

  for (const r of spec.restrictions) {
    const mapped: DetailedConstraint['category'] =
      r.type === 'api' ? 'api-usage'
      : r.type === 'tech-stack' ? 'technology'
      : r.type === 'team' ? 'team'
      : r.type === 'submission' ? 'submission'
      : r.type === 'ip' ? 'ip-ownership'
      : r.type === 'commercial' ? 'commercialization'
      : 'other';
    if (!constraints.some(c => c.rule === r.rule)) {
      constraints.push({
        rule: r.rule,
        category: mapped,
        severity: r.severity,
        explicit: true,
        confidence: { confidence: 'medium', source: 'extracted', notes: 'From restrictions' },
      });
    }
  }

  return constraints;
}

// ─── Challenge Understanding Inference ──────────────────────────────

function inferChallengeUnderstanding(spec: HackathonSpec): ChallengeUnderstanding {
  const hasData = spec.description || spec.title || spec.themes.length > 0;

  if (!hasData) {
    return defaultChallengeUnderstanding();
  }

  const coreProblem = spec.description
    ? spec.description.slice(0, 300).trim()
    : `${spec.title}: build a project addressing ${spec.themes.join(', ')}`;

  const targetUsers: string[] = [];
  const userPatterns = [
    /\b(?:students?|teachers?|developers?|researchers?|patients?|doctors?|small\s+business(?:es)?|enterprises?|communit(?:y|ies)|consumers?|nonprofits?|startups?|designers?|kids?|children|seniors?|elderly|farmers?|workers?|families?|users?)\b/gi,
  ];
  const searchText = `${spec.description} ${spec.tagline}`;
  for (const p of userPatterns) {
    const matches = searchText.match(p);
    if (matches) {
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (lower && !targetUsers.some(u => u.toLowerCase() === lower)) {
          targetUsers.push(m.charAt(0).toUpperCase() + m.slice(1));
        }
      }
    }
  }

  const expectedImpact = spec.description
    ? extractImpactSentence(spec.description)
    : 'Unknown';

  const organizerMotivation = inferOrganizerMotivation(spec);

  const successCriteria: string[] = [];
  for (const c of spec.judgingCriteria) {
    successCriteria.push(`Demonstrates ${c.name.toLowerCase()}${c.weight ? ` (${c.weight}% weight)` : ''}`);
  }
  if (successCriteria.length === 0) {
    successCriteria.push('Working prototype', 'Clear presentation', 'Solves the stated problem');
  }

  const domainKnowledge: string[] = [];
  const themeLower = spec.themes.join(' ').toLowerCase();
  const domainMap: Record<string, string> = {
    ai: 'Machine Learning / AI',
    ml: 'Machine Learning / AI',
    fintech: 'Financial systems',
    health: 'Healthcare domain',
    education: 'Education domain',
    climate: 'Climate science',
    sustainability: 'Sustainability',
    web3: 'Blockchain / Web3',
    blockchain: 'Blockchain / Web3',
    ar: 'AR/VR development',
    vr: 'AR/VR development',
    gaming: 'Game development',
    security: 'Security / cryptography',
    privacy: 'Privacy engineering',
  };
  for (const [k, v] of Object.entries(domainMap)) {
    if (themeLower.includes(k) && !domainKnowledge.includes(v)) {
      domainKnowledge.push(v);
    }
  }

  return {
    coreProblem,
    targetUsers: targetUsers.slice(0, 6),
    expectedImpact,
    organizerMotivation,
    successCriteria,
    domainKnowledge,
    confidence: {
      confidence: spec.description ? 'medium' : 'low',
      source: 'inferred',
      notes: 'Inferred from description/themes',
    },
  };
}

function extractImpactSentence(description: string): string {
  const impactPatterns = [
    /\b(?:impact|benefit|help|enable|empower|solve|address|improve)[^.]{20,300}\./gi,
    /\b(?:will|aim|goal|mission)[^.]{20,300}\./gi,
  ];
  for (const p of impactPatterns) {
    const matches = description.match(p);
    if (matches && matches[0]) {
      return matches[0].trim();
    }
  }
  return description.slice(0, 200).trim();
}

function inferOrganizerMotivation(spec: HackathonSpec): string {
  const org = spec.organizer && spec.organizer !== 'Unknown' ? spec.organizer : 'The organizer';
  if (spec.sponsorAPIs.length > 0) {
    return `${org} is likely promoting adoption of their technology (${spec.sponsorAPIs.slice(0, 3).map(s => s.name).join(', ')}), attracting developers to their ecosystem, and identifying talent.`;
  }
  if (spec.themes.some(t => /climate|sustain|social|impact|community/i.test(t))) {
    return `${org} aims to drive social/environmental impact and surface solutions to real-world problems via community hackathons.`;
  }
  if (spec.themes.some(t => /ai|ml|llm/i.test(t))) {
    return `${org} is fostering innovation in AI/ML and surfacing novel applications of emerging technology.`;
  }
  return `${org} is hosting this hackathon to foster innovation, engage with the developer community, and promote their platform or mission.`;
}

// ─── Judging Intelligence Inference ─────────────────────────────────

function inferJudgingIntelligence(spec: HackathonSpec): JudgingIntelligence {
  const criteria = spec.judgingCriteria;
  if (criteria.length === 0) {
    return defaultJudgingIntelligence();
  }

  const sorted = [...criteria].sort((a, b) => b.weight - a.weight);

  const actualPriorities: string[] = sorted.map(c => `${c.name} (${c.weight}%)`);

  const knownBiases: string[] = [];
  let expectedTechnicalDepth = 5;
  let expectedInnovation = 5;
  let expectedPresentation = 5;
  let expectedBusinessImpact = 5;

  for (const c of criteria) {
    const nameLower = c.name.toLowerCase();
    if (/technical|engineering|implementation|code|complexity/.test(nameLower)) {
      expectedTechnicalDepth = Math.min(10, expectedTechnicalDepth + Math.round(c.weight / 12));
    }
    if (/innovation|creativity|originality|novelty/.test(nameLower)) {
      expectedInnovation = Math.min(10, expectedInnovation + Math.round(c.weight / 12));
    }
    if (/presentation|demo|pitch|design|ui|ux|polish/.test(nameLower)) {
      expectedPresentation = Math.min(10, expectedPresentation + Math.round(c.weight / 12));
    }
    if (/impact|business|value|feasibility|scalability|viability/.test(nameLower)) {
      expectedBusinessImpact = Math.min(10, expectedBusinessImpact + Math.round(c.weight / 12));
    }
  }

  if (expectedTechnicalDepth >= 7) knownBiases.push('Judges value deep technical work — leverage novel algorithms or custom ML');
  if (expectedPresentation >= 7) knownBiases.push('Polish matters — invest in UX/UI and a smooth demo');
  if (expectedInnovation >= 7) knownBiases.push('Novelty is rewarded — avoid clone ideas');
  if (expectedBusinessImpact >= 7) knownBiases.push('Real-world impact dominates — quantify impact with data');

  const strategies: WinningStrategyHint[] = [];

  const top = sorted[0];
  if (top) {
    strategies.push({
      name: `Maximize ${top.name}`,
      rationale: `Highest-weight criterion at ${top.weight}%. Outperform here for maximum score differential.`,
      targetsCriteria: [top.name],
      difficulty: 6,
      scoreBoost: Math.round(top.weight * 0.6),
    });
  }
  if (expectedTechnicalDepth >= 7) {
    strategies.push({
      name: 'Ship a technically impressive core',
      rationale: 'Judges reward engineering depth — a custom ML model, novel algorithm, or nontrivial system design can differentiate.',
      targetsCriteria: criteria.filter(c => /technical|engineering|implementation/i.test(c.name)).map(c => c.name),
      difficulty: 8,
      scoreBoost: Math.round((top?.weight ?? 30) * 0.4),
    });
  }
  if (expectedPresentation >= 6) {
    strategies.push({
      name: 'Invest in demo polish',
      rationale: 'A clean UI and rehearsed 3-min demo can swing 10-20% of total score.',
      targetsCriteria: criteria.filter(c => /presentation|demo|design|ui|polish/i.test(c.name)).map(c => c.name),
      difficulty: 4,
      scoreBoost: Math.round((top?.weight ?? 30) * 0.3),
    });
  }
  if (spec.sponsorAPIs.some(s => s.mustUse || s.strategicValue >= 4)) {
    strategies.push({
      name: 'Sponsor-first integration',
      rationale: 'Using high-value sponsor APIs targets sponsor-specific judging bonuses.',
      targetsCriteria: criteria.map(c => c.name),
      difficulty: 5,
      scoreBoost: 15,
    });
  }

  return {
    actualPriorities,
    likelyWinningStrategies: strategies.slice(0, 5),
    expectedTechnicalDepth,
    expectedInnovation,
    expectedPresentation,
    expectedBusinessImpact,
    knownBiases,
    confidence: {
      confidence: criteria.some(c => !c.inferred) ? 'high' : 'medium',
      source: 'inferred',
      notes: 'Derived from judging criteria weights',
    },
  };
}

// ─── Sponsor Intelligence Inference ────────────────────────────────

function inferSponsorIntelligence(spec: HackathonSpec): SponsorIntelligence {
  const sponsors = spec.sponsorAPIs;
  if (sponsors.length === 0) {
    return defaultSponsorIntelligence();
  }

  const sponsorsByValue: SponsorValueRanking[] = sponsors.map(s => {
    const rationale: string[] = [];
    if (s.mustUse) rationale.push(`Mandatory: ${s.name} must be used`);
    if (s.strategicValue >= 4) rationale.push(`Strategic value ${s.strategicValue}/5 - strong differential`);
    if (s.confidence === 'confirmed') rationale.push('Confirmed sponsor');
    rationale.push(`Category: ${s.category}`);

    const recommendedResources = [
      {
        name: s.name,
        type: inferSponsorResourceType(s.category) as SponsorResource['type'],
        accessMethod: 'API / SDK from sponsor',
        value: Math.min(10, s.strategicValue * 2),
        useCases: inferSponsorUseCases(s),
      },
    ];

    return {
      sponsorName: s.name,
      strategicValue: Math.min(10, s.strategicValue * 2),
      rationale,
      recommendedResources,
      trackValue: spec.tracks.length > 0 ? Object.fromEntries(spec.tracks.map(t => [t, s.strategicValue * 2])) : undefined,
    };
  }).sort((a, b) => b.strategicValue - a.strategicValue);

  const requiredSponsors = sponsors.filter(s => s.mustUse).map(s => s.name);

  const bonusPrizeSponsors: BonusPrizeSponsor[] = spec.prizes
    .filter(p => p.sponsor && p.tier !== 'grand' && p.tier !== 'first')
    .map(p => ({
      sponsorName: p.sponsor ?? 'Unknown',
      bonusPrize: p.description,
      qualification: `Use ${p.sponsor ?? 'the sponsor'}'s API/SDK and submit to the sponsor track`,
      extraValue: p.cashValueUsd ? Math.min(10, Math.max(2, Math.round(Math.log10(p.cashValueUsd)))) : 5,
    }));

  const synergyOpportunities: SponsorSynergy[] = [];
  if (sponsors.length >= 2) {
    const aiSponsor = sponsors.find(s => s.category === 'ai');
    const dataSponsor = sponsors.find(s => s.category === 'data');
    if (aiSponsor && dataSponsor) {
      synergyOpportunities.push({
        sponsors: [aiSponsor.name, dataSponsor.name],
        description: `${aiSponsor.name} models on ${dataSponsor.name}'s vector store for RAG`,
        combinedValue: 8,
        exampleIdea: 'RAG-powered assistant using stored knowledge base',
      });
    }
    const hostingSponsor = sponsors.find(s => s.category === 'hosting');
    if (aiSponsor && hostingSponsor) {
      synergyOpportunities.push({
        sponsors: [aiSponsor.name, hostingSponsor.name],
        description: `${aiSponsor.name} inference endpoints deployed on ${hostingSponsor.name}`,
        combinedValue: 7,
        exampleIdea: 'Serverless AI-powered app deployed on sponsor infra',
      });
    }
  }

  let overallStrategy = '';
  if (requiredSponsors.length > 0) {
    overallStrategy = `Required sponsors (${requiredSponsors.join(', ')}): build the core on these first. ${sponsorsByValue[0]?.sponsorName ?? ''} offers the highest strategic value at ${sponsorsByValue[0]?.strategicValue ?? 0}/10.`;
  } else if (sponsorsByValue[0]) {
    overallStrategy = `Lead with ${sponsorsByValue[0].sponsorName} (strategic value ${sponsorsByValue[0].strategicValue}/10) for the largest differential. Layer 1-2 more sponsors for bonus prize qualification.`;
  }

  return {
    sponsorsByValue,
    requiredSponsors,
    bonusPrizeSponsors,
    synergyOpportunities,
    overallStrategy,
    confidence: {
      confidence: sponsors.some(s => s.confidence === 'confirmed') ? 'high' : 'medium',
      source: 'inferred',
      notes: 'Derived from sponsorAPIs and prize data',
    },
  };
}

function inferSponsorResourceType(category: string): string {
  const map: Record<string, SponsorResource['type']> = {
    ai: 'api',
    payments: 'api',
    comms: 'api',
    data: 'dataset',
    hosting: 'credits',
    auth: 'api',
    ml: 'sdk',
    social: 'api',
    blockchain: 'api',
    ecommerce: 'api',
    other: 'api',
  };
  return map[category] ?? 'api';
}

function inferSponsorUseCases(s: { name: string; category: string; description: string }): string[] {
  const cases: Record<string, string[]> = {
    ai: ['Conversational AI', 'Summarization', 'Content generation', 'Classification'],
    payments: ['Checkout flow', 'Subscriptions', 'Invoicing'],
    comms: ['Notifications', 'SMS OTP', 'Multi-channel messaging'],
    data: ['Real-time data', 'Vector search', 'Offline-first sync'],
    hosting: ['Deploy demo', 'Edge functions', 'Static + serverless'],
    auth: ['Login/signup', 'Social auth', 'Role-based access'],
    ml: ['Model fine-tuning', 'Embeddings', 'Inference endpoints'],
    social: ['Social graph', 'Sharing', 'OAuth integrations'],
    blockchain: ['On-chain state', 'NFT minting', 'Wallet login'],
    ecommerce: ['Product catalog', 'Cart', 'Storefront embed'],
    other: ['Core feature integration'],
  };
  return cases[s.category] ?? ['Core feature integration'];
}

// ─── Opportunity Analysis Inference ─────────────────────────────────

function inferOpportunityAnalysis(spec: HackathonSpec): OpportunityAnalysis {
  const hasData = spec.judgingCriteria.length > 0 || spec.sponsorAPIs.length > 0 || spec.tracks.length > 0;
  if (!hasData) {
    return defaultOpportunityAnalysis();
  }

  // Highest ROI track — heuristic: track with most prizes
  const trackPrizeCount: Record<string, number> = {};
  for (const p of spec.prizes) {
    if (!p.sponsor) continue;
    const track = spec.tracks.find(t => p.description.toLowerCase().includes(t.toLowerCase()));
    if (track) trackPrizeCount[track] = (trackPrizeCount[track] ?? 0) + 1;
  }
  let highestRoiTrack = '';
  if (Object.keys(trackPrizeCount).length > 0) {
    highestRoiTrack = Object.entries(trackPrizeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  }
  if (!highestRoiTrack && spec.tracks.length > 0) {
    highestRoiTrack = spec.tracks[0] ?? '';
  }

  // Easiest path to win
  const easiestPaths: string[] = [];
  if (spec.tracks.length > 0 && highestRoiTrack) {
    easiestPaths.push(`Compete in the "${highestRoiTrack}" track — fewer entrants typically than the open track.`);
  }
  if (spec.sponsorAPIs.some(s => s.mustUse)) {
    easiestPaths.push('Use all required sponsor APIs — auto-qualifies for sponsor prize pools with fewer competitors.');
  }
  if (spec.judgingCriteria.some(c => /presentation|demo|design/i.test(c.name) && c.weight >= 20)) {
    easiestPaths.push('Polish the demo and UI — high-weight presentation criterion is often underinvested by competitors.');
  }
  const easiestPathToWin = easiestPaths.join(' ') || 'Focus on the highest-weight judging criterion and ensure all required sponsor integrations.';

  // Strongest direction
  const topCriterion = [...spec.judgingCriteria].sort((a, b) => b.weight - a.weight)[0];
  const topSponsor = [...spec.sponsorAPIs].sort((a, b) => b.strategicValue - a.strategicValue)[0];

  const strongestDirection: ProjectDirection = {
    name: `${topCriterion?.name ?? 'Innovation'}-led ${topSponsor ? `${topSponsor.name}-powered ` : ''}project${spec.themes[0] ? ` in ${spec.themes[0]}` : ''}`,
    rationale: `Targets the highest-weight criterion (${topCriterion?.name ?? 'Innovation'} at ${topCriterion?.weight ?? 0}%)${topSponsor ? ` and leverages ${topSponsor.name} (strategic value ${topSponsor.strategicValue}/5) for sponsor bonus` : ''}.`,
    targetTrack: highestRoiTrack || undefined,
    keySponsors: spec.sponsorAPIs.slice(0, 3).map(s => s.name),
    effort: topCriterion && /technical|engineering|implementation/i.test(topCriterion.name) ? 8 : 6,
    scorePotential: Math.min(100, 50 + (topCriterion?.weight ?? 0) + (topSponsor ? 10 : 0)),
    requiredCapabilities: inferRequiredCapabilities(spec),
  };

  // Risky directions
  const riskyDirections: RiskyDirection[] = [];
  riskyDirections.push({
    name: 'Overambitious scope',
    rationale: 'Tackling too many features in time-bounded hackathons leads to demos that don\'t run.',
    riskLevel: 8,
    failureModes: ['Demo crashes', 'Lots of half-built features', 'No coherent narrative'],
  });
  if (spec.sponsorAPIs.length === 0 && spec.tracks.length === 0) {
    riskyDirections.push({
      name: 'Ignoring sponsor synergies',
      rationale: 'Even without explicit sponsor prizes, judges/recruiters favor participants who leverage partner tech.',
      riskLevel: 5,
      failureModes: ['Lower judge engagement', 'No sponsor bonus'],
    });
  }
  if (spec.judgingCriteria.some(c => /originality|innovation|creativity/i.test(c.name) && c.weight >= 25)) {
    riskyDirections.push({
      name: 'Clone / tutorial-style project',
      rationale: 'High innovation weight means judges penalize derivative work.',
      riskLevel: 7,
      failureModes: ['"Seen this before" reaction', 'Low innovation score'],
    });
  }

  // Overused ideas (heuristic by theme)
  const overusedIdeas: string[] = [];
  const themeLower = spec.themes.join(' ').toLowerCase();
  if (themeLower.includes('ai') || themeLower.includes('ml')) {
    overusedIdeas.push('Generic chatbot wrapper', 'Another ChatGPT clone', 'To-do list with AI');
  }
  if (themeLower.includes('web3') || themeLower.includes('blockchain')) {
    overusedIdeas.push('Generic NFT marketplace', 'Yet another token');
  }
  if (themeLower.includes('health')) {
    overusedIdeas.push('Symptom checker', 'Generic appointment booking');
  }
  if (overusedIdeas.length === 0) {
    overusedIdeas.push('Tutorial-fresh CRUD app', 'Stock todo-list demo');
  }

  // Underserved opportunities
  const underservedOpportunities: string[] = [];
  if (spec.judgingCriteria.some(c => /accessibility|inclus/i.test(c.name))) {
    underservedOpportunities.push('Accessibility-first design — explicit criterion, often ignored by competitors');
  }
  if (spec.deliverables.some(d => /video|presentation/i.test(d.description))) {
    underservedOpportunities.push('A polished 3-minute demo video — most teams skip this');
  }
  if (spec.sponsorAPIs.some(s => s.strategicValue >= 4 && !s.mustUse)) {
    underservedOpportunities.push('Optional high-value sponsor APIs — bonus prizes with few entrants');
  }
  if (underservedOpportunities.length === 0) {
    underservedOpportunities.push('Cross-track submission (if allowed) to multiply prize chances');
  }

  return {
    easiestPathToWin,
    highestRoiTrack,
    strongestDirection,
    riskyDirections,
    overusedIdeas,
    underservedOpportunities,
    confidence: {
      confidence: spec.judgingCriteria.length > 0 && spec.sponsorAPIs.length > 0 ? 'medium' : 'low',
      source: 'inferred',
      notes: 'Derived from criteria, sponsors, tracks',
    },
  };
}

function inferRequiredCapabilities(spec: HackathonSpec): string[] {
  const caps: string[] = [];
  const themeLower = spec.themes.join(' ').toLowerCase();
  if (themeLower.includes('ai') || themeLower.includes('ml')) caps.push('ML/AI');
  if (themeLower.includes('web3') || themeLower.includes('blockchain')) caps.push('Smart contracts');
  if (themeLower.includes('ar') || themeLower.includes('vr')) caps.push('3D / AR-VR SDKs');
  if (themeLower.includes('gaming')) caps.push('Game engines');
  if (spec.sponsorAPIs.some(s => s.category === 'ai')) caps.push('LLM integration');
  if (spec.sponsorAPIs.some(s => s.category === 'payments')) caps.push('Payment integration');
  if (spec.sponsorAPIs.some(s => s.category === 'data')) caps.push('Vector DB / persistence');
  if (spec.deliverables.some(d => /video|presentation/i.test(d.description))) caps.push('Demo / storytelling');
  if (caps.length === 0) caps.push('Full-stack web development');
  return caps.slice(0, 6);
}

// ─── Per-Field Confidence Tracking ──────────────────────────────────

function buildFieldConfidence(spec: HackathonSpec, inferredFields: string[]): Record<string, FieldConfidence> {
  const fc: Record<string, FieldConfidence> = {};
  const seen = new Set(inferredFields);

  const simpleFields = ['title', 'tagline', 'description', 'organizer', 'themes', 'tracks', 'scoringMethodology'];
  for (const f of simpleFields) {
    const value = spec[f as keyof HackathonSpec];
    if (Array.isArray(value)) {
      fc[f] = { confidence: value.length > 0 ? 'high' : 'low', source: seen.has(f) ? 'inferred' : 'extracted' };
    } else if (typeof value === 'string') {
      fc[f] = { confidence: value && value !== 'Unknown' && value !== 'Untitled Hackathon' ? 'high' : 'low', source: seen.has(f) ? 'inferred' : 'extracted' };
    }
  }

  const arrayFields = ['judgingCriteria', 'prizes', 'sponsorAPIs', 'eligibility', 'restrictions', 'constraints', 'deliverables', 'timeline', 'importantLinks'];
  for (const f of arrayFields) {
    const value = spec[f as keyof HackathonSpec] as unknown;
    if (Array.isArray(value) && value.length > 0) {
      fc[f] = { confidence: 'high', source: seen.has(f) ? 'inferred' : 'extracted' };
    } else {
      fc[f] = { confidence: 'low', source: 'inferred' };
    }
  }

  const intelFields = ['judgingIntelligence', 'sponsorIntelligence', 'opportunityAnalysis', 'challengeUnderstanding'];
  for (const f of intelFields) {
    const value = spec[f as keyof HackathonSpec] as { confidence?: FieldConfidence } | undefined;
    if (value && (value as { confidence?: FieldConfidence }).confidence) {
      fc[f] = (value as { confidence: FieldConfidence }).confidence;
    } else {
      fc[f] = { confidence: 'low', source: 'inferred' };
    }
  }

  return fc;
}
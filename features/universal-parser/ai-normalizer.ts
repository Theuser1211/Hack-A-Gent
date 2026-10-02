/**
 * AI Normalizer — Semantic Hackathon Understanding
 * ================================================
 *
 * Uses an LLM to semantically understand ANY webpage and extract
 * hackathon information. No website-specific logic.
 *
 * The LLM receives clean, structured content and returns a
 * canonical HackathonSpec with confidence and reasoning.
 */

import type { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { LLMRequest } from '../../kernel/llm/llm-types.js';
import type {
  HackathonSpec,
  UniversalParserOptions,
  UniversalExtractedSections,
  ExtractionMeta,
  JudgingIntelligence,
  SponsorIntelligence,
  OpportunityAnalysis,
  ChallengeUnderstanding,
  FieldConfidence,
  WinningStrategyHint,
  SponsorValueRanking,
  SponsorResource,
  BonusPrizeSponsor,
  SponsorSynergy,
  ProjectDirection,
  RiskyDirection,
} from './types.js';

export interface AINormalizationResult {
  isHackathon: boolean;
  confidence: number;
  reasoning: string;
  detectedPageType: string;
  spec?: Partial<HackathonSpec>;
  extractionMeta: Partial<ExtractionMeta>;
}

const SYSTEM_PROMPT = `You are an expert hackathon analyst. Your job is to determine whether a webpage describes a hackathon event, and if so, extract all relevant structured information.

A hackathon is a time-bounded competitive event where participants build software/hardware projects. Key characteristics:
- Has a clear challenge/problem statement
- Has judging criteria or evaluation method
- Has prizes, awards, or recognition
- Has a submission deadline
- Has eligibility rules
- Is organized by an entity (company, university, community)

NOT hackathons:
- Blog posts about hackathons
- Company homepages
- Product documentation
- GitHub repositories
- YouTube videos
- Wikipedia articles
- General tech news
- Job postings
- API documentation
- Tutorials/guides
- Conference pages (unless they include a hackathon)
- Meetup pages

You must return valid JSON matching the HackathonSpec schema.`;

const EXTRACTION_PROMPT = `Analyze the following webpage content and determine if it describes a hackathon.

URL: {url}
Platform Hint: {platform}

=== EXTRACTED PAGE SECTIONS ===
{sections}

=== YOUR TASK ===

1. Determine: Is this a hackathon event page? (not a blog about one, not a company page, etc.)

2. If YES: Extract ALL of the following into the JSON schema:

BASIC FIELDS:
   - title: Official event name
   - tagline: Short 1-2 sentence description
   - description: Full problem statement/challenge description
   - organizer: Host organization
   - themes: Array of theme tags (e.g., "AI/ML", "Fintech", "Climate")
   - tracks: Array of track names if multi-track
   - judgingCriteria: Array of {name, weight(0-100), description, inferred, priority}
   - scoringMethodology: How scoring works
   - prizes: Array of {description, cashValueUsd?, tier, sponsor?, rawText}
   - sponsorAPIs: Array of {name, category, mustUse, strategicValue(1-5), description, confidence}
   - eligibility: Array of {rule, type, required}
   - restrictions: Array of {rule, type, severity}
   - deliverables: Array of {description, format, required, track?}
   - timeline: Array of {label, date, type, timezone?}
   - importantLinks: Array of {label, url, purpose}

JUDGING INTELLIGENCE (judgingIntelligence):
   - actualPriorities: What judges ACTUALLY prioritize beyond stated weights
   - likelyWinningStrategies: Array of {name, rationale, targetsCriteria[], difficulty(1-10), scoreBoost(0-100)}
   - expectedTechnicalDepth: (1-10) How deep technically judges expect
   - expectedInnovation: (1-10) How much innovation judges reward
   - expectedPresentation: (1-10) How much polish/presentation matters
   - expectedBusinessImpact: (1-10) How much real-world impact matters
   - knownBiases: Common judge biases in similar hackathons
   - confidence: {confidence: "high|medium|low", source: "extracted|inferred|ai_interpreted", location?, notes?}

SPONSOR INTELLIGENCE (sponsorIntelligence):
   - sponsorsByValue: Array of {sponsorName, strategicValue(1-10), rationale[], recommendedResources: [{name, type: "api|sdk|dataset|hardware|credits|mentorship|other", accessMethod, docsUrl?, value(1-10), useCases[]}], trackValue?}
   - requiredSponsors: Sponsors that MUST be used
   - bonusPrizeSponsors: Array of {sponsorName, bonusPrize, qualification, extraValue(1-10)}
   - synergyOpportunities: Array of {sponsors[], description, combinedValue(1-10), exampleIdea}
   - overallStrategy: Sponsor strategy recommendation
   - confidence: {confidence: "high|medium|low", source: "extracted|inferred|ai_interpreted", location?, notes?}

OPPORTUNITY ANALYSIS (opportunityAnalysis):
   - easiestPathToWin: Easiest path to a winning submission
   - highestRoiTrack: Highest ROI category/track
   - strongestDirection: {name, rationale, targetTrack?, keySponsors[], effort(1-10), scorePotential(0-100), requiredCapabilities[]}
   - riskyDirections: Array of {name, rationale, riskLevel(1-10), failureModes[]}
   - overusedIdeas: Overused/oversaturated ideas to avoid
   - underservedOpportunities: Underserved opportunities to exploit
   - confidence: {confidence: "high|medium|low", source: "extracted|inferred|ai_interpreted", location?, notes?}

CHALLENGE UNDERSTANDING (challengeUnderstanding):
   - coreProblem: The actual problem being solved (1-2 sentences)
   - targetUsers: Target users/beneficiaries
   - expectedImpact: Expected real-world impact
   - organizerMotivation: Why this hackathon exists
   - successCriteria: What success looks like
   - domainKnowledge: Domain knowledge required
   - confidence: {confidence: "high|medium|low", source: "extracted|inferred|ai_interpreted", location?, notes?}

3. If NO: Explain why in reasoning, identify the page type.

4. Assign confidence (0-1) based on how certain you are.

Return ONLY valid JSON matching this exact structure:
{
  "isHackathon": boolean,
  "confidence": number,
  "reasoning": "detailed explanation",
  "detectedPageType": "hackathon|blog|company-homepage|documentation|github-repo|youtube|wikipedia|job-posting|product-page|conference|meetup|other",
  "spec": { ...HackathonSpec fields including judgingIntelligence, sponsorIntelligence, opportunityAnalysis, challengeUnderstanding ... } or null,
  "extractionMeta": {
    "inferredFields": ["field names that were inferred"],
    "warnings": ["any concerns"],
    "llmCalls": 1
  }
}`;

const RETRY_PROMPT = `Your previous extraction had validation errors. Please fix them.

Previous output:
{previousOutput}

Validation errors:
{errors}

Original content:
{sections}

Return corrected JSON only.`;

function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + '\n\n[...TRUNCATED...]';
}

function buildSectionsText(sections: UniversalExtractedSections): string {
  const parts: string[] = [];

  if (sections.title) parts.push(`TITLE: ${sections.title}`);
  if (sections.tagline) parts.push(`TAGLINE: ${sections.tagline}`);
  if (sections.description) parts.push(`DESCRIPTION:\n${sections.description}`);
  if (sections.themes) parts.push(`THEMES SECTION:\n${sections.themes}`);
  if (sections.judgingCriteria) parts.push(`JUDGING CRITERIA SECTION:\n${sections.judgingCriteria}`);
  if (sections.prizes) parts.push(`PRIZES SECTION:\n${sections.prizes}`);
  if (sections.sponsors) parts.push(`SPONSORS SECTION:\n${sections.sponsors}`);
  if (sections.rules) parts.push(`RULES/ELIGIBILITY SECTION:\n${sections.rules}`);
  if (sections.deliverables) parts.push(`DELIVERABLES/SUBMISSION SECTION:\n${sections.deliverables}`);
  if (sections.timeline) parts.push(`TIMELINE/DEADLINES SECTION:\n${sections.timeline}`);
  if (sections.resources) parts.push(`RESOURCES/LINKS SECTION:\n${sections.resources}`);
  if (sections.faq) parts.push(`FAQ SECTION:\n${sections.faq}`);
  if (sections.team) parts.push(`TEAM SECTION:\n${sections.team}`);
  if (sections.workshops) parts.push(`WORKSHOPS/EVENTS SECTION:\n${sections.workshops}`);
  if (sections.metadata) parts.push(`OTHER SECTIONS:\n${sections.metadata}`);

  return parts.join('\n\n---\n\n');
}

async function callLLM(router: RouterEngine, prompt: string, systemPrompt: string, options: UniversalParserOptions): Promise<string> {
  const messages: LLMRequest['messages'] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ];

  const request: LLMRequest = {
    model_id: '', // Will be selected by router
    provider: 'custom', // Will be selected by router
    messages,
    temperature: 0.1,
    max_tokens: 8000,
    response_format: 'json_object',
  };

  try {
    const result = await router.execute('planning', request);
    return result.response.content || '';
  } catch (error) {
    throw new Error(`RouterEngine execute failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJSONResponse(response: string): AINormalizationResult | null {
  // Try to extract JSON from the response
  // Handle markdown code blocks
  let jsonStr = response.trim();

  // Remove markdown fences
  jsonStr = jsonStr.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');

  // Find JSON object
  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    jsonStr = jsonStr.slice(start, end + 1);
  }

  try {
    return JSON.parse(jsonStr) as AINormalizationResult;
  } catch (e) {
    // Try to fix common issues
    try {
      // Fix trailing commas
      const fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(fixed) as AINormalizationResult;
    } catch {
      return null;
    }
  }
}

export async function normalizeWithAI(
  sections: UniversalExtractedSections,
  url: string,
  platform: string,
  router: RouterEngine,
  options: UniversalParserOptions,
  previousErrors?: string[],
  sectionsTextOverride?: string
): Promise<AINormalizationResult | null> {
  const sectionsText = sectionsTextOverride ?? buildSectionsText(sections);
  const maxContentLength = options.maxHtmlLength || 50000;
  const truncatedSections = truncateContent(sectionsText, maxContentLength);

  let prompt = EXTRACTION_PROMPT
    .replace('{url}', url)
    .replace('{platform}', platform)
    .replace('{sections}', truncatedSections);

  if (previousErrors && previousErrors.length > 0) {
    prompt = RETRY_PROMPT
      .replace('{previousOutput}', JSON.stringify(previousErrors, null, 2))
      .replace('{errors}', previousErrors.join('\n'))
      .replace('{sections}', truncatedSections);
  }

  try {
    const response = await callLLM(router, prompt, SYSTEM_PROMPT, options);
    const result = parseJSONResponse(response);

    if (result) {
      // Ensure extractionMeta has llmCalls
      if (!result.extractionMeta) result.extractionMeta = {};
      result.extractionMeta.llmCalls = (result.extractionMeta.llmCalls || 0) + 1;
      return result;
    }

    return null;
  } catch (error) {
    console.error('[AI Normalizer] LLM call failed:', error);
    return null;
  }
}

export async function normalizeWithAIRetry(
  sections: UniversalExtractedSections,
  url: string,
  platform: string,
  router: RouterEngine,
  options: UniversalParserOptions,
  maxRetries = 1,
  sectionsTextOverride?: string
): Promise<AINormalizationResult | null> {
  let lastErrors: string[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await normalizeWithAI(sections, url, platform, router, options, lastErrors.length > 0 ? lastErrors : undefined, sectionsTextOverride);

    if (result) {
      // Validate the result has required fields if it's a hackathon
      if (result.isHackathon && result.spec) {
        const validationErrors = validateSpec(result.spec);
        if (validationErrors.length === 0) {
          return result;
        }
        lastErrors = validationErrors;
        if (attempt < maxRetries) continue;
      } else if (!result.isHackathon) {
        // Non-hackathon results don't need spec validation
        return result;
      }
    }

    if (attempt === maxRetries) break;
  }

  return null;
}

function validateSpec(spec: Partial<HackathonSpec>): string[] {
  const errors: string[] = [];

  if (!spec.title || spec.title.trim().length === 0) {
    errors.push('Missing required field: title');
  }
  if (!spec.description || spec.description.trim().length === 0) {
    errors.push('Missing required field: description');
  }
  if (!spec.organizer || spec.organizer.trim().length === 0) {
    errors.push('Missing required field: organizer');
  }
  if (!Array.isArray(spec.judgingCriteria) || spec.judgingCriteria.length === 0) {
    errors.push('Missing required field: judgingCriteria (at least one)');
  }
  if (!Array.isArray(spec.prizes) || spec.prizes.length === 0) {
    errors.push('Missing required field: prizes (at least one)');
  }
  if (!Array.isArray(spec.timeline) || spec.timeline.length === 0) {
    errors.push('Missing required field: timeline (at least one)');
  }
  if (!Array.isArray(spec.deliverables) || spec.deliverables.length === 0) {
    errors.push('Missing required field: deliverables (at least one)');
  }

  // Validate strategic intelligence fields (soft warnings, not hard errors)
  if (spec.judgingIntelligence) {
    const ji = judingIntelligenceConstraintCheck(spec.judgingIntelligence);
    for (const w of ji) errors.push(`judgingIntelligence: ${w}`);
  }
  if (spec.sponsorIntelligence && !isValidSponsorIntelligence(spec.sponsorIntelligence)) {
    errors.push('sponsorIntelligence: malformed structure');
  }
  if (spec.opportunityAnalysis && !isValidOpportunityAnalysis(spec.opportunityAnalysis)) {
    errors.push('opportunityAnalysis: malformed structure');
  }
  if (spec.challengeUnderstanding && !isValidChallengeUnderstanding(spec.challengeUnderstanding)) {
    errors.push('challengeUnderstanding: malformed structure');
  }

  // Validate judging criteria weights sum to ~100
  if (Array.isArray(spec.judgingCriteria) && spec.judgingCriteria.length > 0) {
    const totalWeight = spec.judgingCriteria.reduce((sum, c) => sum + (c.weight || 0), 0);
    if (totalWeight < 50 || totalWeight > 150) {
      errors.push(`Judging criteria weights sum to ${totalWeight}, expected ~100`);
    }
  }

  return errors;
}

function judingIntelligenceConstraintCheck(ji: NonNullable<HackathonSpec['judgingIntelligence']>): string[] {
  const warns: string[] = [];
  if (typeof ji.expectedTechnicalDepth !== 'number' || ji.expectedTechnicalDepth < 1 || ji.expectedTechnicalDepth > 10) {
    warns.push('expectedTechnicalDepth must be 1-10');
  }
  if (typeof ji.expectedInnovation !== 'number' || ji.expectedInnovation < 1 || ji.expectedInnovation > 10) {
    warns.push('expectedInnovation must be 1-10');
  }
  if (typeof ji.expectedPresentation !== 'number' || ji.expectedPresentation < 1 || ji.expectedPresentation > 10) {
    warns.push('expectedPresentation must be 1-10');
  }
  if (typeof ji.expectedBusinessImpact !== 'number' || ji.expectedBusinessImpact < 1 || ji.expectedBusinessImpact > 10) {
    warns.push('expectedBusinessImpact must be 1-10');
  }
  if (!Array.isArray(ji.likelyWinningStrategies)) {
    warns.push('likelyWinningStrategies must be an array');
  }
  return warns;
}

function isValidSponsorIntelligence(si: NonNullable<HackathonSpec['sponsorIntelligence']>): boolean {
  return Array.isArray(si.sponsorsByValue) && Array.isArray(si.requiredSponsors) && Array.isArray(si.bonusPrizeSponsors) && Array.isArray(si.synergyOpportunities);
}

function isValidOpportunityAnalysis(oa: NonNullable<HackathonSpec['opportunityAnalysis']>): boolean {
  return typeof oa.easiestPathToWin === 'string' && typeof oa.strongestDirection === 'object' && oa.strongestDirection !== null && Array.isArray(oa.riskyDirections);
}

function isValidChallengeUnderstanding(cu: NonNullable<HackathonSpec['challengeUnderstanding']>): boolean {
  return typeof cu.coreProblem === 'string' && Array.isArray(cu.targetUsers) && Array.isArray(cu.successCriteria);
}
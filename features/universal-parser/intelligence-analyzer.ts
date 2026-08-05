/**
 * Intelligence Analyzer — Deterministic Hackathon Understanding
 * ==============================================================
 *
 * Computes hackathon intelligence from extracted sections using
 * heuristic analysis. No LLM required — works offline.
 *
 * Produces:
 * - Judging intelligence (actual priorities, winning strategies, biases)
 * - Sponsor intelligence (rankings, synergies, bonus opportunities)
 * - Opportunity analysis (overused ideas, underserved areas, risk)
 * - Challenge understanding (core problem, organizer motivation)
 * - Winning strategy report (master intelligence output)
 */

import type {
  HackathonSpec,
  UniversalExtractedSections,
  JudgingIntelligence,
  SponsorIntelligence,
  OpportunityAnalysis,
  ChallengeUnderstanding,
  WinningStrategyHint,
  SponsorValueRanking,
  SponsorResource,
  BonusPrizeSponsor,
  SponsorSynergy,
  ProjectDirection,
  RiskyDirection,
  FieldConfidence,
  JudgingCriterion,
  Prize,
  SponsorAPI,
  PlatformType,
  WinningStrategyReport,
} from './types.js';

// ─── Keyword Banks for Pattern Detection ────────────────────────────

const OVERUSED_IDEAS = [
  'todo app', 'task manager', 'weather app', 'chat app', 'social media clone',
  'recipe app', 'fitness tracker', 'budget tracker', 'notes app', 'calculator',
  'portfolio website', 'blog platform', 'ecommerce store', 'food delivery',
  'ride sharing', 'dating app', 'job board', 'marketplace',
  'AI chatbot', 'AI image generator', 'AI text summarizer',
  'blockchain voting', 'crypto wallet', 'NFT marketplace',
];

const COMMON_JUDGING_BIASES = [
  'recency bias — recent presentations are remembered better',
  'anchoring — first impression sets the bar',
  'halo effect — good demo masks weak implementation',
  'confirmation bias — judges look for what they expect',
  'status quo bias — familiar solutions feel safer',
  'complexity bias — more complex feels more impressive',
  'demo bias — polished demo beats solid architecture',
  'story bias — compelling narrative beats technical merit',
];

const SPONSOR_CATEGORY_VALUE: Record<string, number> = {
  ai: 9, ml: 9, hosting: 7, data: 8, payments: 6, comms: 5,
  auth: 5, social: 4, blockchain: 6, ecommerce: 5, other: 4,
};

const TECH_DEPTH_SIGNALS = [
  'architecture', 'system design', 'scalability', 'performance',
  'real-time', 'distributed', 'microservices', 'database', 'API',
  'machine learning', 'deep learning', 'neural network', 'NLP',
  'computer vision', 'blockchain', 'cryptography', 'security',
];

const INNOVATION_SIGNALS = [
  'novel', 'unique', 'creative', 'inventive', 'original',
  'first', 'breakthrough', 'revolutionary', 'transform',
  'new approach', 'rethink', 'reimagine',
];

const PRESENTATION_SIGNALS = [
  'demo', 'pitch', 'presentation', 'video', 'storytelling',
  'user experience', 'design', 'UI', 'UX', 'polish',
  'frontend', 'interface', 'visual',
];

const BUSINESS_IMPACT_SIGNALS = [
  'real-world', 'production', 'deploy', 'scale', 'impact',
  'users', 'customers', 'market', 'revenue', 'business',
  'enterprise', 'commercial', 'social impact', 'community',
];

// ─── Main Entry Points ──────────────────────────────────────────────

/**
 * Analyze judging intelligence from criteria and content.
 */
export function analyzeJudgingIntelligence(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): JudgingIntelligence {
  const criteria = spec.judgingCriteria;
  const allText = [spec.description, spec.tagline, sections.description, sections.judgingCriteria].join(' ').toLowerCase();

  // Detect actual priorities from criteria weight distribution
  const actualPriorities = inferActualPriorities(criteria, allText);

  // Generate winning strategy hints
  const likelyWinningStrategies = generateWinningStrategies(criteria, spec, allText);

  // Estimate expectations from content signals
  const expectedTechnicalDepth = scoreDimension(allText, TECH_DEPTH_SIGNALS, criteria, 'technical');
  const expectedInnovation = scoreDimension(allText, INNOVATION_SIGNALS, criteria, 'innovation');
  const expectedPresentation = scoreDimension(allText, PRESENTATION_SIGNALS, criteria, 'presentation');
  const expectedBusinessImpact = scoreDimension(allText, BUSINESS_IMPACT_SIGNALS, criteria, 'impact');

  // Detect known biases from platform and content
  const knownBiases = detectBiases(spec.platform, criteria, allText);

  const confidence = computeJudgingConfidence(criteria, sections);

  return {
    actualPriorities,
    likelyWinningStrategies,
    expectedTechnicalDepth,
    expectedInnovation,
    expectedPresentation,
    expectedBusinessImpact,
    knownBiases,
    confidence,
  };
}

/**
 * Analyze sponsor intelligence — rank by strategic value, find synergies.
 */
export function analyzeSponsorIntelligence(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): SponsorIntelligence {
  const sponsors = spec.sponsorAPIs;
  const prizes = spec.prizes;
  const allText = [spec.description, sections.sponsors, sections.prizes].join(' ').toLowerCase();

  // Rank sponsors by strategic value
  const sponsorsByValue = rankSponsors(sponsors, prizes, spec.tracks, allText);

  // Identify required sponsors
  const requiredSponsors = sponsors.filter(s => s.mustUse).map(s => s.name);

  // Find bonus prize sponsors
  const bonusPrizeSponsors = findBonusPrizes(sponsors, prizes);

  // Detect synergy opportunities
  const synergyOpportunities = detectSynergies(sponsors);

  // Generate overall strategy
  const overallStrategy = generateSponsorStrategy(sponsorsByValue, requiredSponsors, bonusPrizeSponsors);

  const confidence = computeSponsorConfidence(sponsors, sections);

  return {
    sponsorsByValue,
    requiredSponsors,
    bonusPrizeSponsors,
    synergyOpportunities,
    overallStrategy,
    confidence,
  };
}

/**
 * Analyze opportunities — detect overused ideas, underserved areas, risk.
 */
export function analyzeOpportunity(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): OpportunityAnalysis {
  const allText = [spec.description, spec.tagline, sections.description, sections.themes].join(' ').toLowerCase();
  const themes = spec.themes.map(t => t.toLowerCase());
  const tracks = spec.tracks.map(t => t.toLowerCase());

  // Detect overused ideas
  const overusedIdeas = detectOverusedIdeas(allText, themes);

  // Detect underserved opportunities
  const underservedOpportunities = detectUnderservedOpportunities(allText, themes, tracks);

  // Find risky directions
  const riskyDirections = identifyRiskyDirections(spec, allText);

  // Find strongest direction
  const strongestDirection = findStrongestDirection(spec, themes, allText);

  // Determine easiest path and highest ROI track
  const easiestPathToWin = determineEasiestPath(spec, themes);
  const highestRoiTrack = determineHighestRoiTrack(spec, tracks, themes);

  const confidence = computeOpportunityConfidence(spec, sections);

  return {
    easiestPathToWin,
    highestRoiTrack,
    strongestDirection,
    riskyDirections,
    overusedIdeas,
    underservedOpportunities,
    confidence,
  };
}

/**
 * Analyze challenge understanding — infer core problem and organizer motivation.
 */
export function analyzeChallengeUnderstanding(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): ChallengeUnderstanding {
  const allText = [spec.description, spec.tagline, sections.description].join(' ');
  const lowerText = allText.toLowerCase();

  // Infer core problem
  const coreProblem = inferCoreProblem(spec, allText);

  // Infer target users
  const targetUsers = inferTargetUsers(lowerText, spec);

  // Infer expected impact
  const expectedImpact = inferExpectedImpact(lowerText, spec);

  // Infer organizer motivation
  const organizerMotivation = inferOrganizerMotivation(lowerText, spec);

  // Generate success criteria
  const successCriteria = generateSuccessCriteria(spec, lowerText);

  // Identify domain knowledge
  const domainKnowledge = identifyDomainKnowledge(lowerText, spec.themes);

  const confidence = computeChallengeConfidence(spec, sections);

  return {
    coreProblem,
    targetUsers,
    expectedImpact,
    organizerMotivation,
    successCriteria,
    domainKnowledge,
    confidence,
  };
}

/**
 * Generate the master Winning Strategy Report.
 * This is the primary output for Product Intelligence.
 */
export function generateWinningStrategyReport(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): WinningStrategyReport {
  const judging = spec.judgingIntelligence || analyzeJudgingIntelligence(spec, sections);
  const sponsor = spec.sponsorIntelligence || analyzeSponsorIntelligence(spec, sections);
  const opportunity = spec.opportunityAnalysis || analyzeOpportunity(spec, sections);
  const challenge = spec.challengeUnderstanding || analyzeChallengeUnderstanding(spec, sections);

  // Easiest path to win
  const easiestPath = selectEasiestPath(judging, opportunity, sponsor);

  // Highest ROI track
  const highestRoiTrack = opportunity.highestRoiTrack || selectHighestRoiTrack(spec, sponsor);

  // Recommended tech stack
  const recommendedTechStack = recommendTechStack(spec, sponsor, judging);

  // Recommended MVP scope
  const recommendedMvpScope = recommendMvpScope(judging, spec);

  // Recommended demo strategy
  const demoStrategy = recommendDemoStrategy(judging, spec);

  // Biggest risks
  const biggestRisks = compileRisks(opportunity, judging);

  // Biggest opportunities
  const biggestOpportunities = compileOpportunities(opportunity, sponsor, judging);

  // Sponsor opportunities
  const sponsorOpportunities = compileSponsorOpportunities(sponsor);

  // Judging priorities summary
  const judgingPrioritiesSummary = summarizeJudgingPriorities(judging, spec);

  return {
    easiestPath,
    highestRoiTrack,
    recommendedTechStack,
    recommendedMvpScope,
    demoStrategy,
    biggestRisks,
    biggestOpportunities,
    sponsorOpportunities,
    judgingPrioritiesSummary,
    overallConfidence: computeOverallConfidence(judging, sponsor, opportunity, challenge),
  };
}

// ─── Judging Intelligence Helpers ───────────────────────────────────

function inferActualPriorities(
  criteria: JudgingCriterion[],
  allText: string
): string[] {
  const priorities: string[] = [];

  // Sort by weight descending
  const sorted = [...criteria].sort((a, b) => (b.weight || 0) - (a.weight || 0));

  // Top criteria are actual priorities
  for (const c of sorted.slice(0, 3)) {
    if (c.weight >= 25) {
      priorities.push(`${c.name} (${c.weight}% weight) — judges explicitly prioritize this`);
    } else if (c.weight >= 15) {
      priorities.push(`${c.name} (${c.weight}% weight) — significant factor`);
    }
  }

  // Detect implicit priorities from content
  if (allText.includes('innovation') || allText.includes('creative')) {
    if (!priorities.some(p => p.toLowerCase().includes('innovation'))) {
      priorities.push('Innovation — implied by language used in description');
    }
  }
  if (allText.includes('real-world') || allText.includes('impact')) {
    if (!priorities.some(p => p.toLowerCase().includes('impact'))) {
      priorities.push('Real-world impact — implied by problem framing');
    }
  }
  if (allText.includes('demo') || allText.includes('presentation')) {
    if (!priorities.some(p => p.toLowerCase().includes('presentation'))) {
      priorities.push('Demo quality — explicit mention of presentation expectations');
    }
  }

  return priorities.length > 0 ? priorities : ['No explicit priorities detected — infer from criteria weights'];
}

function generateWinningStrategies(
  criteria: JudgingCriterion[],
  spec: HackathonSpec,
  allText: string
): WinningStrategyHint[] {
  const strategies: WinningStrategyHint[] = [];

  // Strategy 1: Maximize highest-weighted criteria
  const topCriterion = [...criteria].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
  if (topCriterion) {
    strategies.push({
      name: `Maximize ${topCriterion.name}`,
      rationale: `${topCriterion.name} has the highest weight at ${topCriterion.weight}%. Focus on delivering exceptional ${topCriterion.name.toLowerCase()}.`,
      targetsCriteria: [topCriterion.name],
      difficulty: 4,
      scoreBoost: Math.round(topCriterion.weight * 0.8),
    });
  }

  // Strategy 2: Balanced excellence
  if (criteria.length >= 3) {
    strategies.push({
      name: 'Balanced Excellence',
      rationale: 'Score well across all criteria rather than excelling in one. Judges penalize lopsided submissions.',
      targetsCriteria: criteria.map(c => c.name),
      difficulty: 6,
      scoreBoost: 40,
    });
  }

  // Strategy 3: Sponsor alignment
  const requiredSponsors = spec.sponsorAPIs.filter(s => s.mustUse);
  if (requiredSponsors.length > 0) {
    strategies.push({
      name: 'Sponsor Integration',
      rationale: `Using ${requiredSponsors.map(s => s.name).join(' and ')} heavily demonstrates alignment with sponsor goals. Judges often receive guidance from sponsors.`,
      targetsCriteria: criteria.map(c => c.name),
      difficulty: 3,
      scoreBoost: 25,
    });
  }

  // Strategy 4: Demo-first
  if (allText.includes('demo') || allText.includes('pitch') || allText.includes('presentation')) {
    strategies.push({
      name: 'Demo-First Build',
      rationale: 'Build the demo first, then fill in the backend. Judges see the demo, not the code.',
      targetsCriteria: criteria.filter(c => c.name.toLowerCase().includes('present') || c.name.toLowerCase().includes('demo')).map(c => c.name),
      difficulty: 3,
      scoreBoost: 35,
    });
  }

  // Strategy 5: Story-driven
  if (allText.includes('impact') || allText.includes('social') || allText.includes('community')) {
    strategies.push({
      name: 'Story-Driven Narrative',
      rationale: 'Frame the project as a compelling story of impact. Judges remember narratives better than features.',
      targetsCriteria: criteria.filter(c => c.name.toLowerCase().includes('impact') || c.name.toLowerCase().includes('innovation')).map(c => c.name),
      difficulty: 2,
      scoreBoost: 30,
    });
  }

  return strategies;
}

function scoreDimension(
  text: string,
  signals: string[],
  criteria: JudgingCriterion[],
  criterionHint: string
): number {
  let score = 5; // baseline

  // Count signal matches
  let matches = 0;
  for (const signal of signals) {
    if (text.includes(signal.toLowerCase())) matches++;
  }

  // Adjust based on signal density
  if (matches >= 5) score = 8;
  else if (matches >= 3) score = 7;
  else if (matches >= 1) score = 6;
  else score = 4;

  // Adjust if criterion explicitly mentions this dimension
  const matchingCriterion = criteria.find(c =>
    c.name.toLowerCase().includes(criterionHint)
  );
  if (matchingCriterion) {
    if (matchingCriterion.weight >= 30) score = Math.min(10, score + 2);
    else if (matchingCriterion.weight >= 20) score = Math.min(10, score + 1);
  }

  return Math.max(1, Math.min(10, score));
}

function detectBiases(
  platform: PlatformType,
  criteria: JudgingCriterion[],
  allText: string
): string[] {
  const biases = [...COMMON_JUDGING_BIASES];

  // Platform-specific biases
  if (platform === 'devpost') {
    biases.push('Devpost bias — well-formatted project pages score higher');
    biases.push('Video demo bias — projects with videos get more attention');
  }
  if (platform === 'mlh') {
    biases.push('MLH bias — judges favor projects that could win MLH prizes');
    biases.push('Beginner-friendly bias — simpler but complete projects often beat complex incomplete ones');
  }

  // Criteria-specific biases
  const innovationCriterion = criteria.find(c => c.name.toLowerCase().includes('innovation'));
  if (innovationCriterion && innovationCriterion.weight >= 30) {
    biases.push('Innovation inflation — judges may overvalue novelty over practicality');
  }

  return biases;
}

function computeJudgingConfidence(
  criteria: JudgingCriterion[],
  sections: UniversalExtractedSections
): FieldConfidence {
  let score = 0;
  if (criteria.length > 0) score += 0.4;
  if (criteria.some(c => c.weight > 0)) score += 0.2;
  if (sections.judgingCriteria.length > 50) score += 0.2;
  if (criteria.length >= 3) score += 0.2;

  return {
    confidence: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    source: criteria.some(c => !c.inferred) ? 'extracted' : 'inferred',
    notes: `Based on ${criteria.length} criteria with ${criteria.filter(c => c.weight > 0).length} weighted`,
  };
}

// ─── Sponsor Intelligence Helpers ───────────────────────────────────

function rankSponsors(
  sponsors: SponsorAPI[],
  prizes: Prize[],
  tracks: string[],
  allText: string
): SponsorValueRanking[] {
  return sponsors
    .map(sponsor => {
      let value = SPONSOR_CATEGORY_VALUE[sponsor.category] || 5;

      // Boost for must-use
      if (sponsor.mustUse) value = Math.min(10, value + 2);

      // Boost if sponsor has prizes
      const sponsorPrizes = prizes.filter(p =>
        p.sponsor?.toLowerCase() === sponsor.name.toLowerCase()
      );
      if (sponsorPrizes.length > 0) value = Math.min(10, value + 1);

      // Boost for high strategic value
      if (sponsor.strategicValue >= 4) value = Math.min(10, value + 1);

      // Generate recommendations
      const recommendedResources: SponsorResource[] = [{
        name: sponsor.name,
        type: sponsor.category === 'ai' || sponsor.category === 'ml' ? 'api' : 'sdk',
        accessMethod: `Use ${sponsor.name} API/SDK in your project`,
        value: sponsor.strategicValue,
        useCases: generateUseCases(sponsor, allText),
      }];

      const rationale: string[] = [];
      if (sponsor.mustUse) rationale.push('Required by hackathon rules');
      if (sponsorPrizes.length > 0) rationale.push(`Has ${sponsorPrizes.length} associated prize(s)`);
      if (sponsor.strategicValue >= 4) rationale.push('High strategic value rated by organizers');
      if (rationale.length === 0) rationale.push('Available integration option');

      return {
        sponsorName: sponsor.name,
        strategicValue: value,
        rationale,
        recommendedResources,
      };
    })
    .sort((a, b) => b.strategicValue - a.strategicValue);
}

function generateUseCases(sponsor: SponsorAPI, _allText: string): string[] {
  const useCases: string[] = [];

  if (sponsor.category === 'ai' || sponsor.category === 'ml') {
    useCases.push('AI-powered feature in your project');
    useCases.push('Natural language processing or prediction');
  }
  if (sponsor.category === 'hosting') {
    useCases.push('Deploy your project for live demo');
    useCases.push('Host backend services');
  }
  if (sponsor.category === 'data') {
    useCases.push('Access datasets for your analysis');
    useCases.push('Data visualization and insights');
  }
  if (sponsor.category === 'payments') {
    useCases.push('Payment integration in your project');
    useCases.push('Monetization features');
  }
  if (useCases.length === 0) {
    useCases.push('Integrate into your project for sponsor alignment');
  }

  return useCases;
}

function findBonusPrizes(
  sponsors: SponsorAPI[],
  prizes: Prize[]
): BonusPrizeSponsor[] {
  const bonusSponsors: BonusPrizeSponsor[] = [];

  for (const prize of prizes) {
    if (prize.sponsor && prize.tier === 'special') {
      bonusSponsors.push({
        sponsorName: prize.sponsor,
        bonusPrize: prize.description,
        qualification: `Use ${prize.sponsor} technology in your project`,
        extraValue: 6,
      });
    }
  }

  // Also check for sponsor-specific prizes mentioned in text
  for (const sponsor of sponsors) {
    const hasSpecialPrize = prizes.some(p =>
      p.description.toLowerCase().includes(sponsor.name.toLowerCase()) &&
      p.tier === 'special'
    );
    if (!hasSpecialPrize && sponsor.strategicValue >= 4) {
      bonusSponsors.push({
        sponsorName: sponsor.name,
        bonusPrize: `${sponsor.name} integration recognition`,
        qualification: `Demonstrate significant use of ${sponsor.name}`,
        extraValue: 4,
      });
    }
  }

  return bonusSponsors;
}

function detectSynergies(sponsors: SponsorAPI[]): SponsorSynergy[] {
  const synergies: SponsorSynergy[] = [];

  // AI + Hosting synergy
  const aiSponsors = sponsors.filter(s => s.category === 'ai' || s.category === 'ml');
  const hostingSponsors = sponsors.filter(s => s.category === 'hosting');

  if (aiSponsors.length > 0 && hostingSponsors.length > 0) {
    synergies.push({
      sponsors: [aiSponsors[0]!.name, hostingSponsors[0]!.name],
      description: `Use ${aiSponsors[0]!.name} for AI capabilities and deploy on ${hostingSponsors[0]!.name} for a complete AI-powered solution`,
      combinedValue: 8,
      exampleIdea: `Build an AI app powered by ${aiSponsors[0]!.name}, deployed and scalable on ${hostingSponsors[0]!.name}`,
    });
  }

  // Data + AI synergy
  const dataSponsors = sponsors.filter(s => s.category === 'data');
  if (dataSponsors.length > 0 && aiSponsors.length > 0) {
    synergies.push({
      sponsors: [dataSponsors[0]!.name, aiSponsors[0]!.name],
      description: `Use ${dataSponsors[0]!.name} datasets with ${aiSponsors[0]!.name} AI to build data-driven insights`,
      combinedValue: 7,
      exampleIdea: `Analyze ${dataSponsors[0]!.name} data using ${aiSponsors[0]!.name} to generate actionable insights`,
    });
  }

  // Comms + Auth synergy
  const commsSponsors = sponsors.filter(s => s.category === 'comms');
  const authSponsors = sponsors.filter(s => s.category === 'auth');
  if (commsSponsors.length > 0 && authSponsors.length > 0) {
    synergies.push({
      sponsors: [commsSponsors[0]!.name, authSponsors[0]!.name],
      description: `Use ${authSponsors[0]!.name} for authentication and ${commsSponsors[0]!.name} for real-time features`,
      combinedValue: 6,
      exampleIdea: `Build a collaborative tool with secure auth via ${authSponsors[0]!.name} and real-time sync via ${commsSponsors[0]!.name}`,
    });
  }

  return synergies;
}

function generateSponsorStrategy(
  rankings: SponsorValueRanking[],
  required: string[],
  bonus: BonusPrizeSponsor[]
): string {
  const parts: string[] = [];

  if (required.length > 0) {
    parts.push(`Must use: ${required.join(', ')}`);
  }

  if (rankings.length > 0) {
    const topSponsor = rankings[0]!;
    parts.push(`Top strategic sponsor: ${topSponsor.sponsorName} (value ${topSponsor.strategicValue}/10)`);
  }

  if (bonus.length > 0) {
    parts.push(`Bonus prize opportunities: ${bonus.map(b => b.sponsorName).join(', ')}`);
  }

  if (parts.length === 0) {
    return 'No strong sponsor strategy — focus on project quality';
  }

  return parts.join('. ') + '. Prioritize sponsor integration for maximum scoring advantage.';
}

function computeSponsorConfidence(
  sponsors: SponsorAPI[],
  sections: UniversalExtractedSections
): FieldConfidence {
  let score = 0;
  if (sponsors.length > 0) score += 0.3;
  if (sponsors.some(s => s.mustUse)) score += 0.2;
  if (sections.sponsors.length > 30) score += 0.3;
  if (sponsors.length >= 3) score += 0.2;

  return {
    confidence: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    source: sponsors.length > 0 ? 'extracted' : 'inferred',
    notes: `Based on ${sponsors.length} sponsors detected`,
  };
}

// ─── Opportunity Analysis Helpers ───────────────────────────────────

function detectOverusedIdeas(text: string, themes: string[]): string[] {
  return OVERUSED_IDEAS.filter(idea => text.includes(idea));
}

function detectUnderservedOpportunities(
  text: string,
  themes: string[],
  tracks: string[]
): string[] {
  const opportunities: string[] = [];

  // Check for underrepresented areas
  if (!text.includes('accessibility') && !text.includes('a11y')) {
    opportunities.push('Accessibility — rarely addressed but judges love inclusive design');
  }
  if (!text.includes('offline') && !text.includes('low-bandwidth')) {
    opportunities.push('Offline-first / low-bandwidth — most projects assume perfect internet');
  }
  if (!text.includes('edge') && !text.includes('iot')) {
    opportunities.push('Edge computing / IoT — hardware integration stands out');
  }
  if (!text.includes('local') && !text.includes('community')) {
    opportunities.push('Local/community impact — often overlooked for global solutions');
  }
  if (!text.includes('education') && !text.includes('learning')) {
    opportunities.push('Education/learning — universally valuable but rarely the focus');
  }
  if (!text.includes('environment') && !text.includes('sustainability') && !text.includes('climate')) {
    opportunities.push('Environmental/climate — growing importance, fewer entries');
  }

  return opportunities;
}

function identifyRiskyDirections(
  spec: HackathonSpec,
  allText: string
): RiskyDirection[] {
  const risky: RiskyDirection[] = [];

  // Time-limited complex projects
  const timeEvents = spec.timeline.filter(t => t.type === 'submission');
  if (timeEvents.length > 0) {
    risky.push({
      name: 'Complex full-stack build',
      rationale: 'Time-limited hackathons favor focused MVPs over complex architectures',
      riskLevel: 7,
      failureModes: ['Incomplete implementation', 'No working demo', 'Buggy presentation'],
    });
  }

  // New technology with no prior experience
  if (allText.includes('blockchain') || allText.includes('web3')) {
    risky.push({
      name: 'Blockchain/Web3 integration',
      rationale: 'Requires significant setup time and debugging. Many teams fail to deliver.',
      riskLevel: 8,
      failureModes: ['Gas fee issues', 'Smart contract bugs', 'Wallet connection failures'],
    });
  }

  // Hardware projects
  if (allText.includes('hardware') || allText.includes('iot') || allText.includes('sensor')) {
    risky.push({
      name: 'Hardware-dependent project',
      rationale: 'Hardware failures are unpredictable. Software fallback needed.',
      riskLevel: 6,
      failureModes: ['Hardware failure', 'Sensor inaccuracy', 'Power issues'],
    });
  }

  // Multi-platform deployment
  risky.push({
    name: 'Multi-platform deployment',
    rationale: 'Deploying to web + mobile + desktop in limited time is extremely risky',
    riskLevel: 7,
    failureModes: ['Platform-specific bugs', 'Incomplete features on some platforms', 'No time for testing'],
  });

  return risky;
}

function findStrongestDirection(
  spec: HackathonSpec,
  themes: string[],
  allText: string
): ProjectDirection {
  // Find the direction with highest score potential and lowest effort
  const criteria = [...spec.judgingCriteria].sort((a, b) => (b.weight || 0) - (a.weight || 0));
  const topCriterion = criteria[0];

  let name = 'Focused MVP';
  let rationale = 'Build a focused, working MVP that excels in the highest-weighted criterion';
  let scorePotential = 70;
  let effort = 3;

  if (themes.includes('ai') || themes.includes('machine learning') || allText.includes('ai')) {
    name = 'AI-powered solution';
    rationale = 'AI/ML projects score well on innovation and technical depth. Use sponsor AI APIs.';
    scorePotential = 80;
    effort = 5;
  } else if (themes.includes('climate') || themes.includes('sustainability')) {
    name = 'Climate/sustainability tool';
    rationale = 'Social impact projects resonate with judges and often have dedicated tracks.';
    scorePotential = 75;
    effort = 4;
  } else if (themes.includes('fintech') || themes.includes('payments')) {
    name = 'Fintech innovation';
    rationale = 'Fintech projects demonstrate real-world impact and often align with sponsor goals.';
    scorePotential = 72;
    effort = 5;
  }

  return {
    name,
    rationale,
    targetTrack: spec.tracks[0],
    keySponsors: spec.sponsorAPIs.filter(s => s.mustUse || s.strategicValue >= 4).map(s => s.name),
    effort,
    scorePotential,
    requiredCapabilities: inferRequiredCapabilities(allText, themes),
  };
}

function inferRequiredCapabilities(text: string, themes: string[]): string[] {
  const caps: string[] = [];
  if (text.includes('ai') || text.includes('machine learning') || themes.includes('ai')) caps.push('AI/ML');
  if (text.includes('frontend') || text.includes('ui') || text.includes('ux')) caps.push('Frontend');
  if (text.includes('backend') || text.includes('api') || text.includes('server')) caps.push('Backend');
  if (text.includes('database') || text.includes('data')) caps.push('Data');
  if (text.includes('deploy') || text.includes('cloud')) caps.push('DevOps');
  if (caps.length === 0) caps.push('Full-stack');
  return caps;
}

function determineEasiestPath(spec: HackathonSpec, themes: string[]): string {
  const criteria = spec.judgingCriteria;
  const sorted = [...criteria].sort((a, b) => (b.weight || 0) - (a.weight || 0));

  if (sorted.length === 0) {
    return 'Build a simple, working demo that demonstrates a clear idea';
  }

  const top = sorted[0]!;
  if (top.name.toLowerCase().includes('innovation')) {
    return `Focus on a creative, novel approach to ${themes[0] || 'the problem'} — innovation is the top criterion`;
  }
  if (top.name.toLowerCase().includes('impact')) {
    return `Build something with clear real-world impact — demonstrate measurable outcomes`;
  }
  if (top.name.toLowerCase().includes('technical')) {
    return `Show technical depth — well-architected, scalable, well-coded`;
  }
  if (top.name.toLowerCase().includes('presentation') || top.name.toLowerCase().includes('demo')) {
    return `Invest heavily in the demo and presentation — polish matters more than features`;
  }

  return `Maximize ${top.name} (${top.weight}% weight) — this is the single most important criterion`;
}

function determineHighestRoiTrack(
  spec: HackathonSpec,
  tracks: string[],
  themes: string[]
): string {
  if (tracks.length === 0) return 'Main track';

  // Prefer tracks with fewer expected competitors
  const nicheTracks = tracks.filter(t =>
    t.toLowerCase().includes('beginner') ||
    t.toLowerCase().includes('student') ||
    t.toLowerCase().includes('first-time')
  );
  if (nicheTracks.length > 0) return nicheTracks[0]!;

  // Prefer tracks aligned with themes
  const alignedTracks = tracks.filter(t =>
    themes.some(theme => t.toLowerCase().includes(theme.toLowerCase()))
  );
  if (alignedTracks.length > 0) return alignedTracks[0]!;

  return tracks[0]!;
}

function computeOpportunityConfidence(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): FieldConfidence {
  let score = 0;
  if (spec.description.length > 100) score += 0.3;
  if (spec.judgingCriteria.length >= 2) score += 0.2;
  if (spec.themes.length > 0) score += 0.2;
  if (spec.tracks.length > 0) score += 0.1;
  if (sections.description.length > 200) score += 0.2;

  return {
    confidence: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    source: 'inferred',
    notes: 'Based on content signals and criteria analysis',
  };
}

// ─── Challenge Understanding Helpers ────────────────────────────────

function inferCoreProblem(spec: HackathonSpec, allText: string): string {
  // Try to extract from description
  const sentences = spec.description.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length > 0) {
    return sentences[0]!.trim() + '.';
  }

  // Fallback to tagline
  if (spec.tagline) return spec.tagline;

  // Fallback to title + theme
  return `Solving challenges related to ${spec.themes.join(', ') || 'technology'} at ${spec.organizer || 'this hackathon'}`;
}

function inferTargetUsers(text: string, spec: HackathonSpec): string[] {
  const users: string[] = [];

  if (text.includes('student')) users.push('Students');
  if (text.includes('beginner') || text.includes('first-time')) users.push('Beginners');
  if (text.includes('developer')) users.push('Developers');
  if (text.includes('designer')) users.push('Designers');
  if (text.includes('entrepreneur')) users.push('Entrepreneurs');
  if (text.includes('enterprise') || text.includes('business')) users.push('Enterprise users');
  if (text.includes('consumer') || text.includes('user')) users.push('End users');
  if (text.includes('community') || text.includes('social')) users.push('Communities');
  if (text.includes('environment') || text.includes('climate')) users.push('Environmental organizations');

  return users.length > 0 ? users : ['General public'];
}

function inferExpectedImpact(text: string, spec: HackathonSpec): string {
  if (text.includes('social impact') || text.includes('community')) {
    return 'Positive social change through technology';
  }
  if (text.includes('real-world') || text.includes('production')) {
    return 'Production-ready solution with measurable real-world outcomes';
  }
  if (text.includes('innovation') || text.includes('research')) {
    return 'Novel approach that advances the state of the art';
  }
  if (text.includes('education') || text.includes('learning')) {
    return 'Improved learning outcomes and educational access';
  }
  if (text.includes('environment') || text.includes('climate') || text.includes('sustainability')) {
    return 'Measurable environmental benefit';
  }

  return 'Demonstration of technical skill and creative problem-solving';
}

function inferOrganizerMotivation(text: string, spec: HackathonSpec): string {
  const motivations: string[] = [];

  if (text.includes('sponsor') || text.includes('partner')) {
    motivations.push('Showcase sponsor technology and drive adoption');
  }
  if (text.includes('talent') || text.includes('recruit') || text.includes('hire')) {
    motivations.push('Identify and recruit talented developers');
  }
  if (text.includes('community') || text.includes('ecosystem')) {
    motivations.push('Build and strengthen the developer community');
  }
  if (text.includes('innovation') || text.includes('research')) {
    motivations.push('Drive innovation in a specific domain');
  }
  if (text.includes('education') || text.includes('learn')) {
    motivations.push('Educate developers on new technologies');
  }
  if (text.includes('brand') || text.includes('awareness')) {
    motivations.push('Increase brand awareness and mindshare');
  }

  return motivations.length > 0
    ? motivations.join('; ')
    : `Promote innovation and engagement in the ${spec.themes[0] || 'technology'} space`;
}

function generateSuccessCriteria(spec: HackathonSpec, text: string): string[] {
  const criteria: string[] = [];

  // From judging criteria
  for (const c of spec.judgingCriteria) {
    if (c.weight >= 20) {
      criteria.push(`Score highly on ${c.name} (${c.weight}% weight)`);
    }
  }

  // From content
  if (text.includes('working') || text.includes('functional')) {
    criteria.push('Deliver a working, functional prototype');
  }
  if (text.includes('demo') || text.includes('presentation')) {
    criteria.push('Deliver a compelling demo and presentation');
  }
  if (text.includes('impact') || text.includes('measurable')) {
    criteria.push('Demonstrate measurable impact or outcomes');
  }

  if (criteria.length === 0) {
    criteria.push('Deliver a working project that addresses the challenge');
    criteria.push('Present clearly and concisely');
  }

  return criteria;
}

function identifyDomainKnowledge(text: string, themes: string[]): string[] {
  const knowledge: string[] = [];

  if (text.includes('ai') || text.includes('machine learning') || themes.includes('ai')) {
    knowledge.push('Machine learning fundamentals');
    knowledge.push('Data preprocessing and model training');
  }
  if (text.includes('blockchain') || text.includes('web3')) {
    knowledge.push('Blockchain development');
    knowledge.push('Smart contract programming');
  }
  if (text.includes('climate') || text.includes('environment')) {
    knowledge.push('Climate science basics');
    knowledge.push('Environmental data analysis');
  }
  if (text.includes('fintech') || text.includes('finance')) {
    knowledge.push('Financial services domain');
    knowledge.push('Payment processing and compliance');
  }
  if (text.includes('health') || text.includes('medical')) {
    knowledge.push('Healthcare domain knowledge');
    knowledge.push('HIPAA/data privacy considerations');
  }
  if (text.includes('education') || text.includes('learning')) {
    knowledge.push('Educational methodology');
    knowledge.push('User engagement patterns');
  }

  return knowledge.length > 0 ? knowledge : ['General software development'];
}

function computeChallengeConfidence(
  spec: HackathonSpec,
  sections: UniversalExtractedSections
): FieldConfidence {
  let score = 0;
  if (spec.description.length > 50) score += 0.3;
  if (spec.title.length > 0) score += 0.2;
  if (spec.organizer.length > 0) score += 0.2;
  if (sections.description.length > 100) score += 0.3;

  return {
    confidence: score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low',
    source: spec.description.length > 50 ? 'extracted' : 'inferred',
    notes: `Based on ${spec.description.length} chars of description`,
  };
}

// ─── Winning Strategy Report Helpers ────────────────────────────────

function selectEasiestPath(
  judging: JudgingIntelligence,
  opportunity: OpportunityAnalysis,
  sponsor: SponsorIntelligence
): string {
  const parts: string[] = [];

  if (opportunity.easiestPathToWin) {
    parts.push(opportunity.easiestPathToWin);
  }

  if (judging.likelyWinningStrategies.length > 0) {
    const easiest = [...judging.likelyWinningStrategies].sort((a, b) => a.difficulty - b.difficulty)[0]!;
    parts.push(`Consider the "${easiest.name}" strategy (difficulty ${easiest.difficulty}/10, estimated +${easiest.scoreBoost} points)`);
  }

  if (sponsor.requiredSponsors.length > 0) {
    parts.push(`Must integrate ${sponsor.requiredSponsors.join(' and ')} for eligibility`);
  }

  return parts.join('. ') || 'Build a focused, working MVP';
}

function selectHighestRoiTrack(
  spec: HackathonSpec,
  sponsor: SponsorIntelligence
): string {
  if (spec.tracks.length === 0) return 'Main track';

  // Prefer niche tracks with sponsor prizes
  const trackPrizes = spec.prizes.filter(p => p.track);
  if (trackPrizes.length > 0) {
    return trackPrizes[0]!.track || spec.tracks[0]!;
  }

  return spec.tracks[0]!;
}

function recommendTechStack(
  spec: HackathonSpec,
  sponsor: SponsorIntelligence,
  judging: JudgingIntelligence
): string[] {
  const stack: string[] = [];

  // From sponsors
  for (const s of sponsor.sponsorsByValue.slice(0, 3)) {
    stack.push(s.sponsorName);
  }

  // From themes
  const themes = spec.themes.map(t => t.toLowerCase());
  if (themes.includes('ai') || themes.includes('machine learning')) {
    stack.push('Python', 'TensorFlow/PyTorch');
  }
  if (themes.includes('web') || themes.includes('frontend')) {
    stack.push('React/Next.js', 'TypeScript');
  }
  if (themes.includes('mobile')) {
    stack.push('React Native', 'Flutter');
  }
  if (themes.includes('blockchain')) {
    stack.push('Solidity', 'Ethers.js');
  }

  // Fallback
  if (stack.length === 0) {
    stack.push('TypeScript', 'Node.js', 'React');
  }

  return [...new Set(stack)];
}

function recommendMvpScope(judging: JudgingIntelligence, spec: HackathonSpec): string {
  const depth = judging.expectedTechnicalDepth;
  const innovation = judging.expectedInnovation;

  if (depth >= 7 && innovation >= 7) {
    return 'Deep technical MVP with novel approach — prioritize architecture and innovation over breadth';
  }
  if (depth >= 7) {
    return 'Technically solid MVP — focus on clean architecture, good code quality, and working features';
  }
  if (innovation >= 7) {
    return 'Innovative MVP — demonstrate a novel approach, even if simple technically';
  }
  if (judging.expectedPresentation >= 7) {
    return 'Polished MVP — invest in UI/UX, demo flow, and visual presentation';
  }

  return 'Focused MVP — 2-3 core features, fully working, well-demonstrated';
}

function recommendDemoStrategy(judging: JudgingIntelligence, spec: HackathonSpec): string {
  const presentation = judging.expectedPresentation;
  const impact = judging.expectedBusinessImpact;

  if (presentation >= 7) {
    return 'Invest heavily in demo polish — screen recording, live demo flow, visual design. Presentation is heavily weighted.';
  }
  if (impact >= 7) {
    return 'Lead with impact metrics and real-world outcomes — show measurable results, not just features.';
  }

  return 'Tell a compelling story — problem, solution, demo, impact. Keep it under 3 minutes.';
}

function compileRisks(
  opportunity: OpportunityAnalysis,
  judging: JudgingIntelligence
): string[] {
  const risks: string[] = [];

  for (const r of opportunity.riskyDirections.slice(0, 3)) {
    risks.push(`${r.name} (risk ${r.riskLevel}/10): ${r.rationale}`);
  }

  if (judging.expectedTechnicalDepth >= 8) {
    risks.push('High technical expectations — ensure code quality and architecture are solid');
  }

  return risks;
}

function compileOpportunities(
  opportunity: OpportunityAnalysis,
  sponsor: SponsorIntelligence,
  judging: JudgingIntelligence
): string[] {
  const opps: string[] = [];

  for (const o of opportunity.underservedOpportunities.slice(0, 3)) {
    opps.push(o);
  }

  for (const s of sponsor.bonusPrizeSponsors.slice(0, 2)) {
    opps.push(`Bonus prize opportunity: ${s.bonusPrize} — qualification: ${s.qualification}`);
  }

  return opps;
}

function compileSponsorOpportunities(sponsor: SponsorIntelligence): string[] {
  const opps: string[] = [];

  for (const s of sponsor.sponsorsByValue.slice(0, 3)) {
    opps.push(`${s.sponsorName} (value ${s.strategicValue}/10): ${s.rationale.join('; ')}`);
  }

  for (const syn of sponsor.synergyOpportunities.slice(0, 2)) {
    opps.push(`Synergy: ${syn.description}`);
  }

  return opps;
}

function summarizeJudgingPriorities(
  judging: JudgingIntelligence,
  spec: HackathonSpec
): string {
  const parts: string[] = [];

  if (judging.actualPriorities.length > 0) {
    parts.push(`Top priorities: ${judging.actualPriorities.slice(0, 3).join('; ')}`);
  }

  parts.push(`Technical depth expected: ${judging.expectedTechnicalDepth}/10`);
  parts.push(`Innovation expected: ${judging.expectedInnovation}/10`);
  parts.push(`Presentation expected: ${judging.expectedPresentation}/10`);
  parts.push(`Business impact expected: ${judging.expectedBusinessImpact}/10`);

  return parts.join('. ');
}

function computeOverallConfidence(
  judging: JudgingIntelligence,
  sponsor: SponsorIntelligence,
  opportunity: OpportunityAnalysis,
  challenge: ChallengeUnderstanding
): FieldConfidence {
  const scores = [
    judging.confidence.confidence === 'high' ? 0.3 : judging.confidence.confidence === 'medium' ? 0.2 : 0.1,
    sponsor.confidence.confidence === 'high' ? 0.3 : sponsor.confidence.confidence === 'medium' ? 0.2 : 0.1,
    opportunity.confidence.confidence === 'high' ? 0.2 : opportunity.confidence.confidence === 'medium' ? 0.15 : 0.05,
    challenge.confidence.confidence === 'high' ? 0.2 : challenge.confidence.confidence === 'medium' ? 0.15 : 0.05,
  ];

  const total = scores.reduce((a, b) => a + b, 0);

  return {
    confidence: total >= 0.7 ? 'high' : total >= 0.4 ? 'medium' : 'low',
    source: 'inferred',
    notes: `Overall intelligence confidence: ${(total * 100).toFixed(0)}%`,
  };
}

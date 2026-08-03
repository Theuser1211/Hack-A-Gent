import { hashSeed, seededInt } from '../ideation/rng.js';
import type { ScoredIdea } from '../ideation/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import type { ViabilityAnalysis } from './types.js';

interface DomainProfile {
  marketSize: number;
  businessModel: string;
  monetizationPath: string;
  monetization: number;
}

const DOMAIN_PROFILES: Record<string, DomainProfile> = {
  ai: { marketSize: 9, businessModel: 'API / SaaS', monetizationPath: 'Per-seat SaaS or per-token API after the free tier', monetization: 7 },
  finance: { marketSize: 9, businessModel: 'Transactional / SaaS', monetizationPath: 'Take-rate on payments or a paid subscription for forecasting', monetization: 9 },
  careers: { marketSize: 8, businessModel: 'Marketplace / SaaS', monetizationPath: 'Recruiter side pays, candidate side stays free', monetization: 8 },
  health: { marketSize: 8, businessModel: 'B2B2C subscription', monetizationPath: 'Care providers or plans license it for their families/members', monetization: 7 },
  productivity: { marketSize: 7, businessModel: 'Per-seat SaaS', monetizationPath: 'Team seats with a free solo tier that grows virally', monetization: 8 },
  education: { marketSize: 7, businessModel: 'Subscription / B2B', monetizationPath: 'Schools pay per cohort; consumer freemium for self-learners', monetization: 6 },
  food: { marketSize: 7, businessModel: 'Marketplace take-rate', monetizationPath: 'Small commission on matched orders or local placements', monetization: 6 },
  creative: { marketSize: 6, businessModel: 'Creator subscription', monetizationPath: 'Pro tier for creators; watermark on the free tier', monetization: 6 },
  climate: { marketSize: 7, businessModel: 'B2B / grant-funded', monetizationPath: 'Sell reporting to municipalities; consumer side free', monetization: 5 },
  community: { marketSize: 5, businessModel: 'Marketplace / sponsorship', monetizationPath: 'Local business sponsorships or a tiny transaction fee', monetization: 5 },
  accessibility: { marketSize: 6, businessModel: 'B2B accessibility SaaS', monetizationPath: 'Licensed to orgs that must comply with accessibility law', monetization: 6 },
  civic: { marketSize: 5, businessModel: 'B2G / nonprofit', monetizationPath: 'Municipal contracts or foundation funding', monetization: 4 },
};

const URGENCY_SIGNALS = /late.?night|drowning|stuck|last.?minute|waste|drain|loses|lost|before it spoils|no one|never|urgent|missed|forget|forgotten|scrambl|panic|cram|overload|burnout|silent|slip|catch|prevent/;
const MOAT_SIGNALS = /network|ledger|ballot|marketplace|matches|matchmaker|community|pool|shared|two.?sided|rewards|rating|reputation|group|squad|co.?op/;
const ACQUISITION_SIGNALS = /sms|call|voice|calendar|inbox|email|text|push|phone|voice note|in the browser|no install|one screen|scan|photo|public data|already have/;

/** YC-style business viability analysis derived from the idea's own content. */
export function analyzeViability(idea: ScoredIdea, analysis: CompetitionAnalysis, seed = 0): ViabilityAnalysis {
  const profile = DOMAIN_PROFILES[idea.domain] ?? DOMAIN_PROFILES.ai!;
  const base = hashSeed([idea.id, idea.title, 'viability', seed]);
  const line = `${idea.line} ${idea.concept}`.toLowerCase();

  const marketSize = clamp10(profile.marketSize + (line.includes('gig') || line.includes('freelanc') ? 1 : 0) + seededInt(base, -1, 1));
  const urgency = clamp10(7 + (URGENCY_SIGNALS.test(line) ? 2 : 0) + seededInt(base + 1, -1, 1));
  const monetization = clamp10(profile.monetization + (line.includes('save') || line.includes('budget') || line.includes('fee') ? 1 : 0) + seededInt(base + 2, -1, 1));
  const moat = clamp10(6 + (MOAT_SIGNALS.test(line) ? 3 : 0) + seededInt(base + 3, -1, 1));
  const acquisition = clamp10(6 + (ACQUISITION_SIGNALS.test(line) ? 2 : 0) + seededInt(base + 4, -1, 1));

  const total = Math.round((marketSize * 0.25 + urgency * 0.25 + monetization * 0.2 + moat * 0.15 + acquisition * 0.15) * 10);

  const summary =
    `${idea.title} targets a ${marketSize >= 8 ? 'large' : marketSize >= 6 ? 'sizable' : 'niche but real'} market with ` +
    `${urgency >= 8 ? 'a "hair on fire" problem' : urgency >= 6 ? 'a recurring, felt problem' : 'a genuine but softer pain'}. ` +
    `Business model: ${profile.businessModel}.`;

  return {
    marketSize,
    urgency,
    monetization,
    moat,
    acquisition,
    total,
    businessModel: profile.businessModel,
    monetizationPath: profile.monetizationPath,
    summary,
  };
}

function clamp10(n: number): number {
  return Math.max(1, Math.min(10, n));
}

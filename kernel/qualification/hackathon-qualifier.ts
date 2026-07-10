/**
 * Hackathon Qualification Engine
 *
 * Determines whether a hackathon is compatible with Hack-A-Gent's
 * current capabilities before committing resources to generation.
 *
 * Classifies hackathons into:
 * - SUPPORTED: All requirements can be met
 * - PARTIALLY_SUPPORTED: Some requirements met, others may fail
 * - UNSUPPORTED: Critical requirements cannot be met
 */

import {
  SUPPORTED_CAPABILITIES,
  UNSUPPORTED_PATTERNS,
  type Capability,
  type UnsupportedPattern,
} from './capability-registry.js';

export type QualificationStatus = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'UNSUPPORTED';

export interface QualificationResult {
  status: QualificationStatus;
  supportedRequirements: string[];
  unsupportedRequirements: string[];
  partialRequirements: string[];
  unsupportedReasons: string[];
  confidence: number;
  explanation: string;
  recommendedAction: string;
}

interface HackathonRequirements {
  title: string;
  description: string;
  techStack: string[];
  judgingCriteria: string[];
  constraints: string[];
  sponsorAPIs: string[];
  deliverables: string[];
  category?: string;
}

/**
 * Common technology keywords to extract from hackathon descriptions.
 */
const TECH_KEYWORDS: Array<{ pattern: RegExp; capability: string }> = [
  // Frameworks
  { pattern: /\bnext\.?js\b/i, capability: 'nextjs' },
  { pattern: /\breact\b/i, capability: 'react' },
  { pattern: /\bvue\.?js\b/i, capability: 'vue' },
  { pattern: /\bsvelte\b/i, capability: 'svelte' },
  { pattern: /\bexpress\.?js\b/i, capability: 'express' },
  { pattern: /\bfastify\b/i, capability: 'fastify' },
  { pattern: /\bfastapi\b/i, capability: 'fastapi' },
  { pattern: /\bflask\b/i, capability: 'flask' },

  // Languages
  { pattern: /\btypescript\b/i, capability: 'typescript' },
  { pattern: /\bjavascript\b/i, capability: 'javascript' },
  { pattern: /\bpython\b/i, capability: 'python' },

  // Databases
  { pattern: /\bsqlite\b/i, capability: 'sqlite' },
  { pattern: /\bpostgres(?:ql)?\b/i, capability: 'postgresql' },
  { pattern: /\bmongodb\b/i, capability: 'mongodb' },
  { pattern: /\bsupabase\b/i, capability: 'supabase' },
  { pattern: /\bprisma\b/i, capability: 'prisma' },
  { pattern: /\bdrizzle\b/i, capability: 'drizzle' },

  // Deployment
  { pattern: /\bvercel\b/i, capability: 'vercel' },
  { pattern: /\bnetlify\b/i, capability: 'netlify' },
  { pattern: /\bdocker\b/i, capability: 'docker' },

  // APIs
  { pattern: /\bopenai\b/i, capability: 'openai-api' },
  { pattern: /\banthropic\b/i, capability: 'anthropic-api' },
  { pattern: /\btwilio\b/i, capability: 'twilio' },
  { pattern: /\bstripe\b/i, capability: 'stripe' },
  { pattern: /\bfirebase\b/i, capability: 'firebase' },
  { pattern: /\bhugging\s*face\b/i, capability: 'huggingface' },

  // Local AI
  { pattern: /\bollama\b/i, capability: 'ollama' },

  // UI
  { pattern: /\btailwind\b/i, capability: 'tailwind' },
  { pattern: /\bshadcn\b/i, capability: 'shadcn' },
];

/**
 * Extract technology mentions from text.
 */
function extractTechnologies(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, capability } of TECH_KEYWORDS) {
    if (pattern.test(text)) {
      found.add(capability);
    }
  }
  return Array.from(found);
}

/**
 * Check text against unsupported patterns.
 */
function checkUnsupportedPatterns(text: string): UnsupportedPattern[] {
  return UNSUPPORTED_PATTERNS.filter(({ pattern }) => pattern.test(text));
}

/**
 * Classify a single technology requirement.
 */
function classifyRequirement(tech: string): 'supported' | 'unsupported' | 'partial' {
  const lower = tech.toLowerCase();
  const capability = SUPPORTED_CAPABILITIES.find(
    c => c.id === lower || c.name.toLowerCase() === lower
  );
  if (capability) return 'supported';

  // Check for partial matches (e.g., "React Native" partially matches "React")
  const partialMatch = SUPPORTED_CAPABILITIES.find(
    c => lower.includes(c.id) || c.name.toLowerCase().includes(lower)
  );
  if (partialMatch) return 'partial';

  return 'unsupported';
}

/**
 * Qualify a hackathon based on its requirements.
 *
 * @param requirements - Parsed hackathon requirements
 * @returns Qualification result with status, explanation, and recommendations
 */
export function qualifyHackathon(requirements: HackathonRequirements): QualificationResult {
  const supported: string[] = [];
  const unsupported: string[] = [];
  const partial: string[] = [];
  const reasons: string[] = [];

  // 1. Check for explicitly unsupported patterns in description
  const allText = [
    requirements.title,
    requirements.description,
    ...requirements.constraints,
    ...requirements.deliverables,
  ].join(' ');

  const unsupportedMatches = checkUnsupportedPatterns(allText);
  for (const match of unsupportedMatches) {
    unsupported.push(match.category);
    reasons.push(match.reason);
  }

  // 2. Extract technologies from all text sources
  const extractedTechs = new Set<string>();

  // From explicit tech stack
  for (const tech of requirements.techStack) {
    extractedTechs.add(tech.toLowerCase());
  }

  // From description
  const descTechs = extractTechnologies(requirements.description);
  for (const tech of descTechs) {
    extractedTechs.add(tech);
  }

  // From constraints (may mention required tech)
  for (const constraint of requirements.constraints) {
    const constraintTechs = extractTechnologies(constraint);
    for (const tech of constraintTechs) {
      extractedTechs.add(tech);
    }
  }

  // From sponsor APIs
  for (const api of requirements.sponsorAPIs) {
    const apiTechs = extractTechnologies(api);
    for (const tech of apiTechs) {
      extractedTechs.add(tech);
    }
  }

  // 3. Classify each technology
  for (const tech of extractedTechs) {
    const classification = classifyRequirement(tech);
    switch (classification) {
      case 'supported':
        supported.push(tech);
        break;
      case 'unsupported':
        unsupported.push(tech);
        reasons.push(`Technology '${tech}' is not in the supported capabilities list`);
        break;
      case 'partial':
        partial.push(tech);
        break;
    }
  }

  // 4. Determine overall status
  let status: QualificationStatus;
  let confidence: number;
  let explanation: string;
  let recommendedAction: string;

  if (unsupported.length === 0 && partial.length === 0) {
    status = 'SUPPORTED';
    confidence = 0.9;
    explanation = `All detected requirements (${supported.length} technologies) are supported.`;
    recommendedAction = 'Proceed with full pipeline execution.';
  } else if (unsupported.length === 0 && partial.length > 0) {
    status = 'PARTIALLY_SUPPORTED';
    confidence = 0.7;
    explanation = `${supported.length} technologies supported, ${partial.length} partially supported. No critical blockers detected.`;
    recommendedAction = 'Proceed with caution. Some features may fall back to templates.';
  } else if (unsupported.length <= 2 && supported.length > unsupported.length) {
    status = 'PARTIALLY_SUPPORTED';
    confidence = 0.5;
    explanation = `${supported.length} technologies supported, but ${unsupported.length} unsupported: ${unsupported.join(', ')}.`;
    recommendedAction = `Proceed with reduced scope. Unsupported: ${reasons.join('; ')}`;
  } else {
    status = 'UNSUPPORTED';
    confidence = 0.9;
    explanation = `Critical requirements cannot be met: ${unsupported.join(', ')}. ${reasons.join('; ')}`;
    recommendedAction = `Reject this hackathon. ${reasons.join(' ')}`;
  }

  return {
    status,
    supportedRequirements: supported,
    unsupportedRequirements: unsupported,
    partialRequirements: partial,
    unsupportedReasons: reasons,
    confidence,
    explanation,
    recommendedAction,
  };
}

/**
 * Quick check: is this hackathon worth attempting?
 */
export function isHackathonViable(requirements: HackathonRequirements): boolean {
  const result = qualifyHackathon(requirements);
  return result.status !== 'UNSUPPORTED';
}

/**
 * Format qualification result for CLI display.
 */
export function formatQualificationResult(result: QualificationResult): string {
  const lines: string[] = [];

  const icon = result.status === 'SUPPORTED' ? '✅' :
               result.status === 'PARTIALLY_SUPPORTED' ? '⚠️' : '❌';

  lines.push(`${icon} Hackathon Qualification: ${result.status}`);
  lines.push(`   Confidence: ${Math.round(result.confidence * 100)}%`);
  lines.push(`   ${result.explanation}`);

  if (result.supportedRequirements.length > 0) {
    lines.push(`   Supported: ${result.supportedRequirements.join(', ')}`);
  }
  if (result.partialRequirements.length > 0) {
    lines.push(`   Partial: ${result.partialRequirements.join(', ')}`);
  }
  if (result.unsupportedRequirements.length > 0) {
    lines.push(`   Unsupported: ${result.unsupportedRequirements.join(', ')}`);
  }

  lines.push(`   Action: ${result.recommendedAction}`);

  return lines.join('\n');
}

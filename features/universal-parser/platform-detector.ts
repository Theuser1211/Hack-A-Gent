/**
 * Platform Detector — Semantic Hackathon Detection
 * ================================================
 *
 * Detects whether a page is a hackathon using semantic signals,
 * NOT hostname checks. Returns platform type and confidence score.
 */

import type { PlatformType } from './types.js';
import { stripHtml } from './html-utils.js';

// Platform signature patterns
const PLATFORM_SIGNATURES: Record<PlatformType, PlatformSignature> = {
  devpost: {
    name: 'devpost',
    hostnamePatterns: [/devpost\.com$/i, /\.devpost\.com$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*devpost/i,
      /<div[^>]*id=["']content-sidebar["']/i,
      /<h2[^>]*>\s*(?:judging criteria|prizes|sponsors|requirements)\s*<\/h2>/i,
      /hackathons\?organization=/i,
      /hackathons\?themes?=/i,
      /class=["'][^"']*cf-tag[^"']/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  mlh: {
    name: 'mlh',
    hostnamePatterns: [/mlh\.io$/i, /majorleaguehacking\.com$/i, /\.mlh\.io$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*major league hacking/i,
      /class=["'][^"']*mlh[^"']/i,
      /data-mlh-/i,
      /mlh\-hackathon/i,
      /Major League Hacking/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  unstop: {
    name: 'unstop',
    hostnamePatterns: [/unstop\.com$/i, /\.unstop\.com$/i, /dare2compete\.com$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*unstop/i,
      /class=["'][^"']*unstop[^"']/i,
      /data-unstop-/i,
      /Unstop|Dare2Compete/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  luma: {
    name: 'luma',
    hostnamePatterns: [/lu\.ma$/i, /luma\.com$/i, /\.lu\.ma$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*luma/i,
      /class=["'][^"']*luma[^"']/i,
      /data-luma-/i,
      /lu\.ma\/event/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  hack2skill: {
    name: 'hack2skill',
    hostnamePatterns: [/hack2skill\.com$/i, /\.hack2skill\.com$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*hack2skill/i,
      /class=["'][^"']*hack2skill[^"']/i,
      /Hack2Skill/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  hackerearth: {
    name: 'hackerearth',
    hostnamePatterns: [/hackerearth\.com$/i, /\.hackerearth\.com$/i],
    positiveSignals: [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["'][^"']*hackerearth/i,
      /class=["'][^"']*hackerearth[^"']/i,
      /data-he-/i,
      /HackerEarth/i,
    ],
    negativeSignals: [],
    minConfidence: 0.7,
  },
  generic: {
    name: 'generic',
    hostnamePatterns: [],
    positiveSignals: [],
    negativeSignals: [],
    minConfidence: 0.3,
  },
};

interface PlatformSignature {
  name: PlatformType;
  hostnamePatterns: RegExp[];
  positiveSignals: RegExp[];
  negativeSignals: RegExp[];
  minConfidence: number;
}

// Universal hackathon content signals (platform-agnostic)
const HACKATHON_CONTENT_SIGNALS = [
  // Explicit hackathon keywords
  { pattern: /\bhackathon\b/i, weight: 0.3, label: 'hackathon keyword' },
  { pattern: /\bhack\s*athon\b/i, weight: 0.25, label: 'hack-athon keyword' },
  { pattern: /\bhack\s*fest\b/i, weight: 0.2, label: 'hackfest keyword' },
  { pattern: /\bcode\s*fest\b/i, weight: 0.15, label: 'codefest keyword' },
  { pattern: /\bdev\s*fest\b/i, weight: 0.15, label: 'devfest keyword' },
  { pattern: /\bbuildathon\b/i, weight: 0.2, label: 'buildathon keyword' },
  { pattern: /\bmakeathon\b/i, weight: 0.2, label: 'makeathon keyword' },

  // Competition structure
  { pattern: /\bjudging\s+criteria\b/i, weight: 0.15, label: 'judging criteria' },
  { pattern: /\bprize\s+pool\b/i, weight: 0.15, label: 'prize pool' },
  { pattern: /\bsubmission\s+deadline\b/i, weight: 0.15, label: 'submission deadline' },
  { pattern: /\bwinner\s+announcement\b/i, weight: 0.1, label: 'winner announcement' },
  { pattern: /\bdemo\s+day\b/i, weight: 0.1, label: 'demo day' },
  { pattern: /\bfinalist\b/i, weight: 0.08, label: 'finalist' },
  { pattern: /\bregister\s+(?:for|to)\s+(?:the\s+)?hackathon/i, weight: 0.2, label: 'register for hackathon' },

  // Sponsor/prize indicators
  { pattern: /\bsponsor(?:ed)?\s+by\b/i, weight: 0.1, label: 'sponsored by' },
  { pattern: /\bprize[s]?\s+(?:worth|total|pool)\b/i, weight: 0.12, label: 'prize worth/total' },
  { pattern: /\$\d[\d,]*\s*(?:usd|prize|award|cash)/i, weight: 0.1, label: 'cash prize' },

  // Timeline indicators
  { pattern: /\b(?:registration|submission)\s+(?:opens?|closes?|ends?)\b/i, weight: 0.08, label: 'registration dates' },
  { pattern: /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i, weight: 0.05, label: 'date pattern' },

  // Team/participation
  { pattern: /\bteam\s+(?:of|size|max|minimum)\b/i, weight: 0.08, label: 'team size' },
  { pattern: /\b(?:solo|individual)\s+participat/i, weight: 0.08, label: 'solo participation' },
  { pattern: /\beligib(?:le|ility)\b/i, weight: 0.08, label: 'eligibility' },

  // Technical challenge
  { pattern: /\bbuild\s+(?:an?|a)\s+[^.]{10,}/i, weight: 0.08, label: 'build challenge' },
  { pattern: /\bcreate\s+(?:an?|a)\s+[^.]{10,}/i, weight: 0.08, label: 'create challenge' },
  { pattern: /\bdevelop\s+(?:an?|a)\s+[^.]{10,}/i, weight: 0.08, label: 'develop challenge' },
  { pattern: /\bproblem\s+statement\b/i, weight: 0.1, label: 'problem statement' },
  { pattern: /\bchallenge\s+(?:theme|track|category)\b/i, weight: 0.1, label: 'challenge theme/track' },
];

// Negative signals - NOT a hackathon
const NON_HACKATHON_SIGNALS = [
  { pattern: /\b(?:blog|article|post|news|press|release)\b/i, weight: -0.15, label: 'blog/article' },
  { pattern: /\b(?:documentation|docs|api\s+reference|tutorial|guide|how\s+to)\b/i, weight: -0.2, label: 'documentation' },
  { pattern: /\b(?:github\.com|gitlab\.com|bitbucket\.org)\b/i, weight: -0.3, label: 'code repository' },
  { pattern: /\b(?:youtube\.com|vimeo\.com|twitch\.tv)\b/i, weight: -0.25, label: 'video platform' },
  { pattern: /\b(?:google\.com|wikipedia\.org|amazon\.com|facebook\.com|twitter\.com|linkedin\.com)\b/i, weight: -0.4, label: 'major platform' },
  { pattern: /\b(?:login|sign\s+up|sign\s+in|register)\s*(?:here|now|below)?\s*$/i, weight: -0.1, label: 'login page' },
  { pattern: /\b(?:privacy\s+policy|terms\s+of\s+service|cookie\s+policy)\b/i, weight: -0.1, label: 'legal page' },
  { pattern: /\b(?:404|page\s+not\s+found|not\s+found)\b/i, weight: -0.5, label: 'error page' },
  { pattern: /\b(?:pricing|plans|subscribe|buy\s+now|checkout)\b/i, weight: -0.2, label: 'sales page' },
  { pattern: /\b(?:career|job|hiring|position|vacancy)\b/i, weight: -0.15, label: 'job posting' },
];

export interface DetectionResult {
  isHackathon: boolean;
  confidence: number;
  platform: PlatformType;
  platformConfidence: number;
  signals: SignalMatch[];
  hostnameSignals: SignalMatch[];
  contentSignals: SignalMatch[];
  negativeSignals: SignalMatch[];
  warnings: string[];
  /** Human-readable explanation of why this page was/wasn't classified as a hackathon. */
  reasoning: string;
}

interface SignalMatch {
  label: string;
  weight: number;
  matched: boolean;
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function testSignal(html: string, pattern: RegExp): boolean {
  return pattern.test(html);
}

export function detectPlatform(html: string, url: string): { platform: PlatformType; confidence: number; signals: SignalMatch[] } {
  const hostname = extractHostname(url);
  const textContent = stripHtml(html).toLowerCase();
  const rawHtml = html.toLowerCase();

  let bestPlatform: PlatformType = 'generic';
  let bestConfidence = 0;
  const allSignals: SignalMatch[] = [];

  // Check each platform's signatures
  for (const [platformName, signature] of Object.entries(PLATFORM_SIGNATURES)) {
    const platform = platformName as PlatformType;
    let platformScore = 0;
    const platformSignals: SignalMatch[] = [];

    // Hostname match
    let hostnameMatched = false;
    for (const hp of signature.hostnamePatterns) {
      if (hp.test(hostname)) {
        hostnameMatched = true;
        platformScore += 0.5;
        platformSignals.push({ label: `hostname: ${hp.source}`, weight: 0.5, matched: true });
        break;
      }
    }
    if (!hostnameMatched && signature.hostnamePatterns.length > 0) {
      platformSignals.push({ label: 'hostname', weight: 0, matched: false });
    }

    // Positive HTML signals
    for (const ps of signature.positiveSignals) {
      const matched = testSignal(rawHtml, ps);
      if (matched) {
        platformScore += 0.15;
        platformSignals.push({ label: `html: ${ps.source}`, weight: 0.15, matched: true });
      } else {
        platformSignals.push({ label: `html: ${ps.source}`, weight: 0, matched: false });
      }
    }

    // Negative signals (reduce confidence)
    for (const ns of signature.negativeSignals) {
      if (testSignal(rawHtml, ns)) {
        platformScore -= 0.2;
        platformSignals.push({ label: `negative: ${ns.source}`, weight: -0.2, matched: true });
      }
    }

    // Apply minimum confidence threshold
    if (platformScore >= signature.minConfidence && platformScore > bestConfidence) {
      bestConfidence = platformScore;
      bestPlatform = platform;
    }

    allSignals.push(...platformSignals);
  }

  return {
    platform: bestPlatform,
    confidence: Math.min(1, Math.max(0, bestConfidence)),
    signals: allSignals,
  };
}

export function detectHackathonContent(html: string, url: string): { isHackathon: boolean; confidence: number; signals: SignalMatch[] } {
  const rawHtml = html.toLowerCase();
  const textContent = stripHtml(html).toLowerCase();
  const hostname = extractHostname(url);

  const signals: SignalMatch[] = [];
  let totalScore = 0;

  // Positive content signals
  for (const signal of HACKATHON_CONTENT_SIGNALS) {
    // Test against both raw HTML and stripped text
    const matched = signal.pattern.test(rawHtml) || signal.pattern.test(textContent);
    signals.push({ label: signal.label, weight: signal.weight, matched });
    if (matched) totalScore += signal.weight;
  }

  // Negative signals
  for (const signal of NON_HACKATHON_SIGNALS) {
    const matched = signal.pattern.test(rawHtml) || signal.pattern.test(hostname);
    signals.push({ label: signal.label, weight: signal.weight, matched });
    if (matched) totalScore += signal.weight; // negative weight reduces score
  }

  // Normalize to 0-1
  const maxPossiblePositive = HACKATHON_CONTENT_SIGNALS.reduce((s, sig) => s + sig.weight, 0);
  const normalizedConfidence = Math.max(0, Math.min(1, totalScore / maxPossiblePositive));

  // Higher threshold for "is hackathon" decision
  const isHackathon = normalizedConfidence >= 0.35;

  return {
    isHackathon,
    confidence: normalizedConfidence,
    signals,
  };
}

export function detectHackathon(html: string, url: string, minConfidence = 0.35): DetectionResult {
  const platformResult = detectPlatform(html, url);
  const contentResult = detectHackathonContent(html, url);

  // Combine platform and content confidence
  const combinedConfidence = (platformResult.confidence * 0.4) + (contentResult.confidence * 0.6);
  const isHackathon = combinedConfidence >= minConfidence;

  const warnings: string[] = [];
  if (platformResult.confidence < 0.3 && contentResult.confidence > 0.5) {
    warnings.push('Content suggests hackathon but platform not recognized');
  }
  if (!contentResult.isHackathon && platformResult.confidence > 0.5) {
    warnings.push('Platform recognized but content lacks hackathon signals');
  }
  if (combinedConfidence < minConfidence) {
    warnings.push(`Combined confidence ${combinedConfidence.toFixed(2)} below threshold ${minConfidence}`);
  }

  return {
    isHackathon,
    confidence: combinedConfidence,
    platform: platformResult.platform,
    platformConfidence: platformResult.confidence,
    signals: [...platformResult.signals, ...contentResult.signals],
    hostnameSignals: platformResult.signals.filter(s => s.label.startsWith('hostname')),
    contentSignals: contentResult.signals.filter(s => s.weight > 0),
    negativeSignals: contentResult.signals.filter(s => s.weight < 0 && s.matched),
    warnings,
    reasoning: warnings.join('; ') || (isHackathon
      ? `Detected hackathon signals (combined confidence ${combinedConfidence.toFixed(2)})`
      : 'Content does not match hackathon patterns'),
  };
}

export function isKnownNonHackathonHost(url: string): boolean {
  const hostname = extractHostname(url);
  const knownNonHackathonHosts = [
    'google.com',
    'youtube.com',
    'wikipedia.org',
    'amazon.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'facebook.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
    'instagram.com',
    'reddit.com',
    'stackoverflow.com',
    'medium.com',
    'dev.to',
    'npmjs.com',
    'pypi.org',
    'dockerhub.com',
    'hub.docker.com',
  ];
  return knownNonHackathonHosts.some(h => hostname === h || hostname.endsWith('.' + h));
}
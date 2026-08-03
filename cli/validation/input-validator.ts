export type InputValidationState =
  | 'INVALID_INPUT'
  | 'INVALID_URL'
  | 'PAGE_UNREACHABLE'
  | 'NOT_A_HACKATHON'
  | 'UNSUPPORTED_PLATFORM'
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED';

export interface InputValidationResult {
  valid: boolean;
  state: InputValidationState;
  urlType: 'devpost' | 'mlh' | 'hackathon' | 'file' | 'text' | 'unknown';
  normalizedUrl?: string;
  error?: string;
}

const KNOWN_NON_HACKATHON_DOMAINS = [
  { hostname: 'google.com', label: 'Google' },
  { hostname: 'www.google.com', label: 'Google' },
  { hostname: 'github.com', label: 'GitHub' },
  { hostname: 'www.github.com', label: 'GitHub' },
  { hostname: 'stackoverflow.com', label: 'StackOverflow' },
  { hostname: 'www.stackoverflow.com', label: 'StackOverflow' },
  { hostname: 'reddit.com', label: 'Reddit' },
  { hostname: 'www.reddit.com', label: 'Reddit' },
  { hostname: 'youtube.com', label: 'YouTube' },
  { hostname: 'www.youtube.com', label: 'YouTube' },
  { hostname: 'facebook.com', label: 'Facebook' },
  { hostname: 'www.facebook.com', label: 'Facebook' },
  { hostname: 'twitter.com', label: 'Twitter' },
  { hostname: 'x.com', label: 'X/Twitter' },
  { hostname: 'instagram.com', label: 'Instagram' },
  { hostname: 'www.instagram.com', label: 'Instagram' },
  { hostname: 'linkedin.com', label: 'LinkedIn' },
  { hostname: 'www.linkedin.com', label: 'LinkedIn' },
  { hostname: 'amazon.com', label: 'Amazon' },
  { hostname: 'www.amazon.com', label: 'Amazon' },
  { hostname: 'netflix.com', label: 'Netflix' },
  { hostname: 'www.netflix.com', label: 'Netflix' },
];

const HACKATHON_KEYWORDS = /hackathon|devpost|mlh|challenge|competition|prize|sponsor|judg/i;
const VALID_URL_SCHEME = /^https?:\/\//i;

function isNonHackathonDomain(url: string): { blocked: boolean; label?: string } {
  for (const known of KNOWN_NON_HACKATHON_DOMAINS) {
    if (url.includes(known.hostname)) {
      return { blocked: true, label: known.label };
    }
  }
  return { blocked: false };
}

function detectUrlType(input: string): InputValidationResult['urlType'] {
  if (input.includes('devpost.com')) return 'devpost';
  if (input.includes('mlh.io')) return 'mlh';
  if (HACKATHON_KEYWORDS.test(input)) return 'hackathon';
  if (/\.(txt|md|json)$/i.test(input) || input.startsWith('./') || input.startsWith('../') || input.startsWith('/')) return 'file';
  if (VALID_URL_SCHEME.test(input)) return 'unknown';
  return 'text';
}

export function validateInput(input: string): InputValidationResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return { valid: false, state: 'INVALID_INPUT', urlType: 'unknown', error: 'No input provided' };
  }

  const urlType = detectUrlType(trimmed);

  if (urlType === 'unknown' && !VALID_URL_SCHEME.test(trimmed)) {
    if (trimmed.split(/\s+/).length <= 2 && !/[\/\\]/.test(trimmed)) {
      return { valid: false, state: 'INVALID_INPUT', urlType, error: `"${trimmed}" is not a valid URL or hackathon specification` };
    }
  }

  if (VALID_URL_SCHEME.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
    } catch {
      return { valid: false, state: 'INVALID_URL', urlType, error: `"${trimmed}" is not a valid URL` };
    }
  }

  if (urlType === 'unknown' || urlType === 'devpost' || urlType === 'mlh' || urlType === 'hackathon') {
    const domainCheck = isNonHackathonDomain(trimmed);
    if (domainCheck.blocked) {
      return {
        valid: false,
        state: 'NOT_A_HACKATHON',
        urlType,
        error: `"${domainCheck.label}" is not a supported hackathon platform. Use a Devpost, MLH, or hackathon URL.`,
      };
    }
  }

  if (urlType === 'devpost') {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return { valid: true, state: 'SUPPORTED', urlType, normalizedUrl: normalized };
  }

  if (urlType === 'mlh') return { valid: true, state: 'SUPPORTED', urlType };
  if (urlType === 'hackathon') return { valid: true, state: 'SUPPORTED', urlType };
  if (urlType === 'file') return { valid: true, state: 'SUPPORTED', urlType };
  if (urlType === 'text') {
    if (trimmed.split(/\s+/).length <= 1) {
      return { valid: false, state: 'INVALID_INPUT', urlType, error: `"${trimmed}" is not a valid URL or hackathon specification` };
    }
    return { valid: true, state: 'SUPPORTED', urlType };
  }

  // Allow any HTTPS URL — the parser/qualifier will determine whether the
  // page content is actually a hackathon. The URL itself rarely advertises
  // the page type (e.g. hack.theinnovationstory.com, hack2skill.com, etc.).
  if (VALID_URL_SCHEME.test(trimmed)) {
    return { valid: true, state: 'PARTIALLY_SUPPORTED', urlType: 'hackathon' };
  }

  return { valid: true, state: 'SUPPORTED', urlType: 'text' };
}

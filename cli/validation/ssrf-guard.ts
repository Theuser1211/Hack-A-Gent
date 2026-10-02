/**
 * Shared SSRF / network guard for hackathon URL fetching.
 *
 * Uses a denylist approach: rejects only hosts that are clearly internal or
 * known non-hackathon platforms, and blocks private/link-local/metadata IP
 * ranges. All other HTTPS hosts are allowed so generic hackathon pages
 * (e.g. hack.theinnovationstory.com, mlh.io, hack2skill.com, unstop.com,
 * devfolio.co) can be fetched and inspected.
 */

const DENYLISTED_HOSTS = new Set([
  'google.com', 'www.google.com',
  'github.com', 'www.github.com',
  'stackoverflow.com', 'www.stackoverflow.com',
  'reddit.com', 'www.reddit.com',
  'youtube.com', 'www.youtube.com', 'm.youtube.com',
  'facebook.com', 'www.facebook.com', 'fb.com', 'www.fb.com',
  'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
  'instagram.com', 'www.instagram.com',
  'linkedin.com', 'www.linkedin.com',
  'amazon.com', 'www.amazon.com',
  'netflix.com', 'www.netflix.com',
  'wikipedia.org', 'www.wikipedia.org',
  'discord.com', 'www.discord.com', 'discord.gg',
  'twitch.tv', 'www.twitch.tv',
  'spotify.com', 'www.spotify.com',
]);

const DENYLISTED_HOST_SUFFIXES = [
  '.google.com', '.github.com', '.stackoverflow.com', '.reddit.com',
  '.youtube.com', '.facebook.com', '.twitter.com', '.x.com',
  '.instagram.com', '.linkedin.com', '.amazon.com', '.netflix.com',
  '.wikipedia.org', '.discord.com', '.twitch.tv', '.spotify.com',
];

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isDenylistedHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return false;
  if (DENYLISTED_HOSTS.has(h)) return true;
  for (const suffix of DENYLISTED_HOST_SUFFIXES) {
    if (h === suffix || h.endsWith(suffix)) return true;
  }
  return false;
}

function isLikelyIpAddress(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || /^::/.test(h);
}

function isDenylistedIp(rawHostname: string): boolean {
  const h = normalizeHostname(rawHostname);
  if (h === '0.0.0.0') return true;
  if (h === '::' || h === '::1') return true;
  if (h.startsWith('127.')) return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('169.254.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)) return true;
  if (h.startsWith('::')) return true;
  return false;
}

function isLoopbackHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return h === 'localhost' || h.endsWith('.localhost') || h === 'localhost.localdomain';
}

/** True when a host may be fetched for hackathon analysis (denylist SSRF guard). */
export function isSafeHackathonHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  if (!h) return false;
  if (isLoopbackHostname(h)) return false;
  if (isLikelyIpAddress(h) && isDenylistedIp(h)) return false;
  if (isDenylistedHostname(h)) return false;
  return true;
}

/** Throws on unsafe hosts (denylist SSRF guard). Returns the parsed URL. */
export function assertSafeHackathonUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Only http(s) URLs are allowed: ${url}`);
  }
  if (!isSafeHackathonHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch unsafe host (SSRF guard): ${parsed.hostname}.`,
    );
  }
  return parsed;
}

/** True when a host is a Devpost host (strict allowlist, back-compat). */
export function isAllowedDevpostHost(hostname: string): boolean {
  const h = normalizeHostname(hostname);
  return h === 'devpost.com' || h === 'www.devpost.com' || h.endsWith('.devpost.com');
}

/** Strict Devpost-only guard, preserved for backwards compatibility. */
export function assertSafeDevpostUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Only http(s) Devpost URLs are allowed: ${url}`);
  }
  if (!isAllowedDevpostHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch non-Devpost host (SSRF guard): ${parsed.hostname}. Only devpost.com is allowed.`,
    );
  }
  return parsed;
}

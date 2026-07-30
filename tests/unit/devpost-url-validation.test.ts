import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../../cli/pipeline/parsing.js';

describe('normalizeUrl', () => {
  it('prepends https:// to bare hostname', () => {
    expect(normalizeUrl('ai-yes-competition-30441.devpost.com')).toBe('https://ai-yes-competition-30441.devpost.com');
  });

  it('prepends https:// to hostname with www', () => {
    expect(normalizeUrl('www.ai-yes-competition-30441.devpost.com')).toBe('https://www.ai-yes-competition-30441.devpost.com');
  });

  it('keeps https:// URL as-is', () => {
    expect(normalizeUrl('https://ai-yes-competition-30441.devpost.com')).toBe('https://ai-yes-competition-30441.devpost.com');
  });

  it('keeps http:// URL as-is', () => {
    expect(normalizeUrl('http://ai-yes-competition-30441.devpost.com')).toBe('http://ai-yes-competition-30441.devpost.com');
  });

  it('prepends https:// to devpost.com/software/example', () => {
    expect(normalizeUrl('devpost.com/software/example')).toBe('https://devpost.com/software/example');
  });

  it('prepends https:// to www.devpost.com/software/example', () => {
    expect(normalizeUrl('www.devpost.com/software/example')).toBe('https://www.devpost.com/software/example');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('');
  });

  it('trims and normalizes whitespace-padded input', () => {
    expect(normalizeUrl('  ai-yes-competition-30441.devpost.com  ')).toBe('https://ai-yes-competition-30441.devpost.com');
  });
});

describe('Devpost URL Validation', () => {
  function isValidDevpostHostname(hostname: string): boolean {
    return hostname === 'devpost.com' || hostname.endsWith('.devpost.com');
  }

  describe('valid Devpost hostnames', () => {
    it('accepts bare devpost.com', () => {
      expect(isValidDevpostHostname('devpost.com')).toBe(true);
    });

    it('accepts www.devpost.com', () => {
      expect(isValidDevpostHostname('www.devpost.com')).toBe(true);
    });

    it('accepts hackathon.devpost.com', () => {
      expect(isValidDevpostHostname('hackathon.devpost.com')).toBe(true);
    });

    it('accepts redditgameswithahook.devpost.com', () => {
      expect(isValidDevpostHostname('redditgameswithahook.devpost.com')).toBe(true);
    });

    it('accepts celesta-exoplanet-challenge.devpost.com', () => {
      expect(isValidDevpostHostname('celesta-exoplanet-challenge.devpost.com')).toBe(true);
    });

    it('accepts deep subdomains like a.b.c.devpost.com', () => {
      expect(isValidDevpostHostname('a.b.c.devpost.com')).toBe(true);
    });
  });

  describe('invalid hostnames', () => {
    it('rejects google.com', () => {
      expect(isValidDevpostHostname('google.com')).toBe(false);
    });

    it('rejects devpost.co', () => {
      expect(isValidDevpostHostname('devpost.co')).toBe(false);
    });

    it('rejects devpost.com.evil.com', () => {
      expect(isValidDevpostHostname('devpost.com.evil.com')).toBe(false);
    });

    it('rejects notdevpost.com', () => {
      expect(isValidDevpostHostname('notdevpost.com')).toBe(false);
    });

    it('rejects devpost.commalware', () => {
      expect(isValidDevpostHostname('devpost.commalware')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidDevpostHostname('')).toBe(false);
    });
  });

  describe('URL parsing integration', () => {
    it('parses subdomain URL correctly', () => {
      const url = new URL('https://redditgameswithahook.devpost.com/');
      expect(url.hostname).toBe('redditgameswithahook.devpost.com');
      expect(isValidDevpostHostname(url.hostname)).toBe(true);
    });

    it('parses another subdomain URL correctly', () => {
      const url = new URL('https://celesta-exoplanet-challenge.devpost.com/');
      expect(url.hostname).toBe('celesta-exoplanet-challenge.devpost.com');
      expect(isValidDevpostHostname(url.hostname)).toBe(true);
    });

    it('parses bare devpost.com correctly', () => {
      const url = new URL('https://devpost.com/software/example');
      expect(url.hostname).toBe('devpost.com');
      expect(isValidDevpostHostname(url.hostname)).toBe(true);
    });

    it('parses www.devpost.com correctly', () => {
      const url = new URL('https://www.devpost.com/software/example');
      expect(url.hostname).toBe('www.devpost.com');
      expect(isValidDevpostHostname(url.hostname)).toBe(true);
    });
  });
});

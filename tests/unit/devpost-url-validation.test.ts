import { describe, it, expect } from 'vitest';

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

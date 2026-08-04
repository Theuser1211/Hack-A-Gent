import { describe, it, expect } from 'vitest';

import {
  isSafeHackathonHost,
  assertSafeHackathonUrl,
  isAllowedDevpostHost,
  assertSafeDevpostUrl,
} from '../../cli/validation/ssrf-guard.js';

describe('isSafeHackathonHost (denylist SSRF guard)', () => {
  it('allows devpost hosts', () => {
    expect(isSafeHackathonHost('devpost.com')).toBe(true);
    expect(isSafeHackathonHost('www.devpost.com')).toBe(true);
    expect(isSafeHackathonHost('innovationchallenge.devpost.com')).toBe(true);
  });

  it('allows generic hackathon hosts', () => {
    expect(isSafeHackathonHost('hack.theinnovationstory.com')).toBe(true);
    expect(isSafeHackathonHost('mlh.io')).toBe(true);
    expect(isSafeHackathonHost('ghw.mlh.io')).toBe(true);
    expect(isSafeHackathonHost('hack2skill.com')).toBe(true);
    expect(isSafeHackathonHost('unstop.com')).toBe(true);
    expect(isSafeHackathonHost('devfolio.co')).toBe(true);
  });

  it('blocks loopback and localhost', () => {
    expect(isSafeHackathonHost('localhost')).toBe(false);
    expect(isSafeHackathonHost('127.0.0.1')).toBe(false);
    expect(isSafeHackathonHost('[::1]')).toBe(false);
    expect(isSafeHackathonHost('0.0.0.0')).toBe(false);
  });

  it('blocks private and link-local IP ranges', () => {
    expect(isSafeHackathonHost('10.0.0.1')).toBe(false);
    expect(isSafeHackathonHost('192.168.1.1')).toBe(false);
    expect(isSafeHackathonHost('169.254.169.254')).toBe(false);
    expect(isSafeHackathonHost('172.16.0.1')).toBe(false);
    expect(isSafeHackathonHost('172.31.255.255')).toBe(false);
    // 172.32 is NOT private (out of RFC1918 172.16–31 range) but treated as public
    expect(isSafeHackathonHost('172.32.0.1')).toBe(true);
  });

  it('blocks known non-hackathon platforms', () => {
    expect(isSafeHackathonHost('google.com')).toBe(false);
    expect(isSafeHackathonHost('www.google.com')).toBe(false);
    expect(isSafeHackathonHost('github.com')).toBe(false);
    expect(isSafeHackathonHost('gist.github.com')).toBe(false);
    expect(isSafeHackathonHost('stackoverflow.com')).toBe(false);
    expect(isSafeHackathonHost('reddit.com')).toBe(false);
    expect(isSafeHackathonHost('youtube.com')).toBe(false);
    expect(isSafeHackathonHost('facebook.com')).toBe(false);
    expect(isSafeHackathonHost('x.com')).toBe(false);
    expect(isSafeHackathonHost('twitter.com')).toBe(false);
    expect(isSafeHackathonHost('instagram.com')).toBe(false);
    expect(isSafeHackathonHost('linkedin.com')).toBe(false);
    expect(isSafeHackathonHost('amazon.com')).toBe(false);
    expect(isSafeHackathonHost('netflix.com')).toBe(false);
    expect(isSafeHackathonHost('wikipedia.org')).toBe(false);
    expect(isSafeHackathonHost('discord.com')).toBe(false);
    expect(isSafeHackathonHost('twitch.tv')).toBe(false);
    expect(isSafeHackathonHost('spotify.com')).toBe(false);
  });
});

describe('assertSafeHackathonUrl', () => {
  it('returns the parsed URL for a safe host', () => {
    const u = assertSafeHackathonUrl('https://hack.theinnovationstory.com/');
    expect(u.hostname).toBe('hack.theinnovationstory.com');
  });

  it('throws on http(s) protocol violations', () => {
    expect(() => assertSafeHackathonUrl('ftp://devpost.com/hack')).toThrow(/http\(s\)/);
  });

  it('throws on invalid URLs', () => {
    expect(() => assertSafeHackathonUrl('not a url')).toThrow(/Invalid URL/);
  });

  it('throws on unsafe hosts', () => {
    expect(() => assertSafeHackathonUrl('https://169.254.169.254/latest/meta-data')).toThrow(/SSRF guard/);
    expect(() => assertSafeHackathonUrl('https://github.com/foo')).toThrow(/SSRF guard/);
  });
});

describe('isAllowedDevpostHost / assertSafeDevpostUrl (strict back-compat)', () => {
  it('allows only devpost hosts', () => {
    expect(isAllowedDevpostHost('devpost.com')).toBe(true);
    expect(isAllowedDevpostHost('www.devpost.com')).toBe(true);
    expect(isAllowedDevpostHost('foo.devpost.com')).toBe(true);
    expect(isAllowedDevpostHost('hack.theinnovationstory.com')).toBe(false);
  });

  it('assertSafeDevpostUrl still rejects non-devpost hosts', () => {
    expect(assertSafeDevpostUrl('https://devpost.com/software/example')).toBeTruthy();
    expect(() => assertSafeDevpostUrl('https://hack.theinnovationstory.com/')).toThrow(/Only devpost\.com is allowed/);
  });
});
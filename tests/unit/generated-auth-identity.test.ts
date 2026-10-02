import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT = join(__dirname, '../../agents-for-humans-hackathon');

// The fixture project sits outside tsconfig include, so it is loaded at
// runtime rather than through a static import (same approach as
// tests/unit/fallback-auth-contract.test.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const db = require(join(PROJECT, 'src/lib/db.ts'));

function routeSource(name: string): string {
  return readFileSync(join(PROJECT, 'src/app/api/auth', name, 'route.ts'), 'utf8');
}

describe('generated auth resolves the caller, not a fixed demo account', () => {
  beforeEach(() => {
    db.resetDatabase();
  });

  it('issues refresh tokens that stay bound to the account they were minted for', () => {
    const alice = db.findUserByEmail('alice@example.com');
    const demo = db.findUserByEmail('demo@example.com');
    expect(alice).toBeDefined();
    expect(demo).toBeDefined();

    const aliceToken = db.issueRefreshToken(alice.id);
    const demoToken = db.issueRefreshToken(demo.id);

    // The bug this guards: both tokens resolving to the same account, which
    // would let any holder of either token read the other's user record.
    expect(db.findUserByRefreshToken(aliceToken)?.id).toBe(alice.id);
    expect(db.findUserByRefreshToken(demoToken)?.id).toBe(demo.id);
    expect(db.findUserByRefreshToken(aliceToken)?.id).not.toBe(
      db.findUserByRefreshToken(demoToken)?.id,
    );
  });

  it('a rotated refresh token still resolves after the original is revoked', () => {
    const demo = db.findUserByEmail('demo@example.com');
    const first = db.issueRefreshToken(demo.id);
    db.removeRefreshToken(first);
    const rotated = db.issueRefreshToken(demo.id);

    expect(db.validateRefreshToken(first)).toBe(false);
    expect(db.validateRefreshToken(rotated)).toBe(true);
    expect(db.findUserByRefreshToken(rotated)?.id).toBe(demo.id);
  });

  it('unknown refresh tokens are rejected rather than resolving to a default user', () => {
    expect(db.validateRefreshToken('not-a-real-token')).toBe(false);
    expect(db.findUserByRefreshToken('not-a-real-token')).toBeUndefined();
  });

  it('the me and refresh routes look the caller up by their own identity', () => {
    for (const route of ['me', 'refresh']) {
      const source = routeSource(route);
      // No route may resolve the current account from a hardcoded email.
      expect(source).not.toMatch(/findUserByEmail\(\s*['"][^'"]+@/);
      expect(source).not.toMatch(/email:\s*['"][^'"]+@/);
    }
  });

  it('the me route parses ids that themselves contain dashes', () => {
    const source = routeSource('me');
    // Tokens are `mock-jwt-token-<userId>-<issuedAt>`; user ids may contain
    // dashes, so a naive split on '-' would truncate the id.
    expect(source).toContain('mock-jwt-token-');
    expect(source).toMatch(/replace\(\s*\/-\\d\+\$\/\s*,\s*''\s*\)/);
    expect(source).not.toMatch(/split\(\s*['"]-['"]\s*\)/);
  });
});
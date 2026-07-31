import { describe, it, expect } from 'vitest';
import { generateProjectName } from '../../cli/improvement/improvement-instrumentor.js';

describe('generateProjectName', () => {
  it('generates memorable names', () => {
    const result = generateProjectName('AI Hackathon 2026', 'AI');
    expect(result.displayName).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
    expect(result.slug).toBe(result.displayName.toLowerCase());
    expect(result.folderName).toBe(result.slug);
  });

  it('generates different names for different inputs', () => {
    const result1 = generateProjectName('Hackathon A', 'Web');
    const result2 = generateProjectName('Hackathon B', 'Mobile');
    expect(result1.displayName).toBeTruthy();
    expect(result2.displayName).toBeTruthy();
  });

  it('handles undefined inputs', () => {
    const result = generateProjectName(undefined as unknown as string, undefined);
    expect(result.displayName).toBeTruthy();
    expect(result.slug).toBeTruthy();
    expect(result.folderName).toBeTruthy();
  });

  it('generates consistent names for same input', () => {
    const result1 = generateProjectName('Test Hackathon', 'AI');
    const result2 = generateProjectName('Test Hackathon', 'AI');
    expect(result1.displayName).toBe(result2.displayName);
  });

  it('generates startup-style names', () => {
    const result = generateProjectName('Healthcare AI Challenge', 'Healthcare');
    expect(result.displayName.length).toBeGreaterThan(4);
    expect(result.displayName.length).toBeLessThan(15);
  });
});

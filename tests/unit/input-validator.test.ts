import { describe, it, expect } from 'vitest';
import { validateInput } from '../../cli/validation/input-validator.js';

describe('validateInput', () => {
  it('rejects empty input', () => {
    const result = validateInput('');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('INVALID_INPUT');
  });

  it('rejects non-URL text like "hello"', () => {
    const result = validateInput('hello');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('INVALID_INPUT');
  });

  it('rejects numbers like "123"', () => {
    const result = validateInput('123');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('INVALID_INPUT');
  });

  it('rejects random text like "asdf"', () => {
    const result = validateInput('asdf');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('INVALID_INPUT');
  });

  it('rejects known non-hackathon domain google.com', () => {
    const result = validateInput('https://google.com');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('NOT_A_HACKATHON');
  });

  it('rejects known non-hackathon domain github.com', () => {
    const result = validateInput('https://github.com');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('NOT_A_HACKATHON');
  });

  it('rejects known non-hackathon domain stackoverflow.com', () => {
    const result = validateInput('https://stackoverflow.com');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('NOT_A_HACKATHON');
  });

  it('rejects known non-hackathon domain reddit.com', () => {
    const result = validateInput('https://reddit.com');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('NOT_A_HACKATHON');
  });

  it('rejects known non-hackathon domain youtube.com', () => {
    const result = validateInput('https://youtube.com');
    expect(result.valid).toBe(false);
    expect(result.state).toBe('NOT_A_HACKATHON');
  });

  it('accepts devpost.com URLs', () => {
    const result = validateInput('https://example.devpost.com');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('devpost');
  });

  it('accepts bare devpost hostname', () => {
    const result = validateInput('example.devpost.com');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('devpost');
  });

  it('accepts hackathon-related URLs', () => {
    const result = validateInput('https://example.com/hackathon-2026');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('hackathon');
  });

  it('accepts mlh.io URLs', () => {
    const result = validateInput('https://mlh.io/events/example');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('mlh');
  });

  it('accepts local file paths', () => {
    const result = validateInput('./spec.txt');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('file');
  });

  it('accepts text specifications', () => {
    const result = validateInput('Build a chatbot for healthcare');
    expect(result.valid).toBe(true);
    expect(result.state).toBe('SUPPORTED');
    expect(result.urlType).toBe('text');
  });
});

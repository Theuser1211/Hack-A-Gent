import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJSON, ParseValidationError, executeWithJSONRetry, JSON_EXTRACTION_PROMPT, buildRetryPrompt, supportsStructuredOutput } from '../../kernel/providers/json-extractor.js';

describe('extractJSON', () => {
  it('parses valid JSON directly', () => {
    expect(extractJSON('{"name":"test"}')).toEqual({ name: 'test' });
  });

  it('strips markdown code fences with json tag', () => {
    expect(extractJSON('```json\n{"name":"test"}\n```')).toEqual({ name: 'test' });
  });

  it('strips markdown fences without language tag', () => {
    expect(extractJSON('```\n{"name":"test"}\n```')).toEqual({ name: 'test' });
  });

  it('extracts JSON after leading text', () => {
    expect(extractJSON('Here is the data:\n{"name":"test"}')).toEqual({ name: 'test' });
  });

  it('extracts JSON before trailing text', () => {
    expect(extractJSON('{"name":"test"}\nThis is the result.')).toEqual({ name: 'test' });
  });

  it('extracts JSON between leading and trailing text', () => {
    expect(extractJSON('Result:\n{"name":"test"}\nEnd.')).toEqual({ name: 'test' });
  });

  it('extracts outermost JSON object with extra closing brace', () => {
    expect(extractJSON('{"name":"test"}}')).toEqual({ name: 'test' });
  });

  it('extracts JSON array', () => {
    expect(extractJSON('[{"id":1},{"id":2}]')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('extracts JSON array from markdown', () => {
    expect(extractJSON('```json\n[{"id":1}]\n```')).toEqual([{ id: 1 }]);
  });

  it('removes BOM character', () => {
    expect(extractJSON('\uFEFF{"name":"test"}')).toEqual({ name: 'test' });
  });

  it('normalizes CRLF line endings', () => {
    expect(extractJSON('{"name":"test"}\r\n')).toEqual({ name: 'test' });
  });

  it('validates against Zod schema on success', () => {
    const schema = z.object({ name: z.string(), age: z.number().optional() });
    expect(extractJSON('{"name":"test","age":25}', { schema })).toEqual({ name: 'test', age: 25 });
  });

  it('throws ParseValidationError on schema mismatch', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    expect(() => extractJSON('{"name":"test"}', { schema })).toThrow(ParseValidationError);
  });

  it('throws ParseValidationError on type mismatch', () => {
    const schema = z.object({ name: z.string() });
    expect(() => extractJSON('{"name":123}', { schema })).toThrow(ParseValidationError);
  });

  it('includes raw preview in error details', () => {
    try { extractJSON('not json at all'); } catch (err) {
      expect((err as ParseValidationError).details.rawPreview).toBe('not json at all');
    }
  });

  it('includes provider/model/stage in error details', () => {
    try { extractJSON('bad', { provider: 'nvidia', model: 'mixtral', stage: 'test' }); } catch (err) {
      const pe = err as ParseValidationError;
      expect(pe.details.provider).toBe('nvidia');
      expect(pe.details.model).toBe('mixtral');
      expect(pe.details.stage).toBe('test');
    }
  });

  it('throws on empty input', () => {
    expect(() => extractJSON('')).toThrow(ParseValidationError);
  });

  it('throws on whitespace-only input', () => {
    expect(() => extractJSON('   \n  ')).toThrow(ParseValidationError);
  });

  it('throws on completely invalid input', () => {
    expect(() => extractJSON('<html>not json</html>')).toThrow(ParseValidationError);
  });
});

describe('executeWithJSONRetry', () => {
  it('returns result on first success', async () => {
    const result = await executeWithJSONRetry<{ name: string }>(
      async () => '{"name":"ok"}',
      { stage: 'test', maxRetries: 1 },
    );
    expect(result).toEqual({ name: 'ok' });
  });

  it('retries on parse failure and succeeds', async () => {
    let calls = 0;
    const result = await executeWithJSONRetry<{ name: string }>(
      async (attempt) => {
        calls++;
        if (attempt === 1) return 'not json';
        return '{"name":"ok"}';
      },
      { stage: 'test', maxRetries: 2 },
    );
    expect(result).toEqual({ name: 'ok' });
    expect(calls).toBe(2);
  });

  it('returns fallback after exhausting retries', async () => {
    const result = await executeWithJSONRetry<{ name: string }>(
      async () => 'not json',
      {
        stage: 'test',
        maxRetries: 1,
        fallback: { name: 'fallback' },
      },
    );
    expect(result).toEqual({ name: 'fallback' });
  });

  it('returns fallback function result after exhausting retries', async () => {
    const result = await executeWithJSONRetry<{ name: string }>(
      async () => 'not json',
      {
        stage: 'test',
        maxRetries: 1,
        fallback: () => ({ name: 'fallback-fn' }),
      },
    );
    expect(result).toEqual({ name: 'fallback-fn' });
  });

  it('throws after exhausting retries without fallback', async () => {
    await expect(executeWithJSONRetry(
      async () => 'not json',
      { stage: 'test', maxRetries: 1 },
    )).rejects.toThrow(ParseValidationError);
  });

  it('does not retry non-parse errors', async () => {
    let calls = 0;
    await expect(executeWithJSONRetry(
      async () => {
        calls++;
        throw new Error('network error');
      },
      { stage: 'test', maxRetries: 2 },
    )).rejects.toThrow('network error');
    expect(calls).toBe(1);
  });

  it('passes lastError to executor on retry', async () => {
    let receivedError: string | null = '';
    await executeWithJSONRetry<{ name: string }>(
      async (attempt, lastErr) => {
        receivedError = lastErr;
        if (attempt === 1) return 'bad';
        return '{"name":"ok"}';
      },
      { stage: 'test', maxRetries: 2 },
    );
    expect(receivedError).toBeTruthy();
  });
});

describe('JSON_EXTRACTION_PROMPT', () => {
  it('is a non-empty string with JSON instructions', () => {
    expect(JSON_EXTRACTION_PROMPT.length).toBeGreaterThan(50);
    expect(JSON_EXTRACTION_PROMPT).toContain('valid JSON');
    expect(JSON_EXTRACTION_PROMPT).toContain('Do not include markdown');
    expect(JSON_EXTRACTION_PROMPT).toContain('Do not wrap JSON');
  });
});

describe('buildRetryPrompt', () => {
  it('appends error feedback to original content', () => {
    const result = buildRetryPrompt('original prompt', 'Unexpected token');
    expect(result).toContain('original prompt');
    expect(result).toContain('Unexpected token');
    expect(result).toContain('could not be parsed');
  });
});

describe('supportsStructuredOutput', () => {
  it('returns true for openai', () => {
    expect(supportsStructuredOutput('openai')).toBe(true);
  });

  it('returns true for gemini', () => {
    expect(supportsStructuredOutput('gemini')).toBe(true);
  });

  it('returns true for anthropic', () => {
    expect(supportsStructuredOutput('anthropic')).toBe(true);
  });

  it('returns true for openrouter', () => {
    expect(supportsStructuredOutput('openrouter')).toBe(true);
  });

  it('returns true for custom', () => {
    expect(supportsStructuredOutput('custom')).toBe(true);
  });

  it('returns true for nvidia', () => {
    expect(supportsStructuredOutput('nvidia')).toBe(true);
  });

  it('returns false for mistral', () => {
    expect(supportsStructuredOutput('mistral')).toBe(false);
  });

  it('returns false for local', () => {
    expect(supportsStructuredOutput('local')).toBe(false);
  });

  it('returns false for unknown provider', () => {
    expect(supportsStructuredOutput('unknown')).toBe(false);
  });
});

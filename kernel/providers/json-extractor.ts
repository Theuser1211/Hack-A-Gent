import { z } from 'zod';
import type { ProviderId } from '../llm/llm-types.js';

export interface ParseErrorDetails {
  provider: string;
  model: string;
  stage: string;
  parseFailureReason?: string;
  schemaFailureReason?: string;
  retryCount: number;
  rawPreview: string;
}

export class ParseValidationError extends Error {
  public readonly details: ParseErrorDetails;

  constructor(details: ParseErrorDetails) {
    const msg = `[${details.stage}] ${details.parseFailureReason ?? details.schemaFailureReason ?? 'Parse failed'} (provider: ${details.provider}, model: ${details.model}, retry: ${details.retryCount})`;
    super(msg);
    this.name = 'ParseValidationError';
    this.details = details;
  }
}

export interface ExtractJSONOptions<T = unknown> {
  schema?: z.ZodType<T>;
  provider?: string;
  model?: string;
  stage?: string;
}

const CODE_FENCE_REGEX = /```(?:json)?\s*([\s\S]*?)```/;

function normalize(raw: string): string {
  return raw
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function tryParse(content: string): unknown {
  return JSON.parse(content);
}

function findBalancedSubstring(content: string, startChar: string, endChar: string): string | null {
  const start = content.indexOf(startChar);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (ch === startChar) depth++;
    else if (ch === endChar) {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

function validateSchema<T>(parsed: unknown, options?: ExtractJSONOptions<T>): T {
  if (!options?.schema) return parsed as T;
  const result = options.schema.safeParse(parsed);
  if (result.success) return result.data;
  throw new ParseValidationError({
    provider: options.provider ?? 'unknown',
    model: options.model ?? 'unknown',
    stage: options.stage ?? 'unknown',
    parseFailureReason: 'JSON parsed but schema validation failed',
    schemaFailureReason: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
    retryCount: 0,
    rawPreview: JSON.stringify(parsed).slice(0, 500),
  });
}

function makeDetails(raw: string, reason: string, opts?: { provider?: string; model?: string; stage?: string; retryCount?: number }): ParseValidationError {
  return new ParseValidationError({
    provider: opts?.provider ?? 'unknown',
    model: opts?.model ?? 'unknown',
    stage: opts?.stage ?? 'unknown',
    parseFailureReason: reason,
    retryCount: opts?.retryCount ?? 0,
    rawPreview: raw.slice(0, 500),
  });
}

export function extractJSON<T = unknown>(raw: string, options?: ExtractJSONOptions<T>): T {
  const content = normalize(raw);
  if (!content) throw makeDetails(raw, 'Empty response', options);

  try { return validateSchema(tryParse(content), options); } catch { /* fall through */ }

  const fenceMatch = content.match(CODE_FENCE_REGEX);
  if (fenceMatch) {
    try { return validateSchema(tryParse(fenceMatch[1]!.trim()), options); } catch { /* fall through */ }
  }

  const balancedObj = findBalancedSubstring(content, '{', '}');
  if (balancedObj) {
    try { return validateSchema(tryParse(balancedObj), options); } catch { /* fall through */ }
  }

  const balancedArr = findBalancedSubstring(content, '[', ']');
  if (balancedArr) {
    try { return validateSchema(tryParse(balancedArr), options); } catch { /* fall through */ }
  }

  throw makeDetails(raw, 'No valid JSON found in response', options);
}

export const JSON_EXTRACTION_PROMPT =
  'You MUST respond with valid JSON only.\n' +
  'Do not include markdown.\n' +
  'Do not include explanations.\n' +
  'Do not wrap JSON in code fences.\n' +
  'Output exactly one JSON object matching the requested schema.';

export interface JSONRetryOptions<T> {
  schema?: z.ZodType<T>;
  provider?: string;
  model?: string;
  stage?: string;
  maxRetries?: number;
  fallback?: T | (() => T);
}

export async function executeWithJSONRetry<T>(
  executor: (attempt: number, lastError: string | null) => Promise<string>,
  options?: JSONRetryOptions<T>,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 1 + maxRetries; attempt++) {
    try {
      const raw = await executor(attempt, lastError);
      return extractJSON<T>(raw, {
        schema: options?.schema,
        provider: options?.provider,
        model: options?.model,
        stage: options?.stage,
      });
    } catch (err) {
      if (err instanceof ParseValidationError) {
        lastError = err.details.schemaFailureReason ?? err.details.parseFailureReason ?? 'Unknown parse error';
        if (attempt >= 1 + maxRetries) {
          if (options?.fallback !== undefined) {
            return typeof options.fallback === 'function'
              ? (options.fallback as () => T)()
              : options.fallback;
          }
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  throw new ParseValidationError({
    provider: options?.provider ?? 'unknown',
    model: options?.model ?? 'unknown',
    stage: options?.stage ?? 'unknown',
    parseFailureReason: 'executeWithJSONRetry: unexpected exit',
    retryCount: maxRetries,
    rawPreview: '',
  });
}

export function buildRetryPrompt(originalContent: string, lastError: string): string {
  return `${originalContent}\n\nYour previous response could not be parsed.\nError: ${lastError}\nReturn ONLY valid JSON matching the requested schema.`;
}

const STRUCTURED_OUTPUT_PROVIDERS: Set<ProviderId> = new Set(['openai', 'gemini', 'openrouter', 'anthropic', 'custom']);

export function supportsStructuredOutput(provider: ProviderId | string): boolean {
  return STRUCTURED_OUTPUT_PROVIDERS.has(provider as ProviderId);
}

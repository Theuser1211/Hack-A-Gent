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

/**
 * Fix common JSON issues from models that don't produce strict JSON.
 * Handles unquoted property names, trailing commas, etc.
 */
export function fixCommonJsonIssues(content: string): string {
  // Fix unquoted property names: { key: "value" } -> { "key": "value" }
  // Match property names at start of object or after comma
  let fixed = content.replace(
    /([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g,
    '$1"$2"$3'
  );
  // Fix trailing commas before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  // Fix single-quoted strings to double-quoted (but be careful not to break content)
  // Only fix obvious cases: ': 'value'' -> ': "value"'
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');
  return fixed;
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
  
  // FORENSIC: Log schema validation failure
  if (process.env.HAG_DEBUG_FORENSIC === '1') {
    console.error(`\n=== FORENSIC: Schema Validation FAILED ===`);
    console.error('Schema issues:', JSON.stringify(result.error.issues, null, 2));
    console.error('Parsed object keys:', Object.keys(parsed as object));
  }
  
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

  // FORENSIC: Log JSON extractor input
  if (process.env.HAG_DEBUG_FORENSIC === '1') {
    console.error(`\n=== FORENSIC: JSON Extractor Input (${content.length} chars) ===`);
    console.error(content.slice(0, 5000));
    console.error(`=== END JSON EXTRACTOR INPUT ===\n`);
  }

  // Try parsing with common fixes for models that produce near-JSON
  const tryParseFixed = (c: string) => validateSchema(tryParse(fixCommonJsonIssues(c)), options);

  try { return validateSchema(tryParse(content), options); } catch (e) { 
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Stage 1 (direct parse) FAILED ===`);
      console.error(e instanceof Error ? e.message : String(e));
    }
  }
  try { return tryParseFixed(content); } catch (e) { 
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Stage 2 (fixCommonJsonIssues) FAILED ===`);
      console.error(e instanceof Error ? e.message : String(e));
    }
  }

  const fenceMatch = content.match(CODE_FENCE_REGEX);
  if (fenceMatch) {
    const fenceContent = fenceMatch[1]!.trim();
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Stage 3 (markdown fence) FOUND ===`);
      console.error(fenceContent.slice(0, 500));
    }
    try { return validateSchema(tryParse(fenceContent), options); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 3a (fence direct parse) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    try { return tryParseFixed(fenceContent); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 3b (fence + fix) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const balancedObj = findBalancedSubstring(content, '{', '}');
  if (balancedObj) {
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Stage 4 (balanced object) FOUND ===`);
      console.error(balancedObj.slice(0, 500));
    }
    try { return validateSchema(tryParse(balancedObj), options); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 4a (balanced direct parse) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    try { return tryParseFixed(balancedObj); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 4b (balanced + fix) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  const balancedArr = findBalancedSubstring(content, '[', ']');
  if (balancedArr) {
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Stage 5 (balanced array) FOUND ===`);
      console.error(balancedArr.slice(0, 500));
    }
    try { return validateSchema(tryParse(balancedArr), options); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 5a (balanced array direct parse) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
    try { return tryParseFixed(balancedArr); } catch (e) { 
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Stage 5b (balanced array + fix) FAILED ===`);
        console.error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  if (process.env.HAG_DEBUG_FORENSIC === '1') {
    console.error(`\n=== FORENSIC: ALL STAGES FAILED ===`);
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

const STRUCTURED_OUTPUT_PROVIDERS: Set<ProviderId> = new Set(['openai', 'gemini', 'openrouter', 'anthropic', 'custom', 'nvidia']);

export function supportsStructuredOutput(provider: ProviderId | string): boolean {
  return STRUCTURED_OUTPUT_PROVIDERS.has(provider as ProviderId);
}

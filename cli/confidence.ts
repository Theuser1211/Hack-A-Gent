/**
 * Confidence levels for extracted data.
 *
 * - confirmed: Actually found in the source (e.g., parsed from HTML meta tags)
 * - inferred: Reasonable guess based on context (e.g., keyword match)
 * - unknown: No data found, default fallback
 */
export type ConfidenceLevel = 'confirmed' | 'inferred' | 'unknown';

/**
 * A value extracted from a source with its confidence level.
 * Never fabricates data — if nothing is found, confidence is 'unknown'.
 */
export interface ExtractedField<T> {
  value: T;
  confidence: ConfidenceLevel;
  source?: string;
}

/** Tag a value as confirmed (actually found in source) */
export function confirmed<T>(value: T, source?: string): ExtractedField<T> {
  return { value, confidence: 'confirmed', source };
}

/** Tag a value as inferred (best guess from context) */
export function inferred<T>(value: T, source?: string): ExtractedField<T> {
  return { value, confidence: 'inferred', source };
}

/** Tag a value as unknown (not found, default fallback) */
export function unknownField<T>(value: T): ExtractedField<T> {
  return { value, confidence: 'unknown' };
}

/** Check if a field has usable data (confirmed or inferred) */
export function isKnown<T>(field: ExtractedField<T> | undefined | null): boolean {
  return field !== null && field !== undefined && field.confidence !== 'unknown';
}

/** Get the value if known, otherwise fallback */
export function valueOr<T>(field: ExtractedField<T> | undefined | null, fallback: T): T {
  if (field && field.confidence !== 'unknown') return field.value;
  return fallback;
}

/** Format a confidence tag for display */
export function formatConfidence(level: ConfidenceLevel): string {
  switch (level) {
    case 'confirmed': return 'confirmed';
    case 'inferred': return 'inferred';
    case 'unknown': return 'unknown';
  }
}

/** Character vocabulary + feature extraction. Fully offline, deterministic. */

export function buildVocab(texts: string[]): string[] {
  const set = new Set<string>();
  for (const t of texts) {
    for (const ch of t.toLowerCase()) set.add(ch);
  }
  return [...set].sort();
}

/** Normalized bag-of-characters over the vocabulary. */
export function features(text: string, vocab: string[]): Float32Array {
  const out = new Float32Array(vocab.length);
  const lower = text.toLowerCase();
  for (const ch of lower) {
    const idx = vocab.indexOf(ch);
    if (idx >= 0) out[idx]! += 1;
  }
  const sum = out.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < out.length; i++) out[i] = out[i]! / sum;
  return out;
}

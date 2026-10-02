import type { SampleCall, WaveformFrame } from './types.js';
import { hashCode, mulberry32 } from './random.js';

/**
 * Generate a deterministic audio-level envelope for a call.
 *
 * The waveform is not random noise: during turns where words are spoken the
 * level sits in a speech-like band with syllable modulation; between turns it
 * drops to near silence. Because the source of randomness is the call id, the
 * same call always renders the same waveform.
 */
export function generateWaveform(call: SampleCall, frameMs = 50): WaveformFrame[] {
  const frames = Math.max(1, Math.ceil(call.durationMs / frameMs));
  const rnd = mulberry32(hashCode(call.id) ^ 0x5eed);

  const active: Array<{ start: number; end: number }> = [];
  for (const t of call.turns) {
    for (const w of t.words) active.push({ start: w.atMs, end: w.atMs + w.durationMs });
  }

  const out: WaveformFrame[] = [];
  for (let i = 0; i < frames; i++) {
    const atMs = i * frameMs;
    const inSpeech = active.some((s) => atMs >= s.start && atMs < s.end);
    let level = 0;
    if (inSpeech) {
      level = 0.42 + rnd() * 0.5;
      level *= 0.82 + 0.18 * Math.sin(atMs / 90);
    }
    out.push({ atMs, level: Math.min(1, Math.max(0, level)) });
  }
  return out;
}

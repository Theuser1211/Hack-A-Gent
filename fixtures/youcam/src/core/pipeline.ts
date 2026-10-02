import { EFFECTS, applyEffect, stats, deltaBetween, getEffect } from './kernel.js';
import { generateSampleImage } from './sample-image.js';

/**
 * The processing pipeline behind the API boundary. Given an effect, an
 * intensity and a sample image, it genuinely runs the kernel and reports the
 * measured before/after statistics. `processedLocally` stays true in this build
 * — this is exactly the seam where the real YouCam API would take over.
 */
export interface ProcessResult {
  jobId: string;
  status: 'completed';
  effect: string;
  intensity: number;
  source: { width: number; height: number; pixels: number };
  steps: string[];
  statistics: {
    before: { meanR: number; meanG: number; meanB: number; stdLum: number };
    after: { meanR: number; meanG: number; meanB: number; stdLum: number };
    delta: number;
  };
  processedLocally: boolean;
  boundary: string;
}

let jobCounter = 0;

export function runPipeline(effect: string, intensity: number, width = 96, height = 96): ProcessResult {
  const def = getEffect(effect);
  if (!def) throw new Error(`unknown effect: ${effect}`);

  const sample = generateSampleImage(width, height);
  const before = stats(sample);
  const after = stats(applyEffect(sample, effect, intensity));

  const steps = [
    `validate effect "${effect}" (intensity ${intensity.toFixed(2)}, range ${def.minIntensity}–${def.maxIntensity})`,
    `decode source image ${width}×${height}`,
    `allocate output buffer (${width * height * 4} bytes)`,
    `apply kernel "${effect}" over ${width * height} pixels`,
    `compute before/after statistics`,
  ];

  return {
    jobId: `ff-${String(++jobCounter).padStart(4, '0')}-${Date.now().toString(36)}`,
    status: 'completed',
    effect,
    intensity,
    source: { width, height, pixels: width * height },
    steps,
    statistics: {
      before: { meanR: before.meanR, meanG: before.meanG, meanB: before.meanB, stdLum: before.stdLum },
      after: { meanR: after.meanR, meanG: after.meanG, meanB: after.meanB, stdLum: after.stdLum },
      delta: deltaBetween(before, after),
    },
    processedLocally: true,
    boundary: 'YouCamApiProvider — swap for the real endpoint',
  };
}

export function effectCatalog(): Array<{ id: string; name: string; description: string; category: string; defaultIntensity: number; maxIntensity: number; step: number }> {
  return EFFECTS.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    category: e.category,
    defaultIntensity: e.defaultIntensity,
    maxIntensity: e.maxIntensity,
    step: e.step,
  }));
}

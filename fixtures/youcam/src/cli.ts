import { EFFECTS, applyEffect, stats, deltaBetween } from './core/kernel.js';
import { generateSampleImage } from './core/sample-image.js';
import { writeBmp } from './core/bmp.js';
import { runPipeline } from './core/pipeline.js';

const WIDTH = 96;
const HEIGHT = 96;

export function runCli(): void {
  const sample = generateSampleImage(WIDTH, HEIGHT);
  const outDir = 'output';

  console.log();
  console.log('  FrameForge — local image processing pipeline');
  console.log('  Deterministic kernel over a generated sample image.');
  console.log(`  Writing before/after bitmaps to ./${outDir}/`);
  console.log();

  writeBmp(`${outDir}/00-original.bmp`, sample);
  const before = stats(sample);

  for (const def of EFFECTS) {
    const processed = applyEffect(sample, def.id, def.defaultIntensity);
    writeBmp(`${outDir}/${def.id}.bmp`, processed);
    const after = stats(processed);
    const delta = deltaBetween(before, after);
    console.log(
      `  ${def.name.padEnd(14)} intensity ${String(def.defaultIntensity).padEnd(5)} meanΔ ${delta.toFixed(2).padStart(6)}  → ${outDir}/${def.id}.bmp`,
    );
  }

  console.log();
  console.log('  Sample API job (as the inspector would show it):');
  const result = runPipeline('contrast', 1.3, WIDTH, HEIGHT);
  console.log(`    request : POST /api/process  { effect: "contrast", intensity: 1.3, width: 96, height: 96 }`);
  console.log(`    jobId   : ${result.jobId}`);
  console.log(`    status  : ${result.status} · processed locally: ${result.processedLocally}`);
  console.log(`    delta   : ${result.statistics.delta.toFixed(2)} (mean RGB shift over ${result.source.pixels} px)`);
  console.log();
  console.log('  Boundary: YouCamApiProvider — swap in the real endpoint for cloud effects.');
  console.log();
}

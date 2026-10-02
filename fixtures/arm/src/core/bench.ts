import { performance } from 'node:perf_hooks';

export interface BenchResult {
  label: string;
  iterations: number;
  iterationsPerSecond: number;
  totalMs: number;
  peakRssMb: number;
}

export interface MeasuredRun {
  name: string;
  baselineLabel: string;
  optimizedLabel: string;
  verified: boolean;
  baseline: BenchResult;
  optimized: BenchResult;
  speedupX: number;
  rssDeltaMb: number;
}

/**
 * Time a kernel over a fixed window and report measured throughput and peak
 * RSS. `fn` is invoked repeatedly until the window elapses; ops/sec is derived
 * from the real count. Every number here is measured on the machine that ran it.
 */
export function benchKernel(label: string, fn: () => void, windowMs = 400): BenchResult {
  for (let i = 0; i < 5; i++) fn(); // warmup (JIT)

  let iterations = 0;
  const start = performance.now();
  while (performance.now() - start < windowMs) {
    fn();
    iterations++;
  }
  const totalMs = performance.now() - start;
  const peakRssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;

  return {
    label,
    iterations,
    totalMs: Math.round(totalMs * 10) / 10,
    iterationsPerSecond: Math.round(iterations / (totalMs / 1000)),
    peakRssMb,
  };
}

/** Run both kernels of a pair and compute the measured speedup. */
export function measurePair(
  name: string,
  baselineLabel: string,
  optimizedLabel: string,
  baseline: () => void,
  optimized: () => void,
  verified: boolean,
  windowMs: number,
): MeasuredRun {
  const b = benchKernel(baselineLabel, baseline, windowMs);
  const o = benchKernel(optimizedLabel, optimized, windowMs);
  const speedupX = b.iterationsPerSecond > 0 ? o.iterationsPerSecond / b.iterationsPerSecond : 0;
  return {
    name,
    baselineLabel,
    optimizedLabel,
    verified,
    baseline: b,
    optimized: o,
    speedupX: Math.round(speedupX * 100) / 100,
    rssDeltaMb: Math.round((o.peakRssMb - b.peakRssMb) * 10) / 10,
  };
}

export function printKernelTable(runs: MeasuredRun[]): void {
  const w = (s: string, n: number) => s.padEnd(n);
  console.log(w('kernel', 28) + w('it/s', 10) + w('ms', 8) + w('RSS MB', 8) + 'speedup');
  for (const r of runs) {
    const mark = r.verified ? '' : ' (≠!)';
    console.log(
      w(r.baselineLabel, 28) + w(String(r.baseline.iterationsPerSecond), 10) + w(String(r.baseline.totalMs), 8) + w(String(r.baseline.peakRssMb), 8) + '1.00x' + mark,
    );
    console.log(
      w(r.optimizedLabel, 28) + w(String(r.optimized.iterationsPerSecond), 10) + w(String(r.optimized.totalMs), 8) + w(String(r.optimized.peakRssMb), 8) + `${r.speedupX.toFixed(2)}x`,
    );
  }
}

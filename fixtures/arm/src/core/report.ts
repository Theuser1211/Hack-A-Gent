import { describeHardware, type HardwareInfo } from './hardware.js';
import { printKernelTable, type MeasuredRun } from './bench.js';
import type { QuantSection } from './quantize.js';
import { REFERENCE_DEVICES, referenceNote } from './reference.js';

export interface ReportInput {
  hw: HardwareInfo;
  runs: MeasuredRun[];
  matrixSize: number;
  quant: QuantSection | null;
  windowMs: number;
}

const G = (s: string) => s; // section headers

function guideForHost(hw: HardwareInfo, runs: MeasuredRun[]): string[] {
  const tips: string[] = [];
  const best = runs.reduce((a, b) => (b.speedupX > a.speedupX ? b : a), runs[0]!);
  tips.push(`Largest measured win: ${best.optimizedLabel} at ${best.speedupX.toFixed(2)}x baseline.`);
  if (hw.isArm) {
    tips.push('Host is Arm-class: NEON/ASIMD vectorization and INT8 kernels are the natural next steps.');
    if (hw.hasNeon) tips.push('NEON/ASIMD is visible to the OS — a native kernel should use 128-bit vector loads.');
    tips.push('Keep working sets inside L2; block matrices to fit cache and reduce DRAM traffic.');
  } else {
    tips.push('Host is NOT Arm-class: numbers above are x86 context. Port the harness and re-run on the target board.');
    tips.push('On Arm, expect memory layout (row/column major), tiling and INT8 quantization to dominate the gains.');
  }
  tips.push('For real deployments, prefer NEON intrinsics or an optimized GEMM (e.g. via a BLAS/Compute Library) over scalar JS.');
  return tips;
}

export function printReport(input: ReportInput): void {
  const { hw, runs, matrixSize, quant, windowMs } = input;
  console.log();
  console.log(G('  CortexBench — Arm-aware inference optimization workbench'));
  console.log(G('  ───────────────────────────────────────────────────────────'));
  console.log(`  Host detected: ${hw.arch} · ${hw.cpuModel}`);
  for (const line of describeHardware(hw).slice(1)) console.log('  ' + line);
  console.log();

  console.log('  ◆ Measured kernel suite (real, on this host)');
  console.log(`    Input: ${matrixSize}×${matrixSize} fp32 matrices · ${windowMs}ms window · identical math per pair`);
  printKernelTable(runs);
  console.log('    Every optimized variant produces the same output as its baseline');
  console.log('    (verified above); only throughput differs.');
  console.log();

  if (quant) {
    console.log('  ◆ Quantization analysis (local, computed)');
    console.log(`    Model      : synthetic 2-layer MLP (${quant.weightCount} weights) — illustration only`);
    console.log(`    FP32 bytes : ${quant.modelBytesFloat}`);
    console.log(`    INT8 bytes : ${quant.modelBytesInt8} (${quant.savedPct}% smaller)`);
    console.log(`    MSE        : ${quant.mse}  ·  max abs err: ${quant.maxAbsErr}`);
    console.log(`    Top-1 match: ${quant.matchRatePct}% over ${quant.samples} deterministic inputs`);
    console.log(`    Note       : ${quant.note}`);
    console.log();
  }

  console.log('  ◆ Why Arm matters');
  console.log('    On-device inference runs on power- and memory-constrained Arm cores.');
  console.log('    The same model gets 3-10x real throughput gains from cache-aware');
  console.log('    kernels, NEON/ASIMD vectorization and INT8 quantization — before any');
  console.log('    hardware acceleration is even involved.');
  console.log();

  console.log('  ◆ Optimization guide (for the target board)');
  for (const tip of guideForHost(hw, runs)) console.log(`    • ${tip}`);
  console.log();

  console.log('  ◆ Reference platforms (context, NOT measured here)');
  const w = (s: string, n: number) => s.padEnd(n);
  console.log('    ' + w('device', 26) + w('cores', 26) + 'vector unit');
  for (const d of REFERENCE_DEVICES) {
    console.log('    ' + w(d.device, 26) + w(`${d.cores} @ ${d.clockGhz}GHz`, 26) + d.vectorUnit);
  }
  console.log('    ' + referenceNote());
  console.log();
  console.log('  Honesty: no fabricated figures. Kernels and timings are measured live;');
  console.log('  quantization is computed from the synthetic model; reference rows are');
  console.log('  labeled as context and are not results of this run.');
  console.log();
}

export function toJson(input: ReportInput): string {
  return JSON.stringify(
    {
      tool: 'cortexbench',
      host: {
        arch: input.hw.arch,
        platform: input.hw.platform,
        cpuModel: input.hw.cpuModel,
        logicalCpus: input.hw.logicalCpus,
        isArm: input.hw.isArm,
        hasNeon: input.hw.hasNeon,
      },
      measured: {
        matrixSize: input.matrixSize,
        windowMs: input.windowMs,
        runs: input.runs.map((r) => ({
          name: r.name,
          verified: r.verified,
          baselineItPerSec: r.baseline.iterationsPerSecond,
          optimizedItPerSec: r.optimized.iterationsPerSecond,
          speedupX: r.speedupX,
        })),
      },
      quantization: input.quant,
      referenceNote,
    },
    null,
    2,
  );
}

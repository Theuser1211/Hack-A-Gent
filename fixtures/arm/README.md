# CortexBench — Arm-aware inference optimization workbench

**CortexBench** is a deterministic, honest measurement tool for understanding how
inference performance changes as you optimize a workload for Arm-class hardware.
It does not present a generic AI landing page — it runs real kernels on the host,
measures them, analyzes INT8 quantization with real math, and produces a tuning
guide that explains why each technique matters on Arm.

## What the application demonstrates

1. **A real AI use case** — the kernels are the building blocks of an on-device
   inference pipeline (dense matmul, activation, softmax, vector distance).
2. **Measurable performance** — every kernel pair runs a windowed benchmark and
   reports measured it/s, ms, peak RSS and a speedup derived from those numbers.
3. **Correctness-preserving optimization** — each optimized variant produces the
   *same output* as its baseline (verified at runtime); only throughput differs.
4. **Quantization analysis** — weights of a tiny synthetic MLP are quantized
   FP32 → INT8 with real scale math; the report shows byte savings, MSE, max
   absolute error and top-1 match rate — all computed, never asserted.
5. **ARM context** — host detection (arch, NEON/ASIMD), a clearly-labeled
   reference table of real Arm platforms, and an optimization guide that adapts
   to whether you ran on an Arm host or not.

## Run

```sh
npm install
npm run build
npm start
```

Options:

| Flag | Effect |
| --- | --- |
| `--json` | print a structured JSON report instead of the human report |
| `--size <n>` | matrix dimension for the matmul kernels (32–1024) |
| `--quick` | shorter measurement window (~200 ms per kernel) |
| `--no-quant` | skip the quantization section |

Example:

```sh
npm start -- --size 384 --json > report.json
```

## The optimization story

The measured report is organized around the question: *"where does the time go,
and what actually moves the needle?"*

- **Memory layout & tiling** — `matmul naive` vs `matmul tiled ×8` keeps the
  accumulation order identical while blocking the output loops, improving cache
  locality. This is usually the largest real win on a small Arm cache.
- **Loop structure** — the relu/softmax/dot pairs isolate function-call and
  bounds-check overhead. Their speedups can be near 1.0x — which is an honest,
  useful result, not a cherry-picked one.
- **Quantization** — INT8 weights cut the model footprint ~70% in the
  simulation, with the reported error metrics showing the accuracy cost.
  On Arm, INT8 kernels also enable wider SIMD per instruction.

## Honesty rules

- **Every measured number is measured on the host that ran it.** No number is
  fabricated, imported, or inherited from another machine.
- **The quantization analysis is labeled a simulation** of a synthetic model —
  the bytes/MSE/match figures are computed locally, not claims about any real
  deployed model.
- **Reference platforms are labeled as context, not results.** They are named so
  the guide is concrete, and the report explicitly says they were not measured
  here.
- **Arm vs non-Arm is reported as-is.** Running on x86 is not hidden; the guide
  tells you to re-run on the target board for numbers that matter.

## Why Arm matters

On-device inference runs on power- and memory-constrained Arm cores. A model's
real throughput on such a device depends far more on cache-aware kernels,
NEON/ASIMD vectorization and INT8 quantization than on the model's FLOP count.
This workbench makes those levers visible and measurable before you touch any
accelerator.

## Layout

```
src/
  core/
    hardware.ts   host detection (arch, CPUs, NEON/ASIMD)
    kernels.ts    4 baseline-vs-optimized kernel pairs (identical math)
    bench.ts      windowed measurement harness + table printer
    model.ts      tiny synthetic MLP used by the quantization analysis
    quantize.ts   FP32→INT8 quantization (real local math)
    reference.ts  clearly-labeled reference Arm platforms
    report.ts     text + JSON report assembly and tuning guide
  index.ts        CLI entry (args: --json, --size, --quick, --no-quant)
```

## Technical decisions

- **No runtime dependencies** — `typescript` and `@types/node` only.
- **Deterministic inputs** — every array is seeded, so two runs on the same
  machine are directly comparable.
- **Correctness gate** — the harness verifies each optimized kernel equals its
  baseline before reporting a speedup, preventing "faster but wrong" results.
- **Single window measurement** — kernels run for a fixed time window and the
  real iteration count is divided by elapsed time, which is robust to scheduling
  noise.

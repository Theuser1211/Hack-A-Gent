/**
 * Kernel pairs used by the benchmark. Each pair computes the *same* output with
 * a naive implementation and an optimized one, so the only thing the harness
 * measures is throughput — never correctness differences.
 *
 * Every optimized variant preserves the exact accumulation order of its
 * baseline, which is why `verify()` can demand near-exact equality.
 */

export interface KernelPair {
  name: string;
  baselineLabel: string;
  optimizedLabel: string;
  baseline: () => void;
  optimized: () => void;
  verify: () => boolean;
  describe: () => string;
}

function makeMatrix(n: number, seed: number): Float32Array {
  const out = new Float32Array(n * n);
  let state = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = (state % 101) / 101;
  }
  return out;
}

function near(a: Float32Array, b: Float32Array, tol = 1e-3): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) > tol) return false;
  }
  return true;
}

// ── Matrix multiply: naive (i,j,k) vs tiled (i/j blocks, k order preserved) ──

export function matmulKernels(n: number): KernelPair {
  const A = makeMatrix(n, 7);
  const B = makeMatrix(n, 13);
  const Cb = new Float32Array(n * n);
  const Co = new Float32Array(n * n);

  const baseline = () => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc += A[i * n + k]! * B[k * n + j]!;
        Cb[i * n + j] = acc;
      }
    }
  };

  const T = 8;
  const optimized = () => {
    for (let i0 = 0; i0 < n; i0 += T) {
      for (let j0 = 0; j0 < n; j0 += T) {
        for (let i = i0; i < Math.min(i0 + T, n); i++) {
          for (let j = j0; j < Math.min(j0 + T, n); j++) {
            let acc = 0;
            for (let k = 0; k < n; k++) acc += A[i * n + k]! * B[k * n + j]!;
            Co[i * n + j] = acc;
          }
        }
      }
    }
  };

  return {
    name: 'matmul',
    baselineLabel: 'matmul naive',
    optimizedLabel: 'matmul tiled ×8',
    baseline,
    optimized,
    verify: () => near(Cb, Co, 1e-3),
    describe: () => `dense ${n}×${n} fp32 · tiling keeps k-order identical`,
  };
}

// ── ReLU: scalar loop vs typed-array loop with aliased max ───────────────────

export function reluKernels(n: number): KernelPair {
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = (i * 31 + 5) % 200 / 100 - 1;
  const Rb = new Float32Array(n);
  const Ro = new Float32Array(n);

  const baseline = () => {
    for (let i = 0; i < n; i++) Rb[i] = Math.max(0, src[i]!);
  };

  const optimized = () => {
    const m = Math.max;
    const out = Ro;
    const s = src;
    let i = n;
    while (i--) out[i] = m(0, s[i]!);
  };

  return {
    name: 'relu',
    baselineLabel: 'relu scalar',
    optimizedLabel: 'relu tight loop',
    baseline,
    optimized,
    verify: () => near(Rb, Ro, 0),
    describe: () => `activation over ${n} elements · identical math`,
  };
}

// ── Softmax: two-pass with Math.max alias vs one-pass max trick ──────────────

export function softmaxKernels(n: number): KernelPair {
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = ((i * 17) % 50) / 10 - 2;
  const Sb = new Float32Array(n);
  const So = new Float32Array(n);

  const baseline = () => {
    let mx = -Infinity;
    for (let i = 0; i < n; i++) mx = Math.max(mx, src[i]!);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const e = Math.exp(src[i]! - mx);
      Sb[i] = e;
      sum += e;
    }
    for (let i = 0; i < n; i++) Sb[i] = Sb[i]! / sum;
  };

  const optimized = () => {
    const m = Math.max;
    const e = Math.exp;
    const out = So;
    const s = src;
    let mx = -Infinity;
    let i = n;
    while (i--) mx = m(mx, s[i]!);
    let sum = 0;
    i = n;
    while (i--) {
      const v = e(s[i]! - mx);
      out[i] = v;
      sum += v;
    }
    i = n;
    while (i--) out[i] = out[i]! / sum;
  };

  return {
    name: 'softmax',
    baselineLabel: 'softmax two-pass',
    optimizedLabel: 'softmax aliased',
    baseline,
    optimized,
    verify: () => near(Sb, So, 1e-5),
    describe: () => `softmax over ${n} logits · same numerics`,
  };
}

// ── Vector distance: nested index math vs flat unrolled walk ─────────────────

export function dotKernels(n: number): KernelPair {
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    A[i] = ((i * 7) % 101) / 101;
    B[i] = ((i * 3 + 1) % 101) / 101;
  }

  let outB = 0;
  let outO = 0;

  const baseline = () => {
    let acc = 0;
    for (let i = 0; i < n; i++) acc += A[i]! * B[i]!;
    outB = acc;
  };

  const optimized = () => {
    let acc = 0;
    let i = n;
    while (i >= 4) {
      i -= 4;
      acc += A[i]! * B[i]! + A[i + 1]! * B[i + 1]! + A[i + 2]! * B[i + 2]! + A[i + 3]! * B[i + 3]!;
    }
    while (i--) acc += A[i]! * B[i]!;
    outO = acc;
  };

  return {
    name: 'dot',
    baselineLabel: 'dot nested',
    optimizedLabel: 'dot unrolled ×4',
    baseline,
    optimized,
    verify: () => Math.abs(outB - outO) < 1e-3,
    describe: () => `dot product of two ${n}-vectors · same summation`,
  };
}

export function allKernels(n: number): KernelPair[] {
  return [matmulKernels(n), reluKernels(n), softmaxKernels(n), dotKernels(n)];
}

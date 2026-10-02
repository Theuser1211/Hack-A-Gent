/**
 * A tiny 2-layer classifier that supports real local training (SGD, seeded and
 * deterministic) and a CPU-only forward pass. Small enough to retrain in under a
 * second on a modest device — the point of the project is that this all happens
 * on-device with no network.
 */
export interface TrainedModel {
  inputSize: number;
  hidden: number;
  outputSize: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  epochs: number;
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295;
  };
}

export function createModel(inputSize: number, hidden: number, outputSize: number, seed = 7): TrainedModel {
  const rng = seededRng(seed);
  const init = (n: number, scale: number) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = (rng() - 0.5) * scale;
    return a;
  };
  return {
    inputSize,
    hidden,
    outputSize,
    w1: init(inputSize * hidden, 0.6),
    b1: new Float32Array(hidden),
    w2: init(hidden * outputSize, 0.6),
    b2: new Float32Array(outputSize),
    epochs: 0,
  };
}

export function predict(model: TrainedModel, x: Float32Array): Float32Array {
  const h = new Float32Array(model.hidden);
  for (let j = 0; j < model.hidden; j++) {
    let acc = model.b1[j]!;
    for (let i = 0; i < model.inputSize; i++) acc += x[i]! * model.w1[j * model.inputSize + i]!;
    h[j] = Math.max(0, acc);
  }
  const logits = new Float32Array(model.outputSize);
  for (let k = 0; k < model.outputSize; k++) {
    let acc = model.b2[k]!;
    for (let j = 0; j < model.hidden; j++) acc += h[j]! * model.w2[k * model.hidden + j]!;
    logits[k] = acc;
  }
  let mx = -Infinity;
  for (let i = 0; i < logits.length; i++) mx = Math.max(mx, logits[i]!);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    logits[i] = Math.exp(logits[i]! - mx);
    sum += logits[i]!;
  }
  for (let i = 0; i < logits.length; i++) logits[i] = logits[i]! / sum;
  return logits;
}

export function train(
  model: TrainedModel,
  xs: Float32Array[],
  ys: number[],
  epochs = 90,
  lr = 0.2,
  seed = 11,
  clip = 1.0,
  weightDecay = 1e-3,
): TrainedModel {
  const rng = seededRng(seed);
  const n = xs.length;
  const order = xs.map((_, i) => i);

  const dw2 = new Float32Array(model.w2.length);
  const db2 = new Float32Array(model.b2.length);
  const dw1 = new Float32Array(model.w1.length);
  const db1 = new Float32Array(model.b1.length);

  // Apply accumulated, clipped gradients for one layer.
  const apply = (w: Float32Array, dw: Float32Array) => {
    let maxAbs = 0;
    for (let i = 0; i < dw.length; i++) maxAbs = Math.max(maxAbs, Math.abs(dw[i]!));
    if (maxAbs > clip) {
      const s = clip / maxAbs;
      for (let i = 0; i < dw.length; i++) dw[i]! *= s;
    }
    for (let i = 0; i < w.length; i++) {
      w[i] = w[i]! - lr * dw[i]! - weightDecay * w[i]!;
      dw[i] = 0;
    }
  };

  for (let e = 0; e < epochs; e++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]!;
      order[i] = order[j]!;
      order[j] = tmp;
    }

    for (const idx of order) {
      const x = xs[idx]!;
      const y = ys[idx]!;

      const h = new Float32Array(model.hidden);
      for (let j = 0; j < model.hidden; j++) {
        let acc = model.b1[j]!;
        for (let i = 0; i < model.inputSize; i++) acc += x[i]! * model.w1[j * model.inputSize + i]!;
        h[j] = Math.max(0, acc);
      }

      const logits = new Float32Array(model.outputSize);
      for (let k = 0; k < model.outputSize; k++) {
        let acc = model.b2[k]!;
        for (let j = 0; j < model.hidden; j++) acc += h[j]! * model.w2[k * model.hidden + j]!;
        logits[k] = acc;
      }
      let mx = logits[0]!;
      for (let k = 1; k < logits.length; k++) mx = Math.max(mx, logits[k]!);
      let sum = 0;
      const soft = new Float32Array(logits.length);
      for (let k = 0; k < logits.length; k++) {
        soft[k] = Math.exp(logits[k]! - mx);
        sum += soft[k]!;
      }
      for (let k = 0; k < logits.length; k++) soft[k] = soft[k]! / sum;

      for (let k = 0; k < model.outputSize; k++) {
        const d = soft[k]! - (k === y ? 1 : 0);
        for (let j = 0; j < model.hidden; j++) dw2[k * model.hidden + j]! += d * h[j]!;
        db2[k]! += d;
      }
      for (let j = 0; j < model.hidden; j++) {
        let dH = 0;
        for (let k = 0; k < model.outputSize; k++) {
          dH += (soft[k]! - (k === y ? 1 : 0)) * model.w2[k * model.hidden + j]!;
        }
        dH *= h[j]! > 0 ? 1 : 0;
        for (let i = 0; i < model.inputSize; i++) dw1[j * model.inputSize + i]! += dH * x[i]!;
        db1[j]! += dH;
      }
    }

    apply(model.w2, dw2);
    apply(model.b2, db2);
    apply(model.w1, dw1);
    apply(model.b1, db1);
  }

  model.epochs = epochs;
  return model;
}

export function weightCount(model: TrainedModel): number {
  return model.w1.length + model.b1.length + model.w2.length + model.b2.length;
}

export function serialize(model: TrainedModel): Record<string, unknown> {
  return {
    inputSize: model.inputSize,
    hidden: model.hidden,
    outputSize: model.outputSize,
    epochs: model.epochs,
    w1: Array.from(model.w1),
    b1: Array.from(model.b1),
    w2: Array.from(model.w2),
    b2: Array.from(model.b2),
  };
}

export function deserialize(data: Record<string, unknown>): TrainedModel {
  const arr = (v: unknown) => Float32Array.from((v as number[]) ?? []);
  return {
    inputSize: Number(data.inputSize),
    hidden: Number(data.hidden),
    outputSize: Number(data.outputSize),
    epochs: Number(data.epochs),
    w1: arr(data.w1),
    b1: arr(data.b1),
    w2: arr(data.w2),
    b2: arr(data.b2),
  };
}

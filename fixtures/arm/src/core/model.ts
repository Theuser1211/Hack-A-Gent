/**
 * A tiny, deterministic 2-layer network used to demonstrate quantization. The
 * weights are synthetic (seeded, never trained) — this is a numeric illustration
 * of a real technique, not a real classifier.
 */
export interface TinyModel {
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  hidden: number;
  inputSize: number;
  outputSize: number;
}

export function buildTinyModel(inputSize = 16, hidden = 24, outputSize = 4, seed = 7): TinyModel {
  let state = seed >>> 0;
  const rng = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967295 - 0.5;
  };

  const w1 = new Float32Array(inputSize * hidden);
  for (let i = 0; i < w1.length; i++) w1[i] = rng();
  const b1 = new Float32Array(hidden);
  const w2 = new Float32Array(hidden * outputSize);
  for (let i = 0; i < w2.length; i++) w2[i] = rng() * 0.4;
  const b2 = new Float32Array(outputSize);

  return { w1, b1, w2, b2, hidden, inputSize, outputSize };
}

export function forward(
  model: TinyModel,
  input: Float32Array,
  w1: Float32Array,
  b1: Float32Array,
  w2: Float32Array,
  b2: Float32Array,
): Float32Array {
  const h = new Float32Array(model.hidden);
  for (let j = 0; j < model.hidden; j++) {
    let acc = b1[j]!;
    for (let i = 0; i < model.inputSize; i++) acc += input[i]! * w1[j * model.inputSize + i]!;
    h[j] = Math.max(0, acc);
  }
  const out = new Float32Array(model.outputSize);
  for (let k = 0; k < model.outputSize; k++) {
    let acc = b2[k]!;
    for (let j = 0; j < model.hidden; j++) acc += h[j]! * w2[k * model.hidden + j]!;
    out[k] = acc;
  }
  return out;
}

export function floatBytes(model: TinyModel): number {
  return (model.w1.length + model.b1.length + model.w2.length + model.b2.length) * 4;
}

import { buildTinyModel, floatBytes, forward } from './model.js';

export interface QuantSection {
  modelBytesFloat: number;
  modelBytesInt8: number;
  weightCount: number;
  savedPct: number;
  mse: number;
  maxAbsErr: number;
  matchRatePct: number;
  samples: number;
  note: string;
}

function quantizeWeights(weights: Float32Array, bits = 8): { q: Int8Array; scale: number; zeroPoint: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < weights.length; i++) {
    const v = weights[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const half = Math.pow(2, bits - 1) - 1; // 127
  const scale = Math.max(Math.abs(min), Math.abs(max)) / half;
  const zeroPoint = 0; // symmetric quantization
  const q = new Int8Array(weights.length);
  for (let i = 0; i < weights.length; i++) {
    q[i] = Math.max(-half, Math.min(half, Math.round(weights[i]! / scale)));
  }
  return { q, scale, zeroPoint };
}

function dequantize(q: Int8Array, scale: number): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i]! * scale;
  return out;
}

/**
 * A real, local quantization simulation: weights are quantized to INT8 with a
 * per-tensor scale/zero-point, then the network is run with the dequantized
 * weights on a batch of deterministic inputs. Every statistic is computed from
 * that math — nothing is asserted or fabricated.
 */
export function quantizeSection(): QuantSection {
  const model = buildTinyModel();
  const w1q = quantizeWeights(model.w1);
  const w2q = quantizeWeights(model.w2);
  const d1 = dequantize(w1q.q, w1q.scale);
  const d2 = dequantize(w2q.q, w2q.scale);

  let mseAcc = 0;
  let maxAbs = 0;
  let matched = 0;
  const samples = 64;

  for (let s = 0; s < samples; s++) {
    const input = new Float32Array(model.inputSize);
    let state = (s * 2654435761) >>> 0;
    for (let i = 0; i < input.length; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      input[i] = state / 4294967295;
    }
    const ref = forward(model, input, model.w1, model.b1, model.w2, model.b2);
    const qOut = forward(model, input, d1, model.b1, d2, model.b2);
    for (let k = 0; k < ref.length; k++) {
      const err = qOut[k]! - ref[k]!;
      mseAcc += err * err;
      maxAbs = Math.max(maxAbs, Math.abs(err));
    }
    const argmax = (v: Float32Array) => {
      let best = 0;
      for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
      return best;
    };
    if (argmax(ref) === argmax(qOut)) matched++;
  }

  const count = model.w1.length + model.w2.length;
  const int8 = count * 1 + model.b1.length * 4 + model.b2.length * 4;
  const f32 = floatBytes(model);
  const perElement = mseAcc / (samples * model.outputSize);

  return {
    modelBytesFloat: f32,
    modelBytesInt8: int8,
    weightCount: count,
    savedPct: Math.round(((f32 - int8) / f32) * 1000) / 10,
    mse: Math.round(perElement * 1e6) / 1e6,
    maxAbsErr: Math.round(maxAbs * 1e4) / 1e4,
    matchRatePct: Math.round((matched / samples) * 1000) / 10,
    samples,
    note: 'INT8 quantization is simulated locally on a synthetic model; bytes, MSE and top-1 match rate are computed, not claimed for any deployed model.',
  };
}

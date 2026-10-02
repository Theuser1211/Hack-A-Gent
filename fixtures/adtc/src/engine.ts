import { performance } from 'node:perf_hooks';
import { buildVocab, features } from './tokenizer.js';
import { createModel, deserialize, predict, train, weightCount, serialize, type TrainedModel } from './model.js';
import { loadDataset, type IntentDataset } from './data.js';

export interface Prediction {
  label: string;
  probs: number[];
  latencyMs: number;
}

export interface EvalRow {
  label: string;
  support: number;
  correct: number;
  accuracy: number;
}

/**
 * The full on-device intent pipeline: dataset → vocab → features → train →
 * predict/eval. All deterministic given the seed; nothing here needs a network.
 */
export class IntentEngine {
  readonly dataset: IntentDataset;
  readonly vocab: string[];
  readonly model: TrainedModel;
  readonly trainingTimeMs: number;
  readonly seed: number;

  constructor(dataset: IntentDataset, loadWeights: Record<string, unknown> | null = null, seed = 11) {
    this.dataset = dataset;
    this.seed = seed;
    this.vocab = buildVocab(dataset.examples.map((e) => e.text));
    this.model = loadWeights
      ? deserialize(loadWeights)
      : createModel(this.vocab.length, 24, dataset.labels.length);
    if (!loadWeights) {
      const t0 = performance.now();
      this.trainLocal();
      this.trainingTimeMs = Math.round(performance.now() - t0);
    } else {
      this.trainingTimeMs = 0;
    }
  }

  private xs(): Float32Array[] {
    return this.dataset.examples.map((e) => features(e.text, this.vocab));
  }

  private ys(): number[] {
    return this.dataset.examples.map((e) => this.dataset.labels.indexOf(e.intent));
  }

  trainLocal(epochs = 90): void {
    train(this.model, this.xs(), this.ys(), epochs, this.seed);
  }

  predictRaw(text: string): { logits: Float32Array; latencyMs: number } {
    const x = features(text, this.vocab);
    const t0 = performance.now();
    const logits = predict(this.model, x);
    return { logits, latencyMs: performance.now() - t0 };
  }

  predict(text: string): Prediction {
    const { logits, latencyMs } = this.predictRaw(text);
    return { label: this.dataset.labels[argmax(logits)] ?? this.dataset.labels[0]!, probs: Array.from(logits), latencyMs };
  }

  topK(text: string, k = 3): Prediction & { top: Array<{ label: string; prob: number }> } {
    const p = this.predict(text);
    const top = p.probs
      .map((prob, i) => ({ label: this.dataset.labels[i]!, prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, k);
    return { ...p, top };
  }

  evaluate(): { rows: EvalRow[]; overall: number; total: number; correct: number } {
    let correct = 0;
    const per = new Map<string, { correct: number; support: number }>();
    for (const e of this.dataset.examples) {
      const pred = this.predict(e.text);
      const row = per.get(e.intent) ?? { correct: 0, support: 0 };
      row.support++;
      if (pred.label === e.intent) {
        row.correct++;
        correct++;
      }
      per.set(e.intent, row);
    }
    const rows: EvalRow[] = this.dataset.labels.map((label) => {
      const r = per.get(label) ?? { correct: 0, support: 0 };
      return {
        label,
        support: r.support,
        correct: r.correct,
        accuracy: r.support ? Math.round((r.correct / r.support) * 1000) / 10 : 0,
      };
    });
    return {
      rows,
      overall: this.dataset.examples.length ? Math.round((correct / this.dataset.examples.length) * 1000) / 10 : 0,
      total: this.dataset.examples.length,
      correct,
    };
  }

  modelInfo() {
    return {
      vocabSize: this.vocab.length,
      labels: this.dataset.labels,
      weights: weightCount(this.model),
      weightBytes: weightCount(this.model) * 4,
      trainingTimeMs: this.trainingTimeMs,
      trainableLocally: true,
      seed: this.seed,
    };
  }

  /** Mean cross-entropy loss over the bundled sample set — measured, not assumed. */
  sampleLoss(): number {
    let sum = 0;
    for (const e of this.dataset.examples) {
      const p = this.predict(e.text);
      const idx = this.dataset.labels.indexOf(e.intent);
      const prob = idx >= 0 ? (p.probs[idx] ?? 0) : 0;
      sum += -Math.log(Math.max(prob, 1e-9));
    }
    return this.dataset.examples.length ? sum / this.dataset.examples.length : 0;
  }

  exportWeights(): Record<string, unknown> {
    return serialize(this.model);
  }
}

function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}

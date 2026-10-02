import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFile } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntentEngine } from './engine.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export function startServer(engine: IntentEngine, port = 8802): void {
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
  const HOST = process.env.HOST ?? '127.0.0.1';
  const PORT = Number(process.env.PORT ?? 0) || port;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? HOST}`);
    const pathname = url.pathname;

    void (async () => {
      try {
        // API endpoints
        if (pathname === '/api/model') {
          const info = engine.modelInfo();
          return json(res, 200, {
            model: {
              inputSize: info.vocabSize,
              hidden: 24,
              outputSize: info.labels.length,
              epochs: 90,
              seed: info.seed,
              labels: info.labels,
              weights: info.weights,
              weightBytes: info.weightBytes,
            },
            trained: true,
            metrics: computeMetrics(engine),
          });
        }

        if (pathname === '/api/train' && req.method === 'POST') {
          const epochs = 90;
          engine.trainLocal(epochs);
          const metrics = computeMetrics(engine);
          return json(res, 200, {
            model: engine.modelInfo(),
            metrics,
            epochs,
            seed: engine.seed,
            loss: round(engine.sampleLoss()),
            trainingMs: engine.trainingTimeMs,
          });
        }

        if (pathname === '/api/evaluate') {
          const resEval = engine.evaluate();
          return json(res, 200, {
            rows: resEval.rows,
            overall: resEval.overall,
            correct: resEval.correct,
            total: resEval.total,
            loss: round(engine.sampleLoss()),
            metrics: computeMetrics(engine),
            seed: engine.seed,
          });
        }

        if (pathname === '/api/predict' && req.method === 'POST') {
          const body = await readBody(req);
          const text = String(body.text ?? '').trim();
          if (!text) return json(res, 400, { error: 'missing text' });

          const pred = engine.predict(text);
          const top = engine.topK(text, 3).top;
          return json(res, 200, {
            label: pred.label,
            probs: pred.probs,
            top,
            latencyMs: pred.latencyMs,
          });
        }

        if (pathname === '/api/quantize') {
          const q = quantizeWeights(engine);
          return json(res, 200, q);
        }

        // Static files
        const safeName = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = path.normalize(path.join(publicDir, safeName));
        if (!filePath.startsWith(publicDir)) return json(res, 403, { error: 'forbidden' });
        if (!existsSync(filePath)) return json(res, 404, { error: 'not found' });

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'content-type': MIME[ext] ?? 'application/octet-stream',
          'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
        });
        readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500);
            res.end('server error');
            return;
          }
          res.end(data);
        });
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
      }
    })();
  });

  server.listen(PORT, HOST, () => {
    console.log('  \u25CF  Kilima — on-device intent classification');
    console.log(`      offline \u00b7 CPU only \u00b7 no network required`);

    const model = computeMetrics(engine);
    console.log(`      model  : ${engine.modelInfo().vocabSize}\u219224\u21926  \u00b7 ${model.params} params \u00b7 ~${model.modelSizeKb.toFixed(1)} KB (fp32)`);
    console.log(`      rss    : ~${model.peakRssMb} MB on this host`);
    console.log('');
    console.log(`      dashboard:  http://${HOST}:${PORT}`);
    console.log(`      stop     :  Ctrl+C`);
    console.log('');
    console.log('      CLI stays available, e.g.  npm start -- inspect "remind me to call Mama"');
  });
}

function round(v: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

function computeMetrics(engine: IntentEngine) {
  const evalResult = engine.evaluate();
  const info = engine.modelInfo();
  const timings: number[] = [];

  for (const ex of engine.dataset.examples) {
    const t0 = performance.now();
    engine.predictRaw(ex.text);
    timings.push(performance.now() - t0);
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)] ?? 0;
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
  const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
  const params = info.weights;
  const modelSizeKb = info.weightBytes / 1024;

  return {
    accuracy: evalResult.overall,
    latencyP50: p50,
    latencyP95: p95,
    peakRssMb: rssMb,
    modelSizeKb,
    params,
    samples: evalResult.total,
  };
}

function quantizeWeights(engine: IntentEngine) {
  const m = engine.model;
  const quant = (w: Float32Array) => {
    let max = 0;
    for (let i = 0; i < w.length; i++) max = Math.max(max, Math.abs(w[i]!));
    const scale = max / 127;
    const q = new Int8Array(w.length);
    for (let i = 0; i < w.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(w[i]! / scale)));
    return { q, scale };
  };
  const w1q = quant(m.w1);
  const w2q = quant(m.w2);
  const d1 = new Float32Array(w1q.q.length);
  const d2 = new Float32Array(w2q.q.length);
  for (let i = 0; i < d1.length; i++) d1[i] = w1q.q[i]! * w1q.scale;
  for (let i = 0; i < d2.length; i++) d2[i] = w2q.q[i]! * w2q.scale;

  let mse = 0;
  let maxAbsErr = 0;
  for (let i = 0; i < d1.length; i++) {
    const e = d1[i]! - m.w1[i]!;
    mse += e * e;
    maxAbsErr = Math.max(maxAbsErr, Math.abs(e));
  }
  for (let i = 0; i < d2.length; i++) {
    const e = d2[i]! - m.w2[i]!;
    mse += e * e;
    maxAbsErr = Math.max(maxAbsErr, Math.abs(e));
  }
  mse /= d1.length + d2.length;

  const qmodel: typeof m = { ...m, w1: d1, w2: d2 };
  let matched = 0;
  for (const ex of engine.dataset.examples) {
    const x = features(ex.text, engine.vocab);
    if (argmax(predict(m, x)) === argmax(predict(qmodel, x))) matched++;
  }
  const total = engine.dataset.examples.length;
  const int8Bytes = d1.length + d2.length + m.b1.length * 4 + m.b2.length * 4;
  const fp32Bytes = (d1.length + d2.length + m.b1.length + m.b2.length) * 4;

  return {
    fp32: fp32Bytes,
    int8: int8Bytes,
    savedPct: Math.round(((fp32Bytes - int8Bytes) / fp32Bytes) * 1000) / 10,
    mse: Math.round(mse * 1e6) / 1e6,
    maxAbsErr: Math.round(maxAbsErr * 1e4) / 1e4,
    top1: `${Math.round((matched / total) * 1000) / 10}% (${matched}/${total})`,
  };
}

function predict(model: { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array; hidden: number; inputSize: number; outputSize: number }, x: Float32Array): Float32Array {
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

function features(text: string, vocab: string[]): Float32Array {
  const counts = new Float32Array(vocab.length);
  const vocabIndex = Object.fromEntries(vocab.map((v, i) => [v, i]));
  for (const ch of text.toLowerCase()) {
    const idx = vocabIndex[ch];
    if (idx !== undefined) counts[idx] += 1;
  }
  return counts;
}

function argmax(v: Float32Array): number {
  let best = 0;
  for (let i = 1; i < v.length; i++) if (v[i]! > v[best]!) best = i;
  return best;
}
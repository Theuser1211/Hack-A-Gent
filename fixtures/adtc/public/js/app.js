import { api } from './api.js';

const main = document.querySelector('#main');

const CHIPS = [
  'Will it rain tomorrow?',
  'Remind me to call my mother',
  'Set a timer for 20 minutes',
  'Wake me up at 6:30',
  'Send a message that I am running late',
];

let state = {
  model: null,
  metrics: null,
  trained: true,
  prediction: null,
  evalResult: null,
  quant: null,
  training: false,
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function round(v, dp = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '\u2014';
  const f = 10 ** dp;
  return String(Math.round(v * f) / f);
}

async function boot() {
  try {
    const res = await api('/api/model');
    state.model = res.model;
    state.metrics = res.metrics;
    state.trained = true;
  } catch {
    state.model = { inputSize: 26, hidden: 24, outputSize: 6, labels: [], seed: 11, weights: 0, weightBytes: 0 };
  }
  render();
}

function cardHead(title, subtitle) {
  const head = document.createElement('div');
  head.className = 'card-head';
  const h = document.createElement('h2');
  h.textContent = title;
  head.append(h);
  if (subtitle) {
    const s = document.createElement('span');
    s.className = 'card-sub';
    s.textContent = subtitle;
    head.append(s);
  }
  return head;
}

function render() {
  renderHero();
  renderPrivacy();
  renderClassification();
  renderInspector();
  renderEvaluation();
  renderQuantization();
  renderTraining();
  renderFooter();
}

function renderHero() {
  const m = state.model;
  const arch = `${m.inputSize} \u2192 ${m.hidden} \u2192 ${m.outputSize}`;
  const kb = m.weightBytes ? (m.weightBytes / 1024).toFixed(2) : '\u2014';

  const card = document.createElement('section');
  card.className = 'card hero';
  card.innerHTML = `
    <div class="hero-title">KILIMA</div>
    <div class="hero-sub">On-device intent classification</div>
    <div class="hero-line">offline \u00b7 CPU only \u00b7 no network required</div>
    <div class="hero-stats">
      <div class="hero-stat"><span class="hnum">${m.outputSize}</span><span class="hlab">intents</span></div>
      <div class="hero-stat"><span class="hnum">${m.inputSize}</span><span class="hlab">features</span></div>
      <div class="hero-stat"><span class="hnum mono">${arch}</span><span class="hlab">MLP</span></div>
      <div class="hero-stat"><span class="hnum mono">${m.weights}</span><span class="hlab">params</span></div>
      <div class="hero-stat"><span class="hnum mono">~${kb} KB</span><span class="hlab">fp32</span></div>
    </div>
    <div class="hero-note">Inference runs entirely in this server process — local, deterministic, measured.</div>
  `;
  main.append(card);
}

function tile(label, value) {
  return `<div class="tile"><span class="tile-k">${label}</span><span class="tile-v">${value}</span></div>`;
}

function renderPrivacy() {
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Privacy & Offline', 'what leaves this device'));
  card.innerHTML += `
    <div class="privacy-grid">
      ${tile('NETWORK', '<span class="dot dot--off"></span> Disconnected')}
      ${tile('INFERENCE', '<span class="dot dot--ok"></span> Local CPU')}
      ${tile('MODEL', '<span class="dot dot--ok"></span> Bundled')}
      ${tile('DATA', '<span class="dot dot--ok"></span> Local')}
    </div>
    <p class="small-note">No requests are made to any external service. Classification, evaluation and quantization
    all run inside the local Node.js process against the bundled weights and sample data.</p>
  `;
  main.append(card);
}

function renderClassification() {
  const labels = state.model.labels || [];
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Live classification', 'real forward pass'));

  const input = document.createElement('div');
  input.className = 'prediction-input';
  input.innerHTML = `
    <label>Utterance</label>
    <textarea id="predict-input" rows="2" placeholder="e.g. Remind me to call my mother"></textarea>
    <div class="chip-row">${CHIPS.map((c) => `<button class="chip" type="button" data-t="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="btn-row" style="margin-top: 12px;">
      <button class="btn btn--primary" id="predict-btn" type="button">Classify</button>
    </div>
  `;
  card.append(input);

  const result = document.createElement('div');
  result.className = 'prediction-result';
  result.innerHTML = `<div class="empty"><span class="mono dim">awaiting input</span></div>`;
  card.append(result);

  const run = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    result.innerHTML = `<div class="empty"><span class="mono dim">classifying…</span></div>`;
    try {
      const data = await api('/api/predict', { method: 'POST', body: JSON.stringify({ text: trimmed }) });
      state.prediction = data;
      renderPredictionResult(result, data, labels);
    } catch (err) {
      result.innerHTML = `<div class="empty err">${esc(err.message)}</div>`;
    }
  };

  input.querySelector('#predict-btn').addEventListener('click', () => {
    const t = input.querySelector('#predict-input');
    run(t ? t.value : '');
  });
  input.querySelector('#predict-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      run(e.currentTarget.value);
    }
  });
  input.addEventListener('click', (e) => {
    const chipEl = e.target.closest('.chip[data-t]');
    if (chipEl) {
      const t = input.querySelector('#predict-input');
      t.value = chipEl.dataset.t;
      run(chipEl.dataset.t);
    }
  });

  card.append(input, result);
  main.append(card);
}

function renderPredictionResult(el, data, labels) {
  const best = data.top && data.top[0] ? data.top[0] : { label: data.label, prob: 0 };
  const rows = labels
    .map((label, i) => ({ label, prob: data.probs && data.probs[i] != null ? data.probs[i] : 0 }))
    .sort((a, b) => b.prob - a.prob);
  const bars = rows
    .map((r) => `
      <div class="prob-bar">
        <span class="prob-name">${r.label}</span>
        <div class="prob-track"><div class="prob-fill" style="width:${(r.prob * 100).toFixed(1)}%"></div></div>
        <span class="prob-value">${(r.prob * 100).toFixed(1)}%</span>
      </div>
    `)
    .join('');

  el.innerHTML = `
    <div class="result-header">
      <span class="result-label">${esc(best.label)}</span>
      <span class="result-confidence">p = ${(best.prob * 100).toFixed(1)}%</span>
    </div>
    <div class="result-probs">${bars}</div>
    <div class="lat mono">local inference \u00b7 ${round(data.latencyMs, 3)} ms \u00b7 offline</div>
  `;
}

function renderInspector() {
  const m = state.model;
  const labels = (state.model.labels || []).join(', ');
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Model inspector', 'what is running'));
  card.innerHTML += `
    <div class="kv">
      <div class="kv-row"><span>Architecture</span><code>bag-of-letters \u2192 MLP ${m.inputSize}\u2192${m.hidden}\u2192${m.outputSize}</code></div>
      <div class="kv-row"><span>Tokenizer</span><code>${m.inputSize}-dim character counts (a\u2013z), case-folded</code></div>
      <div class="kv-row"><span>Activations</span><code>ReLU (hidden) \u00b7 softmax (output)</code></div>
      <div class="kv-row"><span>Intents</span><code>${labels}</code></div>
      <div class="kv-row"><span>Weights</span><code>${m.weights} float32 (~${round(m.weightBytes / 1024, 2)} KB)</code></div>
      <div class="kv-row"><span>Seed</span><code>${m.seed} (deterministic training)</code></div>
      <div class="kv-row"><span>Runtime</span><code>CPU only \u00b7 no WASM \u00b7 no GPU \u00b7 no network</code></div>
    </div>
  `;
  main.append(card);
}

async function runEvaluate(card, bodyEl) {
  bodyEl.innerHTML = `<div class="mono dim">running on ${bodyEl.dataset.examples || ''} sample utterances…</div>`;
  try {
    const data = await api('/api/evaluate');
    state.evalResult = data;
    renderEvalBody(bodyEl, data);
  } catch (err) {
    bodyEl.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}

function renderEvalBody(el, data) {
  const rows = (data.rows || [])
    .map((r) => {
      const good = r.correct / Math.max(r.support, 1);
      const mark = r.support === 0 ? '\u2014' : good === 1 ? 'pass' : good >= 0.5 ? 'partial' : 'fail';
      return `
        <div class="eval-row">
          <span class="eval-label">${r.label}</span>
          <span class="eval-count mono">${r.correct}/${r.support}</span>
          <div class="eval-track"><div class="eval-fill ${mark}" style="width:${(good * 100).toFixed(1)}%"></div></div>
          <span class="eval-pct mono">${r.accuracy}%</span>
        </div>
      `;
    })
    .join('');
  el.innerHTML = `
    <div class="eval-head">
      <span>sample accuracy <span class="pill-note">bundled set</span></span>
      <span class="mono acc">${data.overall}%</span>
    </div>
    ${rows}
    <div class="eval-foot mono">${data.correct}/${data.total} \u00b7 seed ${data.seed} \u00b7 loss ${round(data.loss, 3)} \u00b7 p50 ${round(data.metrics.latencyP50, 3)} ms \u00b7 p95 ${round(data.metrics.latencyP95, 3)} ms</div>
  `;
}

function renderEvaluation() {
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Evaluation', 'on the bundled sample set'));
  const bodyEl = document.createElement('div');
  bodyEl.className = 'eval';
  bodyEl.dataset.tokens = state.model.labels ? `${state.metrics ? state.metrics.samples : ''}` : '';
  bodyEl.innerHTML = `<div class="btn-row">
      <button class="btn btn--ghost" id="eval-btn" type="button">Run evaluation</button>
    </div>
    <p class="small-note">Runs the real classifier over the bundled sample utterances. Results are measured locally — a demonstration of the pipeline, not a real-world benchmark.</p>`;
  card.append(bodyEl);
  main.append(card);
  const btn = bodyEl.querySelector('#eval-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    runEvaluate(card, bodyEl);
  });
}

async function runQuantize(card, bodyEl) {
  bodyEl.innerHTML = `<div class="mono dim">quantizing trained weights…</div>`;
  try {
    const data = await api('/api/quantize');
    state.quant = data;
    bodyEl.innerHTML = `
      <div class="quant-grid">
        <div class="quant-item"><span class="qk">FP32</span><span class="qv mono">${data.fp32} B</span></div>
        <div class="quant-item"><span class="qk">INT8</span><span class="qv mono">${data.int8} B</span></div>
        <div class="quant-item"><span class="qk">Smaller</span><span class="qv mono">${data.savedPct}%</span></div>
        <div class="quant-item"><span class="qk">Weight MSE</span><span class="qv mono">${data.mse}</span></div>
        <div class="quant-item"><span class="qk">Top-1 match</span><span class="qv mono">${data.top1}</span></div>
      </div>
      <p class="small-note">Simulated INT8 quantization on the real trained weights via scale/zero-point. Bytes, error and top-1 match are computed, not assumed.</p>
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}

function renderQuantization() {
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Quantization', 'INT8 simulation on trained weights'));
  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `<div class="btn-row"><button class="btn btn--ghost" id="quant-btn" type="button">Quantize weights</button></div>`;
  card.append(bodyEl);
  main.append(card);
  const btn = bodyEl.querySelector('#quant-btn');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    runQuantize(card, bodyEl);
  });
}

async function runTraining(card, bodyEl) {
  if (state.training) return;
  state.training = true;
  bodyEl.innerHTML = `<div class="mono dim">training locally (deterministic)…</div>`;
  try {
    const data = await api('/api/train', { method: 'POST' });
    state.model = data.model;
    state.metrics = data.metrics;
    bodyEl.innerHTML = `
      <div class="train-head">
        <span class="tstat"><span class="tk">Epochs</span><span class="mono">${data.epochs}</span></span>
        <span class="tstat"><span class="tk">Seed</span><span class="mono">${data.seed}</span></span>
        <span class="tstat"><span class="tk">Loss</span><span class="mono">${round(data.loss, 4)}</span></span>
        <span class="tstat"><span class="tk">Accuracy</span><span class="mono">${data.metrics.accuracy}%</span></span>
      </div>
      <p class="small-note">Seed ${data.seed} reproduces the same weights on any run. Retraining happens inside the local process on the bundled sample data.</p>
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  } finally {
    state.training = false;
  }
}

function renderTraining() {
  const card = document.createElement('section');
  card.className = 'card';
  card.append(cardHead('Local training', 'deterministic seed'));
  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = `<div class="btn-row"><button class="btn btn--primary" id="train-btn" type="button">Train on sample data</button></div>
    <p class="small-note">Runs SGD (~90 epochs) on the bundled labeled samples inside the local Node process. Small and safe; reuse the CLI for more control: <code>npm start -- train</code>.</p>`;
  card.append(bodyEl);
  main.append(card);
  const btn = bodyEl.querySelector('#train-btn');
  btn.addEventListener('click', () => runTraining(card, bodyEl));
}

function renderFooter() {
  const div = document.createElement('div');
  div.className = 'footer-note';
  div.innerHTML = `
    <strong>Honesty notice:</strong> the model is trained on the bundled sample set (${state.model.labels.length} intents).
    Reported accuracy, latency, memory and quantization values are measured locally on this machine; they are a demonstration
    of the pipeline, <em>not</em> a claim about real-world data. No external service is contacted.
  `;
  main.append(div);
}

boot();
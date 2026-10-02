import { api } from './api.js';
import { createSpeedupChart, createThroughputChart, createRssChart } from './charts.js';

const app = document.querySelector('#app');
const main = document.querySelector('#main');
const hardwareBadge = document.querySelector('#hardware-badge');

let state = {
  hardware: null,
  kernels: [],
  selectedKernels: new Set(),
  results: null,
  running: false,
};

const KERNEL_DEFINITIONS = [
  { id: 'matmul', name: 'Matrix Multiply', desc: 'Dense GEMM with cache-friendly tiling vs naive triple loop', tags: ['Memory-bound', 'Cache-optimized', 'ARM NEON target'] },
  { id: 'relu', name: 'ReLU Activation', desc: 'Element-wise max(0,x) with tight loop vs scalar Math.max', tags: ['Compute-bound', 'Branch-free', 'Vectorizable'] },
  { id: 'softmax', name: 'Softmax', desc: 'Two-pass stable softmax vs aliased single-pass', tags: ['Numerics-critical', 'Exponent-heavy', 'SIMD-friendly'] },
  { id: 'dot', name: 'Dot Product', desc: 'Unrolled 4x vs scalar accumulation', tags: ['Memory-bound', 'ILP-optimized', 'Reduction'] },
];

async function boot() {
  try {
    await loadHardware();
    render();
  } catch (err) {
    showError(err.message);
  }
}

async function loadHardware() {
  const data = await api('/api/hardware');
  state.hardware = data;
  updateHardwareBadge();
}

function updateHardwareBadge() {
  if (!state.hardware) return;
  const hw = state.hardware;
  hardwareBadge.textContent = hw.isArm ? 'Arm target detected' : 'Non-Arm host (x86/other)';
  hardwareBadge.className = `pill ${hw.isArm ? 'pill--arm' : 'pill--x86'}`;
}

async function loadKernels() {
  const data = await api('/api/kernels');
  state.kernels = data;
  state.selectedKernels = new Set(data.map(k => k.id));
  render();
}

async function runBenchmark() {
  if (state.selectedKernels.size === 0) {
    toast('Select at least one kernel to benchmark');
    return;
  }
  state.running = true;
  render();

  try {
    const selected = Array.from(state.selectedKernels);
    const data = await api('/api/benchmark', {
      method: 'POST',
      body: JSON.stringify({ kernels: selected, matrixSize: getMatrixSize(), windowMs: getWindowMs() }),
    });
    state.results = data;
    toast('Benchmark complete', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    state.running = false;
    render();
  }
}

function getMatrixSize() {
  const sel = document.querySelector('#matrix-size');
  return sel ? Number(sel.value) : 256;
}

function getWindowMs() {
  const sel = document.querySelector('#window-ms');
  return sel ? Number(sel.value) : 400;
}

function toggleKernel(id) {
  if (state.selectedKernels.has(id)) state.selectedKernels.delete(id);
  else state.selectedKernels.add(id);
  render();
}

function selectAllKernels() {
  state.selectedKernels = new Set(state.kernels.map(k => k.id));
  render();
}

function clearKernels() {
  state.selectedKernels.clear();
  render();
}

function render() {
  if (!state.hardware) {
    main.innerHTML = '<div class="loading"><div class="spinner"></div><div>Detecting hardware…</div></div>';
    return;
  }

  main.innerHTML = '';
  main.append(renderHardwareCard());

  if (state.kernels.length === 0) {
    main.append(renderKernelLoader());
  } else {
    main.append(renderKernelSelector());
    main.append(renderControls());
    if (state.results) {
      main.append(renderResults());
    }
    main.append(renderArchitectureCard());
  }

  main.append(renderFooter());
}

function renderHardwareCard() {
  const hw = state.hardware;
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <h2>Hardware Context</h2>
    </div>
    <div class="hardware-grid">
      <div class="hw-item">
        <div class="hw-label">Architecture</div>
        <div class="hw-value">${hw.arch}</div>
      </div>
      <div class="hw-item">
        <div class="hw-label">CPU Model</div>
        <div class="hw-value" style="font-size: 13px;">${hw.cpuModel}</div>
      </div>
      <div class="hw-item">
        <div class="hw-label">Logical CPUs</div>
        <div class="hw-value">${hw.logicalCpus} @ ~${hw.speedMhz} MHz</div>
      </div>
      <div class="hw-item">
        <div class="hw-label">Platform</div>
        <div class="hw-value">${hw.platform} ${hw.isArm ? '· Arm' : '· x86/other'}</div>
      </div>
      <div class="hw-item">
        <div class="hw-label">Vector Unit</div>
        <div class="hw-value ${hw.hasNeon ? 'arm-yes' : 'arm-no'}">${hw.hasNeon ? 'NEON / ASIMD' : 'Not exposed'}</div>
      </div>
    </div>
  `;
  return card;
}

function renderKernelLoader() {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head"><h2>Kernel Suite</h2></div>
    <div class="loading"><div class="spinner"></div><div>Loading kernel definitions…</div></div>
  `;
  // Trigger load
  setTimeout(() => loadKernels(), 100);
  return card;
}

function renderKernelSelector() {
  const card = document.createElement('section');
  card.className = 'card';

  const kernelCards = KERNEL_DEFINITIONS.map(k => {
    const selected = state.selectedKernels.has(k.id);
    const def = state.kernels.find(kk => kk.id === k.id);
    const tags = k.tags.map(t => `<span class="tag ${t.includes('Memory') || t.includes('Cache') ? 'tag--baseline' : 'tag--optimized'}">${t}</span>`).join('');
    return `
      <button class="kernel-card ${selected ? 'kernel-card--selected' : ''}" data-id="${k.id}" type="button">
        <div class="kernel-name">${k.name}</div>
        <div class="kernel-desc">${k.desc}</div>
        <div class="kernel-tags">${tags}</div>
      </button>
    `;
  }).join('');

  card.innerHTML = `
    <div class="card-head">
      <h2>Kernel Suite</h2>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn--ghost" id="select-all" type="button">Select all</button>
        <button class="btn btn--ghost" id="clear-all" type="button">Clear</button>
      </div>
    </div>
    <div class="kernel-grid">${kernelCards}</div>
  `;

  card.querySelector('#select-all').addEventListener('click', selectAllKernels);
  card.querySelector('#clear-all').addEventListener('click', clearKernels);
  card.querySelectorAll('.kernel-card').forEach(btn => {
    btn.addEventListener('click', () => toggleKernel(btn.dataset.id));
  });

  return card;
}

function renderControls() {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head"><h2>Benchmark Configuration</h2></div>
    <div class="field-row">
      <div class="field">
        <label>Matrix size (n × n)</label>
        <select id="matrix-size">
          <option value="128">128</option>
          <option value="256" selected>256</option>
          <option value="384">384</option>
          <option value="512">512</option>
        </select>
        <small>Larger = more memory pressure, longer compute</small>
      </div>
      <div class="field">
        <label>Measurement window</label>
        <select id="window-ms">
          <option value="200">200 ms (quick)</option>
          <option value="400" selected>400 ms (standard)</option>
          <option value="800">800 ms (stable)</option>
        </select>
        <small>Longer = more stable throughput numbers</small>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary btn--lg" id="run-bench" type="button" ${state.running ? 'disabled' : ''}>
        ${state.running ? 'Running…' : 'Run Benchmark'}
      </button>
    </div>
  `;
  card.querySelector('#run-bench').addEventListener('click', runBenchmark);
  return card;
}

function renderResults() {
  const r = state.results;
  if (!r || !r.runs.length) return renderEmpty('No results to display');

  const card = document.createElement('section');
  card.className = 'card';

  const tableRows = r.runs.map(run => `
    <tr>
      <td>${run.name}</td>
      <td class="num">${fmtNumber(run.baseline.iterationsPerSecond)}/s</td>
      <td class="num">${fmtNumber(run.optimized.iterationsPerSecond)}/s</td>
      <td class="num speedup ${run.speedupX < 1 ? 'slow' : ''}">${run.speedupX.toFixed(2)}x</td>
      <td class="num">${run.baseline.peakRssMb} MB</td>
      <td class="num ${run.optimized.peakRssMb <= run.baseline.peakRssMb ? '' : 'warn'}">${run.optimized.peakRssMb} MB</td>
      <td class="${run.verified ? 'verified' : 'not-verified'}">${run.verified ? '✓ Verified' : '✗ Mismatch'}</td>
    </tr>
  `).join('');

  card.innerHTML = `
    <div class="results-header">
      <h3>Results — ${r.runs.length} kernel pair${r.runs.length > 1 ? 's' : ''} · ${r.matrixSize}×${r.matrixSize} · ${r.windowMs}ms window</h3>
      <div class="results-meta">
        <span>Host: <strong>${r.hardware.arch} (${r.hardware.cpuModel})</strong></span>
        <span>${r.hardware.isArm ? 'Arm target' : 'Non-Arm host'}</span>
        <span>NEON: ${r.hardware.hasNeon ? 'Yes' : 'No'}</span>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kernel</th>
            <th>Baseline it/s</th>
            <th>Optimized it/s</th>
            <th>Speedup</th>
            <th>Baseline RSS</th>
            <th>Optimized RSS</th>
            <th>Correctness</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="chart-row">
      <div class="chart-card">
        <div class="chart-title">Speedup Ratio (higher = better)</div>
        <div id="chart-speedup"></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Throughput (iterations/sec)</div>
        <div id="chart-throughput"></div>
      </div>
    </div>
    <div class="chart-row">
      <div class="chart-card">
        <div class="chart-title">Peak RSS Memory (lower = better)</div>
        <div id="chart-rss"></div>
      </div>
    </div>
    ${r.quant ? renderQuantization(r.quant) : ''}
  `;

  // Render charts after DOM insertion
  setTimeout(() => {
    createSpeedupChart(document.querySelector('#chart-speedup'), r.runs);
    createThroughputChart(document.querySelector('#chart-throughput'), r.runs);
    createRssChart(document.querySelector('#chart-rss'), r.runs);
  }, 0);

  return card;
}

function renderQuantization(q) {
  return `
    <div class="card" style="margin-top: 16px;">
      <div class="card-head"><h2>INT8 Quantization Analysis (Simulated)</h2></div>
      <div class="quant-grid">
        <div class="quant-item">
          <div class="quant-value quant-value--violet">${q.modelBytesFloat}</div>
          <div class="quant-label">FP32 Model Bytes</div>
        </div>
        <div class="quant-item">
          <div class="quant-value quant-value--accent">${q.modelBytesInt8}</div>
          <div class="quant-label">INT8 Model Bytes</div>
        </div>
        <div class="quant-item">
          <div class="quant-value quant-value--warn">${q.savedPct}%</div>
          <div class="quant-label">Size Reduction</div>
        </div>
        <div class="quant-item">
          <div class="quant-value">${q.matchRatePct}%</div>
          <div class="quant-label">Top-1 Match Rate</div>
        </div>
        <div class="quant-item">
          <div class="quant-value">${q.mse}</div>
          <div class="quant-label">MSE</div>
        </div>
        <div class="quant-item">
          <div class="quant-value">${q.maxAbsErr}</div>
          <div class="quant-label">Max Abs Error</div>
        </div>
      </div>
      <p style="margin-top: 12px; font-size: 12px; color: var(--muted);">${q.note}</p>
    </div>
  `;
}

function renderArchitectureCard() {
  const steps = [
    { n: 1, title: 'Define kernel pairs', desc: 'Each pair computes identical output: a naive baseline and an optimized variant using cache tiling, loop unrolling, or SIMD-friendly patterns.' },
    { n: 2, title: 'Warm up JIT', desc: 'Run each kernel multiple times before measurement so the JavaScript engine compiles hot paths — mirrors real deployment warm-up.' },
    { n: 3, title: 'Measure throughput', desc: 'Execute in a fixed time window (default 400ms), counting iterations. Ops/sec derived from real counts — no synthetic scaling.' },
    { n: 4, title: 'Verify correctness', desc: 'Every optimized kernel output is compared against its baseline (bit-exact or near-exact). Mismatches are flagged, not hidden.' },
    { n: 5, title: 'Quantize & analyze', desc: 'Optional INT8 quantization pass on a synthetic model: per-tensor scale/zero-point, MSE, max error, top-1 match rate — all computed locally.' },
    { n: 6, title: 'Contextualize for Arm', desc: 'Results annotated with hardware context (NEON visibility, cache hints). Reference table shows target platforms — never presented as measured data.' },
  ];

  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head"><h2>Why This Matters for Arm</h2></div>
    <div class="arch-steps">
      ${steps.map(s => `
        <div class="arch-step">
          <div class="step-num">${s.n}</div>
          <div class="step-content">
            <div class="step-title">${s.title}</div>
            <div class="step-desc">${s.desc}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  return card;
}

function renderEmpty(msg) {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><p>${msg}</p></div>`;
  return card;
}

function renderFooter() {
  const div = document.createElement('div');
  div.className = 'footer-note';
  div.innerHTML = `
    <strong>Honesty notice:</strong> Every benchmark number above is measured live on this machine.
    The quantization section uses a synthetic, untrained model — MSE, match rate, and bytes are computed, not claimed for any deployed model.
    Reference Arm platforms are context only; speedups are NOT comparable across different hardware.
    For real Arm optimization, port this harness to the target board and measure there.
  `;
  return div;
}

function showError(msg) {
  main.innerHTML = `
    <div class="card" style="border-color: var(--danger);">
      <div class="empty"><div class="empty-icon">⚠</div><p>Failed to load: ${msg}</p></div>
    </div>
  `;
}

function toast(message, kind = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = `toast toast--${kind}`;
  t.textContent = message;
  document.body.append(t);

  requestAnimationFrame(() => t.classList.add('toast--show'));
  setTimeout(() => {
    t.classList.remove('toast--show');
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

function fmtNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

boot();
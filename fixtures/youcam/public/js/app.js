import { api } from './api.js';
import { applyEffect, getEffect, EFFECTS } from './kernel.js';

const viewport = document.querySelector('#viewport');
const dropzone = document.querySelector('#dropzone');
const beforeAfter = document.querySelector('#before-after');
const baImage = document.querySelector('#ba-image');
const baRange = document.querySelector('#ba-range');
const baDivider = document.querySelector('#ba-divider');
const fileInput = document.querySelector('#file-input');
const btnUpload = document.querySelector('#btn-upload');
const btnSample = document.querySelector('#btn-sample');
const btnApply = document.querySelector('#btn-apply');
const chipsEl = document.querySelector('#effect-chips');
const intensity = document.querySelector('#intensity');
const intensityValue = document.querySelector('#intensity-value');
const imageMeta = document.querySelector('#image-meta');
const tabBody = document.querySelector('#tab-body');
const tabsEl = document.querySelector('#tabs');
const boundaryPill = document.querySelector('#boundary-pill');

const state = {
  original: null, // ImageData of the loaded image
  effectId: 'contrast',
  intensity: 1.2,
  lastRequest: null,
  lastResponse: null,
};

const MAX_SIDE = 720;

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  await loadEffectCatalog();
  renderChips();
  setupListeners();
  loadSample();
}

async function loadEffectCatalog() {
  try {
    const effects = await api('/api/effects');
    if (Array.isArray(effects) && effects.length) {
      // Server catalog wins; sync intensities from it where present.
      for (const e of effects) {
        const local = getEffect(e.id);
        if (local && e.defaultIntensity != null) local.defaultIntensity = e.defaultIntensity;
      }
    }
  } catch {
    // offline: client catalog is already loaded
  }
}

function setupListeners() {
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.effectId = chip.dataset.id;
    renderChips();
    const def = getEffect(state.effectId);
    syncIntensity(def.defaultIntensity);
    renderPreview();
  });

  intensity.addEventListener('input', () => {
    const def = getEffect(state.effectId);
    const t = Number(intensity.value) / 100;
    state.intensity = def.minIntensity + t * (def.maxIntensity - def.minIntensity);
    intensityValue.textContent = state.intensity.toFixed(2);
    renderPreview();
  });

  btnUpload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) loadFile(file);
  });

  btnSample.addEventListener('click', loadSample);
  btnApply.addEventListener('click', applyAndInspect);

  // Drag & drop
  ['dragenter', 'dragover'].forEach((ev) =>
    viewport.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragging');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) => viewport.addEventListener(ev, (e) => e.preventDefault()));
  viewport.addEventListener('drop', (e) => {
    dropzone.classList.remove('is-dragging');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  // Before/after slider
  baRange.addEventListener('input', () => setSplit(Number(baRange.value)));

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    renderTab(tab.dataset.tab);
  });
}

function syncIntensity(value) {
  const def = getEffect(state.effectId);
  const t = (clampValue(value, def.minIntensity, def.maxIntensity) - def.minIntensity) / (def.maxIntensity - def.minIntensity);
  intensity.value = Math.round(t * 100);
  state.intensity = def.minIntensity + t * (def.maxIntensity - def.minIntensity);
  intensityValue.textContent = state.intensity.toFixed(2);
}

function clampValue(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function renderChips() {
  chipsEl.innerHTML = EFFECTS.map(
    (e) => `<button class="chip ${e.id === state.effectId ? 'is-active' : ''}" data-id="${e.id}" type="button">${e.name}</button>`,
  ).join('');
}

// ── Image loading ───────────────────────────────────────────────────────────

function loadSample() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  drawProceduralSample(canvas);
  ingestCanvas(canvas, 'Sample image · 96×96');
}

function drawProceduralSample(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#3460c4');
  grad.addColorStop(1, '#e08a3c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ff9640';
  ctx.beginPath();
  ctx.arc(w * 0.42, h * 0.45, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#78c8ff';
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.62, w * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffe8c0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.stroke();
}

function loadFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      ingestCanvas(canvas, `${img.width}×${img.height} → ${canvas.width}×${canvas.height}`);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function ingestCanvas(canvas, label) {
  const ctx = canvas.getContext('2d');
  state.original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.lastRequest = null;
  state.lastResponse = null;
  imageMeta.textContent = label;
  dropzone.hidden = true;
  beforeAfter.hidden = false;
  renderPreview();
  tabBody.innerHTML = '<div class="placeholder">Apply an effect to capture the API call.</div>';
  resetInspectorTab();
}

function setSplit(pct) {
  const v = `${pct}%`;
  baImage.style.setProperty('--ba', v);
  baDivider.style.left = v;
}

// ── Preview ─────────────────────────────────────────────────────────────────

function renderPreview() {
  if (!state.original) return;
  const before = state.original;
  const after = applyEffect(before, state.effectId, state.intensity);
  const beforeUrl = imageDataToUrl(before);
  const afterUrl = imageDataToUrl(after);

  baImage.style.backgroundImage = `url(${beforeUrl})`;
  baImage.classList.add('has-after');
  baImage.style.setProperty('--after-image', `url(${afterUrl})`);
  setSplit(Number(baRange.value) || 50);
}

function imageDataToUrl(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ── Inspector ───────────────────────────────────────────────────────────────

async function applyAndInspect() {
  if (!state.original) {
    toast('Load an image first');
    return;
  }
  btnApply.disabled = true;
  btnApply.textContent = 'Processing…';

  const request = {
    effect: state.effectId,
    intensity: Number(state.intensity.toFixed(2)),
    width: state.original.width,
    height: state.original.height,
  };

  try {
    const response = await api('/api/process', { method: 'POST', body: JSON.stringify(request) });
    state.lastRequest = request;
    state.lastResponse = response;
    boundaryPill.textContent = response.processedLocally ? 'Local kernel · offline' : 'YouCamApiProvider';
    renderTab('response');
    toast('Inspector updated');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btnApply.disabled = false;
    btnApply.textContent = 'Apply & inspect';
  }
}

function resetInspectorTab() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === 'request'));
}

function renderTab(tab) {
  if (tab === 'request') {
    if (!state.lastRequest) {
      tabBody.innerHTML = '<div class="placeholder">Apply an effect to capture the API call.</div>';
      return;
    }
    tabBody.innerHTML = `
      <div class="codeblock">${requestHtml(state.lastRequest)}</div>
      <div class="boundary-note">
        This payload is what a real <code>YouCamApiProvider</code> call would
        send. In this build the local kernel handles the pixels and the server
        mirrors the response shape.
      </div>`;
    return;
  }

  if (tab === 'response') {
    if (!state.lastResponse) {
      tabBody.innerHTML = '<div class="placeholder">Apply an effect to capture the API call.</div>';
      return;
    }
    const r = state.lastResponse;
    const s = r.statistics;
    tabBody.innerHTML = `
      <div class="stats-grid">
        <div class="stat"><div class="stat-value">${r.jobId}</div><div class="stat-label">Job id</div></div>
        <div class="stat"><div class="stat-value">${r.status}</div><div class="stat-label">Status</div></div>
        <div class="stat"><div class="stat-value">${r.source.pixels.toLocaleString()}</div><div class="stat-label">Pixels processed</div></div>
        <div class="stat"><div class="stat-value">${s.delta.toFixed(2)}</div><div class="stat-label">Mean RGB shift</div></div>
        <div class="stat"><div class="stat-value">${Math.round(s.before.meanR)}→${Math.round(s.after.meanR)}</div><div class="stat-label">Mean R</div></div>
        <div class="stat"><div class="stat-value">${Math.round(s.before.meanG)}→${Math.round(s.after.meanG)}</div><div class="stat-label">Mean G</div></div>
      </div>
      <div class="codeblock">${responseHtml(r)}</div>
      ${r.processedLocally ? '<div class="boundary-note">Response computed by the local deterministic kernel. Swap <code>YouCamApiProvider</code> for the real endpoint to process in the cloud.</div>' : ''}
    `;
    return;
  }

  // pipeline tab
  if (state.lastResponse) {
    tabBody.innerHTML = `
      <ul class="step-list">
        ${state.lastResponse.steps.map((s) => `<li>${s}</li>`).join('')}
      </ul>
      <div class="boundary-note">The pipeline trace shows exactly what the kernel did, in order, on this machine.</div>`;
  } else {
    tabBody.innerHTML = '<div class="placeholder">Apply an effect to capture the API call.</div>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function requestHtml(req) {
  return `POST /api/process\n${escapeHtml(JSON.stringify(req, null, 2))}`;
}

function responseHtml(res) {
  return escapeHtml(JSON.stringify(res, null, 2));
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
  }, 3200);
}

boot();

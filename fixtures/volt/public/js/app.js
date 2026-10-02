import { api } from './api.js';
import { drawDayChart } from './charts.js';

const els = {
  load: document.querySelector('#st-load'),
  solar: document.querySelector('#st-solar'),
  soc: document.querySelector('#st-soc'),
  grid: document.querySelector('#st-grid'),
  tariff: document.querySelector('#st-tariff'),
  chart: document.querySelector('#chart-day'),
  playhead: document.querySelector('#playhead'),
  compare: document.querySelector('#compare'),
  recList: document.querySelector('#rec-list'),
  savings: document.querySelector('#savings-value'),
  savingsSub: document.querySelector('#savings-sub'),
  run: document.querySelector('#btn-run'),
};

const state = {
  system: null,
  result: null,
  virtualMs: 0,
  raf: 0,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOP_MS = 26000; // a full virtual day every 26s

function controlsFromDom() {
  return {
    evShift: document.querySelector('#ctl-ev').checked,
    batteryDispatch: document.querySelector('#ctl-battery').checked,
    hvacTrim: document.querySelector('#ctl-hvac').checked,
    tariffSwitch: document.querySelector('#ctl-tariff').checked,
  };
}

async function boot() {
  try {
    state.system = await api('/api/system');
    document.querySelectorAll('#ctl-ev, #ctl-battery, #ctl-hvac, #ctl-tariff').forEach((el) => {
      el.addEventListener('change', () => runOptimize());
    });
    els.run.addEventListener('click', runOptimize);
    await runOptimize();
    animate();
  } catch (err) {
    console.error(err);
  }
}

async function runOptimize() {
  els.run.disabled = true;
  els.run.textContent = 'Modeling…';
  try {
    const controls = controlsFromDom();
    state.result = await api('/api/optimize', { method: 'POST', body: JSON.stringify(controls) });
    renderStatic();
    renderLive(0);
  } catch (err) {
    console.error(err);
  } finally {
    els.run.disabled = false;
    els.run.textContent = 'Run optimization';
  }
}

// ── Static rendering ─────────────────────────────────────────────────────────

function renderStatic() {
  const r = state.result;
  const fmtKwh = (v) => `${v.toFixed(1)} kWh`;
  const fmtCost = (v) => `$${v.toFixed(2)}`;

  document.querySelector('#cmp-asis-load').textContent = fmtKwh(r.asIs.loadKwh);
  document.querySelector('#cmp-asis-import').textContent = fmtKwh(r.asIs.gridImportKwh);
  document.querySelector('#cmp-asis-cost').textContent = fmtCost(r.asIs.cost);
  document.querySelector('#cmp-asis-peak').textContent = `${r.asIs.peakImportKw.toFixed(2)} kW`;
  document.querySelector('#cmp-opt-load').textContent = fmtKwh(r.optimized.loadKwh);
  document.querySelector('#cmp-opt-import').textContent = fmtKwh(r.optimized.gridImportKwh);
  document.querySelector('#cmp-opt-cost').textContent = fmtCost(r.optimized.cost);
  document.querySelector('#cmp-opt-peak').textContent = `${r.optimized.peakImportKw.toFixed(2)} kW`;

  els.savings.textContent = `$${r.estimatedDailySavings.toFixed(2)}`;
  els.savingsSub.textContent = `${r.note}`;

  renderRecommendations(r.recommendations);
}

function renderRecommendations(recs) {
  els.recList.innerHTML = recs
    .map(
      (rec) => `
      <div class="rec">
        <div class="rec-head">
          <span class="rec-title">${rec.title}</span>
          <span class="rec-band rec-band--${rec.band}">${rec.band}</span>
        </div>
        <div class="rec-detail">${rec.detail}</div>
        <div class="rec-est">est. $${rec.estDaily.toFixed(2)}/day</div>
      </div>`,
    )
    .join('');
}

// ── Live animation ───────────────────────────────────────────────────────────

function animate() {
  const r = state.result;
  if (r) {
    state.virtualMs = (state.virtualMs + 16 * (DAY_MS / LOOP_MS)) % DAY_MS;
    renderLive(state.virtualMs);
  }
  state.raf = requestAnimationFrame(animate);
}

function renderLive(nowMs) {
  const r = state.result;
  if (!r || !r.points.length) return;

  const points = r.points;
  const interval = 900000; // 15 min
  const idx = Math.min(points.length - 2, Math.max(0, Math.floor(nowMs / interval)));
  const f = (nowMs - idx * interval) / interval;

  const a = points[idx];
  const b = points[Math.min(idx + 1, points.length - 1)];
  const lerp = (x, y) => x + (y - x) * f;
  const netA = r.optimizedNet[idx];
  const netB = r.optimizedNet[Math.min(idx + 1, r.optimizedNet.length - 1)];
  const socA = r.optimizedSoc[idx];
  const socB = r.optimizedSoc[Math.min(idx + 1, r.optimizedSoc.length - 1)];

  const load = lerp(a.loadKw, b.loadKw);
  const solar = lerp(a.solarKw, b.solarKw);
  const net = lerp(netA, netB);
  const soc = r.controls.batteryDispatch ? lerp(socA, socB) : null;
  const price = lerp(a.price, b.price);

  els.load.textContent = load.toFixed(2);
  els.solar.textContent = solar.toFixed(2);
  els.grid.textContent = net > 0 ? net.toFixed(2) : `${Math.abs(net).toFixed(2)}`;
  els.grid.classList.toggle('live', net > 0);
  els.soc.textContent = soc == null ? '—' : `${Math.round(soc * 100)}`;
  els.tariff.textContent = price.toFixed(2);
  els.tariff.style.color = price > 0.25 ? 'var(--danger)' : 'var(--text)';

  const pct = (nowMs / DAY_MS) * 100;
  els.playhead.style.left = `calc(${44}px + (100% - 56px) * ${pct / 100})`;

  drawDayChart(els.chart, {
    points,
    netOptimized: r.optimizedNet,
    socOptimized: r.controls.batteryDispatch ? r.optimizedSoc : null,
    yMax: Math.max(7, ...r.points.map((p) => p.loadKw)),
  });
}

boot();

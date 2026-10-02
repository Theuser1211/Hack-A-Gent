import { api } from './api.js';
import { drawWaveform } from './waveform.js';

const select = document.querySelector('#call-select');
const contextEl = document.querySelector('#call-context');
const durationEl = document.querySelector('#call-duration');
const stateEl = document.querySelector('#call-state');
const startBtn = document.querySelector('#btn-start');
const replayBtn = document.querySelector('#btn-replay');
const transcriptEl = document.querySelector('#transcript');
const waveformCanvas = document.querySelector('#waveform');
const tabsEl = document.querySelector('#tabs');
const tabBody = document.querySelector('#tab-body');
const boundaryPill = document.querySelector('#boundary-pill');
const pipeSteps = Array.from(document.querySelectorAll('.pipe-step'));

const state = {
  calls: [],
  call: null,
  waveform: [],
  analysis: null,
  playing: false,
  startedAt: 0,
  playedMs: 0,
  speed: 4,
  raf: 0,
};

const fmtMs = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  try {
    const calls = await api('/api/calls');
    state.calls = calls;
    for (const c of calls) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.title}  ·  ${c.turns} turns · ${fmtMs(c.durationMs)}`;
      select.append(opt);
    }
    select.addEventListener('change', () => loadCall(select.value));
    startBtn.addEventListener('click', () => {
      if (state.playing) stopPlayback();
      else play();
    });
    replayBtn.addEventListener('click', () => {
      resetPlayback();
      play();
    });
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.speed = Number(btn.dataset.speed);
        document.querySelectorAll('.speed-btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      });
    });
    tabsEl.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      renderTab(tab.dataset.tab);
    });

    await loadCall(calls[0]?.id || '');
  } catch (err) {
    setCallState('Error', true);
    console.error(err);
  }
}

async function loadCall(id) {
  if (!id) return;
  resetPlayback();
  const data = await api(`/api/call/${id}`);
  state.call = data.call;
  state.waveform = data.waveform;
  state.analysis = null;
  boundaryPill.textContent = 'Local pipeline';
  boundaryPill.classList.add('pill--dark');
  contextEl.textContent = data.call.context;
  durationEl.textContent = `00:00 / ${fmtMs(data.call.durationMs)}`;
  setCallState('Ready');
  replayBtn.disabled = true;
  renderTranscript(0);
  tabBody.innerHTML = '<div class="placeholder">Run a call to generate the intelligence panel.</div>';
  resetPipes();
  drawWaveform(waveformCanvas, state.waveform, 0);
}

// ── Playback ────────────────────────────────────────────────────────────────

function play() {
  if (!state.call) return;
  state.playing = true;
  state.startedAt = performance.now() - state.playedMs * state.speed;
  startBtn.textContent = 'Pause';
  replayBtn.disabled = true;
  setPipe(0, 'is-active');
  loop();
}

function loop() {
  if (!state.playing) return;
  const now = performance.now();
  const elapsed = (now - state.startedAt) * state.speed;
  state.playedMs = Math.min(elapsed, state.call.durationMs);
  const progress = state.call.durationMs ? state.playedMs / state.call.durationMs : 0;

  durationEl.textContent = `${fmtMs(state.playedMs)} / ${fmtMs(state.call.durationMs)}`;
  setCallState('Live', true);
  renderTranscript(state.playedMs);
  drawWaveform(waveformCanvas, state.waveform, state.playedMs);

  if (progress < 0.35) setPipe(1, 'is-active');
  if (progress >= 0.35) { setPipe(1, 'is-done'); setPipe(2, 'is-active'); }

  if (state.playedMs >= state.call.durationMs) {
    finish();
    return;
  }
  state.raf = requestAnimationFrame(loop);
}

function finish() {
  stopPlayback();
  setPipe(2, 'is-done');
  setPipe(3, 'is-active');
  setCallState('Complete', false, true);
  startBtn.textContent = 'Start call';
  replayBtn.disabled = false;
  void runAnalysis();
}

function stopPlayback() {
  state.playing = false;
  cancelAnimationFrame(state.raf);
  startBtn.textContent = 'Resume';
}

function resetPlayback() {
  stopPlayback();
  state.playedMs = 0;
  durationEl.textContent = state.call ? `00:00 / ${fmtMs(state.call.durationMs)}` : '00:00 / 00:00';
  setCallState('Ready');
  startBtn.textContent = 'Start call';
  replayBtn.disabled = true;
  renderTranscript(0);
  drawWaveform(waveformCanvas, state.waveform, 0);
  resetPipes();
}

function setCallState(text, live = false, done = false) {
  stateEl.textContent = text;
  stateEl.classList.toggle('is-live', live);
  stateEl.classList.toggle('is-done', done);
}

// ── Transcript rendering ────────────────────────────────────────────────────

function renderTranscript(untilMs) {
  if (!state.call) return;
  const call = state.call;
  let html = '';
  for (const turn of call.turns) {
    if (turn.words.length === 0) continue;
    const first = turn.words[0];
    if (first.atMs > untilMs) break;

    const isLive = state.playing && turn.words.some((w) => w.atMs <= untilMs && w.atMs + w.durationMs >= untilMs);
    const cls = turn.speaker === 'Agent' ? 'agent' : 'customer';

    const shownWords = turn.words.filter((w) => w.atMs <= untilMs);
    const wordHtml = shownWords
      .map((w) => {
        const spoken = w.atMs + w.durationMs <= untilMs;
        return `<span class="w ${spoken ? 'is-old' : 'is-new'}">${escapeHtml(w.text)}</span>`;
      })
      .join('');

    html += `
      <div class="turn">
        <div class="turn-speaker ${cls}">${turn.speaker}${isLive ? ' ·' : ''}</div>
        <div class="turn-body">${wordHtml}</div>
      </div>`;
  }
  transcriptEl.innerHTML = html || '<div class="transcript-empty">Press <strong>Start call</strong> to run the live transcript.</div>';
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

// ── Analysis ────────────────────────────────────────────────────────────────

async function runAnalysis() {
  const data = await api('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ callId: state.call.id }),
  });
  state.analysis = data;
  boundaryPill.textContent = 'Local pipeline · offline';
  setPipe(3, 'is-done');
  renderTab('overview');
}

function renderTab(tab) {
  const a = state.analysis;
  if (!a) {
    tabBody.innerHTML = '<div class="placeholder">Run a call to generate the intelligence panel.</div>';
    return;
  }

  if (tab === 'overview') {
    const m = a.metrics;
    tabBody.innerHTML = `
      <div class="summary-box">${a.summary}</div>
      <div class="metric-grid">
        <div class="metric"><div class="metric-value">${a.sentiment.label}</div><div class="metric-label">Sentiment</div></div>
        <div class="metric"><div class="metric-value">${a.topics[0]?.topic ?? '—'}</div><div class="metric-label">Top topic</div></div>
        <div class="metric"><div class="metric-value">${a.actionItems.length}</div><div class="metric-label">Action items</div></div>
        <div class="metric"><div class="metric-value">${m.wordCount}</div><div class="metric-label">Words</div></div>
        <div class="metric"><div class="metric-value">${Math.round(m.talkTimeAgentMs / 1000)}s</div><div class="metric-label">Agent talk</div></div>
        <div class="metric"><div class="metric-value">${Math.round(m.talkTimeCustomerMs / 1000)}s</div><div class="metric-label">Customer talk</div></div>
        <div class="metric"><div class="metric-value">${m.interjections}</div><div class="metric-label">Interjections</div></div>
        <div class="metric"><div class="metric-value">${Math.round(m.avgResponseDelayMs / 1000)}s</div><div class="metric-label">Avg response</div></div>
      </div>
      ${boundaryNote()}
    `;
  } else if (tab === 'sentiment') {
    const s = a.sentiment;
    const scorePct = Math.round(((s.score + 1) / 2) * 100);
    const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;
    tabBody.innerHTML = `
      <div class="gauge-row">
        <div class="gauge-label"><span>Positive score</span><span>${scorePct}%</span></div>
        <div class="gauge-track"><div class="gauge-fill" style="width:${scorePct}%"></div></div>
      </div>
      <div class="gauge-row">
        <div class="gauge-label"><span>Confidence</span><span>${pct(Math.round(s.confidence * 100))}</span></div>
        <div class="gauge-track"><div class="gauge-fill" style="width:${pct(Math.round(s.confidence * 100))}"></div></div>
      </div>
      <div style="height:14px"></div>
      <h3 style="font-size:13px;margin:0 0 10px;">Detected topics</h3>
      ${a.topics
        .map(
          (t) => `
        <div class="topic-row">
          <div class="topic-name">${t.topic}</div>
          <div class="topic-track"><div class="topic-fill" style="width:${t.weight}%"></div></div>
          <div class="topic-pct">${t.weight}%</div>
        </div>`,
        )
        .join('')}
      ${boundaryNote()}
    `;
  } else if (tab === 'actions') {
    const items = a.actionItems.length
      ? a.actionItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
      : '<li>No action items detected</li>';
    tabBody.innerHTML = `<ul class="action-list">${items}</ul>${boundaryNote()}`;
  } else {
    const turns = state.call.turns
      .map((t) => {
        const cls = t.speaker === 'Agent' ? 'agent' : 'customer';
        const text = t.words.map((w) => w.text).join(' ');
        return `<div class="vturn"><div class="vturn-head ${cls}">${t.speaker} · ${fmtMs(t.startMs)}</div><div class="vturn-body">${escapeHtml(text)}</div></div>`;
      })
      .join('');
    tabBody.innerHTML = `<div class="verbose-transcript">${turns}</div>`;
  }
}

function boundaryNote() {
  return `
    <div class="boundary-note">
      <strong>API integration boundary.</strong> Analysis runs through the typed
      <code>CalleyApiProvider</code> interface. In this build it uses the local
      deterministic engine on prepared dialogue — swap in the real Call-E
      provider to process live audio and speech-to-text in the same pipeline.
    </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Pipeline strip ──────────────────────────────────────────────────────────

function setPipe(index, cls) {
  const el = pipeSteps[index];
  if (!el) return;
  pipeSteps.forEach((p) => p.classList.remove('is-active'));
  if (cls === 'is-done') {
    el.classList.add('is-done');
    const next = pipeSteps[index + 1];
    if (next) next.classList.add('is-active');
  } else {
    el.classList.add(cls);
  }
}

function resetPipes() {
  pipeSteps.forEach((p) => p.classList.remove('is-active', 'is-done'));
  pipeSteps[0]?.classList.add('is-active');
}

boot();

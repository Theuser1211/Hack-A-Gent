export function drawWaveform(canvas, frames, playedMs, opts = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const pad = 8;

  canvas.width = Math.max(100, Math.floor(w * dpr));
  canvas.height = Math.max(100, Math.floor(h * dpr));
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  if (!frames.length) return;

  const n = frames.length;
  const barW = Math.max(1, Math.floor(w / n));
  const mid = h / 2;
  const maxAmp = h / 2 - pad;

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    if (!frame) continue;
    const played = frame.atMs <= playedMs;
    const amp = Math.max(1, Math.round(frame.level * maxAmp));

    const x = (i / n) * w;
    const y = mid - amp;

    if (played) {
      const t = i / n;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#37d6ff');
      grad.addColorStop(1, '#7c6cff');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = 'rgba(139, 147, 167, 0.28)';
    }
    ctx.fillRect(x, y, barW - 1, amp * 2);
  }

  // Playhead cursor
  const cursorX = (playedMs / (frames[n - 1]?.atMs || 1)) * w;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(cursorX - 1, 0, 2, h);
}

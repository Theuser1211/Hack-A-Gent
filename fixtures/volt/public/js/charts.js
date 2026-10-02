// Canvas-based 24-hour curves: load, solar, optimized net grid, battery SOC.

export function drawDayChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(100, Math.floor(w * dpr));
  canvas.height = Math.max(100, Math.floor(h * dpr));
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const padL = 44;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const xs = (i) => padL + (i / (data.points.length - 1)) * plotW;
  const ys = (v) => padT + plotH - (v / data.yMax) * plotH;

  // Grid
  ctx.strokeStyle = 'rgba(139, 174, 156, 0.12)';
  ctx.fillStyle = '#8fae9c';
  ctx.font = '11px Cascadia Code, Consolas, monospace';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH / 4) * g;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    const v = data.yMax * (1 - g / 4);
    ctx.fillText(v.toFixed(1), 6, y + 4);
  }
  for (let hh = 0; hh <= 6; hh++) {
    const i = Math.round((hh / 6) * (data.points.length - 1));
    const x = xs(i);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillText(String(hh * 4).padStart(2, '0') + 'h', x - 12, h - 8);
  }

  const line = (values, color, width = 2) => {
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xs(i);
      const y = ys(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const fill = (values, color, base) => {
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = xs(i);
      const y = ys(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(xs(values.length - 1), ys(base));
    ctx.lineTo(xs(0), ys(base));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  fill(data.points.map((p) => p.solarKw), '#ffcf5c', 0);
  fill(data.points.map((p) => p.loadKw), '#37d687', 0);
  line(data.points.map((p) => p.loadKw), '#37d687', 2);
  line(data.points.map((p) => p.solarKw), '#ffcf5c', 2);
  if (data.netOptimized) line(data.netOptimized, '#5c9dff', 2);
  if (data.socOptimized) line(data.socOptimized.map((s) => s * data.yMax), '#ff8fc7', 1.5);
}

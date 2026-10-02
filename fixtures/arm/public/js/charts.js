/** Simple chart utilities for the benchmark dashboard. */

export function createSpeedupChart(container, runs) {
  container.innerHTML = '';
  const maxSpeedup = Math.max(...runs.map(r => r.speedupX), 1);
  const scale = 180 / maxSpeedup;

  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Speedup comparison: baseline vs optimized');

  for (const r of runs) {
    const group = document.createElement('div');
    group.className = 'chart-bar-group';

    const baselineWrap = document.createElement('div');
    baselineWrap.className = 'chart-bar-wrap';
    const baselineBar = document.createElement('div');
    baselineBar.className = 'chart-bar chart-bar--baseline';
    baselineBar.style.height = `${Math.max(100 / maxSpeedup, 8)}%`;
    baselineWrap.append(baselineBar);

    const optimizedWrap = document.createElement('div');
    optimizedWrap.className = 'chart-bar-wrap';
    const optimizedBar = document.createElement('div');
    optimizedBar.className = 'chart-bar chart-bar--optimized';
    optimizedBar.style.height = `${Math.max(r.speedupX * scale, 8)}%`;
    optimizedWrap.append(optimizedBar);

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = r.name;

    const baselineVal = document.createElement('span');
    baselineVal.className = 'chart-value';
    baselineVal.textContent = '1.00x';

    const optimizedVal = document.createElement('span');
    optimizedVal.className = 'chart-value';
    optimizedVal.style.color = r.speedupX >= 1 ? 'var(--accent)' : 'var(--warn)';
    optimizedVal.textContent = `${r.speedupX.toFixed(2)}x`;

    group.append(baselineWrap, optimizedWrap, label, baselineVal, optimizedVal);
    chart.append(group);
  }

  container.append(chart);
}

export function createThroughputChart(container, runs) {
  container.innerHTML = '';
  const maxItSec = Math.max(
    ...runs.flatMap(r => [r.baseline.iterationsPerSecond, r.optimized.iterationsPerSecond]),
    1
  );

  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Iterations per second comparison');

  for (const r of runs) {
    const group = document.createElement('div');
    group.className = 'chart-bar-group';

    const bWrap = document.createElement('div');
    bWrap.className = 'chart-bar-wrap';
    const bBar = document.createElement('div');
    bBar.className = 'chart-bar chart-bar--baseline';
    bBar.style.height = `${Math.max((r.baseline.iterationsPerSecond / maxItSec) * 100, 4)}%`;
    bWrap.append(bBar);

    const oWrap = document.createElement('div');
    oWrap.className = 'chart-bar-wrap';
    const oBar = document.createElement('div');
    oBar.className = 'chart-bar chart-bar--optimized';
    oBar.style.height = `${Math.max((r.optimized.iterationsPerSecond / maxItSec) * 100, 4)}%`;
    oWrap.append(oBar);

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = r.name;

    const bVal = document.createElement('span');
    bVal.className = 'chart-value';
    bVal.textContent = fmtNumber(r.baseline.iterationsPerSecond);

    const oVal = document.createElement('span');
    oVal.className = 'chart-value';
    oVal.style.color = 'var(--accent)';
    oVal.textContent = fmtNumber(r.optimized.iterationsPerSecond);

    group.append(bWrap, oWrap, label, bVal, oVal);
    chart.append(group);
  }

  container.append(chart);
}

export function createRssChart(container, runs) {
  container.innerHTML = '';
  const maxRss = Math.max(
    ...runs.flatMap(r => [r.baseline.peakRssMb, r.optimized.peakRssMb]),
    1
  );

  const chart = document.createElement('div');
  chart.className = 'chart';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Peak RSS memory comparison');

  for (const r of runs) {
    const group = document.createElement('div');
    group.className = 'chart-bar-group';

    const bWrap = document.createElement('div');
    bWrap.className = 'chart-bar-wrap';
    const bBar = document.createElement('div');
    bBar.className = 'chart-bar chart-bar--baseline';
    bBar.style.height = `${Math.max((r.baseline.peakRssMb / maxRss) * 100, 4)}%`;
    bWrap.append(bBar);

    const oWrap = document.createElement('div');
    oWrap.className = 'chart-bar-wrap';
    const oBar = document.createElement('div');
    oBar.className = 'chart-bar chart-bar--optimized';
    oBar.style.height = `${Math.max((r.optimized.peakRssMb / maxRss) * 100, 4)}%`;
    oWrap.append(oBar);

    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = r.name;

    const bVal = document.createElement('span');
    bVal.className = 'chart-value';
    bVal.textContent = `${r.baseline.peakRssMb} MB`;

    const oVal = document.createElement('span');
    oVal.className = 'chart-value';
    oVal.style.color = r.optimized.peakRssMb <= r.baseline.peakRssMb ? 'var(--accent)' : 'var(--warn)';
    oVal.textContent = `${r.optimized.peakRssMb} MB`;

    group.append(bWrap, oWrap, label, bVal, oVal);
    chart.append(group);
  }

  container.append(chart);
}

function fmtNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}
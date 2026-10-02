import { CONFIG, buildDay, pricePerMin } from './telemetry.js';
import { runOptimization } from './optimizer.js';
import type { OptimizationControls, TelemetryPoint, DayTotals } from './types.js';

function bar(chars: string[], max: number): void {
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c.trim() === '') continue;
    console.log('  ' + c);
  }
}

export function asciiCurve(points: TelemetryPoint[], key: 'loadKw' | 'solarKw', height = 12): void {
  const max = Math.max(...points.map((p) => p[key]));
  const rows: string[][] = [];
  for (let r = 0; r < height; r++) {
    const row: string[] = ['  '];
    const threshold = max * (1 - (r + 0.5) / height);
    for (const p of points) {
      row.push(p[key] >= threshold ? '█' : ' ');
    }
    rows.push(row);
  }
  for (const row of rows) console.log(row.join(''));
  console.log(`  ${'─'.repeat(points.length + 2)}  0h → 24h (max ${max.toFixed(1)} kW)`);
}

function money(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function printCliReport(): void {
  const controls: OptimizationControls = { evShift: true, batteryDispatch: true, hvacTrim: true, tariffSwitch: false };
  const result = runOptimization(controls);
  const asIsPoints = buildDay({ evShift: false, hvacTrim: false }, 'default');

  console.log();
  console.log('  Voltwork — energy optimization workbench');
  console.log(`  ${CONFIG.label}`);
  console.log('  Data: labeled sample profile · 15-min resolution · 24h');
  console.log();

  console.log('  ██ Load (kW)');
  asciiCurve(asIsPoints, 'loadKw', 10);
  console.log();
  console.log('  ██ Solar (kW)');
  asciiCurve(asIsPoints, 'solarKw', 8);
  console.log();

  const fmt = (t: DayTotals) =>
    `    load ${t.loadKwh.toFixed(1)} kWh · solar ${t.solarKwh.toFixed(1)} kWh · import ${t.gridImportKwh.toFixed(1)} kWh · cost ${money(t.cost)}`;

  console.log('  As-is today');
  console.log(fmt(result.asIs));
  console.log(`    peak import ${result.asIs.peakImportKw.toFixed(2)} kW · self-consumption ${result.asIs.selfCoveredPct}%`);
  console.log();
  console.log('  Optimized (EV shift + battery dispatch + HVAC trim)');
  console.log(fmt(result.optimized));
  console.log(`    peak import ${result.optimized.peakImportKw.toFixed(2)} kW · self-consumption ${result.optimized.selfCoveredPct}%`);
  console.log();

  console.log('  Recommendations');
  for (const r of result.recommendations) {
    console.log(`    • ${r.title} — est. ${money(r.estDaily)}/day`);
    console.log(`      ${r.detail}`);
  }
  console.log();
  console.log(`  Estimated daily savings  ${money(result.estimatedDailySavings)}`);
  console.log(`  Estimated annual savings ${money(result.estimatedAnnualSavings)}`);
  console.log(`  ${result.note}`);
  console.log();
  console.log('  Tip: npm start -- --serve  opens the interactive dashboard.');
  console.log();
}

export function priceInfo(): string {
  return `tariff (default) peak $0.32 · mid $0.16 · off-peak $0.08`;
}

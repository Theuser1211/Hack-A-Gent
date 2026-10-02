import type { TelemetryPoint, SystemConfig, DayTotals } from './types.js';

export const CONFIG: SystemConfig = {
  batteryKwh: 10,
  maxChargeKw: 3.5,
  maxDischargeKw: 3.5,
  evChargeKw: 6,
  evDefaultStart: 18 * 60, // 18:00
  evDefaultEnd: 20 * 60, // 20:00
  evShiftedStart: 2 * 60, // 02:00
  evShiftedEnd: 4 * 60, // 04:00
  label: 'Sample home · 3-bed, EV + 4.5 kWp solar',
};

export const INTERVAL_MIN = 15; // 15-minute resolution
export const POINTS_PER_DAY = 1440 / INTERVAL_MIN; // 96

/**
 * Generate a synthetic-but-realistic 24-hour profile.
 *
 * IMPORTANT: this is clearly-labeled SAMPLE data for demonstration. It is a
 * modeled residential profile, not a recording from real hardware.
 */
export function pricePerMin(t: number, plan: 'default' | 'extended'): number {
  const h = t / 60;
  if (plan === 'extended') {
    if (h >= 22 || h < 6) return 0.07; // extended off-peak overnight
    if (h >= 11 && h < 15) return 0.07; // solar midday window
    if (h >= 16 && h < 20) return 0.34; // peak
    return 0.14;
  }
  if (h >= 16 && h < 20) return 0.32; // peak
  if ((h >= 7 && h < 16) || (h >= 20 && h < 22)) return 0.16; // mid
  return 0.08; // off-peak
}

function baseLoad(h: number): number {
  // Residential shape: overnight low, morning and evening peaks.
  const morning = 1.7 * Math.exp(-((h - 8) ** 2) / 3);
  const evening = 2.4 * Math.exp(-((h - 19) ** 2) / 4);
  const mid = 1.05 + 0.25 * Math.sin((h - 10) * (Math.PI / 12));
  return 0.55 + morning + evening + (mid - 0.8) * 0.4;
}

function solarGen(h: number): number {
  if (h < 6 || h > 20) return 0;
  const bell = Math.exp(-((h - 12.5) ** 2) / 8);
  return 4.5 * bell;
}

function applyEv(loads: number[], evStart: number, evEnd: number, evKw: number): void {
  for (let i = 0; i < loads.length; i++) {
    const t = i * INTERVAL_MIN;
    if (t >= evStart && t < evEnd) loads[i]! += evKw;
  }
}

function seededWobble(i: number): number {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  return (a - Math.floor(a)) - 0.5; // -0.5..0.5
}

export function buildDay(controls: { evShift: boolean; hvacTrim: boolean }, plan: 'default' | 'extended'): TelemetryPoint[] {
  const n = POINTS_PER_DAY;
  const loads: number[] = [];
  const points: TelemetryPoint[] = [];

  for (let i = 0; i < n; i++) {
    const t = i * INTERVAL_MIN;
    const h = t / 60;
    let load = baseLoad(h) + seededWobble(i) * 0.08;
    if (controls.hvacTrim && h >= 16 && h < 20) load *= 0.88;
    loads.push(load);
  }

  applyEv(loads, controls.evShift ? CONFIG.evShiftedStart : CONFIG.evDefaultStart, controls.evShift ? CONFIG.evShiftedEnd : CONFIG.evDefaultEnd, CONFIG.evChargeKw);

  for (let i = 0; i < n; i++) {
    const t = i * INTERVAL_MIN;
    const h = t / 60;
    points.push({
      t,
      loadKw: Number(loads[i]!.toFixed(3)),
      solarKw: Number(Math.max(0, solarGen(h) + seededWobble(i + 100) * 0.15).toFixed(3)),
      price: pricePerMin(t, plan),
    });
  }
  return points;
}

/**
 * Simulate a battery with a simple smart-dispatch rule: absorb solar surplus,
 * discharge toward evening peak. Returns net grid flow in kW for each interval
 * (positive = import, negative = export).
 */
export function batteryDispatch(points: TelemetryPoint[], socStart: number): { netKw: number[]; soc: number[] } {
  const n = points.length;
  const soc = new Array<number>(n);
  const net = new Array<number>(n);
  const hours = INTERVAL_MIN / 60;
  let level = socStart; // fraction 0..1

  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const h = p.t / 60;
    const surplus = p.solarKw - p.loadKw;

    let charge = 0;
    let discharge = 0;
    if (surplus > 0 && level < 1) {
      charge = Math.min(surplus, CONFIG.maxChargeKw, (CONFIG.batteryKwh * (1 - level)) / hours);
    } else if (h >= 16 && h < 21 && level > 0.05) {
      discharge = Math.min(CONFIG.maxDischargeKw, CONFIG.batteryKwh * level / hours);
    }

    level = Math.min(1, Math.max(0, level + (charge - discharge) / CONFIG.batteryKwh * hours));
    soc[i] = Number(level.toFixed(3));
    net[i] = Number((p.loadKw - p.solarKw - discharge + charge).toFixed(3));
  }
  return { netKw: net, soc };
}

export function totalsFromNet(netKw: number[], points: TelemetryPoint[], batteryActive: boolean): DayTotals {
  const hours = INTERVAL_MIN / 60;
  let loadKwh = 0;
  let solarKwh = 0;
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let cost = 0;
  let peakImportKw = 0;
  let solarUsed = 0;
  let solarTotal = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const net = netKw[i]!;
    loadKwh += p.loadKw * hours;
    solarKwh += p.solarKw * hours;
    solarTotal += p.solarKw * hours;
    if (net > 0) {
      gridImportKwh += net * hours;
      cost += net * hours * p.price;
      peakImportKw = Math.max(peakImportKw, net);
    } else {
      gridExportKwh += -net * hours;
    }
    solarUsed += Math.min(p.loadKw, p.solarKw) * hours;
  }

  return {
    loadKwh,
    solarKwh,
    gridImportKwh,
    gridExportKwh,
    cost,
    peakImportKw,
    selfCoveredPct: solarTotal > 0 ? Math.round((solarUsed / solarTotal) * 100) : 0,
  };
}

export function optimizeDay(controls: { evShift: boolean; batteryDispatch: boolean; hvacTrim: boolean; tariffSwitch: boolean }): {
  points: TelemetryPoint[];
  asIs: DayTotals;
  optimized: DayTotals;
  asIsNet: number[];
  optimizedNet: number[];
  asIsSoc: number[];
  optimizedSoc: number[];
} {
  const asIsPoints = buildDay({ evShift: false, hvacTrim: false }, 'default');
  const asIsNet = asIsPoints.map((p) => p.loadKw - p.solarKw);
  const asIs = totalsFromNet(asIsNet, asIsPoints, false);

  const optPoints = buildDay({ evShift: controls.evShift, hvacTrim: controls.hvacTrim }, controls.tariffSwitch ? 'extended' : 'default');
  let optNet: number[];
  let optSoc: number[];
  if (controls.batteryDispatch) {
    const dispatch = batteryDispatch(optPoints, 0.35);
    optNet = dispatch.netKw;
    optSoc = dispatch.soc;
  } else {
    optNet = optPoints.map((p) => p.loadKw - p.solarKw);
    optSoc = optPoints.map(() => 0);
  }
  const optimized = totalsFromNet(optNet, optPoints, controls.batteryDispatch);

  return { points: optPoints, asIs, optimized, asIsNet, optimizedNet: optNet, asIsSoc: asIsPoints.map(() => 0), optimizedSoc: optSoc };
}

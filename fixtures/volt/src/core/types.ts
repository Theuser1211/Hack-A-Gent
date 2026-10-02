// ── Shared types for the energy model ───────────────────────────────────────

export interface TelemetryPoint {
  /** minutes from midnight */
  t: number;
  /** household demand in kW (includes EV when charging) */
  loadKw: number;
  /** solar generation in kW */
  solarKw: number;
  /** retail tariff for this interval, $/kWh */
  price: number;
}

export interface SystemConfig {
  /** battery nameplate capacity, kWh */
  batteryKwh: number;
  /** max battery charge/discharge rate, kW */
  maxChargeKw: number;
  maxDischargeKw: number;
  /** EV charger draw when the car is charging, kW */
  evChargeKw: number;
  /** EV block [startMin, endMin] in the default schedule */
  evDefaultStart: number;
  evDefaultEnd: number;
  evShiftedStart: number;
  evShiftedEnd: number;
  label: string;
}

export interface DayTotals {
  loadKwh: number;
  solarKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  cost: number;
  peakImportKw: number;
  selfCoveredPct: number;
}

export interface OptimizationControls {
  evShift: boolean;
  batteryDispatch: boolean;
  hvacTrim: boolean;
  tariffSwitch: boolean;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  estDaily: number;
  band: 'impact' | 'cost' | 'comfort';
}

export interface OptimizationResult {
  asIs: DayTotals;
  optimized: DayTotals;
  controls: OptimizationControls;
  recommendations: Recommendation[];
  estimatedDailySavings: number;
  estimatedAnnualSavings: number;
  note: string;
}

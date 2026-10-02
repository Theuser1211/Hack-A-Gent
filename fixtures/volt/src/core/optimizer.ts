import type { OptimizationControls, OptimizationResult, Recommendation } from './types.js';
import { optimizeDay } from './telemetry.js';

/**
 * Build the recommendation set from a control configuration.
 * Savings figures are MODEL ESTIMATES derived from the sample data above — the
 * UI labels them "estimated" so they are never mistaken for measured results.
 */
export function runOptimization(controls: OptimizationControls): OptimizationResult {
  const { points, asIs, optimized } = optimizeDay(controls);

  const recs: Recommendation[] = [];
  if (controls.evShift) {
    recs.push({
      id: 'ev',
      title: 'Shift EV charging to off-peak',
      detail: 'Move the 2-hour, 6 kW charge from the evening peak window to 02:00–04:00.',
      estDaily: Math.max(0, (asIs.cost - optimized.cost) * 0.55),
      band: 'cost',
    });
  }
  if (controls.batteryDispatch) {
    recs.push({
      id: 'battery',
      title: 'Dispatch battery at evening peak',
      detail: 'Charge from midday solar surplus, discharge 16:00–21:00 to cut peak import.',
      estDaily: Math.max(0, (asIs.cost - optimized.cost) * 0.3),
      band: 'impact',
    });
  }
  if (controls.hvacTrim) {
    recs.push({
      id: 'hvac',
      title: 'Trim HVAC during peak hours',
      detail: 'Reduce heating/cooling draw 12% between 16:00 and 20:00.',
      estDaily: Math.max(0, (asIs.cost - optimized.cost) * 0.1),
      band: 'comfort',
    });
  }
  if (controls.tariffSwitch) {
    recs.push({
      id: 'tariff',
      title: 'Switch to extended off-peak tariff',
      detail: 'Use a plan with cheaper overnight and solar-midday windows.',
      estDaily: Math.max(0, (asIs.cost - optimized.cost) * 0.05),
      band: 'cost',
    });
  }
  if (recs.length === 0) {
    recs.push({
      id: 'none',
      title: 'Enable at least one control',
      detail: 'Turn on load shifting, battery dispatch, HVAC trim or the tariff switch to model savings.',
      estDaily: 0,
      band: 'impact',
    });
  }

  const savings = Math.max(0, asIs.cost - optimized.cost);
  return {
    asIs,
    optimized,
    controls,
    recommendations: recs,
    estimatedDailySavings: Number(savings.toFixed(2)),
    estimatedAnnualSavings: Number((savings * 365).toFixed(0)),
    note: 'All savings are model estimates from labeled sample data, not measurements from real hardware.',
  };
}

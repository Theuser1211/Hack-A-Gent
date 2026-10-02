# Voltwork — Energy Optimization Workbench

**Voltwork** is an energy/electrical optimization workbench built for **Volt
Hacks**. It models a 24-hour home-with-EV-and-solar day, shows live telemetry
curves, lets you toggle optimization controls (load shifting, battery dispatch,
HVAC trim, tariff switch), and reports **estimated** savings from a real local
cost model.

Everything is clearly labeled: the telemetry is **sample data** (a modeled
residential profile, not a recording from real hardware) and every savings
figure is a **model estimate**, not a measurement. No number in this app claims
to come from real hardware.

## What the product demonstrates

1. **Live system monitoring** — animated status cards (load, solar, battery SOC,
   grid flow, live tariff) driven by a virtual clock that sweeps a full day in
   about 26 seconds.
2. **Real curves, real math** — the dashboard plots the sample 24-hour load and
   solar profiles plus the optimized grid flow and battery SOC, all computed at
   15-minute resolution by the local scenario engine.
3. **A scenario engine** — four levers that genuinely reshape the day:
   - **EV shift** moves the 6 kW charge block from the evening peak to off-peak
     hours;
   - **Battery dispatch** stores midday solar surplus and discharges through the
     evening peak (a SOC model with charge/discharge limits);
   - **HVAC trim** cuts demand 12% during peak price hours;
   - **Tariff switch** applies an extended off-peak plan.
4. **Actionable recommendations** — ranked actions with per-item estimated
   savings so the plan is usable, not just a pretty chart.
5. **As-is vs optimized comparison** — side-by-side daily totals: load, grid
   import, cost, peak import.

## Run

```sh
npm install
npm run build
npm start        # CLI: energy report with ASCII curves + recommendations
npm start -- --serve   # interactive dashboard at http://127.0.0.1:8805
```

## Honesty & data labeling

- **Sample data** — the 24-hour load/solar/price profiles are modeled synthetic
  inputs generated in `src/core/telemetry.ts`. The UI and this README label
  them as sample data.
- **Estimates** — "estimated daily savings" is `as-is cost − optimized cost`
  over the sample day, computed locally. It is an estimate, clearly labeled, not
  a claim about any real building.
- **No hardware claims** — the app never presents synthetic numbers as
  measurements from real hardware.

## Architecture

```
src/
  core/
    types.ts       shared types (points, config, totals, controls)
    telemetry.ts   sample 24h load/solar/tariff profiles + battery SOC model
    optimizer.ts   scenario engine + recommendations
    report.ts      CLI formatting (ASCII curves, totals)
  cli.ts           terminal report
  server.ts        static + JSON API (/api/system, /api/optimize)
  index.ts         entry — CLI by default, --serve for the dashboard
public/
  index.html       dashboard shell
  styles.css       industrial dark theme
  js/app.js        status cards, playhead animation, controls, comparisons
  js/charts.js     canvas day-curve renderer
  js/api.js        fetch helper
```

## Design decisions

- **Zero runtime dependencies** — everything is hand-rolled TypeScript.
- **Deterministic** — the seeded profiles produce identical curves on every
  run, so the demo is reproducible.
- **Honest UI** — the persistent "Sample data · simulated" badge and the
  estimate notes keep the credibility intact without burying the product in
  disclaimers.
- **Live feel** — the virtual clock + playhead make the dashboard feel alive for
  a judging session without needing any real meter.

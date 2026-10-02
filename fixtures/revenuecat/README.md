# Lumen

**Lumen** is a subscription-powered focus companion: a calm, mobile-first app that
turns your day into a series of intentional focus sessions. It demonstrates why a
product team would adopt a subscription SDK like RevenueCat — not by repeating the
vendor's name in the UI, but by building the whole free/premium lifecycle on a
clean subscription abstraction.

## Product concept

- **Focus sessions** — timed, taggable deep-work blocks with a live countdown.
- **A weekly rhythm** — a 7-day chart and session history so users can see where
  their attention goes.
- **Free tier** — the timer and basic history are free, capped at 3 sessions/day.
- **Lumen Pro** — unlimited sessions, focus insights, cross-device sync and
  ambient themes, sold as a monthly or yearly subscription with a 7-day trial.

The product is fully runnable offline. All subscription state is served by a
deterministic, in-project store — **no real purchases ever occur**.

## User journey

1. **Onboarding** — a branded landing with two paths: *Continue as Ada* (free) or
   *Start 7-day free trial*.
2. **Dashboard** — summary stats, a working focus timer, week chart and recent
   sessions. Free users see Pro features locked with a clear upgrade path.
3. **Paywall** — monthly/yearly plans, best-value badge, trial call-to-action,
   restore-purchases link, and inline error handling.
4. **Insights** — Pro-only analytics: weekly pattern, streak, best day and
   generated observations.
5. **Account** — subscription status, cancellation, restore purchases, seeded
   payment method and invoices, and demo controls (reset store, simulate a
   declined payment).

## Free vs Pro boundary

| Feature | Free | Pro |
| --- | --- | --- |
| Focus timer | ✓ | ✓ |
| Session history | ✓ (3 sessions/day) | ✓ unlimited |
| Weekly chart | ✓ | ✓ |
| Focus insights | — | ✓ |
| Cross-device sync | — | ✓ |
| Ambient themes | — | ✓ |

The boundary is **data-driven**: a feature is available when the customer holds
its entitlement grant. Entitlements are defined once in
`src/subscription/entitlements.ts` and granted by products in
`src/subscription/products.ts`.

## Subscription architecture

```
src/subscription/
  types.ts          shared domain types (Product, Offering, Receipt, Customer…)
  products.ts       product catalog (monthly / yearly / trial intro offer)
  entitlements.ts   entitlement catalog + grant derivation + gating
  customer.ts       customer state + receipt lifecycle helpers
  mock-provider.ts  StoreProvider — deterministic local store (purchase/restore)
  purchases.ts      SubscriptionService — app-facing facade over the provider
  index.ts          re-exports
```

The key boundary: `StoreProvider` (`mock-provider.ts`) is a small interface
exposing `getOfferings`, `purchase`, `restore` and a receipt ledger. The entire
app — UI, gating, paywall, restore — talks only to that interface, never to the
store internals.

## RevenueCat integration boundary

Mapping this project to a real RevenueCat integration is mechanical:

| Lumen abstraction | RevenueCat SDK |
| --- | --- |
| `StoreProvider.getOfferings()` | `Purchases.getOfferings()` |
| `StoreProvider.purchase(packageId)` | `Purchases.purchase(package)` |
| `StoreProvider.restore()` | `Purchases.restorePurchases()` / `Purchases.getCustomerInfo()` |
| `Receipt` | `StoreTransaction` / `CustomerInfo` |
| `grants(customer)` | `customerInfo.entitlements.active` |
| `SubscriptionService` | Your own domain service wrapping the SDK |

To replace the local provider: implement `StoreProvider` against the RevenueCat
SDK (or the REST API), pass it to `SubscriptionService`, and no other code
changes. The mock store deliberately mirrors those SDK shapes so the swap stays
small and reviewable.

## Run

```sh
npm install
npm run build
npm start
```

Then open `http://localhost:8800`.

### Exploring the lifecycle

- Free → Pro: on the paywall, choose **Start 7-day free trial** (trial state) or
  a paid plan.
- Restore: the store is seeded with a **lapsed yearly purchase**; tap *Restore
  purchases* on the paywall or in Account to bring Pro back — the exact flow a
  reinstall would use.
- Error state: in Account, enable *Simulate payment failure*, then attempt a
  purchase — the paywall shows a declined-transaction state.
- Cancel: in Account, *Cancel subscription* schedules expiry at the end of the
  current period.
- Reset: *Reset demo store* returns the customer and ledger to the factory state.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/bootstrap` | catalog, customer state, metrics, account |
| `POST /api/purchase` `{ packageId }` | purchase / start trial (402 when declined) |
| `POST /api/restore` | restore purchases from the store |
| `POST /api/cancel` | schedule cancellation |
| `POST /api/sessions` `{ durationSec, tag }` | record a session (403 beyond free cap) |
| `GET /api/insights` | Pro-only insights (403 on free) |
| `POST /api/reset` | reset store + data to factory state |

## Technical decisions

- **No runtime dependencies.** TypeScript compiled with `tsc`, a hand-rolled Node
  HTTP server, and a dependency-free browser frontend. Nothing to install beyond
  `typescript` and `@types/node`, and nothing requires network access.
- **Server-owned subscription state.** The entitlement engine lives in Node
  (`src/subscription/`), so gating can't be bypassed by editing the browser — the
  API refuses locked features with `403`.
- **Deterministic, honest demo data.** Sessions and the store ledger are seeded;
  every number shown is either real (session timestamps) or derived from the
  seeded state. The store never claims a real transaction happened.
- **Mobile-first, responsive UI.** One design system (CSS custom properties),
  bottom tab navigation, and a two-column layout on wider screens.

## Layout

```
src/
  index.ts                     entry: wires store + service + server
  server.ts                    HTTP server + JSON API + static files
  app/
    data.ts                    seeded focus sessions
    metrics.ts                 derived stats + insights
  subscription/                the monetization engine (see above)
public/
  index.html                   app shell
  styles.css                   design system
  js/
    app.js                     bootstrap + router
    api.js                     fetch wrapper
    ui.js                      DOM helpers, toast, skeleton
    views.js                   all screens (onboarding, dashboard, paywall, insights, account)
```

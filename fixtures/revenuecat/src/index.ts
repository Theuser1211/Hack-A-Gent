import { fileURLToPath } from 'node:url';
import { newReceipt } from './subscription/customer.js';
import { MockStoreProvider } from './subscription/mock-provider.js';
import { SubscriptionService } from './subscription/purchases.js';
import { seededSessions } from './app/data.js';
import { startServer } from './server.js';

/**
 * Wire everything together:
 *  - one deterministic, local store with a seeded historical purchase so the
 *    restore flow has something to bring back;
 *  - one customer on the factory (free) state;
 *  - seeded focus sessions so the dashboard has shape on first load.
 */
const APP_USER = 'ada@lumen.local';

const seededYearlyPurchase = newReceipt({
  productId: 'pro.yearly',
  store: 'mock-store',
  purchaseDate: new Date(Date.now() - 2 * 86400000).toISOString(),
  expiresDate: new Date(Date.now() - 2 * 86400000 + 365 * 86400000).toISOString(),
  isTrial: false,
  type: 'subscription',
  id: 'rct_historic_yearly_2026',
  originalTransactionId: 'orig_historic_yearly_2026',
});

const store = new MockStoreProvider([seededYearlyPurchase]);
const service = new SubscriptionService(store, APP_USER);
const sessions = seededSessions();

const ACCOUNT = {
  appUserId: APP_USER,
  displayName: 'Ada Okafor',
  email: APP_USER,
  since: '2024-11-03T00:00:00.000Z',
  paymentMethod: { brand: 'Visa', last4: '4242', expiry: '08 / 28' },
  invoices: [
    { id: 'inv_2026_05', date: '2026-05-02', amountUsd: 4.99, status: 'paid', description: 'Lumen Pro — monthly' },
    { id: 'inv_2026_04', date: '2026-04-02', amountUsd: 4.99, status: 'paid', description: 'Lumen Pro — monthly' },
    { id: 'inv_2026_03', date: '2026-03-02', amountUsd: 4.99, status: 'paid', description: 'Lumen Pro — monthly' },
    { id: 'inv_2026_02', date: '2026-02-02', amountUsd: 4.99, status: 'paid', description: 'Lumen Pro — monthly' },
  ],
};

console.log();
console.log('  Lumen — a subscription-powered focus companion');
console.log('  ──────────────────────────────────────────────');
console.log('  Product   : Lumen Pro (monthly / yearly + 7-day trial)');
console.log('  Customer  : ' + APP_USER + ' (factory, free state)');
console.log('  Store     : ' + store.name + ' (deterministic, local only)');
console.log('  Seeded    : one lapsed yearly purchase available to restore');
console.log('  Session cap: 3 free sessions / day (Pro removes the cap)');
console.log('  API       : /api/bootstrap /api/purchase /api/restore /api/insights …');
console.log();

startServer({
  service,
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  account: ACCOUNT,
  sessions,
  onReset: () => {
    sessions.splice(0, sessions.length, ...seededSessions());
  },
});

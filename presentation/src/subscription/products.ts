import type { EntitlementId, Product } from './types.js';

const PRO_ENTITLEMENTS: EntitlementId[] = [
  'focus.unlimited',
  'stats.insights',
  'sync.devices',
  'themes.premium',
];

/**
 * The product catalog. Products are what a store sells; entitlements are what
 * the app grants. This separation mirrors how a real subscription SDK maps a
 * purchase to app access.
 */
export const PRODUCTS: Product[] = [
  {
    id: 'pro.monthly',
    identifier: 'com.lumen.pro.monthly',
    type: 'subscription',
    title: 'Lumen Pro',
    price: 4.99,
    currency: 'USD',
    period: 'month',
    introOffer: { type: 'free_trial', durationDays: 7 },
    entitlements: PRO_ENTITLEMENTS,
  },
  {
    id: 'pro.yearly',
    identifier: 'com.lumen.pro.yearly',
    type: 'subscription',
    title: 'Lumen Pro (Yearly)',
    price: 39.99,
    currency: 'USD',
    period: 'year',
    entitlements: PRO_ENTITLEMENTS,
  },
];

export function productById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function productFor(id: string): Product {
  const found = productById(id);
  if (!found) throw new Error(`unknown product: ${id}`);
  return found;
}

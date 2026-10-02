import { productFor } from './products.js';
import type { Customer, EntitlementGrant, EntitlementId, EntitlementInfo } from './types.js';

/**
 * The entitlement catalog. Every feature in the product maps to exactly one
 * entitlement id; the free/premium boundary is defined here and nowhere else.
 */
export const ENTITLEMENTS: EntitlementInfo[] = [
  {
    id: 'focus.timer',
    label: 'Focus timer',
    description: 'Run timed focus sessions with a live countdown and break tracking.',
    premium: false,
  },
  {
    id: 'stats.basic',
    label: 'Session history',
    description: 'See your recent sessions and weekly totals.',
    premium: false,
  },
  {
    id: 'focus.unlimited',
    label: 'Unlimited sessions',
    description: 'No daily cap on focus sessions.',
    premium: true,
  },
  {
    id: 'stats.insights',
    label: 'Focus insights',
    description: 'Deep weekly analytics: trends, streaks and focus patterns.',
    premium: true,
  },
  {
    id: 'sync.devices',
    label: 'Cross-device sync',
    description: 'Your focus data follows you across devices.',
    premium: true,
  },
  {
    id: 'themes.premium',
    label: 'Ambient themes',
    description: 'Premium themes and soundscapes for your sessions.',
    premium: true,
  },
];

export function entitlementInfo(id: EntitlementId): EntitlementInfo {
  const found = ENTITLEMENTS.find((e) => e.id === id);
  if (!found) throw new Error(`unknown entitlement: ${id}`);
  return found;
}

/** True when a customer currently holds a grant for an entitlement. */
export function hasEntitlement(customer: Customer, id: EntitlementId): boolean {
  return Boolean(customer.activeSubscriptions.length && grants(customer)[id]);
}

/** Derive active entitlement grants from the customer's active subscriptions. */
export function grants(customer: Customer): Record<EntitlementId, EntitlementGrant | undefined> {
  const out = {} as Record<EntitlementId, EntitlementGrant | undefined>;
  for (const sub of customer.activeSubscriptions) {
    const product = productFor(sub.productId);
    if (!product) continue;
    for (const e of product.entitlements) {
      out[e] = {
        productId: sub.productId,
        purchaseDate: sub.purchaseDate,
        expiresDate: sub.expiresDate,
        isTrial: sub.isTrial,
        canceled: sub.canceled,
      };
    }
  }
  return out;
}

export function activeEntitlements(customer: Customer): EntitlementInfo[] {
  const g = grants(customer);
  return ENTITLEMENTS.filter((e) => g[e.id]);
}

export function lockedEntitlements(customer: Customer): EntitlementInfo[] {
  const g = grants(customer);
  return ENTITLEMENTS.filter((e) => e.premium && !g[e.id]);
}

export function isPro(customer: Customer): boolean {
  return hasEntitlement(customer, 'focus.unlimited');
}

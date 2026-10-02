export interface Plan {
  id: 'free' | 'premium';
  name: string;
  priceLabel: string;
  entitlements: string[];
}

export const FREE_PLAN: Plan = {
  id: 'free',
  name: 'Free',
  priceLabel: '$0 / month',
  entitlements: ['focus.timer', 'stats.basic'],
};

export const PREMIUM_PLAN: Plan = {
  id: 'premium',
  name: 'Premium',
  priceLabel: '$4.99 / month',
  entitlements: ['focus.timer', 'focus.unlimited', 'stats.basic', 'stats.advanced', 'sync.devices'],
};

export function allPlans(): Plan[] {
  return [FREE_PLAN, PREMIUM_PLAN];
}
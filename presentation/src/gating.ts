import type { Plan } from './plans.js';

export interface GateResult {
  allowed: boolean;
  entitlement: string;
  reason: string;
  plan: Plan['id'];
}

/**
 * Decide whether a plan grants a given feature entitlement. Pure and
 * deterministic: the boundary lives entirely here and nowhere else.
 */
export function gateFeature(plan: Plan, entitlement: string): GateResult {
  const has = plan.entitlements.includes(entitlement);
  return {
    allowed: has,
    entitlement,
    reason: has
      ? `granted by ${plan.name}`
      : `requires premium — not included in ${plan.name}`,
    plan: plan.id,
  };
}

export function filterAllowed(plan: Plan, entitlements: readonly string[]): string[] {
  return entitlements.filter((e) => plan.entitlements.includes(e));
}
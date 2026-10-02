import { applyReceipt, buildFactoryCustomer, isActive, now } from './customer.js';
import { activeEntitlements, grants, isPro, lockedEntitlements } from './entitlements.js';
import { PRODUCTS } from './products.js';
import type { StoreProvider } from './mock-provider.js';
import type { Customer, EntitlementGrant, EntitlementId, EntitlementInfo, Offering } from './types.js';

export interface ServiceView {
  customer: Customer;
  entitlements: EntitlementInfo[];
  grants: Record<EntitlementId, EntitlementGrant | undefined>;
  isPro: boolean;
}

export interface PurchaseOutcome {
  ok: boolean;
  view?: ServiceView;
  receipt?: unknown;
  error?: string;
}

/**
 * The application-facing subscription facade. It owns the customer object and
 * delegates every store transaction to a StoreProvider. Nothing in this class
 * knows anything about billing internals — that is the provider's job.
 */
export class SubscriptionService {
  private customer: Customer;
  private readonly seedUserId: string;

  constructor(
    private readonly provider: StoreProvider,
    appUserId = 'ada@lumen.local',
  ) {
    this.seedUserId = appUserId;
    this.customer = buildFactoryCustomer(appUserId);
  }

  private view(): ServiceView {
    return {
      customer: this.customer,
      entitlements: activeEntitlements(this.customer),
      grants: grants(this.customer),
      isPro: isPro(this.customer),
    };
  }

  /** Public snapshot of the current customer state. */
  getState(): ServiceView {
    return this.view();
  }

  /** Ask the store to decline the next purchase attempt (exercises error states). */
  failNext(on: boolean): void {
    this.provider.failNextPurchase(on);
  }

  getOfferings(): Offering[] {
    return this.provider.getOfferings();
  }

  getCatalog() {
    return { products: PRODUCTS, offerings: this.getOfferings() };
  }

  async purchase(packageId: string): Promise<PurchaseOutcome> {
    const receipt = await this.provider.purchase(packageId, this.customer.appUserId);
    if (!receipt) {
      return { ok: false, error: 'The store declined this transaction. Try again or use a different payment method.' };
    }
    applyReceipt(this.customer, receipt);
    return { ok: true, view: this.view(), receipt };
  }

  async restore(): Promise<{ ok: boolean; restored: number; view: ServiceView }> {
    const receipts = await this.provider.restore(this.customer.appUserId);
    let restored = 0;
    for (const r of receipts) {
      const known = this.customer.allReceipts.some((x) => x.id === r.id);
      if (!known) {
        applyReceipt(this.customer, r);
        restored++;
      }
    }
    return { ok: true, restored, view: this.view() };
  }

  /** True if this customer has already consumed a free trial on any product. */
  hasUsedTrial(): boolean {
    return this.customer.allReceipts.some((r) => r.isTrial);
  }

  async cancelSubscriptions(): Promise<ServiceView> {
    const endOfPeriod = new Date();
    endOfPeriod.setUTCDate(endOfPeriod.getUTCDate() + 1);
    for (const r of this.customer.activeSubscriptions) {
      if (!isActive(r)) continue;
      r.canceled = true;
    }
    this.customer.lastSeen = now();
    return this.view();
  }

  reset(): ServiceView {
    this.provider.reset();
    this.customer = buildFactoryCustomer(this.seedUserId);
    return this.view();
  }
}

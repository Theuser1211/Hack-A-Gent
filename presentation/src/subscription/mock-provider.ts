import { newReceipt } from './customer.js';
import { PRODUCTS, productFor } from './products.js';
import type { Offering, Receipt } from './types.js';

/**
 * The store abstraction. This interface deliberately mirrors the surface of a
 * real in-app purchase SDK (offerings, purchase, restore, customerInfo) so that
 * swapping this local provider for a real one is a mechanical change.
 */
export interface StoreProvider {
  readonly name: string;
  getOfferings(): Offering[];
  /** Resolve after a simulated store round-trip; null means the purchase was declined. */
  purchase(packageIdentifier: string, appUserId: string): Promise<Receipt | null>;
  restore(appUserId: string): Promise<Receipt[]>;
  receiptsFor(appUserId: string): Receipt[];
  /** Return a store to its factory state (clears the user's receipt ledger). */
  reset(): void;
  /** Make the next purchase attempt fail, to exercise error states. */
  failNextPurchase(flag: boolean): void;
}

const MAIN_OFFERING: Offering = {
  identifier: 'main',
  serverDescription: 'Lumen Pro — unlimited focus, insights and sync',
  packages: PRODUCTS.map((p) => ({ identifier: p.id, product: p })),
};

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A deterministic, fully local store. No network, no real billing: every
 * transaction is derived from the provider's in-memory receipt ledger, seeded
 * with one lapsed yearly purchase so the restore flow has something to bring
 * back.
 */
export class MockStoreProvider implements StoreProvider {
  readonly name = 'mock-store';
  private readonly ledger = new Map<string, Receipt[]>();
  private readonly seedForUser: Receipt[] | null;
  private counter = 0;
  private declineNextPurchase = false;

  constructor(seed: Receipt[] | null = null) {
    this.seedForUser = seed;
  }

  getOfferings(): Offering[] {
    return [MAIN_OFFERING];
  }

  receiptsFor(appUserId: string): Receipt[] {
    if (!this.ledger.has(appUserId) && this.seedForUser) {
      this.ledger.set(appUserId, this.seedForUser);
    }
    return this.ledger.get(appUserId) ?? [];
  }

  async purchase(packageIdentifier: string, appUserId: string): Promise<Receipt | null> {
    await delay(850);
    if (this.declineNextPurchase) {
      this.declineNextPurchase = false;
      return null;
    }
    const product = productFor(packageIdentifier);
    const purchases = this.receiptsFor(appUserId);
    const stamp = new Date();
    const id = `rct_${hash(`${appUserId}:${packageIdentifier}:${++this.counter}:${stamp.getTime()}`)}`;
    const isTrial = Boolean(product.introOffer);

    let expiresDate: string | null = null;
    if (product.period) {
      const end = new Date(stamp);
      if (product.period === 'year') {
        end.setUTCFullYear(end.getUTCFullYear() + 1);
      } else {
        end.setUTCMonth(end.getUTCMonth() + 1);
      }
      expiresDate = end.toISOString();
    }
    if (isTrial && expiresDate) {
      const trialEnd = new Date(stamp);
      trialEnd.setUTCDate(trialEnd.getUTCDate() + (product.introOffer?.durationDays ?? 7));
      expiresDate = trialEnd.toISOString();
    }

    const receipt = newReceipt({
      productId: packageIdentifier,
      store: this.name,
      purchaseDate: stamp.toISOString(),
      expiresDate,
      isTrial,
      type: product.type === 'subscription' ? 'subscription' : 'non_subscription',
      id,
    });
    purchases.push(receipt);
    return receipt;
  }

  async restore(appUserId: string): Promise<Receipt[]> {
    await delay(650);
    return this.receiptsFor(appUserId);
  }

  failNextPurchase(flag: boolean): void {
    this.declineNextPurchase = flag;
  }

  reset(): void {
    this.ledger.clear();
    this.declineNextPurchase = false;
  }
}

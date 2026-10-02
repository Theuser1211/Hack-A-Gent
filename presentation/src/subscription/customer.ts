import { productFor } from './products.js';
import type { Customer, Receipt, ReceiptType } from './types.js';

/** Current time in ISO 8601 (UTC). */
export function now(): string {
  return new Date().toISOString();
}

export function buildFactoryCustomer(appUserId = 'ada@lumen.local'): Customer {
  const ts = now();
  return {
    customerId: 'cus_factory_0001',
    appUserId,
    originalAppUserId: appUserId,
    firstSeen: ts,
    lastSeen: ts,
    activeSubscriptions: [],
    nonSubscriptions: [],
    allReceipts: [],
  };
}

export function isExpired(receipt: Receipt): boolean {
  if (!receipt.expiresDate) return false;
  return Date.parse(receipt.expiresDate) <= Date.now();
}

export function isActive(receipt: Receipt): boolean {
  if (receipt.type !== 'subscription') return false;
  return !isExpired(receipt);
}

/** Attach a receipt to the customer and keep the derived collections in sync. */
export function applyReceipt(customer: Customer, receipt: Receipt): void {
  customer.allReceipts.push(receipt);
  if (receipt.type === 'subscription') {
    customer.activeSubscriptions.push(receipt);
  } else {
    customer.nonSubscriptions.push(receipt);
  }
}

export function newReceipt(opts: {
  productId: string;
  store: string;
  purchaseDate: string;
  expiresDate: string | null;
  isTrial: boolean;
  type: ReceiptType;
  id: string;
  originalTransactionId?: string;
}): Receipt {
  const product = productFor(opts.productId);
  return {
    id: opts.id,
    productId: opts.productId,
    store: opts.store,
    purchaseDate: opts.purchaseDate,
    expiresDate: opts.expiresDate,
    isTrial: opts.isTrial,
    type: opts.type,
    originalTransactionId: opts.originalTransactionId ?? opts.id,
    canceled: false,
  };
}

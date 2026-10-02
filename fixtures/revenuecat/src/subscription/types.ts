export type EntitlementId =
  | 'focus.timer'
  | 'focus.unlimited'
  | 'stats.basic'
  | 'stats.insights'
  | 'sync.devices'
  | 'themes.premium';

export type Period = 'month' | 'year';

export type ReceiptType = 'subscription' | 'non_subscription';

export interface Product {
  id: string;
  identifier: string;
  type: 'subscription' | 'non_consumable';
  title: string;
  price: number;
  currency: 'USD';
  period?: Period;
  introOffer?: { type: 'free_trial'; durationDays: number };
  entitlements: EntitlementId[];
}

export interface Package {
  identifier: string;
  product: Product;
}

export interface Offering {
  identifier: string;
  serverDescription: string;
  packages: Package[];
}

export interface Receipt {
  id: string;
  productId: string;
  store: string;
  purchaseDate: string;
  expiresDate: string | null;
  isTrial: boolean;
  type: ReceiptType;
  originalTransactionId: string;
  canceled: boolean;
}

export interface EntitlementGrant {
  productId: string;
  purchaseDate: string;
  expiresDate: string | null;
  isTrial: boolean;
  canceled: boolean;
}

export interface Customer {
  customerId: string;
  appUserId: string;
  originalAppUserId: string;
  firstSeen: string;
  lastSeen: string;
  activeSubscriptions: Receipt[];
  nonSubscriptions: Receipt[];
  allReceipts: Receipt[];
}

export interface EntitlementInfo {
  id: EntitlementId;
  label: string;
  description: string;
  premium: boolean;
}

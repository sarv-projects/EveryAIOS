/** Subscription tier levels */
export type Tier = 'free' | 'lite' | 'plus' | 'pro' | 'ultra';

/** Status of a subscription */
export type SubscriptionStatus =
  | 'active'
  | 'grace-period'
  | 'suspended'
  | 'cancelled'
  | 'expired';

/** Features and limits granted to a user */
export interface Entitlement {
  tier: Tier;
  expiresAt?: string;
  status: SubscriptionStatus;
  features: string[];
}

/** Repository interface for billing and entitlements */
export interface BillingRepository {
  getEntitlement(userId: string): Promise<Entitlement>;
  purchase(tier: Tier): Promise<boolean>;
  cancel(): Promise<void>;
  getProducts(): Promise<BillingProduct[]>;
}

/** A purchasable product */
export interface BillingProduct {
  id: string;
  tier: Tier;
  name: string;
  price: number;
  currency: string;
  period: 'month' | 'year';
}

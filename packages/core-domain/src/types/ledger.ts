/**
 * Server-authoritative credit ledger types.
 * Used by the GCP svc-api backend for the reserve→commit/refund sequence.
 * All credit operations are idempotent via a transactionId.
 */
export type LedgerEntry = {
  transactionId: string;
  userId: string;
  type: 'reserve' | 'commit' | 'refund';
  amount: number;
  description: string;
  timestamp: string;
};

/**
 * Server-authoritative credit balance. All credit values can be fractional
 * (e.g. 99.7, 0.5) since the 2026-07-23 decimal pricing rollout — pack and
 * subscription balances still hold whole-number pricing intent (e.g. 500),
 * while per-chat consumption is banded at 0.05 / 0.1 / 0.5 / 1.0 of a
 * credit. Firestore stores these as plain JS numbers (no millicredit
 * normalization); rounding to 0.01 is enforced by core-billing helpers.
 */
export type CreditBalance = {
  userId: string;
  subscriptionCredits: number;
  packCredits: number;
  freeCreditsUsed: number;
  freeDailyLimit: number;
  updatedAt: string;
};

/**
 * Firestore path: users/{userId}/ledger/{transactionId}
 * Firestore path: users/{userId}/credits (single document)
 */

export function computeTotalSpendable(balance: CreditBalance): number {
  const freeRemaining = Math.max(0, balance.freeDailyLimit - balance.freeCreditsUsed);
  return freeRemaining + balance.subscriptionCredits + balance.packCredits;
}

export function prioritizeDeduction(balance: CreditBalance, cost: number): {
  fromFree: number;
  fromSubscription: number;
  fromPack: number;
} {
  let remaining = cost;
  const freeRemaining = Math.max(0, balance.freeDailyLimit - balance.freeCreditsUsed);
  const fromFree = Math.min(remaining, freeRemaining);
  remaining -= fromFree;
  const fromSubscription = Math.min(remaining, balance.subscriptionCredits);
  remaining -= fromSubscription;
  const fromPack = Math.min(remaining, balance.packCredits);
  return { fromFree, fromSubscription, fromPack };
}

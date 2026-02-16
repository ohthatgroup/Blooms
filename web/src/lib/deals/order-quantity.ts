import type { DealForOrder } from "@/lib/types";

export type QtyNormalizeMode = "increase" | "decrease" | "input" | "hydrate";

export interface DealTier {
  buy_qty: number;
  free_qty: number;
  target_qty: number;
}

export interface NextTierProgress {
  hasNextTier: boolean;
  remaining: number;
  nextTargetQty: number | null;
}

function clampToNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function buildDealTiers(
  deals: Array<Pick<DealForOrder, "buy_qty" | "free_qty">>,
): DealTier[] {
  const unique = new Map<string, DealTier>();
  for (const deal of deals) {
    const buyQty = clampToNonNegativeInt(deal.buy_qty);
    const freeQty = clampToNonNegativeInt(deal.free_qty);
    if (buyQty <= 0 || freeQty <= 0) continue;
    const targetQty = buyQty + freeQty;
    unique.set(`${buyQty}:${freeQty}`, {
      buy_qty: buyQty,
      free_qty: freeQty,
      target_qty: targetQty,
    });
  }

  return [...unique.values()].sort(
    (a, b) => a.buy_qty - b.buy_qty || a.target_qty - b.target_qty,
  );
}

function findGapTier(qty: number, tiers: DealTier[]): DealTier | null {
  for (let i = tiers.length - 1; i >= 0; i -= 1) {
    const tier = tiers[i];
    if (qty >= tier.buy_qty && qty < tier.target_qty) {
      return tier;
    }
  }
  return null;
}

export function normalizeQtyForDeal(
  rawQty: number,
  tiers: DealTier[],
  mode: QtyNormalizeMode,
): number {
  const qty = clampToNonNegativeInt(rawQty);
  if (qty === 0 || tiers.length === 0) return qty;

  const gapTier = findGapTier(qty, tiers);
  if (!gapTier) return qty;

  if (mode === "decrease") {
    return Math.max(0, gapTier.buy_qty - 1);
  }

  return gapTier.target_qty;
}

export function getNextTierProgress(
  currentQty: number,
  tiers: DealTier[],
): NextTierProgress {
  const qty = clampToNonNegativeInt(currentQty);
  const nextTargetQty =
    [...new Set(tiers.map((tier) => tier.target_qty))]
      .sort((a, b) => a - b)
      .find((targetQty) => targetQty > qty) ?? null;

  if (nextTargetQty === null) {
    return {
      hasNextTier: false,
      remaining: 0,
      nextTargetQty: null,
    };
  }

  return {
    hasNextTier: true,
    remaining: nextTargetQty - qty,
    nextTargetQty,
  };
}

import { describe, expect, it } from "vitest";
import {
  buildDealTiers,
  getNextTierProgress,
  normalizeQtyForDeal,
} from "@/lib/deals/order-quantity";

describe("order quantity deal normalization", () => {
  const tiers = buildDealTiers([
    { buy_qty: 10, free_qty: 3 },
    { buy_qty: 20, free_qty: 7 },
  ]);

  it("jumps to include free qty on increase", () => {
    expect(normalizeQtyForDeal(10, tiers, "increase")).toBe(13);
  });

  it("drops below threshold on decrease", () => {
    expect(normalizeQtyForDeal(12, tiers, "decrease")).toBe(9);
  });

  it("normalizes typed values to include free qty", () => {
    expect(normalizeQtyForDeal(23, tiers, "input")).toBe(27);
  });

  it("reports remaining qty to next free tier", () => {
    expect(getNextTierProgress(13, tiers)).toEqual({
      hasNextTier: true,
      remaining: 7,
      nextTargetQty: 20,
    });
  });

  it("uses buy threshold math for single-tier counters", () => {
    const singleTier = buildDealTiers([{ buy_qty: 20, free_qty: 13 }]);
    expect(getNextTierProgress(1, singleTier)).toEqual({
      hasNextTier: true,
      remaining: 19,
      nextTargetQty: 20,
    });
  });

  it("reports top tier reached when no higher tier exists", () => {
    expect(getNextTierProgress(27, tiers)).toEqual({
      hasNextTier: false,
      remaining: 0,
      nextTargetQty: null,
    });
  });

  it("normalizes legacy hydrated quantities", () => {
    expect(normalizeQtyForDeal(22, tiers, "hydrate")).toBe(27);
  });
});

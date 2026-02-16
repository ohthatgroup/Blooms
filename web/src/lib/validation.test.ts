import { describe, expect, it } from "vitest";
import { saveOrderDraftSchema } from "@/lib/validation";

describe("saveOrderDraftSchema", () => {
  it("accepts empty items", () => {
    const parsed = saveOrderDraftSchema.safeParse({
      token: "1234567890_token",
      items: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.items).toEqual([]);
    }
  });

  it("rejects qty <= 0", () => {
    const parsed = saveOrderDraftSchema.safeParse({
      token: "1234567890_token",
      items: [{ sku: "ABC", qty: 0 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects missing/short token", () => {
    const parsed = saveOrderDraftSchema.safeParse({
      token: "short",
      items: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts missing customer_name", () => {
    const parsed = saveOrderDraftSchema.safeParse({
      token: "1234567890_token",
      items: [{ sku: "ABC", qty: 1 }],
    });
    expect(parsed.success).toBe(true);
  });
});


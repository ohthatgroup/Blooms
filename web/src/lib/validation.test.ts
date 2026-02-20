import { describe, expect, it } from "vitest";
import {
  createDealSchema,
  ingestScanDebugEventSchema,
  patchCustomerLinkSchema,
  saveOrderDraftSchema,
} from "@/lib/validation";

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

describe("patchCustomerLinkSchema", () => {
  it("accepts active-only patch", () => {
    const parsed = patchCustomerLinkSchema.safeParse({ active: false });
    expect(parsed.success).toBe(true);
  });

  it("accepts catalog-only patch", () => {
    const parsed = patchCustomerLinkSchema.safeParse({
      catalog_id: "123e4567-e89b-42d3-a456-426614174000",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty patch", () => {
    const parsed = patchCustomerLinkSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

describe("createDealSchema", () => {
  it("accepts deal_text input", () => {
    const parsed = createDealSchema.safeParse({
      sku: "BLM100",
      deal_text: "Buy 10 get 3 FREE",
      starts_at: "2026-02-01",
      ends_at: "2026-02-27",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts numeric buy/free input", () => {
    const parsed = createDealSchema.safeParse({
      sku: "BLM100",
      buy_qty: 10,
      free_qty: 3,
      starts_at: "2026-02-01",
      ends_at: "2026-02-27",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects incomplete buy/free pair", () => {
    const parsed = createDealSchema.safeParse({
      sku: "BLM100",
      buy_qty: 10,
      starts_at: "2026-02-01",
      ends_at: "2026-02-27",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("ingestScanDebugEventSchema", () => {
  it("accepts a valid payload", () => {
    const parsed = ingestScanDebugEventSchema.safeParse({
      token: "1234567890_token",
      session_id: "scan-session-1",
      source: "scanner:start",
      message: "Scanner started",
      details: { camera: "rear" },
      page_url: "https://blooms-mu.vercel.app/o/token?debugScan=true",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid session characters", () => {
    const parsed = ingestScanDebugEventSchema.safeParse({
      token: "1234567890_token",
      session_id: "bad session with spaces",
      source: "scanner:error",
      message: "bad session id",
    });
    expect(parsed.success).toBe(false);
  });
});


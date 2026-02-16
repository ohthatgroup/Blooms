import { describe, expect, it } from "vitest";
import {
  extractEffectiveDateRange,
  parseDealText,
  parseDealsMatrixText,
} from "@/lib/deals/matrix";

describe("deals matrix parsing", () => {
  it("extracts effective dates from deals header", () => {
    const result = extractEffectiveDateRange(
      "DEAL EFFECTIVE DATES FEB 1 - FEB 27, 2026",
    );
    expect(result).toEqual({
      starts_at: "2026-02-01",
      ends_at: "2026-02-27",
    });
  });

  it("parses deal text formats", () => {
    expect(parseDealText("Buy 10 get 3 FREE")).toEqual({
      buy_qty: 10,
      free_qty: 3,
    });
    expect(parseDealText("20+7")).toEqual({
      buy_qty: 20,
      free_qty: 7,
    });
    expect(parseDealText("Buy 20 pay $14.50")).toBeNull();
  });

  it("builds SKU matrix and skips non-free lines", () => {
    const raw = `
DEAL EFFECTIVE DATES FEB 1 - FEB 27, 2026
10+1 20+3
BLM100 01234 Product A 12/1oz
Buy 30
get 6 FREE
BLM101 01235 Product B 12/1oz
Buy 20
pay $14.50
BLM102 01236 Product C 12/1oz
1+2=3
`;

    const parsed = parseDealsMatrixText(raw);

    expect(parsed.starts_at).toBe("2026-02-01");
    expect(parsed.ends_at).toBe("2026-02-27");
    expect(parsed.matrix).toHaveLength(3);

    const bySku = new Map(parsed.matrix.map((row) => [row.sku, row]));
    expect(bySku.get("BLM100")?.tiers.map((t) => [t.buy_qty, t.free_qty])).toEqual([
      [10, 1],
      [20, 3],
    ]);
    expect(bySku.get("BLM101")?.tiers.map((t) => [t.buy_qty, t.free_qty])).toEqual([
      [10, 1],
      [20, 3],
      [30, 6],
    ]);
    expect(bySku.get("BLM102")?.tiers.map((t) => [t.buy_qty, t.free_qty])).toEqual([
      [10, 1],
      [20, 3],
      [30, 6],
    ]);
    expect(parsed.deals).toHaveLength(8);
  });
});

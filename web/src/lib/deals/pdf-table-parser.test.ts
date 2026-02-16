import { describe, expect, it } from "vitest";
import fixture from "@/lib/deals/__fixtures__/deals-table-items.fixture.json";
import {
  parseDealsFromTablePages,
  type PositionedTextPage,
} from "@/lib/deals/pdf-table-parser";

function makeHeader(y: number) {
  return [
    { str: "ITEM #", x: 40, y, width: 30, height: 8 },
    { str: "UPC", x: 95, y, width: 20, height: 8 },
    { str: "DESCRIPTION", x: 200, y, width: 60, height: 8 },
    { str: "PACK/SIZE", x: 315, y, width: 50, height: 8 },
    { str: "COST", x: 380, y, width: 25, height: 8 },
    { str: "DEAL", x: 418, y, width: 25, height: 8 },
  ];
}

describe("pdf table parser", () => {
  it("parses fixture rows and merges section tiers with row tiers", () => {
    const parsed = parseDealsFromTablePages(
      fixture.pages as PositionedTextPage[],
      fixture.rawText,
    );

    const bySku = new Map(parsed.matrix.map((row) => [row.sku, row]));

    expect(bySku.get("LOT601")?.tiers.map((tier) => [tier.buy_qty, tier.free_qty])).toEqual([
      [10, 1],
      [20, 4],
    ]);
    expect(bySku.get("SIZ024")?.tiers.map((tier) => [tier.buy_qty, tier.free_qty])).toEqual([
      [5, 1],
      [10, 3],
      [20, 10],
    ]);
    expect(bySku.get("BLM578")?.tiers.map((tier) => [tier.buy_qty, tier.free_qty])).toEqual([
      [15, 2],
      [30, 6],
    ]);

    expect(parsed.diagnostics.table_headers_detected).toBeGreaterThanOrEqual(2);
    expect(parsed.diagnostics.sku_rows_with_free_tiers).toBeGreaterThanOrEqual(3);
  });

  it("skips rows with only non-free deal text", () => {
    const page: PositionedTextPage = {
      page_number: 1,
      items: [
        ...makeHeader(700),
        { str: "ONG1221", x: 40, y: 680, width: 34, height: 8 },
        { str: "032797812214", x: 95, y: 680, width: 56, height: 8 },
        { str: "Toffee Filled Fruit Chews", x: 200, y: 680, width: 98, height: 8 },
        { str: "20/7oz", x: 315, y: 680, width: 28, height: 8 },
        { str: "$42.00", x: 380, y: 680, width: 26, height: 8 },
        { str: "Buy 20 pay $14.50", x: 418, y: 680, width: 75, height: 8 },
      ],
    };

    const parsed = parseDealsFromTablePages(
      [page],
      "DEAL EFFECTIVE DATES FEB 1 - FEB 27, 2026",
    );
    expect(parsed.matrix).toHaveLength(0);
    expect(parsed.diagnostics.rows_skipped_non_free).toBe(1);
    expect(parsed.diagnostics.rows_skipped_no_tiers).toBe(1);
  });

  it("throws when table headers are missing", () => {
    const page: PositionedTextPage = {
      page_number: 1,
      items: [{ str: "Random text", x: 100, y: 500, width: 40, height: 8 }],
    };

    expect(() =>
      parseDealsFromTablePages([page], "DEAL EFFECTIVE DATES FEB 1 - FEB 27, 2026"),
    ).toThrow("Could not detect deals table headers");
  });
});

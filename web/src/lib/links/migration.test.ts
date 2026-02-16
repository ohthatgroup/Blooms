import { describe, expect, it } from "vitest";
import { migrateOrderItemsToCatalog } from "@/lib/links/migration";

describe("migrateOrderItemsToCatalog", () => {
  it("keeps matching SKUs and drops missing SKUs", () => {
    const result = migrateOrderItemsToCatalog(
      "order-1",
      [
        { sku: "A", qty: 2 },
        { sku: "B", qty: 3 },
        { sku: "C", qty: 1 },
      ],
      [
        { sku: "A", name: "Alpha", upc: "111", pack: "1/1", category: "Cat" },
        { sku: "C", name: "Charlie", upc: "333", pack: "3/3", category: "Cat" },
      ],
    );

    expect(result.keptItems).toHaveLength(2);
    expect(result.keptItems.map((row) => row.sku)).toEqual(["A", "C"]);
    expect(result.droppedSkus).toEqual(["B"]);
    expect(result.totalSkus).toBe(2);
    expect(result.totalCases).toBe(3);
  });

  it("rebuilds order item metadata from target catalog", () => {
    const result = migrateOrderItemsToCatalog(
      "order-2",
      [{ sku: "X", qty: 5 }],
      [{ sku: "X", name: "Target Name", upc: null, pack: null, category: "NewCat" }],
    );

    expect(result.keptItems[0]).toEqual({
      order_id: "order-2",
      sku: "X",
      product_name: "Target Name",
      upc: "",
      pack: "",
      category: "NewCat",
      qty: 5,
    });
  });
});

import { describe, expect, it } from "vitest";
import { buildOrderCsv } from "@/lib/catalog/csv";

describe("buildOrderCsv", () => {
  it("keeps exact header and sorts category+name", () => {
    const { csv, fileName } = buildOrderCsv({
      customerName: "Store A",
      orderDate: new Date("2026-02-13T00:00:00.000Z"),
      items: [
        {
          sku: "B2",
          name: "B Product",
          upc: "222",
          pack: "2/1oz",
          category: "B",
          qty: 2,
        },
        {
          sku: "A1",
          name: "A Product, Name",
          upc: "111",
          pack: "1/1oz",
          category: "A",
          qty: 1,
        },
      ],
    });

    const lines = csv.split("\n");
    expect(lines[0]).toBe("Customer,Date,SKU,Product,UPC,Pack,Qty");
    expect(lines[1]).toContain('"A1"');
    expect(lines[2]).toContain('"B2"');
    expect(lines[1]).toContain("A Product  Name");
    expect(fileName).toContain("Blooms_Order_Store_A_");
    expect(fileName.endsWith(".csv")).toBe(true);
  });
});


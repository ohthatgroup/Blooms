import { format } from "date-fns";

export interface CsvOrderItem {
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  qty: number;
  note?: string | null;
  dealNote?: string | null;
}

export function buildOrderCsv(input: {
  customerName: string;
  orderDate?: Date;
  items: CsvOrderItem[];
}) {
  const date = input.orderDate ?? new Date();
  const normalizedCustomer = input.customerName.trim() || "Customer";

  const sorted = [...input.items].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );

  const header = "Customer,Date,SKU,Product,UPC,Pack,Qty,Note";
  const rows = sorted.map((item) => {
    const safeName = item.name.replaceAll(",", " ");
    const combinedNote = [item.note, item.dealNote]
      .filter(Boolean)
      .join(" | ")
      .replaceAll('"', '""');
    return `"${normalizedCustomer}","${format(
      date,
      "MM/dd/yyyy",
    )}","${item.sku}","${safeName}","${item.upc ?? ""}","${
      item.pack ?? ""
    }",${item.qty},"${combinedNote}"`;
  });

  const csv = [header, ...rows].join("\n");
  const fileName = `Blooms_Order_${normalizedCustomer
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^a-zA-Z0-9_]/g, "")}_${format(date, "yyyy-MM-dd")}.csv`;

  return { csv, fileName };
}


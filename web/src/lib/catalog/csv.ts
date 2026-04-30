import { format } from "date-fns";

export const ORDER_CSV_COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "date", label: "Date" },
  { key: "sku", label: "SKU" },
  { key: "product", label: "Product" },
  { key: "upc", label: "UPC" },
  { key: "pack", label: "Pack" },
  { key: "qty", label: "Qty" },
  { key: "note", label: "Note" },
] as const;

export type OrderCsvColumn = (typeof ORDER_CSV_COLUMNS)[number]["key"];

export const DEFAULT_ORDER_CSV_COLUMNS = ORDER_CSV_COLUMNS.map(
  (column) => column.key,
);

const ORDER_CSV_COLUMN_SET = new Set<string>(DEFAULT_ORDER_CSV_COLUMNS);

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

export function normalizeOrderCsvColumns(
  columns: unknown,
): OrderCsvColumn[] {
  if (!Array.isArray(columns)) return DEFAULT_ORDER_CSV_COLUMNS;
  const normalized = columns.filter(
    (column): column is OrderCsvColumn =>
      typeof column === "string" && ORDER_CSV_COLUMN_SET.has(column),
  );
  return normalized.length > 0 ? normalized : DEFAULT_ORDER_CSV_COLUMNS;
}

export function buildOrderCsv(input: {
  customerName: string;
  orderDate?: Date;
  items: CsvOrderItem[];
  columns?: OrderCsvColumn[];
}) {
  const date = input.orderDate ?? new Date();
  const normalizedCustomer = input.customerName.trim() || "Customer";
  const columns = normalizeOrderCsvColumns(input.columns);

  const sorted = [...input.items].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );

  const labelsByColumn: Record<OrderCsvColumn, string> = {
    customer: "Customer",
    date: "Date",
    sku: "SKU",
    product: "Product",
    upc: "UPC",
    pack: "Pack",
    qty: "Qty",
    note: "Note",
  };
  const header = columns.map((column) => labelsByColumn[column]).join(",");
  const rows = sorted.map((item) => {
    const safeName = item.name.replaceAll(",", " ");
    const combinedNote = [item.note, item.dealNote]
      .filter(Boolean)
      .join(" | ")
      .replaceAll('"', '""');
    const valuesByColumn: Record<OrderCsvColumn, string | number> = {
      customer: normalizedCustomer,
      date: format(date, "MM/dd/yyyy"),
      sku: item.sku,
      product: safeName,
      upc: item.upc ?? "",
      pack: item.pack ?? "",
      qty: item.qty,
      note: combinedNote,
    };
    return columns
      .map((column) => {
        const value = valuesByColumn[column];
        return typeof value === "number" ? String(value) : `"${value}"`;
      })
      .join(",");
  });

  const csv = [header, ...rows].join("\n");
  const fileName = `Blooms_Order_${normalizedCustomer
    .replaceAll(/\s+/g, "_")
    .replaceAll(/[^a-zA-Z0-9_]/g, "")}_${format(date, "yyyy-MM-dd")}.csv`;

  return { csv, fileName };
}

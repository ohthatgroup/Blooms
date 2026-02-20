import * as XLSX from "xlsx";

export interface BulkOrderItem {
  sku: string;
  qty: number;
  rowNum: number;
}

export interface BulkOrderParseResult {
  items: BulkOrderItem[];
  warnings: string[];
}

function detectBulkColumns(headers: string[]): {
  sku: number;
  qty: number;
} | null {
  const lower = headers.map((h) => (h ?? "").toString().trim().toLowerCase());

  const skuIdx = lower.findIndex((h) =>
    ["sku", "item", "item#", "vendor#", "vendors#", "vendor", "item no", "item number"].includes(h),
  );
  const qtyIdx = lower.findIndex((h) =>
    ["qty", "quantity", "cases", "amount", "cs", "count"].includes(h),
  );

  if (skuIdx === -1 || qtyIdx === -1) return null;
  return { sku: skuIdx, qty: qtyIdx };
}

export function parseBulkOrderFile(
  buffer: ArrayBuffer,
  fileName: string,
): BulkOrderParseResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { items: [], warnings: ["No sheets found in file"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) {
    return { items: [], warnings: ["File appears empty or has no data rows"] };
  }

  let headerRowIdx = -1;
  let cols: ReturnType<typeof detectBulkColumns> = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const detected = detectBulkColumns(rows[i].map((c) => String(c ?? "")));
    if (detected) {
      headerRowIdx = i;
      cols = detected;
      break;
    }
  }

  if (headerRowIdx === -1 || !cols) {
    return {
      items: [],
      warnings: [
        `Could not detect SKU and Qty columns in "${fileName}". Expected headers like SKU/Vendor# and Qty/Quantity.`,
      ],
    };
  }

  const warnings: string[] = [];
  const items: BulkOrderItem[] = [];

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c || String(c).trim() === "")) continue;

    const sku = String(row[cols.sku] ?? "").trim();
    if (!sku) continue;

    const rawQty = row[cols.qty];
    const qty = typeof rawQty === "number" ? rawQty : parseInt(String(rawQty ?? "").replace(/[^0-9]/g, ""), 10);

    if (!qty || qty <= 0) {
      warnings.push(`Row ${i + 1}: SKU "${sku}" has invalid qty, skipped`);
      continue;
    }

    items.push({ sku, qty, rowNum: i + 1 });
  }

  return { items, warnings };
}

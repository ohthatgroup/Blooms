import * as XLSX from "xlsx";

export interface ParsedCatalogItem {
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  price: number | null;
  category: string;
  rowNum: number;
}

export interface ParsedCatalogResult {
  items: ParsedCatalogItem[];
  categories: string[];
  warnings: string[];
}

/**
 * Column mapping: tries common header names.
 * Returns null if the column is not found.
 */
function detectColumns(headers: string[]): {
  sku: number;
  name: number;
  upc: number | null;
  pack: number | null;
  price: number | null;
} | null {
  const lower = headers.map((h) => (h ?? "").toString().trim().toLowerCase());

  const skuIdx = lower.findIndex((h) =>
    ["item", "sku", "item#", "vendor#", "vendors#", "vendor", "item no", "item number"].includes(h),
  );
  const nameIdx = lower.findIndex((h) =>
    ["description", "name", "product", "product name", "item name", "desc"].includes(h),
  );

  if (skuIdx === -1 || nameIdx === -1) return null;

  const upcIdx = lower.findIndex((h) => ["upc", "upc code", "barcode", "upc#"].includes(h));
  const packIdx = lower.findIndex((h) =>
    ["pack/size", "pack", "pack size", "size", "pack/sz", "pack / size"].includes(h),
  );
  const priceIdx = lower.findIndex((h) =>
    ["price", "unit price", "cost", "msrp"].includes(h),
  );

  return {
    sku: skuIdx,
    name: nameIdx,
    upc: upcIdx >= 0 ? upcIdx : null,
    pack: packIdx >= 0 ? packIdx : null,
    price: priceIdx >= 0 ? priceIdx : null,
  };
}

function isCategoryHeaderRow(
  row: unknown[],
  cols: { sku: number; name: number },
): string | null {
  const skuVal = (row[cols.sku] ?? "").toString().trim();
  const nameVal = (row[cols.name] ?? "").toString().trim();

  // Category header: SKU cell empty but name cell has text
  if (!skuVal && nameVal) {
    return nameVal;
  }
  return null;
}

/**
 * Parse a CSV or XLSX ArrayBuffer into catalog items.
 * Handles the BLOOMS ORDER BOOK format where category headers are rows
 * with no SKU but a description value.
 */
export function parseCatalogFile(
  buffer: ArrayBuffer,
  fileName: string,
): ParsedCatalogResult {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { items: [], categories: [], warnings: ["No sheets found in file"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (rows.length < 2) {
    return { items: [], categories: [], warnings: ["File appears empty or has no data rows"] };
  }

  // Find header row (first row with detectable columns)
  let headerRowIdx = -1;
  let cols: ReturnType<typeof detectColumns> = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const detected = detectColumns(rows[i].map((c) => String(c ?? "")));
    if (detected) {
      headerRowIdx = i;
      cols = detected;
      break;
    }
  }

  if (headerRowIdx === -1 || !cols) {
    return {
      items: [],
      categories: [],
      warnings: [
        `Could not detect columns in "${fileName}". Expected headers like ITEM/SKU and DESCRIPTION/Name.`,
      ],
    };
  }

  const warnings: string[] = [];
  const items: ParsedCatalogItem[] = [];
  const categorySet = new Set<string>();
  let currentCategory = "Uncategorized";

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c || String(c).trim() === "")) continue;

    // Check if this is a category header row
    const catHeader = isCategoryHeaderRow(row, cols);
    if (catHeader) {
      currentCategory = catHeader;
      categorySet.add(currentCategory);
      continue;
    }

    const sku = String(row[cols.sku] ?? "").trim();
    const name = String(row[cols.name] ?? "").trim();

    if (!sku) continue;
    if (!name) {
      warnings.push(`Row ${i + 1}: SKU "${sku}" has no name, skipped`);
      continue;
    }

    const upc = cols.upc !== null ? String(row[cols.upc] ?? "").trim() || null : null;
    const pack = cols.pack !== null ? String(row[cols.pack] ?? "").trim() || null : null;
    let price: number | null = null;
    if (cols.price !== null) {
      const raw = row[cols.price];
      const parsed = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/[^0-9.]/g, ""));
      if (!isNaN(parsed) && parsed >= 0) price = parsed;
    }

    categorySet.add(currentCategory);

    items.push({
      sku,
      name,
      upc,
      pack,
      price,
      category: currentCategory,
      rowNum: i + 1,
    });
  }

  // Deduplicate by SKU – keep the last occurrence (latest row wins)
  const seenSkus = new Map<string, number>();
  const deduped: ParsedCatalogItem[] = [];
  for (const item of items) {
    const key = item.sku.toLowerCase();
    if (seenSkus.has(key)) {
      const prevIdx = seenSkus.get(key)!;
      warnings.push(
        `Duplicate SKU "${item.sku}" at row ${item.rowNum} (first seen row ${deduped[prevIdx].rowNum}), keeping latest`,
      );
      deduped[prevIdx] = item;
    } else {
      seenSkus.set(key, deduped.length);
      deduped.push(item);
    }
  }

  return {
    items: deduped,
    categories: Array.from(categorySet),
    warnings,
  };
}

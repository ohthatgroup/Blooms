import { formatDealText } from "./matrix";

interface DealForCsvNote {
  sku: string;
  buy_qty: number;
  free_qty: number;
}

/**
 * Builds a map from SKU to a formatted deal note string.
 * If a SKU has multiple deal tiers, they are joined with " / ".
 */
export function buildDealNoteMap(
  deals: DealForCsvNote[],
): Map<string, string> {
  const map = new Map<string, string[]>();
  for (const d of deals) {
    const list = map.get(d.sku) ?? [];
    list.push(formatDealText(d.buy_qty, d.free_qty));
    map.set(d.sku, list);
  }
  const result = new Map<string, string>();
  for (const [sku, texts] of map) {
    result.set(sku, texts.join(" / "));
  }
  return result;
}

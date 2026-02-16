import {
  extractEffectiveDateRange,
  formatDealText,
  type DealTier,
  type ParsedDealEntry,
  type ParsedDealRow,
  type ParsedDealsMatrix,
} from "@/lib/deals/matrix";

const SKU_RE = /^[A-Z0-9-]{3,}$/;
const RATIO_RE = /(\d{1,3})\+(\d{1,3})/g;
const BUY_GET_FREE_RE = /buy\s+(\d{1,3})\+?\s*get\s+(\d{1,3})\s*free/gi;
const NON_FREE_RE = /\b(pay|pallet|plt|masters|unit)\b/i;
const IGNORE_LINE_RE =
  /\b(bloom packaging corp|tel\s*#|fax\s*#|www\.|deal effective dates|special while supplies last)\b/i;

export interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedTextPage {
  page_number: number;
  items: PositionedTextItem[];
}

interface LineToken {
  str: string;
  x: number;
  y: number;
  width: number;
}

interface TextLine {
  y: number;
  tokens: LineToken[];
}

interface HeaderAnchors {
  item_x: number;
  upc_x: number;
  description_x: number;
  pack_x: number;
  cost_x: number;
  deal_x: number;
}

interface ParserRowState {
  sku: string;
  section_tiers: DealTier[];
  row_deal_parts: string[];
}

export interface DealsParseDiagnostics {
  parsed_pages: number;
  table_headers_detected: number;
  sku_rows_detected: number;
  sku_rows_with_free_tiers: number;
  rows_skipped_non_free: number;
  rows_skipped_no_tiers: number;
  parser_engine: "pdfjs-dist";
  used_legacy_fallback?: boolean;
}

export interface ParsedDealsWithDiagnostics extends ParsedDealsMatrix {
  diagnostics: DealsParseDiagnostics;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function joinTokens(tokens: LineToken[]): string {
  const sorted = [...tokens].sort((a, b) => a.x - b.x);
  let result = "";
  let prevEnd: number | null = null;
  for (const token of sorted) {
    const text = normalizeSpace(token.str);
    if (!text) continue;
    if (prevEnd !== null && token.x - prevEnd > 1.5 && result.length > 0) {
      result += " ";
    }
    result += text;
    prevEnd = token.x + token.width;
  }
  return normalizeSpace(result);
}

function groupItemsIntoLines(items: PositionedTextItem[]): TextLine[] {
  const tokens = items
    .map((item) => ({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
    }))
    .filter((item) => normalizeSpace(item.str).length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  const yTolerance = 2.4;
  for (const token of tokens) {
    const current = lines[lines.length - 1];
    if (!current || Math.abs(current.y - token.y) > yTolerance) {
      lines.push({ y: token.y, tokens: [token] });
      continue;
    }
    current.tokens.push(token);
  }

  for (const line of lines) {
    line.tokens.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function findTokenXByKeyword(tokens: LineToken[], keyword: string): number | null {
  const found = tokens.find((token) =>
    normalizeSpace(token.str).toUpperCase().includes(keyword),
  );
  return found ? found.x : null;
}

function detectHeaderAnchors(line: TextLine): HeaderAnchors | null {
  const lineText = joinTokens(line.tokens).toUpperCase();
  const looksLikeHeader =
    lineText.includes("ITEM") &&
    lineText.includes("UPC") &&
    lineText.includes("DESCRIPTION") &&
    lineText.includes("PACK") &&
    lineText.includes("COST") &&
    lineText.includes("DEAL");
  if (!looksLikeHeader) return null;

  const itemX = findTokenXByKeyword(line.tokens, "ITEM");
  const upcX = findTokenXByKeyword(line.tokens, "UPC");
  const descriptionX = findTokenXByKeyword(line.tokens, "DESCRIPTION");
  const packX = findTokenXByKeyword(line.tokens, "PACK");
  const costX = findTokenXByKeyword(line.tokens, "COST");
  const dealX = findTokenXByKeyword(line.tokens, "DEAL");

  if (
    itemX === null ||
    upcX === null ||
    descriptionX === null ||
    packX === null ||
    costX === null ||
    dealX === null
  ) {
    return null;
  }

  return {
    item_x: itemX,
    upc_x: upcX,
    description_x: descriptionX,
    pack_x: packX,
    cost_x: costX,
    deal_x: dealX,
  };
}

function parseTiersFromRatios(value: string): DealTier[] {
  const tiers: DealTier[] = [];
  for (const match of value.matchAll(RATIO_RE)) {
    tiers.push({
      buy_qty: Number.parseInt(match[1], 10),
      free_qty: Number.parseInt(match[2], 10),
    });
  }
  return tiers;
}

function parseTiersFromBuyGet(value: string): DealTier[] {
  const tiers: DealTier[] = [];
  for (const match of value.matchAll(BUY_GET_FREE_RE)) {
    tiers.push({
      buy_qty: Number.parseInt(match[1], 10),
      free_qty: Number.parseInt(match[2], 10),
    });
  }
  return tiers;
}

function dedupeTiers(tiers: DealTier[]): DealTier[] {
  const unique = new Map<string, DealTier>();
  for (const tier of tiers) {
    if (!Number.isFinite(tier.buy_qty) || !Number.isFinite(tier.free_qty)) continue;
    if (tier.buy_qty <= 0 || tier.free_qty <= 0) continue;
    unique.set(`${tier.buy_qty}:${tier.free_qty}`, tier);
  }
  return [...unique.values()].sort(
    (a, b) => a.buy_qty - b.buy_qty || a.free_qty - b.free_qty,
  );
}

function looksLikeSku(itemText: string): boolean {
  const compact = itemText.replace(/\s+/g, "").toUpperCase();
  if (!SKU_RE.test(compact)) return false;
  return /\d/.test(compact);
}

function normalizeSku(itemText: string): string {
  return itemText.replace(/\s+/g, "").toUpperCase();
}

function isLikelyDealContinuation(text: string): boolean {
  return /\b(buy|get|free|pay|pallet|plt|masters|unit)\b/i.test(text);
}

function toMatrix(
  skuTierMap: Map<string, DealTier[]>,
  startsAt: string,
  endsAt: string,
): { matrix: ParsedDealRow[]; deals: ParsedDealEntry[] } {
  const matrix: ParsedDealRow[] = [...skuTierMap.entries()]
    .map(([sku, tiers]) => ({
      sku,
      tiers: dedupeTiers(tiers).map((tier) => ({
        ...tier,
        deal_text: formatDealText(tier.buy_qty, tier.free_qty),
      })),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const deals: ParsedDealEntry[] = [];
  for (const row of matrix) {
    for (const tier of row.tiers) {
      deals.push({
        sku: row.sku,
        buy_qty: tier.buy_qty,
        free_qty: tier.free_qty,
        starts_at: startsAt,
        ends_at: endsAt,
      });
    }
  }

  return { matrix, deals };
}

export function parseDealsFromTablePages(
  pages: PositionedTextPage[],
  rawTextForDates: string,
): ParsedDealsWithDiagnostics {
  const dateRange = extractEffectiveDateRange(rawTextForDates);
  if (!dateRange) {
    throw new Error("Could not find effective date range in deals PDF.");
  }

  const diagnostics: DealsParseDiagnostics = {
    parsed_pages: pages.length,
    table_headers_detected: 0,
    sku_rows_detected: 0,
    sku_rows_with_free_tiers: 0,
    rows_skipped_non_free: 0,
    rows_skipped_no_tiers: 0,
    parser_engine: "pdfjs-dist",
  };

  const skuTierMap = new Map<string, DealTier[]>();
  const warnings: string[] = [];
  let hasDetectedHeader = false;
  let activeSectionTiers: DealTier[] = [];
  let activeRow: ParserRowState | null = null;

  const flushRow = () => {
    if (!activeRow) return;
    const dealText = normalizeSpace(activeRow.row_deal_parts.join(" "));
    const rowTiers = dedupeTiers([
      ...parseTiersFromRatios(dealText),
      ...parseTiersFromBuyGet(dealText),
    ]);
    const mergedTiers = dedupeTiers([...activeRow.section_tiers, ...rowTiers]);

    if (mergedTiers.length === 0) {
      diagnostics.rows_skipped_no_tiers += 1;
      if (NON_FREE_RE.test(dealText)) {
        diagnostics.rows_skipped_non_free += 1;
      }
      activeRow = null;
      return;
    }

    diagnostics.sku_rows_with_free_tiers += 1;
    const existing = skuTierMap.get(activeRow.sku) ?? [];
    skuTierMap.set(activeRow.sku, dedupeTiers([...existing, ...mergedTiers]));
    activeRow = null;
  };

  for (const page of pages) {
    const lines = groupItemsIntoLines(page.items);

    for (const line of lines) {
      const maybeHeader = detectHeaderAnchors(line);
      if (maybeHeader) {
        flushRow();
        hasDetectedHeader = true;
        activeSectionTiers = [];
        diagnostics.table_headers_detected += 1;
        continue;
      }

      if (!hasDetectedHeader) continue;

      const lineText = joinTokens(line.tokens);
      if (!lineText) continue;
      if (IGNORE_LINE_RE.test(lineText) || /^[^A-Za-z0-9]+$/.test(lineText)) {
        continue;
      }

      const skuMatch = lineText.match(/^([A-Z0-9-]{3,})\s+(\d{8,14})\b/i);
      const skuFromLine =
        skuMatch && looksLikeSku(skuMatch[1]) ? normalizeSku(skuMatch[1]) : null;

      if (skuFromLine) {
        // In this PDF, a "get X FREE" tail can bleed into the next SKU line.
        // If the next SKU line has "get" but no "buy", attach it to previous row first.
        if (activeRow) {
          const hasBuy = /\bbuy\s+\d{1,3}\b/i.test(lineText);
          const bleedGetMatches = lineText.match(/get\s+\d{1,3}\s*free/gi);
          if (!hasBuy && bleedGetMatches && bleedGetMatches.length > 0) {
            activeRow.row_deal_parts.push(bleedGetMatches.join(" "));
          }
        }

        flushRow();
        activeRow = {
          sku: skuFromLine,
          section_tiers: activeSectionTiers,
          row_deal_parts:
            isLikelyDealContinuation(lineText) || parseTiersFromRatios(lineText).length > 0
              ? [lineText]
              : [],
        };
        diagnostics.sku_rows_detected += 1;
        continue;
      }

      const sectionRatioCandidates = dedupeTiers(parseTiersFromRatios(lineText));
      const hasInlineBuyGet = parseTiersFromBuyGet(lineText).length > 0;
      const isSectionRatioLine = sectionRatioCandidates.length > 0 && !hasInlineBuyGet;
      const hasThresholdOnlyMarkers =
        sectionRatioCandidates.length === 0 &&
        !hasInlineBuyGet &&
        /\b\d{1,3}\+\b/.test(lineText);

      if (isSectionRatioLine) {
        flushRow();
        activeSectionTiers = sectionRatioCandidates;
        continue;
      }

      // Lines like "5+ 50+" indicate pay thresholds without FREE tiers; clear prior section carryover.
      if (hasThresholdOnlyMarkers) {
        flushRow();
        activeSectionTiers = [];
        continue;
      }

      if (activeRow && isLikelyDealContinuation(lineText)) {
        activeRow.row_deal_parts.push(lineText);
        continue;
      }

      // Section labels can carry ratios in the right columns.
      if (!activeRow && sectionRatioCandidates.length > 0) {
        activeSectionTiers = sectionRatioCandidates;
        continue;
      }
    }
  }

  flushRow();

  if (diagnostics.table_headers_detected === 0) {
    throw new Error(
      "Could not detect deals table headers (ITEM # / UPC / DESCRIPTION / PACK/SIZE / COST / DEAL).",
    );
  }

  const { matrix, deals } = toMatrix(
    skuTierMap,
    dateRange.starts_at,
    dateRange.ends_at,
  );

  if (matrix.length === 0) {
    warnings.push("No SKU deals were parsed from the PDF tables.");
  }

  return {
    starts_at: dateRange.starts_at,
    ends_at: dateRange.ends_at,
    matrix,
    deals,
    skipped_lines: diagnostics.rows_skipped_no_tiers,
    warnings,
    diagnostics,
  };
}

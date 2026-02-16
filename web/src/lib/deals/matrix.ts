const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const SKU_RE = /\b([A-Z]{2,}[0-9]{2,}[A-Z]?)\b/;
const RATIO_RE = /\b(\d{1,3})\+(\d{1,3})\b/g;

export interface DealTier {
  buy_qty: number;
  free_qty: number;
}

export interface ParsedDealRow {
  sku: string;
  tiers: Array<DealTier & { deal_text: string }>;
}

export interface ParsedDealEntry extends DealTier {
  sku: string;
  starts_at: string;
  ends_at: string;
}

export interface ParsedDealsMatrix {
  starts_at: string;
  ends_at: string;
  matrix: ParsedDealRow[];
  deals: ParsedDealEntry[];
  skipped_lines: number;
  warnings: string[];
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function makeDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatDealText(buy_qty: number, free_qty: number): string {
  return `Buy ${buy_qty} get ${free_qty} FREE`;
}

export function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase();
}

export function parseDealText(dealText: string): DealTier | null {
  const text = dealText.trim();
  if (!text) return null;

  const buyGet = text.match(/buy\s+(\d{1,3})\+?\s*get\s+(\d{1,3})\s*free/i);
  if (buyGet) {
    return {
      buy_qty: Number.parseInt(buyGet[1], 10),
      free_qty: Number.parseInt(buyGet[2], 10),
    };
  }

  const ratio = text.match(/\b(\d{1,3})\+(\d{1,3})\b/);
  if (ratio) {
    return {
      buy_qty: Number.parseInt(ratio[1], 10),
      free_qty: Number.parseInt(ratio[2], 10),
    };
  }

  return null;
}

export function extractEffectiveDateRange(
  rawText: string,
): { starts_at: string; ends_at: string } | null {
  const normalized = rawText.replace(/[‐‑‒–—]/g, "-");
  const match = normalized.match(
    /DEAL EFFECTIVE DATES\s+([A-Z]{3,9})\s+(\d{1,2})\s*-\s*(?:([A-Z]{3,9})\s+)?(\d{1,2}),?\s*(\d{4})/i,
  );
  if (!match) return null;

  const startMonthKey = match[1].slice(0, 3).toUpperCase();
  const startMonth = MONTHS[startMonthKey];
  const endMonthKey = (match[3] ?? match[1]).slice(0, 3).toUpperCase();
  const endMonth = MONTHS[endMonthKey];
  if (!startMonth || !endMonth) return null;

  const startDay = Number.parseInt(match[2], 10);
  const endDay = Number.parseInt(match[4], 10);
  const year = Number.parseInt(match[5], 10);

  return {
    starts_at: makeDate(year, startMonth, startDay),
    ends_at: makeDate(year, endMonth, endDay),
  };
}

function dedupeTiers(tiers: DealTier[]): DealTier[] {
  const unique = new Map<string, DealTier>();
  for (const tier of tiers) {
    if (!Number.isFinite(tier.buy_qty) || !Number.isFinite(tier.free_qty)) continue;
    if (tier.buy_qty <= 0 || tier.free_qty <= 0) continue;
    unique.set(`${tier.buy_qty}:${tier.free_qty}`, tier);
  }
  return [...unique.values()];
}

function extractRatioTiers(line: string): DealTier[] {
  // Ignore "1+2=3" or other math/content artifacts.
  if (line.includes("=")) return [];
  const tiers: DealTier[] = [];
  for (const match of line.matchAll(RATIO_RE)) {
    tiers.push({
      buy_qty: Number.parseInt(match[1], 10),
      free_qty: Number.parseInt(match[2], 10),
    });
  }
  return dedupeTiers(tiers);
}

function extractInlineBuyGetTiers(line: string): DealTier[] {
  const tiers: DealTier[] = [];
  for (const match of line.matchAll(/buy\s+(\d{1,3})\+?\s*get\s+(\d{1,3})\s*free/gi)) {
    tiers.push({
      buy_qty: Number.parseInt(match[1], 10),
      free_qty: Number.parseInt(match[2], 10),
    });
  }
  return dedupeTiers(tiers);
}

function splitLines(rawText: string): string[] {
  return rawText
    .replace(/[‐‑‒–—]/g, "-")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractSku(line: string): string | null {
  const match = line.match(SKU_RE);
  if (!match) return null;
  return normalizeSku(match[1]);
}

export function parseDealsMatrixText(rawText: string): ParsedDealsMatrix {
  const dateRange = extractEffectiveDateRange(rawText);
  if (!dateRange) {
    throw new Error("Could not find effective date range in deals PDF.");
  }

  const lines = splitLines(rawText);
  const skuToTiers = new Map<string, DealTier[]>();
  const warnings: string[] = [];
  let skippedLines = 0;

  let activeTiers: DealTier[] = [];
  let pendingBuyQty: number | null = null;

  for (const line of lines) {
    const sku = extractSku(line);
    if (sku) {
      if (activeTiers.length === 0) {
        skippedLines += 1;
        continue;
      }
      const existing = skuToTiers.get(sku) ?? [];
      skuToTiers.set(sku, dedupeTiers([...existing, ...activeTiers]));
      continue;
    }

    const ratioTiers = extractRatioTiers(line);
    if (ratioTiers.length > 0) {
      activeTiers = ratioTiers;
      pendingBuyQty = null;
      continue;
    }

    const inlineBuyGet = extractInlineBuyGetTiers(line);
    if (inlineBuyGet.length > 0) {
      activeTiers = dedupeTiers([...activeTiers, ...inlineBuyGet]);
      pendingBuyQty = null;
      continue;
    }

    const buyOnly = line.match(/^buy\s+(\d{1,3})\+?\s*$/i);
    if (buyOnly) {
      pendingBuyQty = Number.parseInt(buyOnly[1], 10);
      continue;
    }

    const getOnly = line.match(/^get\s+(\d{1,3})\s*free$/i);
    if (getOnly && pendingBuyQty !== null) {
      activeTiers = dedupeTiers([
        ...activeTiers,
        {
          buy_qty: pendingBuyQty,
          free_qty: Number.parseInt(getOnly[1], 10),
        },
      ]);
      pendingBuyQty = null;
      continue;
    }
  }

  const matrix = [...skuToTiers.entries()]
    .map(([sku, tiers]) => ({
      sku,
      tiers: dedupeTiers(tiers)
        .sort((a, b) => a.buy_qty - b.buy_qty || a.free_qty - b.free_qty)
        .map((tier) => ({
          ...tier,
          deal_text: formatDealText(tier.buy_qty, tier.free_qty),
        })),
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  if (matrix.length === 0) {
    warnings.push("No SKU deals were parsed from the PDF.");
  }

  const deals: ParsedDealEntry[] = [];
  for (const row of matrix) {
    for (const tier of row.tiers) {
      deals.push({
        sku: row.sku,
        buy_qty: tier.buy_qty,
        free_qty: tier.free_qty,
        starts_at: dateRange.starts_at,
        ends_at: dateRange.ends_at,
      });
    }
  }

  return {
    starts_at: dateRange.starts_at,
    ends_at: dateRange.ends_at,
    matrix,
    deals,
    skipped_lines: skippedLines,
    warnings,
  };
}

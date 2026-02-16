import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { importDealsSchema } from "@/lib/validation";
import { normalizeSku } from "@/lib/deals/matrix";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = importDealsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const deduped = new Map<
    string,
    {
      sku: string;
      buy_qty: number;
      free_qty: number;
      starts_at: string;
      ends_at: string;
    }
  >();

  for (const row of parsed.data.deals) {
    if (row.starts_at > row.ends_at) {
      return NextResponse.json(
        { error: `Invalid date range for SKU ${row.sku}` },
        { status: 400 },
      );
    }

    const normalized = {
      sku: normalizeSku(row.sku),
      buy_qty: row.buy_qty,
      free_qty: row.free_qty,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    };
    deduped.set(
      `${normalized.sku}:${normalized.buy_qty}:${normalized.free_qty}:${normalized.starts_at}:${normalized.ends_at}`,
      normalized,
    );
  }

  const rows = [...deduped.values()];

  const { error: deleteError } = await auth.admin
    .from("deals")
    .delete()
    .not("id", "is", null);

  if (deleteError) {
    return NextResponse.json(
      { error: "Failed to clear existing deals", details: deleteError.message },
      { status: 500 },
    );
  }

  const { error: insertError } = await auth.admin
    .from("deals")
    .insert(rows);

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to import deals", details: insertError.message },
      { status: 500 },
    );
  }

  const uniqueSkus = [...new Set(rows.map((row) => row.sku))];
  let knownSkus = new Set<string>();
  if (uniqueSkus.length > 0) {
    const { data: knownRows, error: knownError } = await auth.admin
      .from("catalog_items")
      .select("sku")
      .in("sku", uniqueSkus);
    if (knownError) {
      return NextResponse.json(
        { error: "Deals imported, but SKU validation failed", details: knownError.message },
        { status: 500 },
      );
    }
    knownSkus = new Set((knownRows ?? []).map((row) => row.sku));
  }

  const unknownSkus = uniqueSkus.filter((sku) => !knownSkus.has(sku));

  return NextResponse.json({
    ok: true,
    imported_deal_rows: rows.length,
    imported_skus: uniqueSkus.length,
    unknown_skus: unknownSkus.length,
    unknown_sku_list: unknownSkus.slice(0, 100),
    source_file: parsed.data.source_file ?? null,
  });
}

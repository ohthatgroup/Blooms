import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createDealSchema } from "@/lib/validation";
import {
  formatDealText,
  normalizeSku,
  parseDealText,
} from "@/lib/deals/matrix";

interface DealRow {
  id: string;
  sku: string;
  buy_qty: number;
  free_qty: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
}

function toDealResponse(row: DealRow) {
  return {
    ...row,
    sku: normalizeSku(row.sku),
    deal_text: formatDealText(row.buy_qty, row.free_qty),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const skuFilter = request.nextUrl.searchParams.get("sku");
  const activeOn = request.nextUrl.searchParams.get("active_on");

  let query = auth.admin
    .from("deals")
    .select("id,sku,buy_qty,free_qty,starts_at,ends_at,created_at")
    .order("sku")
    .order("starts_at")
    .order("buy_qty");

  if (skuFilter) {
    query = query.eq("sku", normalizeSku(skuFilter));
  }

  if (activeOn) {
    query = query.lte("starts_at", activeOn).gte("ends_at", activeOn);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch deals", details: error.message },
      { status: 500 },
    );
  }

  const deals = (data ?? []).map((row) => toDealResponse(row as DealRow));
  return NextResponse.json({ deals });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = createDealSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let buyQty = parsed.data.buy_qty;
  let freeQty = parsed.data.free_qty;
  if (buyQty === undefined || freeQty === undefined) {
    const parsedDeal = parseDealText(parsed.data.deal_text ?? "");
    if (!parsedDeal) {
      return NextResponse.json(
        { error: "Failed to parse deal text. Expected Buy X get Y FREE format." },
        { status: 400 },
      );
    }
    buyQty = parsedDeal.buy_qty;
    freeQty = parsedDeal.free_qty;
  }

  const { data, error } = await auth.admin
    .from("deals")
    .insert({
      sku: normalizeSku(parsed.data.sku),
      buy_qty: buyQty,
      free_qty: freeQty,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
    })
    .select("id,sku,buy_qty,free_qty,starts_at,ends_at,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deal: toDealResponse(data as DealRow) }, { status: 201 });
}

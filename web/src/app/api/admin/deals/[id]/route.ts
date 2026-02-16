import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchDealSchema } from "@/lib/validation";
import { formatDealText, parseDealText } from "@/lib/deals/matrix";

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
    deal_text: formatDealText(row.buy_qty, row.free_qty),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchDealSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: existing, error: existingError } = await auth.admin
    .from("deals")
    .select("id,starts_at,ends_at,buy_qty,free_qty")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { error: "Failed to load existing deal", details: existingError.message },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (parsed.data.deal_text) {
    const parsedDeal = parseDealText(parsed.data.deal_text);
    if (!parsedDeal) {
      return NextResponse.json(
        { error: "Failed to parse deal text. Expected Buy X get Y FREE format." },
        { status: 400 },
      );
    }
    update.buy_qty = parsedDeal.buy_qty;
    update.free_qty = parsedDeal.free_qty;
  } else if (
    parsed.data.buy_qty !== undefined &&
    parsed.data.free_qty !== undefined
  ) {
    update.buy_qty = parsed.data.buy_qty;
    update.free_qty = parsed.data.free_qty;
  }

  if (parsed.data.starts_at !== undefined) {
    update.starts_at = parsed.data.starts_at;
  }
  if (parsed.data.ends_at !== undefined) {
    update.ends_at = parsed.data.ends_at;
  }

  const startsAt = (update.starts_at as string | undefined) ?? existing.starts_at;
  const endsAt = (update.ends_at as string | undefined) ?? existing.ends_at;
  if (startsAt > endsAt) {
    return NextResponse.json(
      { error: "starts_at must be on or before ends_at" },
      { status: 400 },
    );
  }

  const { data, error } = await auth.admin
    .from("deals")
    .update(update)
    .eq("id", id)
    .select("id,sku,buy_qty,free_qty,starts_at,ends_at,created_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deal: toDealResponse(data as DealRow) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { error } = await auth.admin
    .from("deals")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

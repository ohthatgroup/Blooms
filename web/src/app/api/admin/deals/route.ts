import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createDealSchema } from "@/lib/validation";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const catalogId = request.nextUrl.searchParams.get("catalog_id");
  if (!catalogId) {
    return NextResponse.json({ error: "catalog_id is required" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("catalog_deals")
    .select("*")
    .eq("catalog_id", catalogId)
    .order("sku")
    .order("starts_at");

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch deals", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deals: data });
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

  const { data, error } = await auth.admin
    .from("catalog_deals")
    .insert(parsed.data)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to create deal", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ deal: data }, { status: 201 });
}

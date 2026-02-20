import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createCatalogItemSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = createCatalogItemSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .select("id")
    .eq("id", parsed.data.catalog_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (catalogError || !catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  // Get next display_order
  const { data: maxRow } = await auth.admin
    .from("catalog_items")
    .select("display_order")
    .eq("catalog_id", parsed.data.catalog_id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextDisplayOrder = (maxRow?.display_order ?? 0) + 1;

  const { data: item, error: insertError } = await auth.admin
    .from("catalog_items")
    .insert({
      catalog_id: parsed.data.catalog_id,
      sku: parsed.data.sku,
      name: parsed.data.name,
      upc: parsed.data.upc ?? null,
      pack: parsed.data.pack ?? null,
      category: parsed.data.category,
      price: parsed.data.price ?? null,
      image_storage_path: parsed.data.image_storage_path ?? "",
      approved: true,
      display_order: nextDisplayOrder,
      parse_issues: [],
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insertError || !item) {
    return NextResponse.json(
      { error: "Failed to create item", details: insertError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ item }, { status: 201 });
}

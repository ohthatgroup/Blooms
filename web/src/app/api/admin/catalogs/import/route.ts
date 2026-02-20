import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { importCatalogSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = importCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Create catalog row (no PDF, no parsing needed)
  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .insert({
      version_label: parsed.data.version_label,
      pdf_storage_path: "",
      status: "ready",
      parse_status: "complete",
      parse_summary: {
        source: "csv_import",
        total_items: parsed.data.items.length,
      },
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (catalogError || !catalog) {
    return NextResponse.json(
      { error: "Failed to create catalog", details: catalogError?.message },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  const catalogItems = parsed.data.items.map((item, index) => ({
    catalog_id: catalog.id,
    sku: item.sku,
    name: item.name,
    upc: item.upc ?? null,
    pack: item.pack ?? null,
    price: item.price ?? null,
    category: item.category,
    image_storage_path: "",
    approved: true,
    display_order: index + 1,
    parse_issues: [],
    updated_at: now,
  }));

  // Insert in batches to avoid payload limits
  const BATCH_SIZE = 500;
  for (let i = 0; i < catalogItems.length; i += BATCH_SIZE) {
    const batch = catalogItems.slice(i, i + BATCH_SIZE);
    const { error: insertError } = await auth.admin
      .from("catalog_items")
      .insert(batch);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to insert catalog items", details: insertError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { catalog_id: catalog.id, item_count: catalogItems.length },
    { status: 201 },
  );
}

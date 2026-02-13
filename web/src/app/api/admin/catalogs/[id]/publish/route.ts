import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .select("id,status,parse_status,parse_summary,deleted_at")
    .eq("id", id)
    .single();

  if (catalogError || !catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  if (catalog.deleted_at) {
    return NextResponse.json(
      { error: "Catalog is archived and cannot be published" },
      { status: 400 },
    );
  }

  if (catalog.parse_status === "queued" || catalog.parse_status === "processing") {
    return NextResponse.json(
      { error: "Catalog cannot be published while parsing is still in progress." },
      { status: 400 },
    );
  }

  if (catalog.parse_status === "failed") {
    return NextResponse.json(
      { error: "Catalog cannot be published because parsing failed." },
      { status: 400 },
    );
  }

  const parseSummary = (catalog.parse_summary ?? {}) as { failed_items?: number };
  const failedItems = Number(parseSummary.failed_items ?? 0);
  if (failedItems > 0) {
    return NextResponse.json(
      { error: `Catalog cannot be published because ${failedItems} items failed parsing.` },
      { status: 400 },
    );
  }

  const { data: pendingItems, error: itemsError } = await auth.admin
    .from("catalog_items")
    .select("id,sku,image_storage_path,approved,parse_issues")
    .eq("catalog_id", id)
    .or("approved.eq.false,image_storage_path.eq.");

  if (itemsError) {
    return NextResponse.json(
      { error: "Failed to validate catalog items" },
      { status: 500 },
    );
  }

  if ((pendingItems ?? []).length > 0) {
    return NextResponse.json(
      {
        error: "Catalog cannot be published",
        details:
          "All items must be approved and must have images before publishing.",
        pendingCount: pendingItems.length,
      },
      { status: 400 },
    );
  }

  const { error: updateError } = await auth.admin
    .from("catalogs")
    .update({
      status: "published",
      parse_status: "complete",
      published_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to publish catalog", details: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

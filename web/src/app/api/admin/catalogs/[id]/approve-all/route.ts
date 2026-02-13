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
    .select("id,deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (catalogError) {
    return NextResponse.json(
      { error: "Failed to load catalog", details: catalogError.message },
      { status: 500 },
    );
  }

  if (!catalog || catalog.deleted_at) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  const { count: pendingCount, error: pendingError } = await auth.admin
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", id)
    .eq("approved", false);

  if (pendingError) {
    return NextResponse.json(
      { error: "Failed to count pending items", details: pendingError.message },
      { status: 500 },
    );
  }

  const { error: updateError } = await auth.admin
    .from("catalog_items")
    .update({
      approved: true,
      updated_at: new Date().toISOString(),
    })
    .eq("catalog_id", id)
    .eq("approved", false);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to approve catalog items", details: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, updatedCount: pendingCount ?? 0 });
}

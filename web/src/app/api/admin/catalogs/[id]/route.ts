import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data: catalog, error } = await auth.admin
    .from("catalogs")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error || !catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  const [{ count: totalItems }, { count: approvedItems }, { data: lastJob }] =
    await Promise.all([
      auth.admin
        .from("catalog_items")
        .select("id", { count: "exact", head: true })
        .eq("catalog_id", id),
      auth.admin
        .from("catalog_items")
        .select("id", { count: "exact", head: true })
        .eq("catalog_id", id)
        .eq("approved", true),
      auth.admin
        .from("parser_jobs")
        .select("id,status,error_log,created_at,started_at,finished_at")
        .eq("catalog_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return NextResponse.json({
    catalog,
    stats: {
      totalItems: totalItems ?? 0,
      approvedItems: approvedItems ?? 0,
    },
    parserJob: lastJob ?? null,
  });
}

export async function DELETE(
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

  if (!catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  if (catalog.deleted_at) {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const deletedAt = new Date().toISOString();
  const { error: archiveError } = await auth.admin
    .from("catalogs")
    .update({
      status: "archived",
      deleted_at: deletedAt,
      deleted_by: auth.user.id,
    })
    .eq("id", id);

  if (archiveError) {
    return NextResponse.json(
      { error: "Failed to archive catalog", details: archiveError.message },
      { status: 500 },
    );
  }

  const { error: linksError } = await auth.admin
    .from("customer_links")
    .update({ active: false, disabled_at: deletedAt })
    .eq("catalog_id", id)
    .eq("active", true);

  if (linksError) {
    return NextResponse.json(
      { error: "Catalog archived but failed to disable links", details: linksError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

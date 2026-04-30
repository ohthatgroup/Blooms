import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { classifyParserHealth } from "@/lib/parser/status";

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
        .select(
          "id,status,attempts,error_log,created_at,started_at,finished_at,total_items,reused_items,queued_items,processed_items,failed_items,progress_percent,progress_label,parsed_pages,total_pages",
        )
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
    health: classifyParserHealth(catalog, lastJob),
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
    .select("id,deleted_at,pdf_storage_path")
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

  const [
    { count: orderCount, error: orderCountError },
    { count: linkCount, error: linkCountError },
    { data: catalogItems, error: itemPathsError },
  ] = await Promise.all([
    auth.admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("catalog_id", id),
    auth.admin
      .from("customer_links")
      .select("id", { count: "exact", head: true })
      .eq("catalog_id", id),
    auth.admin
      .from("catalog_items")
      .select("image_storage_path")
      .eq("catalog_id", id),
  ]);

  if (orderCountError || linkCountError || itemPathsError) {
    return NextResponse.json(
      {
        error: "Failed to inspect catalog dependencies before delete",
        details: orderCountError?.message || linkCountError?.message || itemPathsError?.message,
      },
      { status: 500 },
    );
  }

  const deletedAt = new Date().toISOString();
  const imagePaths = Array.from(
    new Set(
      (catalogItems ?? [])
        .map((item) => item.image_storage_path)
        .filter((path): path is string => Boolean(path)),
    ),
  );

  const { error: parserItemsDeleteError } = await auth.admin
    .from("parser_job_items")
    .delete()
    .eq("catalog_id", id);

  if (parserItemsDeleteError) {
    return NextResponse.json(
      { error: "Failed to remove parser job items", details: parserItemsDeleteError.message },
      { status: 500 },
    );
  }

  const { error: parserJobsDeleteError } = await auth.admin
    .from("parser_jobs")
    .delete()
    .eq("catalog_id", id);

  if (parserJobsDeleteError) {
    return NextResponse.json(
      { error: "Failed to remove parser queue entries", details: parserJobsDeleteError.message },
      { status: 500 },
    );
  }

  const hardDeleteAllowed = (orderCount ?? 0) === 0 && (linkCount ?? 0) === 0;

  if (hardDeleteAllowed) {
    const { error: catalogDeleteError } = await auth.admin
      .from("catalogs")
      .delete()
      .eq("id", id);

    if (catalogDeleteError) {
      return NextResponse.json(
        { error: "Failed to hard delete catalog", details: catalogDeleteError.message },
        { status: 500 },
      );
    }

    const storageErrors: string[] = [];
    if (catalog.pdf_storage_path) {
      const { error } = await auth.admin.storage
        .from("catalog-pdfs")
        .remove([catalog.pdf_storage_path]);
      if (error) storageErrors.push(error.message);
    }
    if (imagePaths.length > 0) {
      const { error } = await auth.admin.storage
        .from("product-images")
        .remove(imagePaths);
      if (error) storageErrors.push(error.message);
    }

    return NextResponse.json({
      ok: true,
      deleted: "hard",
      removedParserQueue: true,
      storageErrors,
    });
  }

  const { error: itemDeleteError } = await auth.admin
    .from("catalog_items")
    .delete()
    .eq("catalog_id", id);

  if (itemDeleteError) {
    return NextResponse.json(
      { error: "Failed to remove catalog items", details: itemDeleteError.message },
      { status: 500 },
    );
  }

  const { error: archiveError } = await auth.admin
    .from("catalogs")
    .update({
      status: "archived",
      parse_status: "failed",
      parse_summary: {
        deleted_at: deletedAt,
        delete_mode: "archived_with_references",
        parser_queue_removed: true,
      },
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

  return NextResponse.json({
    ok: true,
    deleted: "archived",
    removedParserQueue: true,
    retainedReferences: {
      orders: orderCount ?? 0,
      customerLinks: linkCount ?? 0,
    },
  });
}

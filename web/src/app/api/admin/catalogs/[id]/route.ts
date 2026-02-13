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


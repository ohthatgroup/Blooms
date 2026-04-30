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
  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .select("id,version_label,status,parse_status,parse_summary,created_at,published_at")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (catalogError || !catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  const { data: parserJob, error: jobError } = await auth.admin
    .from("parser_jobs")
    .select(
      "id,catalog_id,status,attempts,error_log,created_at,started_at,finished_at,total_items,reused_items,queued_items,processed_items,failed_items,progress_percent,progress_label,parsed_pages,total_pages",
    )
    .eq("catalog_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json(
      { error: "Failed to load parser status", details: jobError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    catalog,
    parserJob: parserJob ?? null,
    health: classifyParserHealth(catalog, parserJob),
  });
}

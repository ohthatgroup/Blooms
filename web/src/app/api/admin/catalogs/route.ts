import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { triggerParserWorkflow } from "@/lib/github-actions";
import { createCatalogSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("catalogs")
    .select(
      "id,version_label,status,parse_status,parse_summary,created_at,published_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch catalogs", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ catalogs: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = createCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: catalog, error: insertError } = await auth.admin
    .from("catalogs")
    .insert({
      version_label: parsed.data.versionLabel,
      pdf_storage_path: parsed.data.pdfStoragePath,
      status: "draft",
      parse_status: "queued",
      parse_summary: {},
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (insertError || !catalog) {
    return NextResponse.json(
      { error: "Failed to create catalog", details: insertError?.message },
      { status: 500 },
    );
  }

  const { data: parserJob, error: jobError } = await auth.admin
    .from("parser_jobs")
    .insert({
      catalog_id: catalog.id,
      status: "queued",
      attempts: 0,
    })
    .select("id")
    .single();

  if (jobError || !parserJob) {
    return NextResponse.json(
      { error: "Catalog created but job queue failed", catalog_id: catalog.id },
      { status: 500 },
    );
  }

  const workflowResult = await triggerParserWorkflow({
    reason: "catalog_uploaded",
    catalogId: catalog.id,
  });

  return NextResponse.json(
    {
      catalog_id: catalog.id,
      parser_job_id: parserJob.id,
      pdf_storage_path: parsed.data.pdfStoragePath,
      parser_triggered: workflowResult.triggered,
      parser_trigger_message: workflowResult.message,
      workflow_run_url: workflowResult.workflowRunUrl,
      workflow_run_confirmed: workflowResult.workflowRunConfirmed ?? false,
      next_action: workflowResult.triggered
        ? workflowResult.workflowRunConfirmed
          ? "wait_for_parser"
          : "check_github_actions"
        : "retry_trigger",
    },
    { status: 201 },
  );
}

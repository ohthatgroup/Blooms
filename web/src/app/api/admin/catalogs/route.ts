import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { createCatalogSchema } from "@/lib/validation";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("catalogs")
    .select(
      "id,version_label,status,parse_status,parse_summary,created_at,published_at",
    )
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

  const { error: jobError } = await auth.admin.from("parser_jobs").insert({
    catalog_id: catalog.id,
    status: "queued",
    attempts: 0,
  });

  if (jobError) {
    return NextResponse.json(
      { error: "Catalog created but job queue failed", catalog_id: catalog.id },
      { status: 500 },
    );
  }

  return NextResponse.json({ catalog_id: catalog.id }, { status: 201 });
}


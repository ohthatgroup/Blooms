import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { parseDealsPdfBuffer } from "@/lib/deals/pdf-parse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const parsed = await parseDealsPdfBuffer(buffer);
    const skus = parsed.matrix.map((row) => row.sku);
    const diagnostics = parsed.diagnostics ?? {
      parsed_pages: 0,
      table_headers_detected: 0,
      sku_rows_detected: 0,
      sku_rows_with_free_tiers: 0,
      rows_skipped_non_free: 0,
      rows_skipped_no_tiers: 0,
      parser_engine: "pdfjs-dist",
      used_legacy_fallback: false,
    };

    let knownSkus = new Set<string>();
    if (skus.length > 0) {
      const { data: knownRows, error: knownError } = await auth.admin
        .from("catalog_items")
        .select("sku")
        .in("sku", skus);
      if (knownError) {
        return NextResponse.json(
          { error: "Failed to validate parsed SKUs", details: knownError.message },
          { status: 500 },
        );
      }
      knownSkus = new Set((knownRows ?? []).map((row) => row.sku));
    }

    const unknownSkus = skus.filter((sku) => !knownSkus.has(sku));

    return NextResponse.json({
      ...parsed,
      source_file: file.name,
      summary: {
        total_skus: parsed.matrix.length,
        total_deal_rows: parsed.deals.length,
        known_skus: skus.length - unknownSkus.length,
        unknown_skus: unknownSkus.length,
        skipped_lines: parsed.skipped_lines,
        parsed_pages: diagnostics.parsed_pages,
        table_headers_detected: diagnostics.table_headers_detected,
        sku_rows_detected: diagnostics.sku_rows_detected,
        sku_rows_with_free_tiers: diagnostics.sku_rows_with_free_tiers,
        rows_skipped_non_free: diagnostics.rows_skipped_non_free,
        rows_skipped_no_tiers: diagnostics.rows_skipped_no_tiers,
        parser_engine: diagnostics.parser_engine,
        used_legacy_fallback: Boolean(diagnostics.used_legacy_fallback),
      },
      unknown_sku_list: unknownSkus.slice(0, 100),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse deals PDF",
      },
      { status: 400 },
    );
  }
}

import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin-nav";
import { CatalogReviewClient } from "@/components/admin/catalog-review-client";
import { AutoRefreshWhenEnabled } from "@/components/admin/auto-refresh-when-enabled";

export default async function CatalogReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();
  const { id } = await params;

  const { data: catalog } = await admin
    .from("catalogs")
    .select("id,version_label,parse_status,parse_summary")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const parseStatus = catalog?.parse_status ?? "";
  const parseSummary = (catalog?.parse_summary ?? {}) as {
    progress_percent?: number;
    failed_items?: number;
  };
  const progressPercent = Math.max(
    0,
    Math.min(
      100,
      Number.isFinite(parseSummary.progress_percent)
        ? Number(parseSummary.progress_percent)
        : parseStatus === "needs_review" || parseStatus === "complete"
          ? 100
          : 0,
    ),
  );
  const parseActive = parseStatus === "queued" || parseStatus === "processing";
  const hasBlockingParseFailures =
    parseStatus === "failed" || Number(parseSummary.failed_items ?? 0) > 0;

  return (
    <div className="container grid">
      <AutoRefreshWhenEnabled enabled={parseActive} />
      <AdminNav />
      <div>
        <Link href="/admin">Back to Catalogs</Link>
      </div>
      {parseActive || hasBlockingParseFailures ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{catalog?.version_label ?? "Catalog"}</h2>
          <div className="muted">
            {parseActive
              ? "Parsing in progress. Review is disabled until 100%."
              : "Parsing has blocking failures. Re-run parser before review."}
          </div>
          <div
            style={{
              marginTop: 12,
              width: "100%",
              maxWidth: 480,
              height: 12,
              borderRadius: 999,
              background: "#eceff1",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "#1565c0",
                transition: "width 0.25s ease",
              }}
            />
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {progressPercent}%
          </div>
          {hasBlockingParseFailures && (
            <div className="pill red" style={{ marginTop: 8 }}>
              Failed items: {parseSummary.failed_items ?? 0}
            </div>
          )}
        </div>
      ) : (
        <CatalogReviewClient catalogId={id} />
      )}
    </div>
  );
}

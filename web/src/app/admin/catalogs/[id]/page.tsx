import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CatalogReviewClient } from "@/components/admin/catalog-review-client";
import { AutoRefreshWhenEnabled } from "@/components/admin/auto-refresh-when-enabled";

export default async function CatalogReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
      <div>
        <Link href="/admin" className="button secondary">
          &larr; Back to Catalogs
        </Link>
      </div>
      {parseActive || hasBlockingParseFailures ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{catalog?.version_label ?? "Catalog"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className={`badge badge--${parseActive ? "processing" : "error"}`}>
              <span className="badge__dot" />
              {parseActive
                ? "Parsing in progress"
                : "Blocking failures"}
            </span>
          </div>
          <div className="muted" style={{ marginBottom: 12 }}>
            {parseActive
              ? "Review is disabled until parsing reaches 100%."
              : "Re-run parser before review."}
          </div>
          <div className="progress progress--lg" style={{ maxWidth: 480 }}>
            <div
              className={`progress__bar${progressPercent >= 100 ? " progress__bar--complete" : ""}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {progressPercent}%
          </div>
          {hasBlockingParseFailures && (
            <span className="badge badge--error" style={{ marginTop: 8 }}>
              <span className="badge__dot" />
              Failed items: {parseSummary.failed_items ?? 0}
            </span>
          )}
        </div>
      ) : (
        <CatalogReviewClient catalogId={id} />
      )}
    </div>
  );
}

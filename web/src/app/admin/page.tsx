import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CatalogUploadPanel } from "@/components/admin/catalog-upload-panel";
import { CatalogDeleteButton } from "@/components/admin/catalog-delete-button";
import { AutoRefreshWhenEnabled } from "@/components/admin/auto-refresh-when-enabled";

export default async function AdminPage() {
  const admin = createSupabaseAdminClient();

  const { data: catalogs } = await admin
    .from("catalogs")
    .select("id,version_label,status,parse_status,parse_summary,created_at,published_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const hasActiveParse = (catalogs ?? []).some(
    (catalog) => catalog.parse_status === "queued" || catalog.parse_status === "processing",
  );

  const catalogList = catalogs ?? [];
  const totalCatalogs = catalogList.length;
  const publishedCount = catalogList.filter((c) => c.status === "published").length;
  const draftCount = catalogList.filter((c) => c.status === "draft").length;
  const parsingCount = catalogList.filter(
    (c) => c.parse_status === "queued" || c.parse_status === "processing",
  ).length;

  return (
    <div className="container grid">
      <AutoRefreshWhenEnabled enabled={hasActiveParse} />

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card__value">{totalCatalogs}</div>
          <div className="stat-card__label">Total Catalogs</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-card__value">{publishedCount}</div>
          <div className="stat-card__label">Published</div>
        </div>
        <div className="stat-card stat-card--orange">
          <div className="stat-card__value">{draftCount}</div>
          <div className="stat-card__label">Drafts</div>
        </div>
        <div className="stat-card stat-card--purple">
          <div className="stat-card__value">{parsingCount}</div>
          <div className="stat-card__label">Parsing</div>
        </div>
      </div>

      {/* Upload Section */}
      <div className="section-header">
        <h2 className="section-header__title">Upload New Catalog</h2>
      </div>
      <CatalogUploadPanel />

      {/* Catalogs Table */}
      <div className="section-header">
        <h2 className="section-header__title">Catalogs</h2>
      </div>

      {catalogList.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">&#128218;</div>
            <p className="empty-state__title">No catalogs yet</p>
            <p className="empty-state__description">Upload a catalog PDF to get started.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-container">
            <div className="table-container__body">
              <table className="table table-mobile-cards">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Parse</th>
                    <th>Created</th>
                    <th>Published</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {catalogList.map((catalog) => {
                    const summary = (catalog.parse_summary ?? {}) as {
                      new_items?: number;
                      updated_items?: number;
                      unchanged_items?: number;
                      removed_items?: number;
                      progress_percent?: number;
                      raw_candidates?: number;
                      unique_skus?: number;
                      failed_items?: number;
                    };
                    const parseProgress = Math.max(
                      0,
                      Math.min(
                        100,
                        Number.isFinite(summary.progress_percent)
                          ? Number(summary.progress_percent)
                          : catalog.parse_status === "complete" ||
                              catalog.parse_status === "needs_review"
                            ? 100
                            : 0,
                      ),
                    );
                    const parseActive =
                      catalog.parse_status === "queued" || catalog.parse_status === "processing";
                    const hasDiffSummary =
                      typeof summary.new_items === "number" ||
                      typeof summary.updated_items === "number" ||
                      typeof summary.unchanged_items === "number" ||
                      typeof summary.removed_items === "number";
                    const hasBlockingParseFailures =
                      catalog.parse_status === "failed" || (summary.failed_items ?? 0) > 0;

                    return (
                      <tr key={catalog.id}>
                        <td style={{ fontWeight: 600 }}>{catalog.version_label}</td>
                        <td>
                          <span className={`badge badge--${catalog.status === "published" ? "published" : "draft"}`}>
                            <span className="badge__dot" />
                            {catalog.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span className={`badge badge--${parseActive ? "processing" : catalog.parse_status === "failed" ? "error" : "complete"}`}>
                              <span className="badge__dot" />
                              {catalog.parse_status}
                            </span>
                          </div>
                          {parseActive ? (
                            <>
                              <div className="progress" style={{ width: 160 }}>
                                <div
                                  className="progress__bar"
                                  style={{ width: `${parseProgress}%` }}
                                />
                              </div>
                              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                {parseProgress}% (parsing)
                              </div>
                            </>
                          ) : (
                            <>
                              {hasDiffSummary ? (
                                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                  {summary.new_items ?? 0} new, {summary.updated_items ?? 0} updated, {summary.unchanged_items ?? 0} unchanged, {summary.removed_items ?? 0} removed
                                </div>
                              ) : (summary.unique_skus ?? summary.raw_candidates) ? (
                                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                  {summary.unique_skus ?? summary.raw_candidates ?? 0} total items
                                </div>
                              ) : null}
                            </>
                          )}
                          {hasBlockingParseFailures && (
                            <span className="badge badge--error" style={{ marginTop: 4 }}>
                              <span className="badge__dot" />
                              Failures: {summary.failed_items ?? 0}
                            </span>
                          )}
                        </td>
                        <td>{new Date(catalog.created_at).toLocaleString()}</td>
                        <td>
                          {catalog.published_at
                            ? new Date(catalog.published_at).toLocaleString()
                            : "-"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 8 }}>
                            {parseProgress >= 100 && !parseActive && !hasBlockingParseFailures ? (
                              <Link className="button secondary" href={`/admin/catalogs/${catalog.id}`}>
                                Review
                              </Link>
                            ) : (
                              <button className="button secondary" disabled>
                                Review
                              </button>
                            )}
                            <CatalogDeleteButton catalogId={catalog.id} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="mobile-card-list">
            {catalogList.map((catalog) => {
              const summary = (catalog.parse_summary ?? {}) as {
                progress_percent?: number;
                failed_items?: number;
                new_items?: number;
                updated_items?: number;
                unchanged_items?: number;
                removed_items?: number;
                raw_candidates?: number;
                unique_skus?: number;
              };
              const parseProgress = Math.max(
                0,
                Math.min(
                  100,
                  Number.isFinite(summary.progress_percent)
                    ? Number(summary.progress_percent)
                    : catalog.parse_status === "complete" ||
                        catalog.parse_status === "needs_review"
                      ? 100
                      : 0,
                ),
              );
              const parseActive =
                catalog.parse_status === "queued" || catalog.parse_status === "processing";
              const hasBlockingParseFailures =
                catalog.parse_status === "failed" || (summary.failed_items ?? 0) > 0;

              return (
                <div className="mobile-card" key={catalog.id}>
                  <div className="mobile-card__row">
                    <span className="mobile-card__label">Version</span>
                    <span className="mobile-card__value" style={{ fontWeight: 600 }}>{catalog.version_label}</span>
                  </div>
                  <div className="mobile-card__row">
                    <span className="mobile-card__label">Status</span>
                    <span className={`badge badge--${catalog.status === "published" ? "published" : "draft"}`}>
                      <span className="badge__dot" />
                      {catalog.status}
                    </span>
                  </div>
                  <div className="mobile-card__row">
                    <span className="mobile-card__label">Parse</span>
                    <span className={`badge badge--${parseActive ? "processing" : catalog.parse_status === "failed" ? "error" : "complete"}`}>
                      <span className="badge__dot" />
                      {catalog.parse_status}
                    </span>
                  </div>
                  {parseActive ? (
                    <div style={{ margin: "8px 0" }}>
                      <div className="progress">
                        <div
                          className="progress__bar"
                          style={{ width: `${parseProgress}%` }}
                        />
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {parseProgress}% (parsing)
                      </div>
                    </div>
                  ) : (
                    <div className="mobile-card__row">
                      <span className="mobile-card__label">Items</span>
                      <span className="mobile-card__value muted" style={{ fontSize: 12 }}>
                        {typeof summary.new_items === "number"
                          ? `${summary.new_items} new, ${summary.updated_items ?? 0} upd, ${summary.unchanged_items ?? 0} unch, ${summary.removed_items ?? 0} rem`
                          : `${summary.unique_skus ?? summary.raw_candidates ?? 0} total`}
                      </span>
                    </div>
                  )}
                  {hasBlockingParseFailures && (
                    <span className="badge badge--error" style={{ marginTop: 4 }}>
                      <span className="badge__dot" />
                      Failures: {summary.failed_items ?? 0}
                    </span>
                  )}
                  <div className="mobile-card__row">
                    <span className="mobile-card__label">Created</span>
                    <span className="mobile-card__value">{new Date(catalog.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mobile-card__actions">
                    {parseProgress >= 100 && !parseActive && !hasBlockingParseFailures ? (
                      <Link className="button secondary" href={`/admin/catalogs/${catalog.id}`}>
                        Review
                      </Link>
                    ) : (
                      <button className="button secondary" disabled>
                        Review
                      </button>
                    )}
                    <CatalogDeleteButton catalogId={catalog.id} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

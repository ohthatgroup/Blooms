/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CatalogDeal } from "@/lib/types";

interface CatalogReviewClientProps {
  catalogId: string;
}

interface CatalogItemRow {
  id: string;
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  image_storage_path: string;
  image_url: string;
  parse_issues: string[];
  approved: boolean;
  change_type?: "new" | "updated" | "unchanged";
}

interface CatalogSummaryState {
  version_label?: string;
  parse_status?: string;
  status?: string;
  parse_summary?: {
    new_items?: number;
    updated_items?: number;
    unchanged_items?: number;
    removed_items?: number;
    baseline_catalog_id?: string | null;
  };
}

interface ParserJobState {
  id: string;
  status: "queued" | "processing" | "success" | "failed";
  attempts: number;
  error_log: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function CatalogReviewClient({ catalogId }: CatalogReviewClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [catalogSummary, setCatalogSummary] = useState<CatalogSummaryState>({});
  const [lastParserJob, setLastParserJob] = useState<ParserJobState | null>(null);

  // Deals state
  const [deals, setDeals] = useState<CatalogDeal[]>([]);
  const [newDealSku, setNewDealSku] = useState("");
  const [newDealText, setNewDealText] = useState("");
  const [newDealStart, setNewDealStart] = useState(todayStr());
  const [newDealEnd, setNewDealEnd] = useState("");
  const [skuSuggestions, setSkuSuggestions] = useState<string[]>([]);
  const [showSkuSuggestions, setShowSkuSuggestions] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  async function load(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }
    const [catalogRes, itemsRes, dealsRes] = await Promise.all([
      fetch(`/api/admin/catalogs/${catalogId}`),
      fetch(`/api/admin/catalogs/${catalogId}/items`),
      fetch(`/api/admin/deals?catalog_id=${catalogId}`),
    ]);
    const catalogBody = await catalogRes.json().catch(() => ({}));
    const itemsBody = await itemsRes.json().catch(() => ({}));
    const dealsBody = await dealsRes.json().catch(() => ({}));
    setCatalogSummary(catalogBody.catalog ?? {});
    setLastParserJob(catalogBody.parserJob ?? null);
    setItems(itemsBody.items ?? []);
    setDeals(dealsBody.deals ?? []);
    if (!options?.silent) {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const approved = items.filter((x) => x.approved).length;
    const missingImage = items.filter((x) => !x.image_storage_path).length;
    return { total, approved, missingImage };
  }, [items]);

  const parseSummary = catalogSummary.parse_summary ?? {};
  const isParserActive =
    catalogSummary.parse_status === "queued" || catalogSummary.parse_status === "processing";
  const hasDiffSummary =
    typeof parseSummary.new_items === "number" ||
    typeof parseSummary.updated_items === "number" ||
    typeof parseSummary.unchanged_items === "number" ||
    typeof parseSummary.removed_items === "number";

  useEffect(() => {
    if (!isParserActive) return;
    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParserActive, catalogId]);

  async function updateItem(itemId: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/catalog-items/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatusText(body.error || "Failed to update item");
      return;
    }
    const body = await response.json();
    setItems((prev) => prev.map((x) => (x.id === itemId ? { ...x, ...body.item } : x)));
    setStatusText("Item updated");
  }

  async function replaceImage(item: CatalogItemRow, file: File) {
    const supabase = createSupabaseBrowserClient();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `catalog-items/${catalogId}/${item.sku}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { upsert: true });
    if (error) {
      setStatusText(`Image upload failed: ${error.message}`);
      return;
    }

    await updateItem(item.id, { image_storage_path: path });
    await load();
  }

  async function publishCatalog() {
    const response = await fetch(`/api/admin/catalogs/${catalogId}/publish`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatusText(body.error || "Publish failed");
      return;
    }
    setStatusText("Catalog published");
    await load();
  }

  async function approveAllItems() {
    setApprovingAll(true);
    const response = await fetch(`/api/admin/catalogs/${catalogId}/approve-all`, {
      method: "POST",
    });
    const body = await response.json().catch(() => ({}));
    setApprovingAll(false);
    if (!response.ok) {
      setStatusText(body.error || "Approve all failed");
      return;
    }
    setStatusText(`Approved ${body.updatedCount ?? 0} items`);
    await load();
  }

  async function deleteCatalog() {
    const confirmed = window.confirm(
      "Archive this catalog? It will be hidden and all links for it will be disabled.",
    );
    if (!confirmed) return;

    setDeleting(true);
    const response = await fetch(`/api/admin/catalogs/${catalogId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));
    setDeleting(false);

    if (!response.ok) {
      setStatusText(body.error || "Delete failed");
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  // --- Deal CRUD ---

  async function addDeal() {
    if (!newDealSku || !newDealText || !newDealStart || !newDealEnd) {
      setStatusText("Please fill in all deal fields");
      return;
    }
    const response = await fetch("/api/admin/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        catalog_id: catalogId,
        sku: newDealSku,
        deal_text: newDealText,
        starts_at: newDealStart,
        ends_at: newDealEnd,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatusText(body.error || "Failed to create deal");
      return;
    }
    setDeals((prev) => [...prev, body.deal]);
    setNewDealSku("");
    setNewDealText("");
    setNewDealEnd("");
    setStatusText("Deal added");
  }

  async function updateDeal(dealId: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatusText(body.error || "Failed to update deal");
      return;
    }
    const body = await response.json();
    setDeals((prev) => prev.map((d) => (d.id === dealId ? body.deal : d)));
    setStatusText("Deal updated");
  }

  async function deleteDeal(dealId: string) {
    if (!window.confirm("Delete this deal?")) return;
    const response = await fetch(`/api/admin/deals/${dealId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatusText(body.error || "Failed to delete deal");
      return;
    }
    setDeals((prev) => prev.filter((d) => d.id !== dealId));
    setStatusText("Deal deleted");
  }

  function handleSkuInput(value: string) {
    setNewDealSku(value);
    if (value.length > 0) {
      const q = value.toLowerCase();
      const matches = items
        .map((i) => i.sku)
        .filter((sku) => sku.toLowerCase().includes(q))
        .slice(0, 8);
      setSkuSuggestions(matches);
      setShowSkuSuggestions(matches.length > 0);
    } else {
      setShowSkuSuggestions(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <div className="muted">Loading catalog review...</div>
      </div>
    );
  }

  return (
    <div className="grid">
      {/* Header */}
      <div className="section-header">
        <h2 className="section-header__title">{catalogSummary.version_label ?? "Catalog"}</h2>
        <div className="section-header__actions">
          <button
            className="button"
            onClick={publishCatalog}
            disabled={stats.total === 0 || stats.approved !== stats.total || stats.missingImage > 0}
          >
            Publish Catalog
          </button>
          <button className="button secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__label">Total Items</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-card__value">{stats.approved}</div>
          <div className="stat-card__label">Approved</div>
        </div>
        <div className="stat-card stat-card--orange">
          <div className="stat-card__value">{stats.missingImage}</div>
          <div className="stat-card__label">Missing Images</div>
        </div>
        {hasDiffSummary && (
          <div className="stat-card stat-card--purple">
            <div className="stat-card__value">
              {(parseSummary.new_items ?? 0) + (parseSummary.updated_items ?? 0)}
            </div>
            <div className="stat-card__label">Changes (new + updated)</div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="button secondary" onClick={approveAllItems} disabled={approvingAll}>
          {approvingAll ? "Approving..." : "Approve All Items"}
        </button>
        <button
          className="button secondary"
          onClick={deleteCatalog}
          disabled={deleting}
          style={{ borderColor: "var(--red)", color: "var(--red)" }}
        >
          {deleting ? "Deleting..." : "Delete Catalog"}
        </button>
      </div>

      {isParserActive && (
        <span className="badge badge--processing">
          <span className="badge__dot" />
          Parser is running. Auto-refreshing every 5 seconds.
        </span>
      )}

      {/* Status Message */}
      {statusText && (
        <span className={`badge ${statusText.includes("failed") || statusText.includes("Failed") ? "badge--error" : "badge--success"}`}>
          <span className="badge__dot" />
          {statusText}
        </span>
      )}

      {/* Parser Job Info */}
      {lastParserJob && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Last parser job:</span>
            <span className={`badge badge--${lastParserJob.status === "success" ? "success" : lastParserJob.status === "failed" ? "error" : "processing"}`}>
              <span className="badge__dot" />
              {lastParserJob.status}
            </span>
            <span className="muted">Attempts: {lastParserJob.attempts}</span>
          </div>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
            Queued: {new Date(lastParserJob.created_at).toLocaleString()}
            {lastParserJob.started_at
              ? ` | Started: ${new Date(lastParserJob.started_at).toLocaleString()}`
              : ""}
            {lastParserJob.finished_at
              ? ` | Finished: ${new Date(lastParserJob.finished_at).toLocaleString()}`
              : ""}
          </div>
          {lastParserJob.error_log && (
            <span className="badge badge--error" style={{ marginTop: 8 }}>
              <span className="badge__dot" />
              {lastParserJob.error_log}
            </span>
          )}
        </div>
      )}

      {/* Deals Section */}
      <div className="table-container">
        <div className="table-container__header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong>Deals</strong>
          <span className="badge badge--processing">
            <span className="badge__dot" />
            {deals.length}
          </span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
            <div style={{ position: "relative", minWidth: 120 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 2 }}>SKU</label>
              <input
                className="input"
                value={newDealSku}
                placeholder="SKU"
                onChange={(e) => handleSkuInput(e.target.value)}
                onFocus={() => { if (skuSuggestions.length) setShowSkuSuggestions(true); }}
                onBlur={() => setTimeout(() => setShowSkuSuggestions(false), 150)}
              />
              {showSkuSuggestions && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 8, zIndex: 10, maxHeight: 160, overflowY: "auto",
                  boxShadow: "var(--shadow-md)",
                }}>
                  {skuSuggestions.map((sku) => (
                    <div
                      key={sku}
                      style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13 }}
                      onMouseDown={() => { setNewDealSku(sku); setShowSkuSuggestions(false); }}
                    >
                      {sku}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 2 }}>Deal Text</label>
              <input
                className="input"
                value={newDealText}
                placeholder="e.g. Buy 10 get 3 free"
                onChange={(e) => setNewDealText(e.target.value)}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 2 }}>Start Date</label>
              <input
                className="input"
                type="date"
                value={newDealStart}
                onChange={(e) => setNewDealStart(e.target.value)}
              />
            </div>
            <div style={{ minWidth: 140 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 2 }}>End Date</label>
              <input
                className="input"
                type="date"
                value={newDealEnd}
                onChange={(e) => setNewDealEnd(e.target.value)}
              />
            </div>
            <button className="button" onClick={addDeal}>Add Deal</button>
          </div>

          {deals.length === 0 ? (
            <div className="muted" style={{ textAlign: "center", padding: 16 }}>
              No deals yet. Add one above.
            </div>
          ) : (
            <div className="table-container__body">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Deal Text</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id}>
                      <td style={{ fontWeight: 600 }}>{deal.sku}</td>
                      <td>
                        <input
                          className="input"
                          value={deal.deal_text}
                          onChange={(e) =>
                            setDeals((prev) =>
                              prev.map((d) =>
                                d.id === deal.id ? { ...d, deal_text: e.target.value } : d,
                              ),
                            )
                          }
                          onBlur={(e) => void updateDeal(deal.id, { deal_text: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={deal.starts_at}
                          onChange={(e) =>
                            setDeals((prev) =>
                              prev.map((d) =>
                                d.id === deal.id ? { ...d, starts_at: e.target.value } : d,
                              ),
                            )
                          }
                          onBlur={(e) => void updateDeal(deal.id, { starts_at: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="date"
                          value={deal.ends_at}
                          onChange={(e) =>
                            setDeals((prev) =>
                              prev.map((d) =>
                                d.id === deal.id ? { ...d, ends_at: e.target.value } : d,
                              ),
                            )
                          }
                          onBlur={(e) => void updateDeal(deal.id, { ends_at: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          className="button secondary"
                          style={{ borderColor: "var(--red)", color: "var(--red)", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => void deleteDeal(deal.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <div className="table-container">
        <div className="table-container__body">
          <table className="table">
            <thead>
              <tr>
                <th>Image</th>
                <th>SKU</th>
                <th>Name</th>
                <th>UPC</th>
                <th>Pack</th>
                <th>Category</th>
                <th>Change</th>
                <th>Issues</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ minWidth: 140 }}>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        width={64}
                        height={64}
                        style={{ borderRadius: 6, objectFit: "cover" }}
                      />
                    ) : (
                      <span className="badge badge--error">
                        <span className="badge__dot" />
                        Missing
                      </span>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void replaceImage(item, file);
                          }
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{item.sku}</td>
                  <td style={{ minWidth: 220 }}>
                    <input
                      className="input"
                      value={item.name}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === item.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={(e) => void updateItem(item.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={item.upc ?? ""}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === item.id ? { ...x, upc: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={(e) => void updateItem(item.id, { upc: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={item.pack ?? ""}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === item.id ? { ...x, pack: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={(e) => void updateItem(item.id, { pack: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      value={item.category}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === item.id ? { ...x, category: e.target.value } : x,
                          ),
                        )
                      }
                      onBlur={(e) => void updateItem(item.id, { category: e.target.value })}
                    />
                  </td>
                  <td>
                    <span className={`badge badge--${item.change_type === "unchanged" ? "unchanged" : item.change_type === "updated" ? "updated" : "new"}`}>
                      <span className="badge__dot" />
                      {item.change_type ?? "new"}
                    </span>
                  </td>
                  <td style={{ maxWidth: 180 }}>
                    {(item.parse_issues ?? []).length ? (
                      <span className="badge badge--error">
                        <span className="badge__dot" />
                        {item.parse_issues.join(", ")}
                      </span>
                    ) : (
                      <span className="badge badge--success">
                        <span className="badge__dot" />
                        none
                      </span>
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={item.approved}
                      onChange={(e) => void updateItem(item.id, { approved: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

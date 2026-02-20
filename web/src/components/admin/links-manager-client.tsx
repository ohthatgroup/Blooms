"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { OrderDeleteButton } from "@/components/admin/order-delete-button";
import { BulkImportClient } from "@/components/admin/bulk-import-client";

interface CatalogOption {
  id: string;
  version_label: string;
}

interface LinkRow {
  id: string;
  token: string;
  catalog_id: string;
  customer_name: string;
  active: boolean;
  show_upc?: boolean;
  show_price?: boolean;
  created_at: string;
  catalogs?: { version_label: string };
  url: string;
  has_order?: boolean;
  order_id?: string | null;
  total_skus?: number;
  total_cases?: number;
  updated_at?: string | null;
}

interface LinksManagerClientProps {
  publishedCatalogs: CatalogOption[];
  initialLinks: LinkRow[];
}

export function LinksManagerClient({
  publishedCatalogs,
  initialLinks,
}: LinksManagerClientProps) {
  const [catalogId, setCatalogId] = useState(publishedCatalogs[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [message, setMessage] = useState("");
  const [lastCreatedUrl, setLastCreatedUrl] = useState<string>("");
  const [catalogDraftByLinkId, setCatalogDraftByLinkId] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(initialLinks.map((link) => [link.id, link.catalog_id])),
  );
  const [showBulkImport, setShowBulkImport] = useState(false);

  async function copyToClipboard(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied link to clipboard");
    } catch {
      const ok = window.prompt("Copy this link:", text);
      if (ok !== null) setMessage("Copy the link from the prompt");
    }
  }

  const loadLinks = async () => {
    const response = await fetch("/api/admin/links");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to load links");
      return;
    }
    const nextLinks = body.links ?? [];
    setLinks(nextLinks);
    setCatalogDraftByLinkId(
      Object.fromEntries(nextLinks.map((link: LinkRow) => [link.id, link.catalog_id])),
    );
  };

  const catalogOptionForLink = (link: LinkRow) => {
    const options = [...publishedCatalogs];
    if (
      link.catalog_id &&
      !options.some((catalog) => catalog.id === link.catalog_id)
    ) {
      options.unshift({
        id: link.catalog_id,
        version_label: link.catalogs?.version_label ?? "Current catalog",
      });
    }
    return options;
  };

  async function createLink(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setLastCreatedUrl("");
    const response = await fetch("/api/admin/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        catalog_id: catalogId,
        customer_name: customerName,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to create link");
      return;
    }
    setLastCreatedUrl(body.url ?? "");
    setMessage("Created link");
    setCustomerName("");
    await loadLinks();
  }

  async function deleteLink(id: string) {
    if (!window.confirm("Permanently delete this link and its order data? This cannot be undone.")) return;
    const response = await fetch(`/api/admin/links/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("Failed to delete link");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setMessage("Link deleted");
  }

  async function toggleLink(id: string, active: boolean) {
    const response = await fetch(`/api/admin/links/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (!response.ok) {
      setMessage("Failed to update link");
      return;
    }
    await loadLinks();
  }

  async function toggleVisibility(id: string, field: "show_upc" | "show_price", current: boolean) {
    const response = await fetch(`/api/admin/links/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: !current }),
    });
    if (!response.ok) {
      setMessage("Failed to update visibility");
      return;
    }
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: !current } : l)),
    );
  }

  async function updateLinkCatalog(id: string) {
    const nextCatalogId = catalogDraftByLinkId[id];
    if (!nextCatalogId) {
      setMessage("Select a catalog first");
      return;
    }

    const response = await fetch(`/api/admin/links/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ catalog_id: nextCatalogId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to update link catalog");
      return;
    }

    const migration = body.migration as
      | {
          kept_count?: number;
          dropped_count?: number;
          dropped_skus?: string[];
        }
      | undefined;

    if (migration) {
      setMessage(
        `Catalog updated. Kept ${migration.kept_count ?? 0} items, dropped ${migration.dropped_count ?? 0} items.`,
      );
    } else {
      setMessage("Catalog updated");
    }
    await loadLinks();
  }

  return (
    <div className="grid">
      {/* Create Link Form */}
      <form className="card" onSubmit={createLink}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ flex: "0 0 200px" }}
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
            required
          >
            {publishedCatalogs.map((catalog) => (
              <option key={catalog.id} value={catalog.id}>
                {catalog.version_label}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ flex: "1 1 200px" }}
            placeholder="Customer name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
          <button className="button" style={{ flex: "0 0 auto" }} disabled={!catalogId}>
            Generate Link
          </button>
        </div>
        {(message || lastCreatedUrl) && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
            {message ? (
              <span className={`badge ${message.includes("Failed") || message.includes("failed") ? "badge--error" : "badge--success"}`}>
                <span className="badge__dot" />
                {message}
              </span>
            ) : null}
            {lastCreatedUrl ? (
              <div className="url-display">
                <a href={lastCreatedUrl} target="_blank" rel="noreferrer">
                  {lastCreatedUrl}
                </a>
                <button
                  type="button"
                  className="button secondary"
                  style={{ padding: "6px 10px" }}
                  onClick={() => void copyToClipboard(lastCreatedUrl)}
                >
                  Copy
                </button>
              </div>
            ) : null}
          </div>
        )}
      </form>

      {/* Links Table - Desktop */}
      {links.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state__icon">&#128279;</div>
            <p className="empty-state__title">No customer links yet</p>
            <p className="empty-state__description">Create a link above to get started.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-container">
            <div className="table-container__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Customer Links</h3>
              <button className="button secondary" onClick={() => setShowBulkImport(true)}>
                Bulk Import Order
              </button>
            </div>
            <div className="table-container__body">
              <table className="table table-mobile-cards">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Catalog</th>
                    <th>Status</th>
                    <th>Visibility</th>
                    <th>Order</th>
                    <th>Updated</th>
                    <th>Link</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td style={{ fontWeight: 600 }}>{link.customer_name}</td>
                      <td>{link.catalogs?.version_label}</td>
                      <td>
                        <span className={`badge badge--${link.active ? "active" : "inactive"}`}>
                          <span className="badge__dot" />
                          {link.active ? "active" : "disabled"}
                        </span>
                      </td>
                      <td>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={link.show_upc !== false}
                            onChange={() => void toggleVisibility(link.id, "show_upc", link.show_upc !== false)}
                          />
                          UPC
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginTop: 2 }}>
                          <input
                            type="checkbox"
                            checked={link.show_price === true}
                            onChange={() => void toggleVisibility(link.id, "show_price", link.show_price === true)}
                          />
                          Price
                        </label>
                      </td>
                      <td>
                        {link.has_order ? (
                          <div className="muted">
                            {link.total_skus ?? 0} SKUs / {link.total_cases ?? 0} cases
                          </div>
                        ) : (
                          <span className="muted">No order yet</span>
                        )}
                      </td>
                      <td>
                        {link.updated_at ? new Date(link.updated_at).toLocaleString() : "-"}
                      </td>
                      <td>
                        {link.url ? (
                          <div className="url-display">
                            <a href={link.url} target="_blank" rel="noreferrer">
                              {link.url}
                            </a>
                            <button
                              type="button"
                              className="button secondary"
                              style={{ padding: "6px 10px" }}
                              onClick={() => void copyToClipboard(link.url)}
                            >
                              Copy
                            </button>
                          </div>
                        ) : (
                          <span className="muted">Set APP_BASE_URL</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8 }}>
                          <select
                            className="input"
                            style={{ minWidth: 170 }}
                            value={catalogDraftByLinkId[link.id] ?? link.catalog_id}
                            onChange={(e) =>
                              setCatalogDraftByLinkId((prev) => ({
                                ...prev,
                                [link.id]: e.target.value,
                              }))
                            }
                          >
                            {catalogOptionForLink(link).map((catalog) => (
                              <option key={catalog.id} value={catalog.id}>
                                {catalog.version_label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="button secondary"
                            onClick={() => void updateLinkCatalog(link.id)}
                            disabled={
                              (catalogDraftByLinkId[link.id] ?? link.catalog_id) ===
                              link.catalog_id
                            }
                          >
                            Update Catalog
                          </button>
                          {link.order_id ? (
                            <>
                              <Link className="button secondary" href={`/admin/orders/${link.order_id}`}>
                                Edit
                              </Link>
                              {link.has_order && (
                                <a className="button secondary" href={`/api/admin/orders/${link.order_id}/csv`} download>
                                  CSV
                                </a>
                              )}
                              <OrderDeleteButton orderId={link.order_id} onDeleted={() => void loadLinks()} />
                            </>
                          ) : null}
                          <button
                            className="button secondary"
                            onClick={() => void toggleLink(link.id, link.active)}
                          >
                            {link.active ? "Disable" : "Enable"}
                          </button>
                          <button
                            className="button secondary"
                            style={{ color: "var(--red)" }}
                            onClick={() => void deleteLink(link.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="mobile-card-list">
            {links.map((link) => (
              <div className="mobile-card" key={link.id}>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Customer</span>
                  <span className="mobile-card__value" style={{ fontWeight: 600 }}>{link.customer_name}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Catalog</span>
                  <span className="mobile-card__value">{link.catalogs?.version_label}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Status</span>
                  <span className={`badge badge--${link.active ? "active" : "inactive"}`}>
                    <span className="badge__dot" />
                    {link.active ? "active" : "disabled"}
                  </span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Order</span>
                  <span className="mobile-card__value">
                    {link.has_order
                      ? `${link.total_skus ?? 0} SKUs / ${link.total_cases ?? 0} cases`
                      : "No order yet"}
                  </span>
                </div>
                {link.url && (
                  <div style={{ marginTop: 8 }}>
                    <div className="url-display">
                      <a href={link.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                        {link.url}
                      </a>
                      <button
                        type="button"
                        className="button secondary"
                        style={{ padding: "4px 8px", fontSize: 12 }}
                        onClick={() => void copyToClipboard(link.url)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                <div className="mobile-card__actions">
                  <select
                    className="input"
                    value={catalogDraftByLinkId[link.id] ?? link.catalog_id}
                    onChange={(e) =>
                      setCatalogDraftByLinkId((prev) => ({
                        ...prev,
                        [link.id]: e.target.value,
                      }))
                    }
                  >
                    {catalogOptionForLink(link).map((catalog) => (
                      <option key={catalog.id} value={catalog.id}>
                        {catalog.version_label}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary"
                    onClick={() => void updateLinkCatalog(link.id)}
                    disabled={
                      (catalogDraftByLinkId[link.id] ?? link.catalog_id) === link.catalog_id
                    }
                  >
                    Update Catalog
                  </button>
                  {link.order_id ? (
                    <>
                      <Link className="button secondary" href={`/admin/orders/${link.order_id}`}>
                        Edit Order
                      </Link>
                      {link.has_order && (
                        <a className="button secondary" href={`/api/admin/orders/${link.order_id}/csv`} download>
                          CSV
                        </a>
                      )}
                      <OrderDeleteButton orderId={link.order_id} onDeleted={() => void loadLinks()} />
                    </>
                  ) : null}
                  <button
                    className="button secondary"
                    onClick={() => void toggleLink(link.id, link.active)}
                  >
                    {link.active ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="button secondary"
                    style={{ color: "var(--red)" }}
                    onClick={() => void deleteLink(link.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showBulkImport && (
        <BulkImportClient
          catalogs={publishedCatalogs}
          links={links.map((l) => ({
            id: l.id,
            customer_name: l.customer_name,
            catalog_id: l.catalog_id,
          }))}
          onClose={() => setShowBulkImport(false)}
          onSuccess={() => void loadLinks()}
        />
      )}
    </div>
  );
}

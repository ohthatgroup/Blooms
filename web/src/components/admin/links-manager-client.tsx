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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  };

  const shortUrl = (value: string) => {
    if (!value) return "";
    try {
      const url = new URL(value);
      return `${url.host}${url.pathname}`;
    } catch {
      return value;
    }
  };

  const orderSummary = (link: LinkRow) =>
    link.has_order
      ? `${link.total_skus ?? 0} SKUs / ${link.total_cases ?? 0} cases`
      : "No order yet";

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

  const renderStatus = (link: LinkRow) => (
    <div className="orders-status">
      <span className={`badge badge--${link.active ? "active" : "inactive"}`}>
        <span className="badge__dot" />
        {link.active ? "Active" : "Disabled"}
      </span>
      <span className={`badge badge--${link.has_order ? "processing" : "draft"}`}>
        <span className="badge__dot" />
        {link.has_order ? "Order started" : "No order yet"}
      </span>
    </div>
  );

  const renderLink = (link: LinkRow) =>
    link.url ? (
      <div className="orders-link">
        <a href={link.url} target="_blank" rel="noreferrer" title={link.url}>
          {shortUrl(link.url)}
        </a>
        <button
          type="button"
          className="button secondary orders-link__copy"
          onClick={() => void copyToClipboard(link.url)}
        >
          Copy
        </button>
      </div>
    ) : (
      <span className="muted">Set APP_BASE_URL</span>
    );

  const renderOrder = (link: LinkRow) => (
    <div className="orders-order">
      <span className={link.has_order ? undefined : "muted"}>{orderSummary(link)}</span>
      {link.order_id ? (
        <Link className="orders-order__edit" href={`/admin/orders/${link.order_id}`}>
          Edit
        </Link>
      ) : null}
    </div>
  );

  const renderRowMenu = (link: LinkRow) => {
    const menuOpen = openMenuId === link.id;
    const selectedCatalogId = catalogDraftByLinkId[link.id] ?? link.catalog_id;

    return (
      <div className="orders-menu">
        <button
          type="button"
          className="button secondary orders-menu__trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setOpenMenuId(menuOpen ? null : link.id)}
        >
          Settings
        </button>
        {menuOpen ? (
          <div className="orders-menu__panel" role="menu">
            <div className="orders-menu__group">
              <label className="form-label" htmlFor={`catalog-${link.id}`}>
                Catalog
              </label>
              <div className="orders-menu__catalog-row">
                <select
                  id={`catalog-${link.id}`}
                  className="input"
                  value={selectedCatalogId}
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
                  type="button"
                  className="button secondary"
                  onClick={() => void updateLinkCatalog(link.id)}
                  disabled={selectedCatalogId === link.catalog_id}
                >
                  Update
                </button>
              </div>
            </div>

            <div className="orders-menu__group orders-menu__toggles">
              <label>
                <input
                  type="checkbox"
                  checked={link.show_upc !== false}
                  onChange={() =>
                    void toggleVisibility(link.id, "show_upc", link.show_upc !== false)
                  }
                />
                Show UPC
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={link.show_price === true}
                  onChange={() =>
                    void toggleVisibility(link.id, "show_price", link.show_price === true)
                  }
                />
                Show price
              </label>
            </div>

            <div className="orders-menu__group orders-menu__actions">
              {link.order_id ? (
                <>
                  <Link className="button secondary" href={`/admin/orders/${link.order_id}`}>
                    Edit order
                  </Link>
                  {link.has_order ? (
                    <a
                      className="button secondary"
                      href={`/api/admin/orders/${link.order_id}/csv`}
                      download
                    >
                      Download CSV
                    </a>
                  ) : null}
                  <OrderDeleteButton
                    orderId={link.order_id}
                    onDeleted={() => {
                      setOpenMenuId(null);
                      void loadLinks();
                    }}
                  />
                </>
              ) : null}
              <button
                type="button"
                className="button secondary"
                onClick={() => void toggleLink(link.id, link.active)}
              >
                {link.active ? "Disable link" : "Enable link"}
              </button>
              <button
                type="button"
                className="button secondary orders-menu__danger"
                onClick={() => void deleteLink(link.id)}
              >
                Delete link
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

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
          <div className="table-container orders-table-container">
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
                    <th>Status</th>
                    <th>Link</th>
                    <th>Date Created</th>
                    <th>Order</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td>
                        <div className="orders-customer">
                          <strong>{link.customer_name}</strong>
                          <span>{link.catalogs?.version_label}</span>
                        </div>
                      </td>
                      <td>{renderStatus(link)}</td>
                      <td>{renderLink(link)}</td>
                      <td>{formatDateTime(link.created_at)}</td>
                      <td>{renderOrder(link)}</td>
                      <td>
                        {renderRowMenu(link)}
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
                  <span className="mobile-card__value">
                    <span className="orders-mobile-customer">{link.customer_name}</span>
                    <span className="muted">{link.catalogs?.version_label}</span>
                  </span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Status</span>
                  {renderStatus(link)}
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Link</span>
                  {renderLink(link)}
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Date Created</span>
                  <span className="mobile-card__value">{formatDateTime(link.created_at)}</span>
                </div>
                <div className="mobile-card__row">
                  <span className="mobile-card__label">Order</span>
                  {renderOrder(link)}
                </div>
                <div className="mobile-card__actions">
                  {renderRowMenu(link)}
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

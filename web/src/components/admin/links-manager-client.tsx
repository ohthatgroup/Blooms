"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

interface CatalogOption {
  id: string;
  version_label: string;
}

interface LinkRow {
  id: string;
  token: string;
  customer_name: string;
  active: boolean;
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

  async function copyToClipboard(text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied link to clipboard");
    } catch {
      // Fallback for older browsers / denied clipboard permissions.
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
    setLinks(body.links ?? []);
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

  return (
    <div className="grid">
      <form className="card grid" onSubmit={createLink}>
        <h2 style={{ margin: 0 }}>Create Customer Order Link</h2>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Catalog Version</span>
          <select
            className="input"
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
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Customer Name</span>
          <input
            className="input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        </label>
        <button className="button" disabled={!catalogId}>
          Generate Link
        </button>
        {(message || lastCreatedUrl) && (
          <div className="muted" style={{ display: "grid", gap: 8 }}>
            {message ? <div>{message}</div> : null}
            {lastCreatedUrl ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>Orders</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Catalog</th>
              <th>Status</th>
              <th>Order</th>
              <th>Updated</th>
              <th>Link</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id}>
                <td>{link.customer_name}</td>
                <td>{link.catalogs?.version_label}</td>
                <td>
                  <span className={`pill ${link.active ? "green" : "red"}`}>
                    {link.active ? "active" : "disabled"}
                  </span>
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
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                    <span className="muted">Set APP_BASE_URL for public links</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    {link.order_id ? (
                      <Link className="button secondary" href={`/admin/orders/${link.order_id}`}>
                        Edit Order
                      </Link>
                    ) : null}
                    <button
                      className="button secondary"
                      onClick={() => void toggleLink(link.id, link.active)}
                    >
                      {link.active ? "Disable" : "Enable"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
}

export function CatalogReviewClient({ catalogId }: CatalogReviewClientProps) {
  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogSummary, setCatalogSummary] = useState<{
    version_label?: string;
    parse_status?: string;
    status?: string;
  }>({});

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  async function load() {
    setLoading(true);
    const [catalogRes, itemsRes] = await Promise.all([
      fetch(`/api/admin/catalogs/${catalogId}`),
      fetch(`/api/admin/catalogs/${catalogId}/items`),
    ]);
    const catalogBody = await catalogRes.json().catch(() => ({}));
    const itemsBody = await itemsRes.json().catch(() => ({}));
    setCatalogSummary(catalogBody.catalog ?? {});
    setItems(itemsBody.items ?? []);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const total = items.length;
    const approved = items.filter((x) => x.approved).length;
    const missingImage = items.filter((x) => !x.image_storage_path).length;
    return { total, approved, missingImage };
  }, [items]);

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

  if (loading) {
    return <div className="card">Loading catalog review...</div>;
  }

  return (
    <div className="grid">
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{catalogSummary.version_label ?? "Catalog"}</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            Status: {catalogSummary.status} • Parse: {catalogSummary.parse_status}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            {stats.approved}/{stats.total} approved • {stats.missingImage} missing images
          </div>
        </div>
        <div style={{ display: "grid", alignContent: "start", gap: 8 }}>
          <button
            className="button"
            onClick={publishCatalog}
            disabled={stats.total === 0 || stats.approved !== stats.total || stats.missingImage > 0}
          >
            Publish Catalog
          </button>
          <button className="button secondary" onClick={load}>
            Refresh
          </button>
        </div>
      </div>
      {statusText && <div className="card">{statusText}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Image</th>
              <th>SKU</th>
              <th>Name</th>
              <th>UPC</th>
              <th>Pack</th>
              <th>Category</th>
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
                    <div className="pill red">Missing image</div>
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
                <td>{item.sku}</td>
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
                <td style={{ maxWidth: 180 }}>
                  {(item.parse_issues ?? []).length ? (
                    <div className="pill red">{item.parse_issues.join(", ")}</div>
                  ) : (
                    <div className="pill green">none</div>
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
  );
}

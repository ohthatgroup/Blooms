"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCatalogFile, type ParsedCatalogItem } from "@/lib/catalog/xlsx-parse";

export function CatalogXlsxUpload() {
  const router = useRouter();
  const [versionLabel, setVersionLabel] = useState("");
  const [items, setItems] = useState<ParsedCatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleFile(file: File) {
    setMessage("");
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const result = parseCatalogFile(buffer, file.name);
    setItems(result.items);
    setCategories(result.categories);
    setWarnings(result.warnings);

    if (result.items.length === 0) {
      setMessage("No items found in file. Check the format.");
    }
  }

  async function submit() {
    if (!versionLabel.trim() || items.length === 0) return;
    setUploading(true);
    setMessage("");

    const response = await fetch("/api/admin/catalogs/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version_label: versionLabel.trim(),
        items: items.map((i) => ({
          sku: i.sku,
          name: i.name,
          upc: i.upc,
          pack: i.pack,
          price: i.price,
          category: i.category,
        })),
      }),
    });
    const body = await response.json().catch(() => ({}));
    setUploading(false);

    if (!response.ok) {
      setMessage(body.error || "Failed to import catalog");
      return;
    }

    router.push(`/admin/catalogs/${body.catalog_id}`);
    router.refresh();
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Import from CSV/XLSX</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <div className="form-group" style={{ flex: "1 1 200px" }}>
          <label className="form-label">Version Label</label>
          <input
            className="input"
            placeholder="e.g. Spring 2026"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ flex: "1 1 200px" }}>
          <label className="form-label">File</label>
          <input
            className="input"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      </div>

      {fileName && items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            {items.length} items in {categories.length} categories from {fileName}
          </div>

          {warnings.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {warnings.slice(0, 5).map((w, i) => (
                <div key={i} className="badge badge--error" style={{ display: "block", marginBottom: 4 }}>
                  <span className="badge__dot" />
                  {w}
                </div>
              ))}
              {warnings.length > 5 && (
                <div className="muted">...and {warnings.length - 5} more warnings</div>
              )}
            </div>
          )}

          <details>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 8 }}>
              Preview first 10 items
            </summary>
            <div className="table-container__body">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>UPC</th>
                    <th>Pack</th>
                    <th>Price</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 10).map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{item.sku}</td>
                      <td>{item.name}</td>
                      <td>{item.upc ?? ""}</td>
                      <td>{item.pack ?? ""}</td>
                      <td>{item.price != null ? `$${item.price.toFixed(2)}` : ""}</td>
                      <td>{item.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <button
            className="button"
            onClick={submit}
            disabled={uploading || !versionLabel.trim()}
          >
            {uploading ? "Importing..." : `Import ${items.length} Items`}
          </button>
        </div>
      )}

      {message && (
        <span className={`badge ${message.includes("Failed") || message.includes("failed") || message.includes("No items") ? "badge--error" : "badge--success"}`}>
          <span className="badge__dot" />
          {message}
        </span>
      )}
    </div>
  );
}

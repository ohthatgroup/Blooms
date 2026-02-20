"use client";

import { useState, useCallback } from "react";
import { parseBulkOrderFile, type BulkOrderItem } from "@/lib/catalog/bulk-import";

interface CatalogOption {
  id: string;
  version_label: string;
}

interface LinkOption {
  id: string;
  customer_name: string;
  catalog_id: string;
}

interface BulkImportClientProps {
  catalogs: CatalogOption[];
  links: LinkOption[];
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkImportClient({
  catalogs,
  links,
  onClose,
  onSuccess,
}: BulkImportClientProps) {
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? "");
  const [customerName, setCustomerName] = useState("");
  const [linkId, setLinkId] = useState<string>("");
  const [mode, setMode] = useState<"new" | "existing">("new");

  const [parsedItems, setParsedItems] = useState<BulkOrderItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    matched_count: number;
    unmatched_count: number;
    unmatched_skus: string[];
    total_cases: number;
  } | null>(null);
  const [error, setError] = useState("");

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError("");
      setResult(null);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        const { items, warnings: w } = parseBulkOrderFile(buffer, file.name);
        setParsedItems(items);
        setWarnings(w);
        if (items.length === 0 && w.length === 0) {
          setWarnings(["No items found in file. Check that it has SKU and Qty columns."]);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [],
  );

  const linksForCatalog = links.filter((l) => l.catalog_id === catalogId);

  async function handleSubmit() {
    if (parsedItems.length === 0) return;
    setSubmitting(true);
    setError("");
    setResult(null);

    const body: Record<string, unknown> = {
      catalog_id: catalogId,
      customer_name: mode === "existing" && linkId
        ? links.find((l) => l.id === linkId)?.customer_name ?? customerName
        : customerName,
      items: parsedItems.map((i) => ({ sku: i.sku, qty: i.qty })),
    };
    if (mode === "existing" && linkId) {
      body.customer_link_id = linkId;
    }

    try {
      const res = await fetch("/api/admin/orders/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Import failed");
        if (data.unmatched_skus?.length) {
          setError((prev) => `${prev}. Unmatched: ${data.unmatched_skus.join(", ")}`);
        }
      } else {
        setResult(data);
        onSuccess();
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 700, maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Bulk Import Order</h2>
          <button className="button secondary" onClick={onClose} style={{ padding: "4px 12px" }}>
            &#10005;
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="radio"
              name="importMode"
              checked={mode === "new"}
              onChange={() => { setMode("new"); setLinkId(""); }}
            />
            New order
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="radio"
              name="importMode"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />
            Existing customer link
          </label>
        </div>

        {/* Catalog selector */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <select
            className="input"
            style={{ flex: "1 1 200px" }}
            value={catalogId}
            onChange={(e) => { setCatalogId(e.target.value); setLinkId(""); }}
          >
            {catalogs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.version_label}
              </option>
            ))}
          </select>
        </div>

        {mode === "new" ? (
          <input
            className="input"
            style={{ width: "100%", marginBottom: 12 }}
            placeholder="Customer name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        ) : (
          <select
            className="input"
            style={{ width: "100%", marginBottom: 12 }}
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
          >
            <option value="">-- Select customer link --</option>
            {linksForCatalog.map((l) => (
              <option key={l.id} value={l.id}>
                {l.customer_name}
              </option>
            ))}
          </select>
        )}

        {/* File upload */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>
            Upload CSV/XLSX with SKU &amp; Qty columns
          </label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="input"
          />
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {warnings.map((w, i) => (
              <div key={i} className="badge badge--error" style={{ marginBottom: 4, display: "block" }}>
                <span className="badge__dot" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Preview */}
        {parsedItems.length > 0 && (
          <>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              {parsedItems.length} items from &quot;{fileName}&quot;
            </div>
            <div style={{ maxHeight: 250, overflow: "auto", marginBottom: 12 }}>
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>SKU</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedItems.slice(0, 50).map((item, i) => (
                    <tr key={i}>
                      <td>{item.rowNum}</td>
                      <td>{item.sku}</td>
                      <td>{item.qty}</td>
                    </tr>
                  ))}
                  {parsedItems.length > 50 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        ... and {parsedItems.length - 50} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="badge badge--error" style={{ marginBottom: 12, display: "block" }}>
            <span className="badge__dot" />
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginBottom: 12, padding: 12, background: "var(--green-bg, #e8f5e9)", borderRadius: 8 }}>
            <strong>Import complete!</strong>
            <div>{result.matched_count} items matched, {result.total_cases} total cases</div>
            {result.unmatched_count > 0 && (
              <div className="muted" style={{ marginTop: 4 }}>
                {result.unmatched_count} SKUs not found: {result.unmatched_skus.slice(0, 10).join(", ")}
                {result.unmatched_skus.length > 10 && ` ... and ${result.unmatched_skus.length - 10} more`}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="button secondary" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              className="button"
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                parsedItems.length === 0 ||
                !catalogId ||
                (mode === "new" && !customerName.trim()) ||
                (mode === "existing" && !linkId)
              }
            >
              {submitting ? "Importing..." : `Import ${parsedItems.length} Items`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

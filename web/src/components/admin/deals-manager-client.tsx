"use client";

import { FormEvent, useMemo, useState } from "react";

interface DealRow {
  id: string;
  sku: string;
  buy_qty: number;
  free_qty: number;
  starts_at: string;
  ends_at: string;
  deal_text: string;
  created_at: string;
}

interface ParsedDealMatrixRow {
  sku: string;
  tiers: Array<{
    buy_qty: number;
    free_qty: number;
    deal_text: string;
  }>;
}

interface ParsedDealsPayload {
  starts_at: string;
  ends_at: string;
  matrix: ParsedDealMatrixRow[];
  deals: Array<{
    sku: string;
    buy_qty: number;
    free_qty: number;
    starts_at: string;
    ends_at: string;
  }>;
  summary?: {
    total_skus?: number;
    total_deal_rows?: number;
    known_skus?: number;
    unknown_skus?: number;
    skipped_lines?: number;
  };
  unknown_sku_list?: string[];
  source_file?: string;
  warnings?: string[];
  details?: string;
  hint?: string;
  code?: string;
}

interface DealsManagerClientProps {
  initialDeals: DealRow[];
}

function toDateInputValue(value: string): string {
  return value.slice(0, 10);
}

export function DealsManagerClient({ initialDeals }: DealsManagerClientProps) {
  const [deals, setDeals] = useState<DealRow[]>(initialDeals);
  const [message, setMessage] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedPayload, setParsedPayload] = useState<ParsedDealsPayload | null>(null);

  const [newSku, setNewSku] = useState("");
  const [newBuyQty, setNewBuyQty] = useState("1");
  const [newFreeQty, setNewFreeQty] = useState("1");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newEndsAt, setNewEndsAt] = useState("");

  const sortedDeals = useMemo(
    () =>
      [...deals].sort(
        (a, b) =>
          a.sku.localeCompare(b.sku) ||
          a.starts_at.localeCompare(b.starts_at) ||
          a.buy_qty - b.buy_qty,
      ),
    [deals],
  );

  function formatErrorMessage(body: Record<string, unknown>, fallback: string): string {
    const error = typeof body.error === "string" ? body.error : fallback;
    const details = typeof body.details === "string" ? body.details : "";
    const hint = typeof body.hint === "string" ? body.hint : "";
    const parts = [error];
    if (details) parts.push(details);
    if (hint) parts.push(`Hint: ${hint}`);
    return parts.join(" - ");
  }

  async function loadDeals() {
    const response = await fetch("/api/admin/deals");
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to load deals");
      return;
    }
    setDeals(body.deals ?? []);
  }

  async function parseDealsPdf(event: FormEvent) {
    event.preventDefault();
    if (!pdfFile) {
      setMessage("Choose a deals PDF first");
      return;
    }

    setParsing(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", pdfFile);

    const response = await fetch("/api/admin/deals/parse", {
      method: "POST",
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    setParsing(false);
    if (!response.ok) {
      setMessage(formatErrorMessage(body as Record<string, unknown>, "Failed to parse PDF"));
      return;
    }

    setParsedPayload(body as ParsedDealsPayload);
    setMessage(
      `Parsed ${body.summary?.total_skus ?? 0} SKUs and ${body.summary?.total_deal_rows ?? 0} deal rows.`,
    );
    if (body.starts_at) setNewStartsAt(body.starts_at);
    if (body.ends_at) setNewEndsAt(body.ends_at);
  }

  async function importParsedDeals() {
    if (!parsedPayload || parsedPayload.deals.length === 0) {
      setMessage("No parsed deals to import");
      return;
    }

    setImporting(true);
    const response = await fetch("/api/admin/deals/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deals: parsedPayload.deals,
        source_file: parsedPayload.source_file,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setImporting(false);
    if (!response.ok) {
      setMessage(formatErrorMessage(body as Record<string, unknown>, "Import failed"));
      return;
    }

    setMessage(
      `Imported ${body.imported_deal_rows ?? 0} deal rows across ${body.imported_skus ?? 0} SKUs.`,
    );
    await loadDeals();
  }

  async function addDeal(event: FormEvent) {
    event.preventDefault();
    const buyQty = Number.parseInt(newBuyQty, 10);
    const freeQty = Number.parseInt(newFreeQty, 10);
    if (!newSku.trim() || !newStartsAt || !newEndsAt || buyQty <= 0 || freeQty <= 0) {
      setMessage("Fill SKU, buy/free quantities, and start/end dates");
      return;
    }

    const response = await fetch("/api/admin/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: newSku.trim().toUpperCase(),
        buy_qty: buyQty,
        free_qty: freeQty,
        starts_at: newStartsAt,
        ends_at: newEndsAt,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to create deal");
      return;
    }
    setMessage("Deal created");
    setDeals((prev) => [body.deal, ...prev]);
    setNewSku("");
  }

  async function updateDeal(dealId: string, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to update deal");
      await loadDeals();
      return;
    }
    setDeals((prev) => prev.map((deal) => (deal.id === dealId ? body.deal : deal)));
    setMessage("Deal updated");
  }

  async function deleteDeal(dealId: string) {
    if (!window.confirm("Delete this deal?")) return;
    const response = await fetch(`/api/admin/deals/${dealId}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to delete deal");
      return;
    }
    setDeals((prev) => prev.filter((deal) => deal.id !== dealId));
    setMessage("Deal deleted");
  }

  return (
    <div className="grid">
      <form className="card" onSubmit={parseDealsPdf}>
        <h3 style={{ marginTop: 0 }}>Import Deals PDF</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ flex: "1 1 220px", width: "auto" }}
            type="file"
            accept="application/pdf"
            onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
            required
          />
          <button className="button" disabled={parsing || !pdfFile}>
            {parsing ? "Parsing..." : "Parse PDF"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={importing || !parsedPayload || parsedPayload.deals.length === 0}
            onClick={() => void importParsedDeals()}
          >
            {importing ? "Importing..." : "Import Parsed Deals"}
          </button>
        </div>
        {message && (
          <span
            className={`badge ${message.toLowerCase().includes("failed") ? "badge--error" : "badge--success"}`}
            style={{ marginTop: 10 }}
          >
            <span className="badge__dot" />
            {message}
          </span>
        )}
      </form>

      {parsedPayload && (
        <div className="table-container">
          <div className="table-container__header">
            <strong>Parsed SKU Matrix</strong>
          </div>
          <div style={{ padding: 16 }}>
            <div className="muted" style={{ marginBottom: 10 }}>
              Effective dates: {parsedPayload.starts_at} to {parsedPayload.ends_at}
            </div>
            <div className="muted" style={{ marginBottom: 10 }}>
              {parsedPayload.summary?.total_skus ?? parsedPayload.matrix.length} SKUs,{" "}
              {parsedPayload.summary?.total_deal_rows ?? parsedPayload.deals.length} deal rows,{" "}
              {parsedPayload.summary?.unknown_skus ?? 0} unknown SKUs,{" "}
              {parsedPayload.summary?.skipped_lines ?? 0} skipped lines.
            </div>
            {(parsedPayload.warnings ?? []).length > 0 && (
              <span className="badge badge--error" style={{ marginBottom: 10 }}>
                <span className="badge__dot" />
                {(parsedPayload.warnings ?? []).join(" | ")}
              </span>
            )}
            <div className="table-container__body">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Tiers</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedPayload.matrix.map((row) => (
                    <tr key={row.sku}>
                      <td style={{ fontWeight: 600 }}>{row.sku}</td>
                      <td>{row.tiers.map((tier) => tier.deal_text).join(" | ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <form className="card" onSubmit={addDeal}>
        <h3 style={{ marginTop: 0 }}>Add Deal Manually</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <input
            className="input"
            style={{ minWidth: 120 }}
            placeholder="SKU"
            value={newSku}
            onChange={(event) => setNewSku(event.target.value)}
            required
          />
          <input
            className="input"
            style={{ width: 90 }}
            type="number"
            min={1}
            placeholder="Buy"
            value={newBuyQty}
            onChange={(event) => setNewBuyQty(event.target.value)}
            required
          />
          <input
            className="input"
            style={{ width: 90 }}
            type="number"
            min={1}
            placeholder="Free"
            value={newFreeQty}
            onChange={(event) => setNewFreeQty(event.target.value)}
            required
          />
          <input
            className="input"
            style={{ width: 150 }}
            type="date"
            value={newStartsAt}
            onChange={(event) => setNewStartsAt(event.target.value)}
            required
          />
          <input
            className="input"
            style={{ width: 150 }}
            type="date"
            value={newEndsAt}
            onChange={(event) => setNewEndsAt(event.target.value)}
            required
          />
          <button className="button">Add Deal</button>
        </div>
      </form>

      <div className="table-container">
        <div className="table-container__header">
          <strong>Global Deals</strong>
        </div>
        <div className="table-container__body">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Buy</th>
                <th>Free</th>
                <th>Deal</th>
                <th>Start</th>
                <th>End</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedDeals.map((deal) => (
                <tr key={deal.id}>
                  <td style={{ fontWeight: 600 }}>{deal.sku}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number"
                      min={1}
                      value={deal.buy_qty}
                      onChange={(event) =>
                        setDeals((prev) =>
                          prev.map((row) =>
                            row.id === deal.id
                              ? { ...row, buy_qty: Number.parseInt(event.target.value, 10) || 1 }
                              : row,
                          ),
                        )
                      }
                      onBlur={() =>
                        void updateDeal(deal.id, {
                          buy_qty: deal.buy_qty,
                          free_qty: deal.free_qty,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 90 }}
                      type="number"
                      min={1}
                      value={deal.free_qty}
                      onChange={(event) =>
                        setDeals((prev) =>
                          prev.map((row) =>
                            row.id === deal.id
                              ? { ...row, free_qty: Number.parseInt(event.target.value, 10) || 1 }
                              : row,
                          ),
                        )
                      }
                      onBlur={() =>
                        void updateDeal(deal.id, {
                          buy_qty: deal.buy_qty,
                          free_qty: deal.free_qty,
                        })
                      }
                    />
                  </td>
                  <td>{deal.deal_text}</td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 150 }}
                      type="date"
                      value={toDateInputValue(deal.starts_at)}
                      onChange={(event) =>
                        setDeals((prev) =>
                          prev.map((row) =>
                            row.id === deal.id ? { ...row, starts_at: event.target.value } : row,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        void updateDeal(deal.id, { starts_at: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      style={{ width: 150 }}
                      type="date"
                      value={toDateInputValue(deal.ends_at)}
                      onChange={(event) =>
                        setDeals((prev) =>
                          prev.map((row) =>
                            row.id === deal.id ? { ...row, ends_at: event.target.value } : row,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        void updateDeal(deal.id, { ends_at: event.target.value })
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      style={{ borderColor: "var(--red)", color: "var(--red)" }}
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
      </div>
    </div>
  );
}

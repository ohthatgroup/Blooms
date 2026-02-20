/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import type { ProductForOrder } from "@/lib/types";
import type { BarcodeScannerDebugEvent } from "@/components/barcode-scanner";
import {
  buildDealTiers,
  getNextTierProgress,
  normalizeQtyForDeal,
  type QtyNormalizeMode,
} from "@/lib/deals/order-quantity";
import { matchesBarcodeQuery, pickSearchValueFromScan } from "@/lib/barcode";

const BarcodeScanner = lazy(() =>
  import("@/components/barcode-scanner").then((m) => ({ default: m.BarcodeScanner })),
);

interface OrderClientProps {
  token: string;
  linkCustomerName: string;
  catalogLabel: string;
  products: ProductForOrder[];
  showUpc?: boolean;
  debugScan?: boolean;
  initialLiveOrder: {
    id: string;
    customer_name: string;
    items: Array<{ sku: string; qty: number; note?: string }>;
  } | null;
}

export function OrderClient({
  token,
  linkCustomerName,
  catalogLabel,
  products,
  showUpc = true,
  debugScan = false,
  initialLiveOrder,
}: OrderClientProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [liveOrderId, setLiveOrderId] = useState<string | null>(
    initialLiveOrder?.id ?? null,
  );
  const [customerName, setCustomerName] = useState(
    initialLiveOrder?.customer_name ?? linkCustomerName,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const tiersBySku = new Map(
      products.map((product) => [product.sku, buildDealTiers(product.deals)]),
    );
    const seeded: Record<string, number> = {};
    for (const item of initialLiveOrder?.items ?? []) {
      const normalizedQty = normalizeQtyForDeal(
        item.qty,
        tiersBySku.get(item.sku) ?? [],
        "hydrate",
      );
      if (normalizedQty > 0) {
        seeded[item.sku] = normalizedQty;
      }
    }
    return seeded;
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(
    null,
  );
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const item of initialLiveOrder?.items ?? []) {
      if (item.note) seeded[item.sku] = item.note;
    }
    return seeded;
  });
  const [dealPopupSku, setDealPopupSku] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanDebugEvents, setScanDebugEvents] = useState<
    Array<{
      time: string;
      source: string;
      message: string;
      details?: Record<string, unknown>;
    }>
  >([]);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const dealTiersBySku = useMemo(
    () =>
      new Map(products.map((product) => [product.sku, buildDealTiers(product.deals)])),
    [products],
  );

  const categories = useMemo(
    () => Array.from(new Set(products.map((x) => x.category))),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeTab !== "ALL") {
      result = result.filter((p) => p.category === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          matchesBarcodeQuery(p.upc, q),
      );
    }
    return result;
  }, [activeTab, products, search]);

  const upcStats = useMemo(() => {
    let missing = 0;
    const lengths = new Map<number, number>();
    for (const product of products) {
      const digits = product.upc.replace(/\D/g, "");
      if (!digits) {
        missing += 1;
        continue;
      }
      lengths.set(digits.length, (lengths.get(digits.length) ?? 0) + 1);
    }
    return {
      missing,
      lengths: Array.from(lengths.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([length, count]) => `${length}:${count}`)
        .join(", "),
    };
  }, [products]);

  const pushScanDebug = useCallback(
    (source: string, message: string, details?: Record<string, unknown>) => {
      if (!debugScan) return;
      const time = new Date().toLocaleTimeString();
      setScanDebugEvents((prev) => {
        const next = [...prev, { time, source, message, details }];
        return next.slice(-20);
      });
      console.debug("[scan-debug]", source, message, details ?? {});
    },
    [debugScan],
  );

  const orderItems = useMemo(() => {
    return Object.entries(quantities)
      .map(([sku, qty]) => {
        const product = products.find((x) => x.sku === sku);
        if (!product) return null;
        return { ...product, qty, note: notes[sku] ?? "" };
      })
      .filter((x): x is ProductForOrder & { qty: number; note: string } => Boolean(x))
      .sort(
        (a, b) =>
          (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.sku.localeCompare(b.sku),
      );
  }, [notes, products, quantities]);

  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, x) => sum + x.qty, 0);
  const canDownload = totalSkus > 0 && customerName.trim().length > 0;

  const draftSignature = useMemo(() => {
    const name = customerName.trim();
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sku, qty]) => [sku, qty, notes[sku] ?? ""] as const);
    return JSON.stringify({ name, items });
  }, [customerName, notes, quantities]);

  const lastSavedSigRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const queuedSigRef = useRef<string | null>(null);

  const latestRef = useRef<{
    customerName: string;
    orderItems: Array<ProductForOrder & { qty: number; note: string }>;
    liveOrderId: string | null;
    draftSignature: string;
  }>({
    customerName,
    orderItems,
    liveOrderId,
    draftSignature,
  });
  latestRef.current = { customerName, orderItems, liveOrderId, draftSignature };

  function setQty(sku: string, raw: string | number, mode: QtyNormalizeMode) {
    const next = Math.max(0, parseInt(String(raw), 10) || 0);
    const normalized = normalizeQtyForDeal(next, dealTiersBySku.get(sku) ?? [], mode);
    setQuantities((prev) => {
      const copy = { ...prev };
      if (normalized === 0) {
        delete copy[sku];
        setNotes((n) => { const c = { ...n }; delete c[sku]; return c; });
      } else {
        copy[sku] = normalized;
      }
      return copy;
    });
  }

  const downloadCsv = useCallback(async () => {
    if (!orderItems.length || !customerName.trim()) return;
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/public/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        customer_name: customerName,
        items: orderItems.map((x) => ({ sku: x.sku, qty: x.qty, note: x.note || undefined })),
      }),
    });
    setLoading(false);

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.error || "Failed to submit order");
      return;
    }

    const blob = new Blob([body.csv], { type: "text/csv" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = body.file_name;
    link.click();
    URL.revokeObjectURL(objectUrl);
    setMessage("Order saved and CSV downloaded.");
    setShowReview(false);
  }, [customerName, orderItems, token]);

  const saveDraft = useCallback(async (opts?: { keepalive?: boolean; signature?: string }) => {
    const sigAtCall = opts?.signature ?? latestRef.current.draftSignature;
    if (savingRef.current) {
      queuedSigRef.current = sigAtCall;
      return;
    }

    // Avoid creating empty orders until the user actually adds something.
    if (latestRef.current.orderItems.length === 0 && latestRef.current.liveOrderId === null) {
      lastSavedSigRef.current = sigAtCall;
      setSaveState("idle");
      return;
    }

    savingRef.current = true;
    setSaveState("saving");

    const trimmedName = latestRef.current.customerName.trim();
    const payload: {
      token: string;
      customer_name?: string;
      items: Array<{ sku: string; qty: number }>;
    } = {
      token,
      items: latestRef.current.orderItems.map((x) => ({ sku: x.sku, qty: x.qty, note: x.note || undefined })),
    };

    if (trimmedName) {
      payload.customer_name = trimmedName;
    }

    try {
      const response = await fetch("/api/public/orders/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: Boolean(opts?.keepalive),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveState("error");
        return;
      }

      if (body.order_id && typeof body.order_id === "string") {
        setLiveOrderId(body.order_id);
      }
      lastSavedSigRef.current = sigAtCall;
      setLastSavedAt(body.updated_at ?? new Date().toISOString());
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      const queued = queuedSigRef.current;
      queuedSigRef.current = null;
      if (queued && queued !== lastSavedSigRef.current) {
        // Catch up immediately if changes happened during an in-flight save.
        void saveDraft({ keepalive: false, signature: queued });
      }
    }
  }, [token]);

  useEffect(() => {
    if (!zoomed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomed(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomed]);

  // Debounced autosave (skip initial hydration).
  useEffect(() => {
    if (lastSavedSigRef.current === null) {
      lastSavedSigRef.current = draftSignature;
      return;
    }
    if (draftSignature === lastSavedSigRef.current) return;
    if (orderItems.length === 0 && liveOrderId === null) return;

    const t = window.setTimeout(() => {
      void saveDraft({ keepalive: false, signature: draftSignature });
    }, 2500);
    return () => window.clearTimeout(t);
  }, [draftSignature, liveOrderId, orderItems.length, saveDraft]);

  // Best-effort flush when the user hides/closes the page.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) return;
      if (lastSavedSigRef.current === null) return;
      if (draftSignature === lastSavedSigRef.current) return;
      if (orderItems.length === 0 && liveOrderId === null) return;
      void saveDraft({ keepalive: true, signature: draftSignature });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [draftSignature, liveOrderId, orderItems.length, saveDraft]);

  const saveStatusText = useMemo(() => {
    if (saveState === "saving") return "Saving...";
    if (saveState === "error") return "Save failed (retrying)";
    if (saveState === "saved" && lastSavedAt) {
      return `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }
    return "";
  }, [lastSavedAt, saveState]);

  const handleScannerScan = useCallback(
    (code: string) => {
      const searchValue = pickSearchValueFromScan(code);
      const matches = products.filter((product) =>
        matchesBarcodeQuery(product.upc, searchValue),
      );
      pushScanDebug("order-client", "Scan decoded", {
        rawCode: code,
        appliedSearch: searchValue,
        matchCount: matches.length,
        firstMatches: matches.slice(0, 5).map((product) => ({
          sku: product.sku,
          upc: product.upc,
        })),
      });
      setSearch(searchValue);
      setShowScanner(false);
    },
    [products, pushScanDebug],
  );

  const handleScannerClose = useCallback(() => {
    setShowScanner(false);
    pushScanDebug("order-client", "Scanner closed by user");
  }, [pushScanDebug]);

  const handleScannerDebugEvent = useCallback(
    (event: BarcodeScannerDebugEvent) => {
      pushScanDebug(`scanner:${event.type}`, event.message, event.details);
    },
    [pushScanDebug],
  );

  return (
    <div className="container" style={{ paddingBottom: 90 }}>
      <div className="card" style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0 }}>Bloom Packaging Corp.</h1>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {catalogLabel} • {products.length} Products
        </div>
      </div>

      <div className="card grid" style={{ marginBottom: 10 }}>
        <label>
          <div style={{ fontSize: 13, marginBottom: 4 }}>Store / Customer Name</div>
          <input
            className="input"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="Search by name, SKU, or UPC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            style={{ padding: "8px 12px", fontSize: 18, lineHeight: 1 }}
            title="Scan barcode"
            onClick={() => setShowScanner(true)}
          >
            &#9783;
          </button>
        </div>
      </div>

      {debugScan && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Scanner Debug Mode</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Search: "{search || "(empty)"}" • Filtered: {filteredProducts.length} • UPC missing:{" "}
            {upcStats.missing} • UPC length map: {upcStats.lengths || "n/a"}
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>
              Recent scanner events ({scanDebugEvents.length})
            </summary>
            <pre
              style={{
                marginTop: 8,
                maxHeight: 180,
                overflow: "auto",
                background: "rgba(0,0,0,0.04)",
                padding: 8,
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              {scanDebugEvents
                .map(
                  (entry) =>
                    `[${entry.time}] ${entry.source}: ${entry.message}${
                      entry.details ? ` ${JSON.stringify(entry.details)}` : ""
                    }`,
                )
                .join("\n")}
            </pre>
          </details>
        </div>
      )}

      {showScanner && (
        <Suspense fallback={<div className="muted" style={{ textAlign: "center", padding: 20 }}>Loading scanner...</div>}>
          <BarcodeScanner
            onScan={handleScannerScan}
            onClose={handleScannerClose}
            debug={debugScan}
            onDebugEvent={handleScannerDebugEvent}
          />
        </Suspense>
      )}

      <div className="card" style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, minWidth: "max-content" }}>
          <button
            className={`button ${activeTab === "ALL" ? "" : "secondary"}`}
            onClick={() => setActiveTab("ALL")}
          >
            All ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`button ${activeTab === cat ? "" : "secondary"}`}
              onClick={() => setActiveTab(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="productGrid" style={{ marginBottom: 10 }}>
        {filteredProducts.map((product) => {
          const hasDeals = product.deals.length > 0;
          const dealTiers = dealTiersBySku.get(product.sku) ?? [];
          const qty = quantities[product.sku] ?? 0;
          const tierProgress = getNextTierProgress(qty, dealTiers);
          const openDealPopup = () => setDealPopupSku(product.sku);
          return (
            <div
              key={product.sku}
              className={`productCard${hasDeals ? " hasDeal isDealClickable" : ""}${qty > 0 ? " hasQty" : ""}`}
              onClick={hasDeals ? openDealPopup : undefined}
              onKeyDown={
                hasDeals
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDealPopup();
                      }
                    }
                  : undefined
              }
              role={hasDeals ? "button" : undefined}
              tabIndex={hasDeals ? 0 : undefined}
              aria-label={hasDeals ? `View deals for ${product.name}` : undefined}
            >
              <div className="cardSku">{product.sku}</div>
              <div className="cardName">{product.name}</div>
              <div className="cardMeta">
                {product.pack}{showUpc ? <> &middot; {product.upc}</> : null}
              </div>
              {hasDeals && (
                <button
                  className="cardDealBadge"
                  onClick={(e) => { e.stopPropagation(); setDealPopupSku(product.sku); }}
                >
                  DEAL
                </button>
              )}
              <div className="cardImageWrap">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    onClick={(event) => {
                      event.stopPropagation();
                      setZoomed({ url: product.imageUrl, alt: product.name });
                    }}
                  />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 6, background: "#eee" }} />
                )}
              </div>
              <div className="cardQtyControls" onClick={(event) => event.stopPropagation()}>
                {qty === 0 ? (
                  <button
                    className="cardAddBtn"
                    onClick={() => setQty(product.sku, 1, "increase")}
                  >
                    + Add
                  </button>
                ) : (
                  <div className="cardQtyRow">
                    <button
                      className="button secondary"
                      onClick={() => setQty(product.sku, qty - 1, "decrease")}
                    >
                      -
                    </button>
                    <input
                      className="input"
                      style={{ width: 56, textAlign: "center" }}
                      type="number"
                      min={0}
                      value={qty}
                      onChange={(e) => setQty(product.sku, e.target.value, "input")}
                      onBlur={(e) => setQty(product.sku, e.target.value, "input")}
                    />
                    <button
                      className="button secondary"
                      onClick={() => setQty(product.sku, qty + 1, "increase")}
                    >
                      +
                    </button>
                  </div>
                )}
                {qty > 0 && hasDeals && (
                  <div className="cardDealCounter muted">
                    {tierProgress.hasNextTier
                      ? `${tierProgress.remaining} left to next free tier`
                      : "Top free tier reached"}
                  </div>
                )}
                {qty > 0 && (
                  <input
                    className="input cardNoteInput"
                    placeholder="Add note..."
                    value={notes[product.sku] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [product.sku]: e.target.value }))
                    }
                    maxLength={500}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {message && (
        <div className="card" style={{ marginBottom: 70 }}>
          {message}
        </div>
      )}

      <div
        className="card"
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div className="muted" style={{ flex: 1 }}>
          {totalSkus} items • {totalCases} cases
          {saveStatusText ? ` • ${saveStatusText}` : ""}
        </div>
        <button className="button secondary" disabled={!totalSkus} onClick={() => setShowReview(true)}>
          Review
        </button>
        <button className="button" disabled={!canDownload || loading} onClick={downloadCsv}>
          {loading ? "Downloading..." : "Download CSV"}
        </button>
      </div>

      {showReview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 14,
          }}
          onClick={() => setShowReview(false)}
        >
          <div
            className="card"
            style={{ width: "min(760px, 100%)", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Order Review — {customerName}</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              {totalSkus} products • {totalCases} total cases
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td className="muted">{item.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="button secondary" onClick={() => setShowReview(false)}>
                Close
              </button>
              <button className="button" onClick={downloadCsv} disabled={!canDownload || loading}>
                {loading ? "Downloading..." : "Download CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dealPopupSku && (() => {
        const p = products.find((x) => x.sku === dealPopupSku);
        if (!p) return null;
        return (
          <div className="dealOverlay" onClick={() => setDealPopupSku(null)}>
            <div className="dealPopup" onClick={(e) => e.stopPropagation()}>
              <div className="dealPopup__header">
                <strong>{p.name}</strong>
                <span className="muted">{p.sku}</span>
                <button className="dealPopup__close" onClick={() => setDealPopupSku(null)}>
                  &times;
                </button>
              </div>
              {p.deals.map((d, i) => (
                <div key={i} className="dealPopup__row">
                  <div>{d.deal_text}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Valid through {d.ends_at}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {zoomed && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "grid",
            placeItems: "center",
            padding: 14,
            zIndex: 1000,
          }}
          onClick={() => setZoomed(null)}
        >
          <img
            src={zoomed.url}
            alt={zoomed.alt}
            style={{
              maxWidth: "92vw",
              maxHeight: "82vh",
              objectFit: "contain",
              borderRadius: 10,
              background: "white",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

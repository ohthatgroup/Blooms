/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductForOrder } from "@/lib/types";

interface OrderClientProps {
  token: string;
  linkCustomerName: string;
  catalogLabel: string;
  products: ProductForOrder[];
  initialLiveOrder: {
    id: string;
    customer_name: string;
    items: Array<{ sku: string; qty: number }>;
  } | null;
}

export function OrderClient({
  token,
  linkCustomerName,
  catalogLabel,
  products,
  initialLiveOrder,
}: OrderClientProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [customerName, setCustomerName] = useState(
    initialLiveOrder?.customer_name ?? linkCustomerName,
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const seeded: Record<string, number> = {};
    for (const item of initialLiveOrder?.items ?? []) {
      if (item.qty > 0) {
        seeded[item.sku] = item.qty;
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
          p.upc.includes(q),
      );
    }
    return result;
  }, [activeTab, products, search]);

  const orderItems = useMemo(() => {
    return Object.entries(quantities)
      .map(([sku, qty]) => {
        const product = products.find((x) => x.sku === sku);
        if (!product) return null;
        return { ...product, qty };
      })
      .filter((x): x is ProductForOrder & { qty: number } => Boolean(x))
      .sort(
        (a, b) =>
          (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.sku.localeCompare(b.sku),
      );
  }, [products, quantities]);

  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, x) => sum + x.qty, 0);

  function setQty(sku: string, raw: string | number) {
    const next = Math.max(0, parseInt(String(raw), 10) || 0);
    setQuantities((prev) => {
      const copy = { ...prev };
      if (next === 0) {
        delete copy[sku];
      } else {
        copy[sku] = next;
      }
      return copy;
    });
  }

  async function submitOrder() {
    if (!orderItems.length || !customerName.trim()) return;
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/public/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        customer_name: customerName,
        items: orderItems.map((x) => ({ sku: x.sku, qty: x.qty })),
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
    setMessage(
      body.updated
        ? "Order updated and CSV downloaded."
        : "Order submitted and CSV downloaded.",
    );
    setShowReview(false);
  }

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
        <input
          className="input"
          placeholder="Search by name, SKU, or UPC..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
          const qty = quantities[product.sku] ?? 0;
          return (
            <div
              key={product.sku}
              className={`productCard${qty > 0 ? " hasQty" : ""}`}
            >
              <div className="cardSku">{product.sku}</div>
              <div className="cardName">{product.name}</div>
              <div className="cardMeta">
                {product.pack} &middot; {product.upc}
              </div>
              <div className="cardImageWrap">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    onClick={() => setZoomed({ url: product.imageUrl, alt: product.name })}
                  />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: 6, background: "#eee" }} />
                )}
              </div>
              <div className="cardQtyControls">
                {qty === 0 ? (
                  <button
                    className="cardAddBtn"
                    onClick={() => setQty(product.sku, 1)}
                  >
                    + Add
                  </button>
                ) : (
                  <div className="cardQtyRow">
                    <button
                      className="button secondary"
                      onClick={() => setQty(product.sku, qty - 1)}
                    >
                      -
                    </button>
                    <input
                      className="input"
                      style={{ width: 56, textAlign: "center" }}
                      type="number"
                      min={0}
                      value={qty}
                      onChange={(e) => setQty(product.sku, e.target.value)}
                    />
                    <button
                      className="button secondary"
                      onClick={() => setQty(product.sku, qty + 1)}
                    >
                      +
                    </button>
                  </div>
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
        </div>
        <button className="button secondary" disabled={!totalSkus} onClick={() => setShowReview(true)}>
          Review
        </button>
        <button className="button" disabled={!totalSkus || loading} onClick={submitOrder}>
          {loading ? "Submitting..." : "Download CSV"}
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
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="button secondary" onClick={() => setShowReview(false)}>
                Close
              </button>
              <button className="button" onClick={submitOrder} disabled={loading}>
                {loading ? "Submitting..." : "Submit + Download CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

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

/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import type { ProductForOrder } from "@/lib/types";

interface OrderClientProps {
  token: string;
  linkCustomerName: string;
  catalogLabel: string;
  products: ProductForOrder[];
}

export function OrderClient({
  token,
  linkCustomerName,
  catalogLabel,
  products,
}: OrderClientProps) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [customerName, setCustomerName] = useState(linkCustomerName);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showReview, setShowReview] = useState(false);

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

  const groupedProducts = useMemo(() => {
    const grouped: Record<string, ProductForOrder[]> = {};
    filteredProducts.forEach((p) => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    return grouped;
  }, [filteredProducts]);

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
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
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
    setMessage("Order submitted and CSV downloaded.");
    setShowReview(false);
  }

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

      {Object.entries(groupedProducts).map(([category, group]) => (
        <div key={category} className="card" style={{ marginBottom: 10 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            {category} <span className="muted">({group.length})</span>
          </h2>
          <div className="grid">
            {group.map((product) => {
              const qty = quantities[product.sku] ?? 0;
              return (
                <div
                  key={product.sku}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 8,
                    background: qty > 0 ? "#e8f5e9" : "white",
                  }}
                >
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      width={48}
                      height={48}
                      style={{ objectFit: "cover", borderRadius: 6 }}
                    />
                  ) : (
                    <div
                      style={{ width: 48, height: 48, borderRadius: 6, background: "#eee" }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "var(--green)" }}>{product.sku}</div>
                    <div>{product.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {product.pack} • {product.upc}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="button secondary" onClick={() => setQty(product.sku, qty - 1)}>
                      -
                    </button>
                    <input
                      className="input"
                      style={{ width: 56, textAlign: "center" }}
                      type="number"
                      min={0}
                      value={qty || ""}
                      onChange={(e) => setQty(product.sku, e.target.value)}
                    />
                    <button className="button secondary" onClick={() => setQty(product.sku, qty + 1)}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
    </div>
  );
}

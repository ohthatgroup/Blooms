"use client";

import { useMemo, useState } from "react";

interface OrderEditItem {
  sku: string;
  product_name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  qty: number;
}

interface CatalogProductOption {
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  display_order: number;
}

interface OrderEditClientProps {
  orderId: string;
  initialCustomerName: string;
  initialItems: OrderEditItem[];
  catalogProducts: CatalogProductOption[];
}

export function OrderEditClient({
  orderId,
  initialCustomerName,
  initialItems,
  catalogProducts,
}: OrderEditClientProps) {
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const productOrderBySku = useMemo(
    () =>
      new Map(
        catalogProducts.map((product) => [product.sku, product.display_order ?? 0]),
      ),
    [catalogProducts],
  );

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const ao = productOrderBySku.get(a.sku) ?? Number.MAX_SAFE_INTEGER;
      const bo = productOrderBySku.get(b.sku) ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.sku.localeCompare(b.sku);
    });
  }, [items, productOrderBySku]);

  const totals = useMemo(() => {
    const filtered = items.filter((item) => item.qty > 0);
    return {
      skus: filtered.length,
      cases: filtered.reduce((sum, item) => sum + item.qty, 0),
    };
  }, [items]);

  const addableProducts = useMemo(() => {
    const currentSkus = new Set(items.map((item) => item.sku));
    const query = search.trim().toLowerCase();
    return catalogProducts
      .filter((product) => !currentSkus.has(product.sku))
      .filter((product) => {
        if (!query) return true;
        return (
          product.sku.toLowerCase().includes(query) ||
          product.name.toLowerCase().includes(query) ||
          (product.upc ?? "").toLowerCase().includes(query)
        );
      })
      .slice(0, 30);
  }, [catalogProducts, items, search]);

  function addProduct(product: CatalogProductOption) {
    setItems((prev) => [
      ...prev,
      {
        sku: product.sku,
        product_name: product.name,
        upc: product.upc,
        pack: product.pack,
        category: product.category,
        qty: 1,
      },
    ]);
    setSearch("");
  }

  function removeProduct(sku: string) {
    setItems((prev) => prev.filter((item) => item.sku !== sku));
  }

  async function saveOrder() {
    const payloadItems = items
      .filter((item) => item.qty > 0)
      .map((item) => ({ sku: item.sku, qty: item.qty }));

    if (!customerName.trim() || payloadItems.length === 0) {
      setMessage("Customer name and at least one item with qty > 0 are required.");
      return;
    }

    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_name: customerName.trim(),
        items: payloadItems,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setMessage(body.error || "Failed to save order");
      return;
    }

    setMessage("Order updated.");
  }

  return (
    <div className="grid">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Edit Order</h2>
        <div className="grid" style={{ gap: 8 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Customer Name</span>
            <input
              className="input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>
          <div className="muted">
            {totals.skus} SKUs | {totals.cases} total cases
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button" onClick={saveOrder} disabled={saving}>
              {saving ? "Saving..." : "Save Order"}
            </button>
          </div>
          {message && <div className="muted">{message}</div>}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add Product</h3>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by SKU, name, or UPC..."
        />
        <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
          {addableProducts.map((product) => (
            <button
              key={product.sku}
              className="button secondary"
              onClick={() => addProduct(product)}
              style={{ textAlign: "left" }}
            >
              {product.sku} - {product.name}
            </button>
          ))}
          {addableProducts.length === 0 && (
            <div className="muted">No matching products to add.</div>
          )}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>UPC</th>
              <th>Pack</th>
              <th>Category</th>
              <th>Qty</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.sku}>
                <td>{item.sku}</td>
                <td>{item.product_name}</td>
                <td>{item.upc ?? ""}</td>
                <td>{item.pack ?? ""}</td>
                <td>{item.category}</td>
                <td style={{ maxWidth: 120 }}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={item.qty}
                    onChange={(e) => {
                      const next = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                      setItems((prev) =>
                        prev.map((row) =>
                          row.sku === item.sku ? { ...row, qty: next } : row,
                        ),
                      );
                    }}
                  />
                </td>
                <td>
                  <button
                    className="button secondary"
                    onClick={() => removeProduct(item.sku)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

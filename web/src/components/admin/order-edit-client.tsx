"use client";

import { useMemo, useState } from "react";
import { OrderDeleteButton } from "@/components/admin/order-delete-button";

interface OrderEditItem {
  sku: string;
  product_name: string;
  upc: string | null;
  pack: string | null;
  category: string;
  qty: number;
  is_custom?: boolean;
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
  const [browsing, setBrowsing] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseCategory, setBrowseCategory] = useState("ALL");
  const [customSku, setCustomSku] = useState("");
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState(1);

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

  const browseCategories = useMemo(
    () => Array.from(new Set(catalogProducts.map((p) => p.category))),
    [catalogProducts],
  );

  const currentSkuSet = useMemo(() => new Set(items.map((i) => i.sku)), [items]);

  const browseProducts = useMemo(() => {
    let result = catalogProducts;
    if (browseCategory !== "ALL") {
      result = result.filter((p) => p.category === browseCategory);
    }
    if (browseSearch.trim()) {
      const q = browseSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.upc ?? "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [catalogProducts, browseCategory, browseSearch]);

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

  function addCustomItem() {
    const sku = customSku.trim();
    const name = customName.trim();
    if (!sku || !name || customQty < 1) return;
    if (items.some((item) => item.sku === sku)) return;
    setItems((prev) => [
      ...prev,
      {
        sku,
        product_name: name,
        upc: null,
        pack: null,
        category: "Custom",
        qty: customQty,
        is_custom: true,
      },
    ]);
    setCustomSku("");
    setCustomName("");
    setCustomQty(1);
  }

  function downloadCsv() {
    const activeItems = items.filter((item) => item.qty > 0);
    if (activeItems.length === 0) return;

    const sorted = [...activeItems].sort(
      (a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name),
    );
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
    const name = customerName.trim() || "Customer";
    const header = "Customer,Date,SKU,Product,UPC,Pack,Qty";
    const rows = sorted.map(
      (item) =>
        `"${name}","${dateStr}","${item.sku}","${item.product_name.replaceAll(",", " ")}","${item.upc ?? ""}","${item.pack ?? ""}",${item.qty}`,
    );
    const csv = [header, ...rows].join("\n");
    const fileDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const safeName = name.replaceAll(/\s+/g, "_").replaceAll(/[^a-zA-Z0-9_]/g, "");
    const fileName = `Blooms_Order_${safeName}_${fileDate}.csv`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveOrder() {
    const payloadItems = items
      .filter((item) => item.qty > 0)
      .map((item) =>
        item.is_custom
          ? { sku: item.sku, qty: item.qty, product_name: item.product_name, is_custom: true as const }
          : { sku: item.sku, qty: item.qty },
      );

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

  if (browsing) {
    return (
      <div className="grid">
        <div className="section-header">
          <h2 className="section-header__title">Add Products</h2>
          <div className="section-header__actions">
            <button className="button" onClick={() => { setBrowsing(false); setBrowseSearch(""); setBrowseCategory("ALL"); }}>
              Done
            </button>
          </div>
        </div>

        <input
          className="input"
          placeholder="Search by SKU, name, or UPC..."
          value={browseSearch}
          onChange={(e) => setBrowseSearch(e.target.value)}
        />

        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 10, minWidth: "max-content" }}>
            <button
              className={`button ${browseCategory === "ALL" ? "" : "secondary"}`}
              onClick={() => setBrowseCategory("ALL")}
            >
              All ({catalogProducts.length})
            </button>
            {browseCategories.map((cat) => (
              <button
                key={cat}
                className={`button ${browseCategory === cat ? "" : "secondary"}`}
                onClick={() => setBrowseCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="productGrid">
          {browseProducts.map((product) => {
            const inOrder = currentSkuSet.has(product.sku);
            return (
              <div key={product.sku} className={`productCard${inOrder ? " hasQty" : ""}`}>
                <div className="cardSku">{product.sku}</div>
                <div className="cardName">{product.name}</div>
                <div className="cardMeta">
                  {product.pack} &middot; {product.upc}
                </div>
                <div className="cardQtyControls">
                  {inOrder ? (
                    <span className="badge badge--success">
                      <span className="badge__dot" />
                      In order
                    </span>
                  ) : (
                    <button className="cardAddBtn" onClick={() => addProduct(product)}>
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid">
      {/* Customer Name + Actions */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Edit Order</h2>
        <div className="form-section">
          <div className="form-group">
            <label className="form-label">Customer Name</label>
            <input
              className="input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="button" onClick={saveOrder} disabled={saving}>
              {saving ? "Saving..." : "Save Order"}
            </button>
            <button className="button secondary" onClick={downloadCsv} disabled={totals.skus === 0}>
              Submit
            </button>
            <OrderDeleteButton orderId={orderId} redirectTo="/admin/orders" />
            {message && (
              <span className={`badge ${message.includes("Failed") || message.includes("failed") || message.includes("required") ? "badge--error" : "badge--success"}`}>
                <span className="badge__dot" />
                {message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card stat-card--blue">
          <div className="stat-card__value">{totals.skus}</div>
          <div className="stat-card__label">Unique SKUs</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-card__value">{totals.cases}</div>
          <div className="stat-card__label">Total Cases</div>
        </div>
      </div>

      {/* Items Table */}
      <div className="table-container">
        <div className="table-container__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Order Items</h3>
          <button className="button secondary" onClick={() => setBrowsing(true)}>
            Add Products
          </button>
        </div>
        <div className="table-container__body">
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
                  <td style={{ fontWeight: 600 }}>
                    {item.sku}
                    {item.is_custom && (
                      <span className="badge badge--draft" style={{ marginLeft: 6, fontSize: 10 }}>Custom</span>
                    )}
                  </td>
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

      {/* Add Custom Item */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add Custom Item</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ flex: "0 0 120px" }}>
            <label className="form-label">SKU</label>
            <input
              className="input"
              value={customSku}
              onChange={(e) => setCustomSku(e.target.value)}
              placeholder="SKU"
            />
          </div>
          <div className="form-group" style={{ flex: "1 1 200px" }}>
            <label className="form-label">Product Name</label>
            <input
              className="input"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Product name"
            />
          </div>
          <div className="form-group" style={{ flex: "0 0 80px" }}>
            <label className="form-label">Qty</label>
            <input
              className="input"
              type="number"
              min={1}
              value={customQty}
              onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value || "1", 10) || 1))}
            />
          </div>
          <button
            className="button"
            onClick={addCustomItem}
            disabled={!customSku.trim() || !customName.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

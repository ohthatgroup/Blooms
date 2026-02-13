import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchOrderSchema } from "@/lib/validation";
import { buildOrderCsv } from "@/lib/catalog/csv";
import { uploadOrderCsv } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data: order, error: orderError } = await auth.admin
    .from("orders")
    .select("id,customer_name,catalog_id,total_skus,total_cases,submitted_at,csv_storage_path")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await auth.admin
    .from("order_items")
    .select("sku,product_name,upc,pack,category,qty")
    .eq("order_id", id)
    .order("category", { ascending: true })
    .order("product_name", { ascending: true });

  if (itemsError) {
    return NextResponse.json(
      { error: "Failed to load order items", details: itemsError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ order, items: items ?? [] });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: order, error: orderError } = await auth.admin
    .from("orders")
    .select("id,catalog_id")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const requestedSkus = parsed.data.items.map((item) => item.sku);
  const { data: products, error: productsError } = await auth.admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category")
    .eq("catalog_id", order.catalog_id)
    .in("sku", requestedSkus);

  if (productsError) {
    return NextResponse.json(
      { error: "Failed to load products", details: productsError.message },
      { status: 500 },
    );
  }

  const productBySku = new Map((products ?? []).map((row) => [row.sku, row]));
  const invalid = requestedSkus.filter((sku) => !productBySku.has(sku));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "One or more items are invalid for this catalog", invalid },
      { status: 400 },
    );
  }

  const orderItems = parsed.data.items.map((entry) => {
    const product = productBySku.get(entry.sku)!;
    return {
      sku: product.sku,
      product_name: product.name,
      upc: product.upc ?? "",
      pack: product.pack ?? "",
      category: product.category,
      qty: entry.qty,
    };
  });
  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, row) => sum + row.qty, 0);
  const now = new Date().toISOString();

  const { error: updateError } = await auth.admin
    .from("orders")
    .update({
      customer_name: parsed.data.customer_name,
      total_skus: totalSkus,
      total_cases: totalCases,
      submitted_at: now,
      updated_at: now,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update order", details: updateError.message },
      { status: 500 },
    );
  }

  await auth.admin.from("order_items").delete().eq("order_id", id);
  const { error: insertItemsError } = await auth.admin.from("order_items").insert(
    orderItems.map((item) => ({ ...item, order_id: id })),
  );

  if (insertItemsError) {
    return NextResponse.json(
      { error: "Failed to save order items", details: insertItemsError.message },
      { status: 500 },
    );
  }

  const { csv } = buildOrderCsv({
    customerName: parsed.data.customer_name,
    items: orderItems.map((item) => ({
      sku: item.sku,
      name: item.product_name,
      upc: item.upc,
      pack: item.pack,
      category: item.category,
      qty: item.qty,
    })),
  });

  const csvStoragePath = await uploadOrderCsv({ orderId: id, csv });
  await auth.admin
    .from("orders")
    .update({ csv_storage_path: csvStoragePath, updated_at: now })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    order: {
      id,
      customer_name: parsed.data.customer_name,
      total_skus: totalSkus,
      total_cases: totalCases,
      csv_storage_path: csvStoragePath,
      updated_at: now,
    },
  });
}

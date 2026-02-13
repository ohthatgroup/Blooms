import { NextResponse } from "next/server";
import { enforcePublicRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { submitOrderSchema } from "@/lib/validation";
import { buildOrderCsv } from "@/lib/catalog/csv";
import { uploadOrderCsv } from "@/lib/storage";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = submitOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitResult = await enforcePublicRateLimit(
    `${parsed.data.token}:${ip}`,
  );
  if (!limitResult.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
      },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: link, error: linkError } = await admin
    .from("customer_links")
    .select("id,catalog_id,active")
    .eq("token", parsed.data.token)
    .single();

  if (linkError || !link || !link.active) {
    return NextResponse.json({ error: "Invalid link token" }, { status: 404 });
  }

  const { data: catalog } = await admin
    .from("catalogs")
    .select("id,status")
    .eq("id", link.catalog_id)
    .single();

  if (!catalog || catalog.status !== "published") {
    return NextResponse.json(
      { error: "Catalog is not available for ordering" },
      { status: 400 },
    );
  }

  const requestedSkus = parsed.data.items.map((x) => x.sku);
  const { data: products, error: productsError } = await admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category")
    .eq("catalog_id", link.catalog_id)
    .in("sku", requestedSkus);

  if (productsError) {
    return NextResponse.json(
      { error: "Failed to load products", details: productsError.message },
      { status: 500 },
    );
  }

  const productBySku = new Map((products ?? []).map((p) => [p.sku, p]));
  const invalid = requestedSkus.filter((sku) => !productBySku.has(sku));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "One or more items are invalid for this catalog", invalid },
      { status: 400 },
    );
  }

  const orderItems = parsed.data.items.map((entry) => {
    const p = productBySku.get(entry.sku)!;
    return {
      sku: p.sku,
      product_name: p.name,
      upc: p.upc ?? "",
      pack: p.pack ?? "",
      category: p.category,
      qty: entry.qty,
    };
  });

  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, x) => sum + x.qty, 0);

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_link_id: link.id,
      catalog_id: link.catalog_id,
      customer_name: parsed.data.customer_name,
      submitted_at: new Date().toISOString(),
      total_skus: totalSkus,
      total_cases: totalCases,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { error: "Failed to create order", details: orderError?.message },
      { status: 500 },
    );
  }

  const { error: itemInsertError } = await admin.from("order_items").insert(
    orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    })),
  );

  if (itemInsertError) {
    return NextResponse.json(
      { error: "Failed to save order items", details: itemInsertError.message },
      { status: 500 },
    );
  }

  const { csv, fileName } = buildOrderCsv({
    customerName: parsed.data.customer_name,
    items: orderItems.map((i) => ({
      sku: i.sku,
      name: i.product_name,
      upc: i.upc,
      pack: i.pack,
      category: i.category,
      qty: i.qty,
    })),
  });

  const csvStoragePath = await uploadOrderCsv({ orderId: order.id, csv });
  if (csvStoragePath) {
    await admin
      .from("orders")
      .update({ csv_storage_path: csvStoragePath })
      .eq("id", order.id);
  }

  return NextResponse.json({
    order_id: order.id,
    file_name: fileName,
    csv,
    csv_storage_path: csvStoragePath,
  });
}


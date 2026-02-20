import { NextResponse } from "next/server";
import { enforcePublicRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { submitOrderSchema } from "@/lib/validation";
import { buildOrderCsv } from "@/lib/catalog/csv";
import { uploadOrderCsv } from "@/lib/storage";
import { buildDealNoteMap } from "@/lib/deals/csv-note";

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
    `submit:${parsed.data.token}:${ip}`,
  );
  if (!limitResult.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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
    const product = productBySku.get(entry.sku)!;
    return {
      sku: product.sku,
      product_name: product.name,
      upc: product.upc ?? "",
      pack: product.pack ?? "",
      category: product.category,
      qty: entry.qty,
      note: entry.note || null,
    };
  });

  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, x) => sum + x.qty, 0);
  const now = new Date().toISOString();

  const { data: liveOrder, error: liveOrderError } = await admin
    .from("orders")
    .select("id")
    .eq("customer_link_id", link.id)
    .is("archived_at", null)
    .maybeSingle();

  if (liveOrderError) {
    return NextResponse.json(
      { error: "Failed to load existing order", details: liveOrderError.message },
      { status: 500 },
    );
  }

  let orderId = liveOrder?.id ?? "";
  const updated = Boolean(liveOrder);
  if (liveOrder) {
    const { error: updateOrderError } = await admin
      .from("orders")
      .update({
        catalog_id: link.catalog_id,
        customer_name: parsed.data.customer_name,
        submitted_at: now,
        total_skus: totalSkus,
        total_cases: totalCases,
        updated_at: now,
      })
      .eq("id", liveOrder.id);

    if (updateOrderError) {
      return NextResponse.json(
        { error: "Failed to update order", details: updateOrderError.message },
        { status: 500 },
      );
    }
  } else {
    const { data: createdOrder, error: createOrderError } = await admin
      .from("orders")
      .insert({
        customer_link_id: link.id,
        catalog_id: link.catalog_id,
        customer_name: parsed.data.customer_name,
        submitted_at: now,
        total_skus: totalSkus,
        total_cases: totalCases,
        archived_at: null,
        updated_at: now,
      })
      .select("id")
      .single();

    if (createOrderError || !createdOrder) {
      return NextResponse.json(
        { error: "Failed to create order", details: createOrderError?.message },
        { status: 500 },
      );
    }
    orderId = createdOrder.id;
  }

  if (!orderId) {
    return NextResponse.json({ error: "Order id missing" }, { status: 500 });
  }

  await admin.from("order_items").delete().eq("order_id", orderId);
  const { error: insertItemsError } = await admin.from("order_items").insert(
    orderItems.map((item) => ({ ...item, order_id: orderId })),
  );

  if (insertItemsError) {
    return NextResponse.json(
      { error: "Failed to save order items", details: insertItemsError.message },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  let dealNoteMap = new Map<string, string>();
  if (requestedSkus.length > 0) {
    const { data: deals } = await admin
      .from("deals")
      .select("sku,buy_qty,free_qty")
      .in("sku", requestedSkus)
      .lte("starts_at", today)
      .gte("ends_at", today);
    if (deals) dealNoteMap = buildDealNoteMap(deals);
  }

  const { csv, fileName } = buildOrderCsv({
    customerName: parsed.data.customer_name,
    items: orderItems.map((item) => ({
      sku: item.sku,
      name: item.product_name,
      upc: item.upc,
      pack: item.pack,
      category: item.category,
      qty: item.qty,
      note: item.note,
      dealNote: dealNoteMap.get(item.sku) ?? null,
    })),
  });

  const csvStoragePath = await uploadOrderCsv({ orderId, csv });
  await admin
    .from("orders")
    .update({ csv_storage_path: csvStoragePath, updated_at: now })
    .eq("id", orderId);

  return NextResponse.json({
    order_id: orderId,
    updated,
    file_name: fileName,
    csv,
    csv_storage_path: csvStoragePath,
  });
}

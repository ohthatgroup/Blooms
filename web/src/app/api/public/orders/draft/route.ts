import { NextResponse } from "next/server";
import { enforcePublicRateLimit } from "@/lib/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { saveOrderDraftSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = saveOrderDraftSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitResult = await enforcePublicRateLimit(
    `draft:${parsed.data.token}:${ip}`,
  );
  if (!limitResult.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const admin = createSupabaseAdminClient();

  const { data: link, error: linkError } = await admin
    .from("customer_links")
    .select("id,catalog_id,customer_name,active")
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

  const requestedSkus = (parsed.data.items ?? []).map((x) => x.sku);
  if (requestedSkus.length > 0) {
    const { data: products, error: productsError } = await admin
      .from("catalog_items")
      .select("sku")
      .eq("catalog_id", link.catalog_id)
      .in("sku", requestedSkus);

    if (productsError) {
      return NextResponse.json(
        { error: "Failed to load products", details: productsError.message },
        { status: 500 },
      );
    }

    const productBySku = new Set((products ?? []).map((p) => p.sku));
    const invalid = requestedSkus.filter((sku) => !productBySku.has(sku));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "One or more items are invalid for this catalog", invalid },
        { status: 400 },
      );
    }
  }

  const totalSkus = requestedSkus.length;
  const totalCases = (parsed.data.items ?? []).reduce((sum, x) => sum + x.qty, 0);
  const now = new Date().toISOString();
  const effectiveCustomerName =
    parsed.data.customer_name?.trim() || link.customer_name;

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
  if (liveOrder) {
    const { error: updateOrderError } = await admin
      .from("orders")
      .update({
        catalog_id: link.catalog_id,
        customer_name: effectiveCustomerName,
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
        customer_name: effectiveCustomerName,
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

  // Replace items atomically (delete then insert).
  await admin.from("order_items").delete().eq("order_id", orderId);

  if ((parsed.data.items ?? []).length > 0) {
    const { data: rows, error: rowError } = await admin
      .from("catalog_items")
      .select("sku,name,upc,pack,category")
      .eq("catalog_id", link.catalog_id)
      .in("sku", requestedSkus);

    if (rowError) {
      return NextResponse.json(
        { error: "Failed to load products", details: rowError.message },
        { status: 500 },
      );
    }

    const productBySku = new Map((rows ?? []).map((r) => [r.sku, r]));
    const orderItems = (parsed.data.items ?? []).map((entry) => {
      const p = productBySku.get(entry.sku)!;
      return {
        order_id: orderId,
        sku: p.sku,
        product_name: p.name,
        upc: p.upc ?? "",
        pack: p.pack ?? "",
        category: p.category,
        qty: entry.qty,
      };
    });

    const { error: insertItemsError } = await admin
      .from("order_items")
      .insert(orderItems);
    if (insertItemsError) {
      return NextResponse.json(
        { error: "Failed to save order items", details: insertItemsError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    total_skus: totalSkus,
    total_cases: totalCases,
    updated_at: now,
  });
}


import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { bulkImportOrderSchema } from "@/lib/validation";
import { buildOrderCsv } from "@/lib/catalog/csv";
import { uploadOrderCsv } from "@/lib/storage";
import { buildDealNoteMap } from "@/lib/deals/csv-note";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = bulkImportOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { catalog_id, customer_name, items, customer_link_id } = parsed.data;

  // Verify catalog exists and is published
  const { data: catalog } = await auth.admin
    .from("catalogs")
    .select("id,status")
    .eq("id", catalog_id)
    .single();

  if (!catalog || catalog.status !== "published") {
    return NextResponse.json(
      { error: "Catalog not found or not published" },
      { status: 400 },
    );
  }

  // Validate SKUs against catalog
  const requestedSkus = items.map((x) => x.sku);
  const { data: products } = await auth.admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category")
    .eq("catalog_id", catalog_id)
    .in("sku", requestedSkus);

  const productBySku = new Map((products ?? []).map((p) => [p.sku, p]));
  const matched = items.filter((i) => productBySku.has(i.sku));
  const unmatched = items.filter((i) => !productBySku.has(i.sku));

  if (matched.length === 0) {
    return NextResponse.json(
      {
        error: "No matching SKUs found in catalog",
        unmatched_skus: unmatched.map((i) => i.sku),
      },
      { status: 400 },
    );
  }

  // Resolve or create customer link
  let linkId = customer_link_id ?? "";
  if (customer_link_id) {
    const { data: existingLink } = await auth.admin
      .from("customer_links")
      .select("id,catalog_id")
      .eq("id", customer_link_id)
      .single();

    if (!existingLink) {
      return NextResponse.json(
        { error: "Customer link not found" },
        { status: 404 },
      );
    }
    linkId = existingLink.id;
  } else {
    // Auto-create a customer link
    const token = nanoid(24);
    const { data: newLink, error: linkError } = await auth.admin
      .from("customer_links")
      .insert({
        token,
        catalog_id,
        customer_name,
        active: true,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (linkError || !newLink) {
      return NextResponse.json(
        { error: "Failed to create customer link", details: linkError?.message },
        { status: 500 },
      );
    }
    linkId = newLink.id;
  }

  // Build order items
  const orderItems = matched.map((entry) => {
    const product = productBySku.get(entry.sku)!;
    return {
      sku: product.sku,
      product_name: product.name,
      upc: product.upc ?? "",
      pack: product.pack ?? "",
      category: product.category,
      qty: entry.qty,
      note: null as string | null,
    };
  });

  const totalSkus = orderItems.length;
  const totalCases = orderItems.reduce((sum, x) => sum + x.qty, 0);
  const now = new Date().toISOString();

  // Check for existing live order on this link
  const { data: liveOrder } = await auth.admin
    .from("orders")
    .select("id")
    .eq("customer_link_id", linkId)
    .is("archived_at", null)
    .maybeSingle();

  let orderId = liveOrder?.id ?? "";
  if (liveOrder) {
    await auth.admin
      .from("orders")
      .update({
        catalog_id,
        customer_name,
        submitted_at: now,
        total_skus: totalSkus,
        total_cases: totalCases,
        updated_at: now,
      })
      .eq("id", liveOrder.id);
  } else {
    const { data: createdOrder, error: createError } = await auth.admin
      .from("orders")
      .insert({
        customer_link_id: linkId,
        catalog_id,
        customer_name,
        submitted_at: now,
        total_skus: totalSkus,
        total_cases: totalCases,
        archived_at: null,
        updated_at: now,
      })
      .select("id")
      .single();

    if (createError || !createdOrder) {
      return NextResponse.json(
        { error: "Failed to create order", details: createError?.message },
        { status: 500 },
      );
    }
    orderId = createdOrder.id;
  }

  // Replace order items
  await auth.admin.from("order_items").delete().eq("order_id", orderId);
  const { error: insertError } = await auth.admin.from("order_items").insert(
    orderItems.map((item) => ({ ...item, order_id: orderId })),
  );

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to save order items", details: insertError.message },
      { status: 500 },
    );
  }

  // Build CSV with deal notes
  const today = new Date().toISOString().slice(0, 10);
  let dealNoteMap = new Map<string, string>();
  const skus = orderItems.map((i) => i.sku);
  if (skus.length > 0) {
    const { data: deals } = await auth.admin
      .from("deals")
      .select("sku,buy_qty,free_qty")
      .in("sku", skus)
      .lte("starts_at", today)
      .gte("ends_at", today);
    if (deals) dealNoteMap = buildDealNoteMap(deals);
  }

  const { csv } = buildOrderCsv({
    customerName: customer_name,
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
  await auth.admin
    .from("orders")
    .update({ csv_storage_path: csvStoragePath, updated_at: now })
    .eq("id", orderId);

  return NextResponse.json({
    order_id: orderId,
    customer_link_id: linkId,
    matched_count: matched.length,
    unmatched_count: unmatched.length,
    unmatched_skus: unmatched.map((i) => i.sku),
    total_skus: totalSkus,
    total_cases: totalCases,
  });
}

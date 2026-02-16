import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getPublicProductImageUrl } from "@/lib/storage";
import { formatDealText } from "@/lib/deals/matrix";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: link, error: linkError } = await admin
    .from("customer_links")
    .select("id,catalog_id,customer_name,active")
    .eq("token", token)
    .single();

  if (linkError || !link || !link.active) {
    return NextResponse.json({ error: "Invalid or inactive link" }, { status: 404 });
  }

  const { data: catalog } = await admin
    .from("catalogs")
    .select("id,version_label,status")
    .eq("id", link.catalog_id)
    .single();

  if (!catalog || catalog.status !== "published") {
    return NextResponse.json(
      { error: "Catalog is not available for ordering" },
      { status: 400 },
    );
  }

  const { data: items, error: itemsError } = await admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category,image_storage_path,display_order")
    .eq("catalog_id", link.catalog_id)
    .order("display_order", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (itemsError) {
    return NextResponse.json(
      { error: "Failed to load catalog products", details: itemsError.message },
      { status: 500 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const skuList = (items ?? []).map((item) => item.sku);
  let deals:
    | Array<{ sku: string; buy_qty: number; free_qty: number; ends_at: string }>
    | null = null;
  if (skuList.length > 0) {
    const { data } = await admin
      .from("deals")
      .select("sku,buy_qty,free_qty,ends_at")
      .in("sku", skuList)
      .lte("starts_at", today)
      .gte("ends_at", today)
      .order("sku", { ascending: true })
      .order("buy_qty", { ascending: true });
    deals = data;
  }

  const dealMap = new Map<
    string,
    { deal_text: string; buy_qty: number; free_qty: number; ends_at: string }[]
  >();
  for (const d of deals ?? []) {
    const list = dealMap.get(d.sku) ?? [];
    list.push({
      deal_text: formatDealText(d.buy_qty, d.free_qty),
      buy_qty: d.buy_qty,
      free_qty: d.free_qty,
      ends_at: d.ends_at,
    });
    dealMap.set(d.sku, list);
  }

  const products = (items ?? []).map((item) => ({
    sku: item.sku,
    name: item.name,
    upc: item.upc ?? "",
    pack: item.pack ?? "",
    category: item.category,
    imageUrl: item.image_storage_path
      ? getPublicProductImageUrl(item.image_storage_path)
      : "",
    displayOrder: item.display_order ?? 0,
    deals: dealMap.get(item.sku) ?? [],
  }));

  const { data: liveOrder } = await admin
    .from("orders")
    .select("id,customer_name")
    .eq("customer_link_id", link.id)
    .is("archived_at", null)
    .maybeSingle();

  let liveOrderItems: Array<{ sku: string; qty: number }> = [];
  if (liveOrder) {
    const { data: rows } = await admin
      .from("order_items")
      .select("sku,qty")
      .eq("order_id", liveOrder.id);
    liveOrderItems = (rows ?? []).map((row) => ({ sku: row.sku, qty: row.qty }));
  }

  return NextResponse.json({
    link: {
      id: link.id,
      token,
      customer_name: link.customer_name,
    },
    catalog: {
      id: catalog.id,
      version_label: catalog.version_label,
    },
    products,
    live_order: liveOrder
      ? {
          id: liveOrder.id,
          customer_name: liveOrder.customer_name,
          items: liveOrderItems,
        }
      : null,
  });
}

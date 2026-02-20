import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getPublicProductImageUrl } from "@/lib/storage";
import { OrderClient } from "@/components/order-client";
import type { ProductForOrder } from "@/lib/types";
import { formatDealText } from "@/lib/deals/matrix";

export default async function CustomerOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const resolvedSearchParams = await searchParams;
  const debugScanRaw = resolvedSearchParams.debugScan;
  const debugScanValue = Array.isArray(debugScanRaw) ? debugScanRaw[0] : debugScanRaw;
  const debugScan = debugScanValue === "1" || debugScanValue === "true";
  const admin = createSupabaseAdminClient();

  const { data: link } = await admin
    .from("customer_links")
    .select("id,catalog_id,customer_name,active,show_upc")
    .eq("token", token)
    .single();

  if (!link || !link.active) {
    notFound();
  }

  const { data: catalog } = await admin
    .from("catalogs")
    .select("id,version_label,status")
    .eq("id", link.catalog_id)
    .single();

  if (!catalog || catalog.status !== "published") {
    notFound();
  }

  const { data: items } = await admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category,image_storage_path,display_order")
    .eq("catalog_id", link.catalog_id)
    .order("display_order", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

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

  const products: ProductForOrder[] = (items ?? []).map((item) => ({
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

  let liveOrderItems: Array<{ sku: string; qty: number; note: string }> = [];
  if (liveOrder) {
    const { data: rows } = await admin
      .from("order_items")
      .select("sku,qty,note")
      .eq("order_id", liveOrder.id);
    liveOrderItems = (rows ?? []).map((row) => ({ sku: row.sku, qty: row.qty, note: row.note ?? "" }));
  }

  return (
    <OrderClient
      token={token}
      linkCustomerName={link.customer_name}
      catalogLabel={catalog.version_label}
      products={products}
      showUpc={link.show_upc !== false}
      debugScan={debugScan}
      initialLiveOrder={
        liveOrder
          ? {
              id: liveOrder.id,
              customer_name: liveOrder.customer_name,
              items: liveOrderItems,
            }
          : null
      }
    />
  );
}

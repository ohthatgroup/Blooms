import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getPublicProductImageUrl } from "@/lib/storage";
import { OrderClient } from "@/components/order-client";
import type { ProductForOrder } from "@/lib/types";

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: link } = await admin
    .from("customer_links")
    .select("id,catalog_id,customer_name,active")
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
    .select("sku,name,upc,pack,category,image_storage_path")
    .eq("catalog_id", link.catalog_id)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  const products: ProductForOrder[] = (items ?? []).map((item) => ({
    sku: item.sku,
    name: item.name,
    upc: item.upc ?? "",
    pack: item.pack ?? "",
    category: item.category,
    imageUrl: item.image_storage_path
      ? getPublicProductImageUrl(item.image_storage_path)
      : "",
  }));

  return (
    <OrderClient
      token={token}
      linkCustomerName={link.customer_name}
      catalogLabel={catalog.version_label}
      products={products}
    />
  );
}


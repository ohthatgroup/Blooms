import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { OrderEditClient } from "@/components/admin/order-edit-client";

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = createSupabaseAdminClient();
  const { id } = await params;

  const { data: order } = await admin
    .from("orders")
    .select("id,customer_name,catalog_id")
    .eq("id", id)
    .is("archived_at", null)
    .single();

  if (!order) {
    notFound();
  }

  const { data: items } = await admin
    .from("order_items")
    .select("sku,product_name,upc,pack,category,qty")
    .eq("order_id", id)
    .order("category", { ascending: true })
    .order("product_name", { ascending: true });

  const { data: catalogProducts } = await admin
    .from("catalog_items")
    .select("sku,name,upc,pack,category,display_order")
    .eq("catalog_id", order.catalog_id)
    .order("display_order", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="container grid">
      <div>
        <Link href="/admin/orders" className="button secondary">
          &larr; Back to Orders
        </Link>
      </div>
      <OrderEditClient
        orderId={order.id}
        initialCustomerName={order.customer_name}
        initialItems={(() => {
          const catalogSkus = new Set((catalogProducts ?? []).map((p) => p.sku));
          return (items ?? []).map((item) =>
            catalogSkus.has(item.sku) ? item : { ...item, is_custom: true },
          );
        })()}
        catalogProducts={catalogProducts ?? []}
      />
    </div>
  );
}

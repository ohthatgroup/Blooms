import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin-nav";
import { OrderEditClient } from "@/components/admin/order-edit-client";

export default async function AdminOrderEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const admin = createSupabaseAdminClient();
  const { id } = await params;

  const { data: order } = await admin
    .from("orders")
    .select("id,customer_name")
    .eq("id", id)
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

  return (
    <div className="container grid">
      <AdminNav />
      <div>
        <Link href="/admin/orders">Back to Orders</Link>
      </div>
      <OrderEditClient
        orderId={order.id}
        initialCustomerName={order.customer_name}
        initialItems={items ?? []}
      />
    </div>
  );
}

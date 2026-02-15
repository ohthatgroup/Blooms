import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { buildOrderCsv } from "@/lib/catalog/csv";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const { data: order, error: orderError } = await auth.admin
    .from("orders")
    .select("id,customer_name")
    .eq("id", id)
    .is("archived_at", null)
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

  if (itemsError || !items) {
    return NextResponse.json(
      { error: "Failed to load order items" },
      { status: 500 },
    );
  }

  const { csv, fileName } = buildOrderCsv({
    customerName: order.customer_name,
    items: items.map((item) => ({
      sku: item.sku,
      name: item.product_name,
      upc: item.upc,
      pack: item.pack,
      category: item.category,
      qty: item.qty,
    })),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

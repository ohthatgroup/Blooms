import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.admin
    .from("orders")
    .select(
      "id,customer_name,submitted_at,total_skus,total_cases,csv_storage_path,updated_at,customer_links(customer_name,token),catalogs(version_label)",
    )
    .is("archived_at", null)
    .order("submitted_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch orders", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ orders: data ?? [] });
}

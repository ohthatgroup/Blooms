import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { getPublicProductImageUrl } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  const { data, error } = await auth.admin
    .from("catalog_items")
    .select("*")
    .eq("catalog_id", id)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch catalog items", details: error.message },
      { status: 500 },
    );
  }

  const items = (data ?? []).map((item) => ({
    ...item,
    image_url: item.image_storage_path
      ? getPublicProductImageUrl(item.image_storage_path)
      : "",
  }));

  return NextResponse.json({ items });
}


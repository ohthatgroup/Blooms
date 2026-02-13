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
  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .select("id,parse_status,parse_summary")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (catalogError) {
    return NextResponse.json(
      { error: "Failed to load catalog", details: catalogError.message },
      { status: 500 },
    );
  }

  if (!catalog) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  if (catalog.parse_status === "queued" || catalog.parse_status === "processing") {
    return NextResponse.json({
      items: [],
      parse_active: true,
      parse_summary: catalog.parse_summary ?? {},
    });
  }

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

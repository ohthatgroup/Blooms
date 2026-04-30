import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth";

const approveItemsSchema = z.object({
  itemIds: z.array(z.uuid()).min(1).max(1000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = approveItemsSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: catalog, error: catalogError } = await auth.admin
    .from("catalogs")
    .select("id,deleted_at")
    .eq("id", id)
    .maybeSingle();

  if (catalogError) {
    return NextResponse.json(
      { error: "Failed to load catalog", details: catalogError.message },
      { status: 500 },
    );
  }

  if (!catalog || catalog.deleted_at) {
    return NextResponse.json({ error: "Catalog not found" }, { status: 404 });
  }

  const { count: pendingCount, error: pendingError } = await auth.admin
    .from("catalog_items")
    .select("id", { count: "exact", head: true })
    .eq("catalog_id", id)
    .eq("approved", false)
    .in("id", parsed.data.itemIds);

  if (pendingError) {
    return NextResponse.json(
      { error: "Failed to count visible pending items", details: pendingError.message },
      { status: 500 },
    );
  }

  const { error: updateError } = await auth.admin
    .from("catalog_items")
    .update({
      approved: true,
      updated_at: new Date().toISOString(),
    })
    .eq("catalog_id", id)
    .eq("approved", false)
    .in("id", parsed.data.itemIds);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to approve visible catalog items", details: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, updatedCount: pendingCount ?? 0 });
}

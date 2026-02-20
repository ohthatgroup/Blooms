import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { patchCustomerLinkSchema } from "@/lib/validation";
import { migrateOrderItemsToCatalog } from "@/lib/links/migration";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = patchCustomerLinkSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { data: existingLink, error: existingLinkError } = await auth.admin
    .from("customer_links")
    .select("id,catalog_id,active,disabled_at")
    .eq("id", id)
    .maybeSingle();

  if (existingLinkError) {
    return NextResponse.json(
      { error: "Failed to load link", details: existingLinkError.message },
      { status: 500 },
    );
  }

  if (!existingLink) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  const nextCatalogId = parsed.data.catalog_id ?? existingLink.catalog_id;
  const catalogChanged =
    parsed.data.catalog_id !== undefined &&
    parsed.data.catalog_id !== existingLink.catalog_id;

  if (catalogChanged) {
    const { data: targetCatalog, error: targetCatalogError } = await auth.admin
      .from("catalogs")
      .select("id,status,deleted_at")
      .eq("id", nextCatalogId)
      .maybeSingle();

    if (targetCatalogError) {
      return NextResponse.json(
        { error: "Failed to validate target catalog", details: targetCatalogError.message },
        { status: 500 },
      );
    }

    if (!targetCatalog) {
      return NextResponse.json({ error: "Target catalog not found" }, { status: 404 });
    }

    if (targetCatalog.deleted_at || targetCatalog.status !== "published") {
      return NextResponse.json(
        { error: "Target catalog must be published and not archived." },
        { status: 400 },
      );
    }

    updates.catalog_id = nextCatalogId;
  }

  if (parsed.data.active !== undefined) {
    updates.active = parsed.data.active;
    updates.disabled_at = parsed.data.active ? null : new Date().toISOString();
  }

  if (parsed.data.show_upc !== undefined) {
    updates.show_upc = parsed.data.show_upc;
  }
  if (parsed.data.show_price !== undefined) {
    updates.show_price = parsed.data.show_price;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      link: existingLink,
      migration: null,
      noop: true,
    });
  }

  let migration:
    | {
        order_id: string;
        kept_count: number;
        dropped_count: number;
        dropped_skus: string[];
      }
    | null = null;

  if (catalogChanged) {
    const { data: liveOrder, error: liveOrderError } = await auth.admin
      .from("orders")
      .select("id")
      .eq("customer_link_id", id)
      .is("archived_at", null)
      .maybeSingle();

    if (liveOrderError) {
      return NextResponse.json(
        { error: "Failed to load live order for migration", details: liveOrderError.message },
        { status: 500 },
      );
    }

    if (liveOrder) {
      const { data: existingItems, error: existingItemsError } = await auth.admin
        .from("order_items")
        .select("sku,qty")
        .eq("order_id", liveOrder.id);

      if (existingItemsError) {
        return NextResponse.json(
          {
            error: "Failed to load live order items for migration",
            details: existingItemsError.message,
          },
          { status: 500 },
        );
      }

      const uniqueSkus = [...new Set((existingItems ?? []).map((row) => row.sku))];
      let targetProducts: Array<{
        sku: string;
        name: string;
        upc: string | null;
        pack: string | null;
        category: string;
      }> = [];

      if (uniqueSkus.length > 0) {
        const { data, error: targetProductsError } = await auth.admin
          .from("catalog_items")
          .select("sku,name,upc,pack,category")
          .eq("catalog_id", nextCatalogId)
          .in("sku", uniqueSkus);

        if (targetProductsError) {
          return NextResponse.json(
            {
              error: "Failed to load target catalog items for migration",
              details: targetProductsError.message,
            },
            { status: 500 },
          );
        }

        targetProducts = data ?? [];
      }

      const migrationResult = migrateOrderItemsToCatalog(
        liveOrder.id,
        existingItems ?? [],
        targetProducts,
      );
      const keptItems = migrationResult.keptItems;

      const { error: deleteItemsError } = await auth.admin
        .from("order_items")
        .delete()
        .eq("order_id", liveOrder.id);

      if (deleteItemsError) {
        return NextResponse.json(
          { error: "Failed to clear old order items", details: deleteItemsError.message },
          { status: 500 },
        );
      }

      if (keptItems.length > 0) {
        const { error: insertItemsError } = await auth.admin
          .from("order_items")
          .insert(keptItems);
        if (insertItemsError) {
          return NextResponse.json(
            { error: "Failed to insert migrated order items", details: insertItemsError.message },
            { status: 500 },
          );
        }
      }

      const now = new Date().toISOString();
      const { error: updateOrderError } = await auth.admin
        .from("orders")
        .update({
          catalog_id: nextCatalogId,
          total_skus: migrationResult.totalSkus,
          total_cases: migrationResult.totalCases,
          updated_at: now,
          csv_storage_path: null,
        })
        .eq("id", liveOrder.id);

      if (updateOrderError) {
        return NextResponse.json(
          { error: "Failed to update migrated order", details: updateOrderError.message },
          { status: 500 },
        );
      }

      migration = {
        order_id: liveOrder.id,
        kept_count: migrationResult.totalSkus,
        dropped_count: migrationResult.droppedSkus.length,
        dropped_skus: migrationResult.droppedSkus,
      };
    }
  }

  const { data, error } = await auth.admin
    .from("customer_links")
    .update(updates)
    .eq("id", id)
    .select("id,catalog_id,active,disabled_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Failed to update link", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ link: data, migration });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  // Delete associated orders first (FK: orders.customer_link_id → customer_links.id ON DELETE RESTRICT)
  const { error: ordersError } = await auth.admin
    .from("orders")
    .delete()
    .eq("customer_link_id", id);

  if (ordersError) {
    return NextResponse.json(
      { error: "Failed to delete associated orders", details: ordersError.message },
      { status: 500 },
    );
  }

  const { error } = await auth.admin
    .from("customer_links")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete link", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

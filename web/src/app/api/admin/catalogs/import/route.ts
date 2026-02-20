import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth";
import { importCatalogSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const payload = await request.json().catch(() => null);
  const parsed = importCatalogSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[catalog-import] Validation failed", parsed.error.flatten());
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Deduplicate items by SKU (keep last occurrence, case-insensitive)
  const skuMap = new Map<string, (typeof parsed.data.items)[number]>();
  for (const item of parsed.data.items) {
    skuMap.set(item.sku.toUpperCase(), item);
  }
  const uniqueItems = Array.from(skuMap.values());

  let catalogId = parsed.data.catalog_id ?? "";
  let isUpdate = false;

  console.log("[catalog-import] Starting", {
    mode: catalogId ? "update" : "new",
    catalogId: catalogId || "(new)",
    itemCount: uniqueItems.length,
    versionLabel: parsed.data.version_label,
  });

  if (catalogId) {
    // Importing into existing catalog – verify it exists and isn't deleted
    const { data: existing, error: lookupError } = await auth.admin
      .from("catalogs")
      .select("id,status")
      .eq("id", catalogId)
      .is("deleted_at", null)
      .single();

    if (lookupError || !existing) {
      console.error("[catalog-import] Catalog lookup failed", {
        catalogId,
        error: lookupError?.message,
        code: lookupError?.code,
        hint: lookupError?.hint,
      });
      return NextResponse.json(
        {
          error: "Catalog not found",
          details: lookupError?.message ?? "No matching catalog with that ID (or it was deleted)",
          catalog_id: catalogId,
        },
        { status: 404 },
      );
    }
    console.log("[catalog-import] Found catalog", { id: existing.id, status: existing.status });
    isUpdate = true;
  } else {
    // Create new catalog row (no PDF, no parsing needed)
    const { data: catalog, error: catalogError } = await auth.admin
      .from("catalogs")
      .insert({
        version_label: parsed.data.version_label,
        pdf_storage_path: "",
        status: "ready",
        parse_status: "complete",
        parse_summary: {
          source: "csv_import",
          total_items: uniqueItems.length,
        },
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (catalogError || !catalog) {
      console.error("[catalog-import] Failed to create catalog", catalogError);
      return NextResponse.json(
        { error: "Failed to create catalog", details: catalogError?.message },
        { status: 500 },
      );
    }
    catalogId = catalog.id;
    console.log("[catalog-import] Created new catalog", { catalogId });
  }

  const now = new Date().toISOString();
  let updatedCount = 0;
  let insertedCount = 0;

  if (isUpdate) {
    // Upsert into existing catalog: update matching SKUs, insert new ones
    // Fetch existing items in batches to avoid URL length limits
    const incomingSkus = uniqueItems.map((i) => i.sku);
    const existingBySku = new Map<string, { id: string; image_storage_path: string }>();

    const SKU_BATCH = 200;
    for (let i = 0; i < incomingSkus.length; i += SKU_BATCH) {
      const skuBatch = incomingSkus.slice(i, i + SKU_BATCH);
      const { data: existingItems, error: fetchError } = await auth.admin
        .from("catalog_items")
        .select("id,sku,image_storage_path")
        .eq("catalog_id", catalogId)
        .in("sku", skuBatch);

      if (fetchError) {
        console.error("[catalog-import] Failed to fetch existing SKUs", {
          batch: Math.floor(i / SKU_BATCH) + 1,
          error: fetchError.message,
        });
      }

      for (const item of existingItems ?? []) {
        existingBySku.set(item.sku.toUpperCase(), {
          id: item.id,
          image_storage_path: item.image_storage_path ?? "",
        });
      }
    }

    console.log("[catalog-import] Update mode", {
      existingMatchedSkus: existingBySku.size,
      incomingSkus: incomingSkus.length,
    });

    // Get max display_order for new items
    const { data: maxRow } = await auth.admin
      .from("catalog_items")
      .select("display_order")
      .eq("catalog_id", catalogId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextOrder = (maxRow?.display_order ?? 0) + 1;

    const toInsert: Record<string, unknown>[] = [];

    for (const item of uniqueItems) {
      const existing = existingBySku.get(item.sku.toUpperCase());
      if (existing) {
        // Update existing item (preserve image_storage_path)
        const { error: updateError } = await auth.admin
          .from("catalog_items")
          .update({
            name: item.name,
            upc: item.upc ?? null,
            pack: item.pack ?? null,
            price: item.price ?? null,
            category: item.category,
            updated_at: now,
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("[catalog-import] Failed to update SKU", {
            sku: item.sku,
            itemId: existing.id,
            error: updateError.message,
          });
          return NextResponse.json(
            { error: `Failed to update SKU "${item.sku}"`, details: updateError.message },
            { status: 500 },
          );
        }
        updatedCount++;
      } else {
        toInsert.push({
          catalog_id: catalogId,
          sku: item.sku,
          name: item.name,
          upc: item.upc ?? null,
          pack: item.pack ?? null,
          price: item.price ?? null,
          category: item.category,
          image_storage_path: "",
          approved: true,
          display_order: nextOrder++,
          parse_issues: [],
          updated_at: now,
        });
        insertedCount++;
      }
    }

    // Batch insert new items
    const BATCH_SIZE = 500;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      console.log("[catalog-import] Inserting batch", { batch: batchNum, items: batch.length });

      const { error: insertError } = await auth.admin
        .from("catalog_items")
        .insert(batch);

      if (insertError) {
        console.error("[catalog-import] Batch insert failed", {
          batch: batchNum,
          error: insertError.message,
          code: insertError.code,
        });
        return NextResponse.json(
          { error: "Failed to insert new catalog items", details: insertError.message },
          { status: 500 },
        );
      }
    }
  } else {
    // New catalog – carry over images from the latest published catalog
    const imageBySku = new Map<string, string>();
    const { data: publishedCatalog } = await auth.admin
      .from("catalogs")
      .select("id")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (publishedCatalog) {
      const allSkus = uniqueItems.map((i) => i.sku);
      const SKU_BATCH = 200;
      for (let i = 0; i < allSkus.length; i += SKU_BATCH) {
        const skuBatch = allSkus.slice(i, i + SKU_BATCH);
        const { data: prevItems } = await auth.admin
          .from("catalog_items")
          .select("sku,image_storage_path")
          .eq("catalog_id", publishedCatalog.id)
          .in("sku", skuBatch);

        for (const item of prevItems ?? []) {
          if (item.image_storage_path) {
            imageBySku.set(item.sku.toUpperCase(), item.image_storage_path);
          }
        }
      }
    }

    console.log("[catalog-import] Image carry-over", {
      fromCatalog: publishedCatalog?.id ?? "(none)",
      imagesFound: imageBySku.size,
      totalItems: uniqueItems.length,
    });

    const catalogItems = uniqueItems.map((item, index) => ({
      catalog_id: catalogId,
      sku: item.sku,
      name: item.name,
      upc: item.upc ?? null,
      pack: item.pack ?? null,
      price: item.price ?? null,
      category: item.category,
      image_storage_path: imageBySku.get(item.sku.toUpperCase()) ?? "",
      approved: true,
      display_order: index + 1,
      parse_issues: [],
      updated_at: now,
    }));

    const BATCH_SIZE = 500;
    for (let i = 0; i < catalogItems.length; i += BATCH_SIZE) {
      const batch = catalogItems.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      console.log("[catalog-import] Inserting batch", { batch: batchNum, items: batch.length });

      const { error: insertError } = await auth.admin
        .from("catalog_items")
        .insert(batch);

      if (insertError) {
        console.error("[catalog-import] Batch insert failed, cleaning up", {
          batch: batchNum,
          error: insertError.message,
          code: insertError.code,
          catalogId,
        });
        // Clean up: delete the half-created catalog so we don't leave orphans
        await auth.admin.from("catalog_items").delete().eq("catalog_id", catalogId);
        await auth.admin.from("catalogs").delete().eq("id", catalogId);
        return NextResponse.json(
          { error: "Failed to insert catalog items", details: insertError.message },
          { status: 500 },
        );
      }
    }
    insertedCount = uniqueItems.length;
  }

  console.log("[catalog-import] Done", {
    catalogId,
    isUpdate,
    insertedCount,
    updatedCount,
    totalItems: uniqueItems.length,
  });

  return NextResponse.json(
    {
      catalog_id: catalogId,
      item_count: uniqueItems.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      is_update: isUpdate,
    },
    { status: 201 },
  );
}

export interface ExistingOrderItemForMigration {
  sku: string;
  qty: number;
}

export interface TargetCatalogProductForMigration {
  sku: string;
  name: string;
  upc: string | null;
  pack: string | null;
  category: string;
}

export interface MigratedOrderItem {
  order_id: string;
  sku: string;
  product_name: string;
  upc: string;
  pack: string;
  category: string;
  qty: number;
}

export function migrateOrderItemsToCatalog(
  orderId: string,
  existingItems: ExistingOrderItemForMigration[],
  targetProducts: TargetCatalogProductForMigration[],
): {
  keptItems: MigratedOrderItem[];
  droppedSkus: string[];
  totalSkus: number;
  totalCases: number;
} {
  const productBySku = new Map(targetProducts.map((product) => [product.sku, product]));
  const droppedSkus = new Set<string>();
  const keptItems: MigratedOrderItem[] = [];

  for (const row of existingItems) {
    const product = productBySku.get(row.sku);
    if (!product) {
      droppedSkus.add(row.sku);
      continue;
    }
    keptItems.push({
      order_id: orderId,
      sku: product.sku,
      product_name: product.name,
      upc: product.upc ?? "",
      pack: product.pack ?? "",
      category: product.category,
      qty: row.qty,
    });
  }

  return {
    keptItems,
    droppedSkus: [...droppedSkus].sort(),
    totalSkus: keptItems.length,
    totalCases: keptItems.reduce((sum, item) => sum + item.qty, 0),
  };
}

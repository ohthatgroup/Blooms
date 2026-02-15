import { z } from "zod";

export const createCatalogSchema = z.object({
  versionLabel: z.string().min(1).max(120),
  pdfStoragePath: z.string().min(1),
});

export const patchCatalogItemSchema = z.object({
  name: z.string().min(1).optional(),
  upc: z.string().nullable().optional(),
  pack: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
  image_storage_path: z.string().min(1).optional(),
  approved: z.boolean().optional(),
});

export const createDealSchema = z.object({
  catalog_id: z.string().uuid(),
  sku: z.string().min(1),
  deal_text: z.string().min(1).max(500),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const patchDealSchema = z.object({
  deal_text: z.string().min(1).max(500).optional(),
  starts_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ends_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createCustomerLinkSchema = z.object({
  catalog_id: z.string().uuid(),
  customer_name: z.string().min(1).max(200),
});

export const patchCustomerLinkSchema = z.object({
  active: z.boolean(),
});

export const submitOrderSchema = z.object({
  token: z.string().min(10),
  customer_name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        sku: z.string().min(2),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const patchOrderSchema = z.object({
  customer_name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        qty: z.number().int().positive(),
        product_name: z.string().min(1).optional(),
        is_custom: z.boolean().optional(),
      }),
    )
    .min(1),
});

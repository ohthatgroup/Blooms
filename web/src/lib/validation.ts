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


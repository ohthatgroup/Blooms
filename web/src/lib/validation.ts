import { z } from "zod";

export const createCatalogSchema = z.object({
  versionLabel: z.string().min(1).max(120),
  pdfStoragePath: z.string().min(1),
});

export const createCatalogItemSchema = z.object({
  catalog_id: z.string().uuid(),
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(500),
  upc: z.string().max(100).nullable().optional(),
  pack: z.string().max(200).nullable().optional(),
  category: z.string().min(1).max(200),
  price: z.number().nonnegative().nullable().optional(),
  image_storage_path: z.string().optional(),
});

export const patchCatalogItemSchema = z.object({
  name: z.string().min(1).optional(),
  upc: z.string().nullable().optional(),
  pack: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
  image_storage_path: z.string().min(1).optional(),
  approved: z.boolean().optional(),
  price: z.number().nonnegative().nullable().optional(),
});

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createDealSchema = z
  .object({
    sku: z.string().min(1),
    deal_text: z.string().min(1).max(500).optional(),
    buy_qty: z.number().int().positive().optional(),
    free_qty: z.number().int().positive().optional(),
    starts_at: dateStringSchema,
    ends_at: dateStringSchema,
  })
  .superRefine((value, ctx) => {
    if ((value.buy_qty === undefined) !== (value.free_qty === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "buy_qty and free_qty must be provided together.",
      });
    }
    const hasNumeric = value.buy_qty !== undefined && value.free_qty !== undefined;
    if (!hasNumeric && !value.deal_text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide deal_text or buy_qty/free_qty.",
      });
    }
    if (value.starts_at > value.ends_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "starts_at must be on or before ends_at.",
      });
    }
  });

export const patchDealSchema = z
  .object({
    deal_text: z.string().min(1).max(500).optional(),
    buy_qty: z.number().int().positive().optional(),
    free_qty: z.number().int().positive().optional(),
    starts_at: dateStringSchema.optional(),
    ends_at: dateStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required.",
      });
    }
    if ((value.buy_qty === undefined) !== (value.free_qty === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "buy_qty and free_qty must be provided together.",
      });
    }
    if (
      value.starts_at !== undefined &&
      value.ends_at !== undefined &&
      value.starts_at > value.ends_at
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "starts_at must be on or before ends_at.",
      });
    }
  });

export const importDealsSchema = z.object({
  deals: z
    .array(
      z.object({
        sku: z.string().min(1),
        buy_qty: z.number().int().positive(),
        free_qty: z.number().int().positive(),
        starts_at: dateStringSchema,
        ends_at: dateStringSchema,
      }),
    )
    .min(1),
  source_file: z.string().max(300).optional(),
});

export const createCustomerLinkSchema = z.object({
  catalog_id: z.string().uuid(),
  customer_name: z.string().min(1).max(200),
});

export const patchCustomerLinkSchema = z
  .object({
    active: z.boolean().optional(),
    catalog_id: z.string().uuid().optional(),
    show_upc: z.boolean().optional(),
    show_price: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.active === undefined &&
      value.catalog_id === undefined &&
      value.show_upc === undefined &&
      value.show_price === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required.",
      });
    }
  });

export const submitOrderSchema = z.object({
  token: z.string().min(10),
  customer_name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        sku: z.string().min(2),
        qty: z.number().int().positive(),
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export const saveOrderDraftSchema = z.object({
  token: z.string().min(10),
  customer_name: z.string().min(1).max(200).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().min(2),
        qty: z.number().int().positive(),
        note: z.string().max(500).optional(),
      }),
    )
    .optional()
    .default([]),
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
        note: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

export const importCatalogSchema = z.object({
  version_label: z.string().min(1).max(120),
  catalog_id: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        upc: z.string().nullable().optional(),
        pack: z.string().nullable().optional(),
        price: z.number().nonnegative().nullable().optional(),
        category: z.string().min(1),
      }),
    )
    .min(1),
});

export const bulkImportOrderSchema = z.object({
  catalog_id: z.string().uuid(),
  customer_name: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
  customer_link_id: z.string().uuid().optional(),
});

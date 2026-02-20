ALTER TABLE public.catalog_items ADD COLUMN IF NOT EXISTS price numeric(10,2);
ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS show_upc boolean NOT NULL DEFAULT true;
ALTER TABLE public.customer_links ADD COLUMN IF NOT EXISTS show_price boolean NOT NULL DEFAULT false;

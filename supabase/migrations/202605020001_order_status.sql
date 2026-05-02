ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_status text NOT NULL DEFAULT 'draft'
CHECK (order_status IN ('draft', 'submitted'));

UPDATE public.orders
SET order_status = CASE
  WHEN csv_storage_path IS NOT NULL THEN 'submitted'
  ELSE 'draft'
END;

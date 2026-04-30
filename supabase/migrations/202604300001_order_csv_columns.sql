ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS csv_columns jsonb;

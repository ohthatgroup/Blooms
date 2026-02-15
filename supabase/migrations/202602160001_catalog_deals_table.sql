-- New deals table (replaces the single catalog_items.deal column)
create table public.catalog_deals (
  id         uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  sku        text not null,
  deal_text  text not null,
  starts_at  date not null,
  ends_at    date not null,
  created_at timestamptz not null default now(),
  constraint catalog_deals_date_range check (ends_at >= starts_at)
);

-- Index for fast lookup by catalog + sku
create index idx_catalog_deals_catalog_sku on public.catalog_deals(catalog_id, sku);

-- Drop the old single-deal column
alter table public.catalog_items drop column if exists deal;

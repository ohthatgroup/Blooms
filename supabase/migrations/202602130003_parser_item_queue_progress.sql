alter table public.catalogs
add column if not exists pdf_sha256 text;

alter table public.catalog_items
add column if not exists quick_fingerprint text;

alter table public.parser_jobs
add column if not exists total_items int not null default 0,
add column if not exists reused_items int not null default 0,
add column if not exists queued_items int not null default 0,
add column if not exists processed_items int not null default 0,
add column if not exists failed_items int not null default 0,
add column if not exists progress_percent int not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
add column if not exists progress_label text not null default 'queued',
add column if not exists parsed_pages int,
add column if not exists total_pages int;

create table if not exists public.item_parse_cache (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  quick_fingerprint text not null,
  strong_fingerprint text not null,
  name text not null,
  upc text,
  pack text,
  category text not null,
  image_storage_path text not null,
  updated_at timestamptz not null default now(),
  unique (sku, quick_fingerprint)
);

create table if not exists public.parser_job_items (
  id uuid primary key default gen_random_uuid(),
  parser_job_id uuid not null references public.parser_jobs(id) on delete cascade,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  sku text not null,
  quick_fingerprint text not null,
  page_no int,
  sku_bbox jsonb,
  image_bbox jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'success', 'failed', 'reused')),
  error_log text,
  attempts int not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_catalog_items_quick_fingerprint on public.catalog_items(quick_fingerprint);
create index if not exists idx_item_parse_cache_quick_fingerprint on public.item_parse_cache(quick_fingerprint);
create index if not exists idx_item_parse_cache_sku on public.item_parse_cache(sku);
create index if not exists idx_parser_job_items_parser_job_id on public.parser_job_items(parser_job_id);
create index if not exists idx_parser_job_items_catalog_id on public.parser_job_items(catalog_id);
create index if not exists idx_parser_job_items_status on public.parser_job_items(status);

alter table public.item_parse_cache enable row level security;
alter table public.parser_job_items enable row level security;

drop policy if exists "admin_all_item_parse_cache" on public.item_parse_cache;
create policy "admin_all_item_parse_cache"
on public.item_parse_cache
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_parser_job_items" on public.parser_job_items;
create policy "admin_all_parser_job_items"
on public.parser_job_items
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

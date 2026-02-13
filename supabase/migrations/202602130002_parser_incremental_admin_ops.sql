alter table public.catalogs
add column if not exists deleted_at timestamptz,
add column if not exists deleted_by uuid references auth.users(id) on delete set null,
add column if not exists baseline_catalog_id uuid references public.catalogs(id) on delete set null;

alter table public.catalog_items
add column if not exists signature text not null default '',
add column if not exists change_type text not null default 'new'
  check (change_type in ('new', 'updated', 'unchanged'));

create index if not exists idx_catalogs_deleted_at on public.catalogs(deleted_at);
create index if not exists idx_catalog_items_catalog_signature on public.catalog_items(catalog_id, signature);
create index if not exists idx_catalog_items_catalog_change_type on public.catalog_items(catalog_id, change_type);

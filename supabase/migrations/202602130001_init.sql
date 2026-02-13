create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1
    from public.profiles p
    where p.user_id = uid
      and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, role)
  values (new.id, 'admin')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  version_label text not null,
  pdf_storage_path text not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'published', 'archived')),
  parse_status text not null default 'queued' check (parse_status in ('queued', 'processing', 'needs_review', 'failed', 'complete')),
  parse_summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  sku text not null,
  name text not null,
  upc text,
  pack text,
  category text not null,
  image_storage_path text not null default '',
  parse_issues jsonb not null default '[]'::jsonb,
  approved boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (catalog_id, sku)
);

create table if not exists public.customer_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  customer_name text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_link_id uuid not null references public.customer_links(id) on delete restrict,
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  customer_name text not null,
  submitted_at timestamptz not null default now(),
  total_skus int not null default 0 check (total_skus >= 0),
  total_cases int not null default 0 check (total_cases >= 0),
  csv_storage_path text
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sku text not null,
  product_name text not null,
  upc text,
  pack text,
  category text not null,
  qty int not null check (qty > 0)
);

create table if not exists public.parser_jobs (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'success', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  error_log text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_catalog_items_updated_at on public.catalog_items;
create trigger set_catalog_items_updated_at
before update on public.catalog_items
for each row execute procedure public.touch_updated_at();

create index if not exists idx_catalog_items_catalog_id on public.catalog_items(catalog_id);
create index if not exists idx_customer_links_catalog_id on public.customer_links(catalog_id);
create index if not exists idx_orders_catalog_id on public.orders(catalog_id);
create index if not exists idx_orders_customer_link_id on public.orders(customer_link_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_parser_jobs_catalog_id on public.parser_jobs(catalog_id);

alter table public.profiles enable row level security;
alter table public.catalogs enable row level security;
alter table public.catalog_items enable row level security;
alter table public.customer_links enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.parser_jobs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "admin_all_catalogs" on public.catalogs;
create policy "admin_all_catalogs"
on public.catalogs
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_catalog_items" on public.catalog_items;
create policy "admin_all_catalog_items"
on public.catalog_items
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_customer_links" on public.customer_links;
create policy "admin_all_customer_links"
on public.customer_links
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_orders" on public.orders;
create policy "admin_all_orders"
on public.orders
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_order_items" on public.order_items;
create policy "admin_all_order_items"
on public.order_items
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_all_parser_jobs" on public.parser_jobs;
create policy "admin_all_parser_jobs"
on public.parser_jobs
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public)
values
  ('catalog-pdfs', 'catalog-pdfs', false),
  ('product-images', 'product-images', true),
  ('order-csv', 'order-csv', false)
on conflict (id) do nothing;

drop policy if exists "admin_catalog_pdfs_access" on storage.objects;
create policy "admin_catalog_pdfs_access"
on storage.objects
for all
to authenticated
using (bucket_id = 'catalog-pdfs' and public.is_admin(auth.uid()))
with check (bucket_id = 'catalog-pdfs' and public.is_admin(auth.uid()));

drop policy if exists "public_product_images_read" on storage.objects;
create policy "public_product_images_read"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

drop policy if exists "admin_product_images_write" on storage.objects;
create policy "admin_product_images_write"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-images' and public.is_admin(auth.uid()))
with check (bucket_id = 'product-images' and public.is_admin(auth.uid()));

drop policy if exists "admin_order_csv_access" on storage.objects;
create policy "admin_order_csv_access"
on storage.objects
for all
to authenticated
using (bucket_id = 'order-csv' and public.is_admin(auth.uid()))
with check (bucket_id = 'order-csv' and public.is_admin(auth.uid()));

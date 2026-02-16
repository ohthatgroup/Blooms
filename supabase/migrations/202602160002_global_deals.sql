create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  buy_qty int not null check (buy_qty > 0),
  free_qty int not null check (free_qty > 0),
  starts_at date not null,
  ends_at date not null,
  created_at timestamptz not null default now(),
  constraint deals_date_range check (ends_at >= starts_at),
  constraint deals_unique_rule unique (sku, buy_qty, free_qty, starts_at, ends_at)
);

create index if not exists idx_deals_sku_dates on public.deals(sku, starts_at, ends_at);
create index if not exists idx_deals_dates on public.deals(starts_at, ends_at);

alter table public.deals enable row level security;

drop policy if exists "admin_all_deals" on public.deals;
create policy "admin_all_deals"
on public.deals
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

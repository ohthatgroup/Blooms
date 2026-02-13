alter table public.orders
add column if not exists is_live boolean not null default true,
add column if not exists updated_at timestamptz not null default now();

with ranked as (
  select
    id,
    row_number() over (
      partition by customer_link_id, catalog_id
      order by submitted_at desc, id desc
    ) as rn
  from public.orders
)
update public.orders o
set is_live = (r.rn = 1)
from ranked r
where o.id = r.id;

create unique index if not exists uniq_orders_live_by_link_catalog
on public.orders(customer_link_id, catalog_id)
where is_live = true;

create index if not exists idx_orders_is_live on public.orders(is_live);

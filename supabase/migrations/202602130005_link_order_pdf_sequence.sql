alter table public.catalog_items
add column if not exists display_order int not null default 0,
add column if not exists source_page_no int,
add column if not exists source_top numeric;

create index if not exists idx_catalog_items_catalog_display_order
on public.catalog_items(catalog_id, display_order);

alter table public.orders
add column if not exists archived_at timestamptz;

with ranked as (
  select
    id,
    row_number() over (
      partition by customer_link_id
      order by submitted_at desc, id desc
    ) as rn
  from public.orders
)
update public.orders o
set archived_at = case
  when r.rn = 1 then null
  else coalesce(o.archived_at, now())
end
from ranked r
where o.id = r.id;

create unique index if not exists uniq_orders_active_per_link
on public.orders(customer_link_id)
where archived_at is null;

create index if not exists idx_orders_active_link
on public.orders(customer_link_id)
where archived_at is null;

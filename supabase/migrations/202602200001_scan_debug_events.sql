create table if not exists public.scan_debug_events (
  id bigserial primary key,
  session_id text not null,
  customer_link_id uuid references public.customer_links(id) on delete set null,
  source text not null,
  event_type text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  page_url text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  check (char_length(session_id) between 3 and 120),
  check (char_length(source) between 1 and 80),
  check (char_length(event_type) between 1 and 80),
  check (char_length(message) between 1 and 500)
);

create index if not exists idx_scan_debug_events_session_created_at
  on public.scan_debug_events (session_id, created_at desc);

create index if not exists idx_scan_debug_events_customer_link_created_at
  on public.scan_debug_events (customer_link_id, created_at desc);

alter table public.scan_debug_events enable row level security;

drop policy if exists "admin_all_scan_debug_events" on public.scan_debug_events;
create policy "admin_all_scan_debug_events"
on public.scan_debug_events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

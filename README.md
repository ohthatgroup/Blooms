# Bloom Catalog Ordering App

Production-ready V1 implementation with:

- `web/`: Next.js + TypeScript app (admin + customer + APIs)
- `supabase/migrations/`: SQL schema and RLS/storage policies
- `parser-worker/`: Python parser worker service

## Project Layout

- `web/src/app/admin/*`: admin dashboard, review, links, orders
- `web/src/app/o/[token]`: customer ordering flow
- `web/src/app/api/admin/*`: admin APIs
- `web/src/app/api/public/*`: customer APIs
- `parser-worker/worker.py`: queue polling + PDF parse pipeline
- `parser-worker/parser.py`: Bloom PDF parsing + image mapping

## Setup

1. Create a Supabase project.
2. Run migrations in order:
   - `supabase/migrations/202602130001_init.sql`
   - `supabase/migrations/202602130002_parser_incremental_admin_ops.sql`
   - `supabase/migrations/202602130003_parser_item_queue_progress.sql`
   - `supabase/migrations/202602130004_orders_live_editing.sql`
   - `supabase/migrations/202602130005_link_order_pdf_sequence.sql`
   - `supabase/migrations/202602150001_catalog_item_deal.sql`
   - `supabase/migrations/202602160001_catalog_deals_table.sql`
   - `supabase/migrations/202602160002_global_deals.sql`
   - Recommended CLI: `supabase db push`
3. Configure web env:
   - `web/.env.example` -> `web/.env.local`
4. Configure parser env:
   - `parser-worker/.env.example` -> `parser-worker/.env`

## Vercel Public Customer Links

1. Set `APP_BASE_URL` in Vercel to your public production domain.
2. Disable Vercel deployment protection/auth for customer links you share publicly.
3. Keep admin routes protected by the app's Supabase auth (`/admin`, `/api/admin/*`).

## Run Web

```bash
cd web
npm install
npm run dev
```

## Run Parser Worker

```bash
cd parser-worker
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python worker.py
```

## Tests

### Web

```bash
cd web
npm run test
```

### Parser

```bash
cd parser-worker
pytest
```

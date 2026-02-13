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
2. Run migration:
   - `supabase/migrations/202602130001_init.sql`
3. Configure web env:
   - `web/.env.example` -> `web/.env.local`
4. Configure parser env:
   - `parser-worker/.env.example` -> `parser-worker/.env`

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


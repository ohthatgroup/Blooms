# Parser Worker

Dedicated Python worker for Bloom catalog parsing.

## What it does

1. Polls `parser_jobs` for `queued` jobs.
2. Downloads catalog PDF from Supabase Storage bucket `catalog-pdfs`.
3. Parses SKU, name, UPC, pack, category, and image mapping.
4. Uploads product images to `product-images`.
5. Upserts `catalog_items` and updates parse summary/status.

## Run locally

```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
python worker.py
```

## Test

```bash
pytest
```

The fixture test expects `../BLOOMS CATALOG 2.10.2026.pdf` to exist.


from __future__ import annotations

import logging
import os
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

from parser import parse_catalog_pdf

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PARSER_POLL_SECONDS = int(os.environ.get("PARSER_POLL_SECONDS", "10"))
LOG_LEVEL = os.environ.get("PARSER_LOG_LEVEL", "INFO")

logging.basicConfig(level=getattr(logging, LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger("parser-worker")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def claim_next_job(client: Client):
    result = (
        client.table("parser_jobs")
        .select("id,catalog_id,status,attempts")
        .eq("status", "queued")
        .order("created_at")
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None

    job = rows[0]
    attempts = int(job.get("attempts") or 0) + 1
    (
        client.table("parser_jobs")
        .update(
            {
                "status": "processing",
                "attempts": attempts,
                "started_at": now_iso(),
                "error_log": None,
            }
        )
        .eq("id", job["id"])
        .execute()
    )
    (
        client.table("catalogs")
        .update({"parse_status": "processing"})
        .eq("id", job["catalog_id"])
        .execute()
    )
    return job


def _safe_filename(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in name)


def process_job(client: Client, job: dict):
    job_id = job["id"]
    catalog_id = job["catalog_id"]
    logger.info("Processing parser job %s catalog=%s", job_id, catalog_id)

    try:
        catalog_resp = (
            client.table("catalogs")
            .select("id,pdf_storage_path")
            .eq("id", catalog_id)
            .single()
            .execute()
        )
        catalog = catalog_resp.data
        if not catalog:
            raise RuntimeError(f"Catalog not found: {catalog_id}")

        pdf_path = catalog["pdf_storage_path"]
        file_bytes = client.storage.from_("catalog-pdfs").download(pdf_path)
        if not file_bytes:
            raise RuntimeError(f"Unable to download PDF from storage path: {pdf_path}")

        with tempfile.TemporaryDirectory(prefix="blooms-parser-") as temp_dir:
            tmp_pdf = Path(temp_dir) / "catalog.pdf"
            tmp_pdf.write_bytes(file_bytes)
            parsed_items = parse_catalog_pdf(tmp_pdf)

            missing_images = 0
            unknown_categories = 0
            for item in parsed_items:
                image_storage_path = ""
                if item.image_bytes:
                    ext = item.image_extension or "jpg"
                    image_storage_path = (
                        f"catalog-items/{catalog_id}/{item.sku}-{int(time.time() * 1000)}.{_safe_filename(ext)}"
                    )
                    client.storage.from_("product-images").upload(
                        image_storage_path,
                        item.image_bytes,
                        {"upsert": "true"},
                    )
                else:
                    missing_images += 1

                if "unknown_category" in item.parse_issues:
                    unknown_categories += 1

                client.table("catalog_items").upsert(
                    {
                        "catalog_id": catalog_id,
                        "sku": item.sku,
                        "name": item.name,
                        "upc": item.upc,
                        "pack": item.pack,
                        "category": item.category,
                        "image_storage_path": image_storage_path,
                        "parse_issues": item.parse_issues,
                        "approved": False,
                    },
                    on_conflict="catalog_id,sku",
                ).execute()

        summary = {
            "total_items": len(parsed_items),
            "missing_images": missing_images,
            "unknown_categories": unknown_categories,
        }
        client.table("catalogs").update(
            {"parse_status": "needs_review", "status": "draft", "parse_summary": summary}
        ).eq("id", catalog_id).execute()

        client.table("parser_jobs").update(
            {"status": "success", "finished_at": now_iso(), "error_log": None}
        ).eq("id", job_id).execute()

        logger.info("Parser job %s completed: %s", job_id, summary)
    except Exception as exc:
        message = str(exc)[:4000]
        logger.exception("Parser job %s failed: %s", job_id, message)
        client.table("catalogs").update({"parse_status": "failed"}).eq("id", catalog_id).execute()
        client.table("parser_jobs").update(
            {"status": "failed", "finished_at": now_iso(), "error_log": message}
        ).eq("id", job_id).execute()


def run_once():
    client = get_client()
    job = claim_next_job(client)
    if not job:
        logger.info("No queued parser jobs.")
        return False
    process_job(client, job)
    return True


def run_forever():
    logger.info("Parser worker started, polling every %ss", PARSER_POLL_SECONDS)
    while True:
        try:
            processed = run_once()
            if not processed:
                time.sleep(PARSER_POLL_SECONDS)
        except Exception:
            logger.exception("Unexpected worker error, sleeping before retry")
            time.sleep(PARSER_POLL_SECONDS)


if __name__ == "__main__":
    run_forever()


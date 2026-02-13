from __future__ import annotations

import hashlib
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


def _normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().lower().split())


def _sha256_hex(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _item_signature(
    sku: str,
    name: str,
    upc: str | None,
    pack: str | None,
    category: str,
    image_hash: str,
) -> str:
    payload = "|".join(
        [
            _normalize_text(sku),
            _normalize_text(name),
            _normalize_text(upc),
            _normalize_text(pack),
            _normalize_text(category),
            image_hash,
        ]
    )
    return _sha256_hex(payload)


def _load_baseline_catalog_id(client: Client, catalog_id: str) -> str | None:
    result = (
        client.table("catalogs")
        .select("id")
        .eq("status", "published")
        .is_("deleted_at", "null")
        .neq("id", catalog_id)
        .order("published_at", desc=True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        return None
    return rows[0]["id"]


def _load_baseline_items(client: Client, baseline_catalog_id: str | None) -> dict[str, dict]:
    if not baseline_catalog_id:
        return {}
    result = (
        client.table("catalog_items")
        .select("sku,name,upc,pack,category,image_storage_path,signature")
        .eq("catalog_id", baseline_catalog_id)
        .execute()
    )
    rows = result.data or []
    return {row["sku"]: row for row in rows}


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

            baseline_catalog_id = _load_baseline_catalog_id(client, catalog_id)
            baseline_items = _load_baseline_items(client, baseline_catalog_id)
            baseline_skus = set(baseline_items.keys())
            parsed_skus: set[str] = set()

            missing_images = 0
            unknown_categories = 0
            new_items = 0
            updated_items = 0
            unchanged_items = 0
            row_payload: list[dict] = []

            for item in parsed_items:
                parsed_skus.add(item.sku)

                image_hash = _sha256_hex(item.image_bytes) if item.image_bytes else ""
                signature = _item_signature(
                    sku=item.sku,
                    name=item.name,
                    upc=item.upc,
                    pack=item.pack,
                    category=item.category,
                    image_hash=image_hash,
                )

                baseline = baseline_items.get(item.sku)
                baseline_signature = baseline.get("signature") if baseline else ""
                is_unchanged = bool(baseline and baseline_signature and baseline_signature == signature)

                if is_unchanged:
                    unchanged_items += 1
                    image_storage_path = baseline.get("image_storage_path", "")
                    if not image_storage_path:
                        missing_images += 1
                    row_payload.append(
                        {
                            "catalog_id": catalog_id,
                            "sku": item.sku,
                            "name": baseline.get("name") or item.name,
                            "upc": baseline.get("upc"),
                            "pack": baseline.get("pack"),
                            "category": baseline.get("category") or item.category,
                            "image_storage_path": image_storage_path,
                            "parse_issues": [],
                            "approved": True,
                            "signature": signature,
                            "change_type": "unchanged",
                        }
                    )
                    continue

                if baseline:
                    updated_items += 1
                    change_type = "updated"
                else:
                    new_items += 1
                    change_type = "new"

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

                row_payload.append(
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
                        "signature": signature,
                        "change_type": change_type,
                    }
                )

            # Re-runs for the same catalog should replace item rows with current parse output.
            client.table("catalog_items").delete().eq("catalog_id", catalog_id).execute()

            if row_payload:
                client.table("catalog_items").upsert(
                    row_payload,
                    on_conflict="catalog_id,sku",
                ).execute()

        removed_items = len(baseline_skus - parsed_skus)

        summary = {
            "total_items": len(parsed_items),
            "new_items": new_items,
            "updated_items": updated_items,
            "unchanged_items": unchanged_items,
            "removed_items": removed_items,
            "missing_images": missing_images,
            "unknown_categories": unknown_categories,
            "baseline_catalog_id": baseline_catalog_id,
        }
        client.table("catalogs").update(
            {
                "parse_status": "needs_review",
                "status": "draft",
                "parse_summary": summary,
                "baseline_catalog_id": baseline_catalog_id,
            }
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

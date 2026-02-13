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

from parser import QuickCandidate, parse_catalog_pdf, scan_catalog_fast

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


def _sha256_hex(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _safe_filename(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in name)


def _normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().lower().split())


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
    return rows[0]["id"] if rows else None


def _load_baseline_items(client: Client, baseline_catalog_id: str | None) -> dict[str, dict]:
    if not baseline_catalog_id:
        return {}
    result = (
        client.table("catalog_items")
        .select("sku,signature,name,upc,pack,category,image_storage_path")
        .eq("catalog_id", baseline_catalog_id)
        .execute()
    )
    rows = result.data or []
    return {row["sku"]: row for row in rows}


def _progress_percent(total_items: int, done_items: int) -> int:
    if total_items <= 0:
        return 0
    return max(0, min(100, int((done_items * 100) / total_items)))


def _summarize_progress(
    *,
    total_items: int,
    raw_candidates: int,
    reused_items: int,
    queued_items: int,
    processed_items: int,
    failed_items: int,
    parsed_pages: int,
    total_pages: int,
) -> dict:
    done_items = reused_items + processed_items + failed_items
    return {
        "raw_candidates": raw_candidates,
        "unique_skus": total_items,
        "total_items": total_items,
        "reused_items": reused_items,
        "queued_items": queued_items,
        "processed_items": processed_items,
        "failed_items": failed_items,
        "parsed_pages": parsed_pages,
        "total_pages": total_pages,
        "progress_percent": _progress_percent(total_items, done_items),
    }


def _update_processing_progress(
    client: Client,
    *,
    job_id: str,
    catalog_id: str,
    progress: dict,
    progress_label: str,
) -> None:
    client.table("parser_jobs").update(
        {
            "total_items": progress["total_items"],
            "reused_items": progress["reused_items"],
            "queued_items": progress["queued_items"],
            "processed_items": progress["processed_items"],
            "failed_items": progress["failed_items"],
            "progress_percent": progress["progress_percent"],
            "progress_label": progress_label,
            "parsed_pages": progress["parsed_pages"],
            "total_pages": progress["total_pages"],
        }
    ).eq("id", job_id).execute()

    client.table("catalogs").update(
        {
            "parse_status": "processing",
            "parse_summary": progress,
        }
    ).eq("id", catalog_id).execute()


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
    client.table("parser_jobs").update(
        {
            "status": "processing",
            "attempts": attempts,
            "started_at": now_iso(),
            "error_log": None,
            "total_items": 0,
            "reused_items": 0,
            "queued_items": 0,
            "processed_items": 0,
            "failed_items": 0,
            "progress_percent": 0,
            "progress_label": "queued",
            "parsed_pages": 0,
            "total_pages": 0,
        }
    ).eq("id", job["id"]).execute()

    client.table("catalogs").update(
        {
            "parse_status": "processing",
            "parse_summary": {"progress_percent": 0, "progress_label": "queued"},
        }
    ).eq("id", job["catalog_id"]).execute()
    return job


def _classify_change_type(sku: str, signature: str, baseline_items: dict[str, dict]) -> str:
    baseline = baseline_items.get(sku)
    if not baseline:
        return "new"
    baseline_signature = baseline.get("signature") or ""
    return "unchanged" if baseline_signature == signature else "updated"


def _dedupe_candidates(candidates: list[QuickCandidate]) -> list[QuickCandidate]:
    unique: dict[str, QuickCandidate] = {}
    for candidate in candidates:
        if candidate.sku not in unique:
            unique[candidate.sku] = candidate
    return list(unique.values())


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

        pdf_sha256 = _sha256_hex(file_bytes)
        with tempfile.TemporaryDirectory(prefix="blooms-parser-") as temp_dir:
            tmp_pdf = Path(temp_dir) / "catalog.pdf"
            tmp_pdf.write_bytes(file_bytes)

            fast_candidates_raw = scan_catalog_fast(tmp_pdf)
            raw_candidates = len(fast_candidates_raw)
            fast_candidates = _dedupe_candidates(fast_candidates_raw)
            unique_skus = [candidate.sku for candidate in fast_candidates]
            total_items = len(fast_candidates)
            total_pages = max((candidate.page_no for candidate in fast_candidates_raw), default=0)

            baseline_catalog_id = _load_baseline_catalog_id(client, catalog_id)
            baseline_items = _load_baseline_items(client, baseline_catalog_id)
            baseline_skus = set(baseline_items.keys())

            cache_rows: list[dict] = []
            if unique_skus:
                cache_resp = (
                    client.table("item_parse_cache")
                    .select(
                        "sku,quick_fingerprint,strong_fingerprint,name,upc,pack,category,image_storage_path"
                    )
                    .in_("sku", unique_skus)
                    .execute()
                )
                cache_rows = cache_resp.data or []

            cache_by_key = {
                (row["sku"], row["quick_fingerprint"]): row for row in cache_rows
            }

            queued_candidates: dict[str, QuickCandidate] = {}
            parser_job_item_rows: list[dict] = []
            catalog_item_rows: list[dict] = []
            missing_images = 0
            unknown_categories = 0
            reused_items = 0
            queued_items = 0
            processed_items = 0
            failed_items = 0

            for candidate in fast_candidates:
                cache_hit = cache_by_key.get((candidate.sku, candidate.quick_fingerprint))
                status = "queued"
                row_finished_at = None
                error_log = None

                if cache_hit:
                    signature = cache_hit["strong_fingerprint"]
                    change_type = _classify_change_type(candidate.sku, signature, baseline_items)
                    approved = change_type == "unchanged"
                    image_storage_path = cache_hit.get("image_storage_path") or ""
                    parse_issues: list[str] = []
                    if not image_storage_path:
                        missing_images += 1
                    if cache_hit.get("category") == "Uncategorized":
                        unknown_categories += 1

                    catalog_item_rows.append(
                        {
                            "catalog_id": catalog_id,
                            "sku": candidate.sku,
                            "name": cache_hit["name"],
                            "upc": cache_hit.get("upc"),
                            "pack": cache_hit.get("pack"),
                            "category": cache_hit["category"],
                            "image_storage_path": image_storage_path,
                            "parse_issues": parse_issues,
                            "approved": approved,
                            "signature": signature,
                            "quick_fingerprint": candidate.quick_fingerprint,
                            "change_type": change_type,
                        }
                    )
                    status = "reused"
                    row_finished_at = now_iso()
                    reused_items += 1
                else:
                    queued_candidates[candidate.sku] = candidate
                    queued_items += 1

                parser_job_item_rows.append(
                    {
                        "parser_job_id": job_id,
                        "catalog_id": catalog_id,
                        "sku": candidate.sku,
                        "quick_fingerprint": candidate.quick_fingerprint,
                        "page_no": candidate.page_no,
                        "sku_bbox": candidate.sku_bbox,
                        "image_bbox": candidate.image_bbox,
                        "status": status,
                        "error_log": error_log,
                        "attempts": 0,
                        "finished_at": row_finished_at,
                    }
                )

            client.table("parser_job_items").delete().eq("parser_job_id", job_id).execute()
            if parser_job_item_rows:
                client.table("parser_job_items").insert(parser_job_item_rows).execute()

            client.table("catalog_items").delete().eq("catalog_id", catalog_id).execute()

            progress = _summarize_progress(
                total_items=total_items,
                raw_candidates=raw_candidates,
                reused_items=reused_items,
                queued_items=queued_items,
                processed_items=processed_items,
                failed_items=failed_items,
                parsed_pages=total_pages,
                total_pages=total_pages,
            )
            _update_processing_progress(
                client,
                job_id=job_id,
                catalog_id=catalog_id,
                progress=progress,
                progress_label="reusing_cached_items",
            )

            if queued_candidates:
                queued_skus = set(queued_candidates.keys())
                parsed_items = parse_catalog_pdf(tmp_pdf, sku_filter=queued_skus)
                parsed_by_sku = {item.sku: item for item in parsed_items}

                for sku, candidate in queued_candidates.items():
                    client.table("parser_job_items").update(
                        {
                            "status": "processing",
                            "attempts": 1,
                            "started_at": now_iso(),
                        }
                    ).eq("parser_job_id", job_id).eq("sku", sku).execute()

                    item = parsed_by_sku.get(sku)
                    if not item:
                        failed_items += 1
                        client.table("parser_job_items").update(
                            {
                                "status": "failed",
                                "error_log": "SKU not found in heavy parse output",
                                "finished_at": now_iso(),
                            }
                        ).eq("parser_job_id", job_id).eq("sku", sku).execute()

                        progress = _summarize_progress(
                            total_items=total_items,
                            raw_candidates=raw_candidates,
                            reused_items=reused_items,
                            queued_items=queued_items,
                            processed_items=processed_items,
                            failed_items=failed_items,
                            parsed_pages=total_pages,
                            total_pages=total_pages,
                        )
                        _update_processing_progress(
                            client,
                            job_id=job_id,
                            catalog_id=catalog_id,
                            progress=progress,
                            progress_label="heavy_parse_processing",
                        )
                        continue

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

                    image_hash = _sha256_hex(item.image_bytes) if item.image_bytes else ""
                    signature = _item_signature(
                        sku=item.sku,
                        name=item.name,
                        upc=item.upc,
                        pack=item.pack,
                        category=item.category,
                        image_hash=image_hash,
                    )
                    change_type = _classify_change_type(item.sku, signature, baseline_items)
                    approved = change_type == "unchanged"

                    catalog_item_rows.append(
                        {
                            "catalog_id": catalog_id,
                            "sku": item.sku,
                            "name": item.name,
                            "upc": item.upc,
                            "pack": item.pack,
                            "category": item.category,
                            "image_storage_path": image_storage_path,
                            "parse_issues": item.parse_issues,
                            "approved": approved,
                            "signature": signature,
                            "quick_fingerprint": candidate.quick_fingerprint,
                            "change_type": change_type,
                        }
                    )

                    client.table("item_parse_cache").upsert(
                        {
                            "sku": item.sku,
                            "quick_fingerprint": candidate.quick_fingerprint,
                            "strong_fingerprint": signature,
                            "name": item.name,
                            "upc": item.upc,
                            "pack": item.pack,
                            "category": item.category,
                            "image_storage_path": image_storage_path,
                            "updated_at": now_iso(),
                        },
                        on_conflict="sku,quick_fingerprint",
                    ).execute()

                    processed_items += 1
                    client.table("parser_job_items").update(
                        {
                            "status": "success",
                            "error_log": None,
                            "finished_at": now_iso(),
                        }
                    ).eq("parser_job_id", job_id).eq("sku", item.sku).execute()

                    progress = _summarize_progress(
                        total_items=total_items,
                        raw_candidates=raw_candidates,
                        reused_items=reused_items,
                        queued_items=queued_items,
                        processed_items=processed_items,
                        failed_items=failed_items,
                        parsed_pages=total_pages,
                        total_pages=total_pages,
                    )
                    _update_processing_progress(
                        client,
                        job_id=job_id,
                        catalog_id=catalog_id,
                        progress=progress,
                        progress_label="heavy_parse_processing",
                    )

            if catalog_item_rows:
                client.table("catalog_items").upsert(
                    catalog_item_rows,
                    on_conflict="catalog_id,sku",
                ).execute()

            parsed_skus = {row["sku"] for row in catalog_item_rows}
            removed_items = len(baseline_skus - parsed_skus)

            new_items = sum(1 for row in catalog_item_rows if row["change_type"] == "new")
            updated_items = sum(1 for row in catalog_item_rows if row["change_type"] == "updated")
            unchanged_items = sum(1 for row in catalog_item_rows if row["change_type"] == "unchanged")
            final_progress = _summarize_progress(
                total_items=total_items,
                raw_candidates=raw_candidates,
                reused_items=reused_items,
                queued_items=queued_items,
                processed_items=processed_items,
                failed_items=failed_items,
                parsed_pages=total_pages,
                total_pages=total_pages,
            )
            summary = {
                **final_progress,
                "new_items": new_items,
                "updated_items": updated_items,
                "unchanged_items": unchanged_items,
                "removed_items": removed_items,
                "missing_images": missing_images,
                "unknown_categories": unknown_categories,
                "baseline_catalog_id": baseline_catalog_id,
                "pdf_sha256": pdf_sha256,
                "progress_percent": 100,
            }

            client.table("catalogs").update(
                {
                    "parse_status": "needs_review",
                    "status": "draft",
                    "parse_summary": summary,
                    "baseline_catalog_id": baseline_catalog_id,
                    "pdf_sha256": pdf_sha256,
                }
            ).eq("id", catalog_id).execute()

            client.table("parser_jobs").update(
                {
                    "status": "success",
                    "error_log": None,
                    "finished_at": now_iso(),
                    "total_items": total_items,
                    "reused_items": reused_items,
                    "queued_items": queued_items,
                    "processed_items": processed_items,
                    "failed_items": failed_items,
                    "progress_percent": 100,
                    "progress_label": "complete",
                    "parsed_pages": total_pages,
                    "total_pages": total_pages,
                }
            ).eq("id", job_id).execute()

            logger.info("Parser job %s completed: %s", job_id, summary)
    except Exception as exc:
        message = str(exc)[:4000]
        logger.exception("Parser job %s failed: %s", job_id, message)
        client.table("catalogs").update(
            {"parse_status": "failed", "parse_summary": {"error": message}}
        ).eq("id", catalog_id).execute()
        client.table("parser_jobs").update(
            {
                "status": "failed",
                "error_log": message,
                "finished_at": now_iso(),
                "progress_label": "failed",
            }
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

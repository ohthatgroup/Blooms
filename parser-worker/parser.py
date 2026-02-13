from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import pdfplumber
from pypdf import PdfReader

PREFIX_CATEGORY_MAP: dict[str, str] = {
    "BLK": "Misc",
    "BLM": "Bloom's",
    "CC": "Coca Cola / Beverages",
    "CON": "Dubble Bubble",
    "DP": "Pressels",
    "FAMS": "Famous",
    "GRAN": "General Mills / Fruit Snacks",
    "HER": "Hershey",
    "JB": "Mike & Ike / Just Born",
    "JMP": "Jump Juice",
    "JOY": "Joyva",
    "KALI": "Kali Tzom",
    "KOP": "Misc",
    "LOT": "Lotus",
    "LS": "Mentos / Imported",
    "LT": "Laffy Taffy",
    "MGD": "Israeli Imports",
    "MIMI": "Mimi",
    "ONG": "Oneg",
    "OREO": "Oreo",
    "RP": "Ring Pops",
    "SCH": "Schmerling",
    "SHL": "Fruit Leather",
    "SIZ": "Sizgit",
    "SPR": "Spring Juice",
    "TIC": "Tic Tac",
    "TRP": "Misc",
    "ZK": "Twizzlers / Licorice",
}

HEADER_LINES = {
    '×‘×¡"×“',
    "Bloom Packaging Corp.",
    "244 Dukes Street / Kearny N.J. 07032",
    "Tel # 718 768-1919 - Fax # 718 768-2551",
    "www.bloomskosher.com",
}

SKU_RE = re.compile(r"^[A-Z][A-Z0-9\-/]{2,}\d{2,}$")
PACK_HINT_RE = re.compile(r"(\d+\s*/\s*[\w.\- ]+)|(oz|gr|g|lb|pc)", re.I)
STRONG_PACK_RE = re.compile(r"\d+\s*[/-]\s*[\w.\- ]+", re.I)


@dataclass
class ParsedItem:
    sku: str
    name: str
    upc: str | None
    pack: str | None
    category: str
    parse_issues: list[str]
    image_bytes: bytes | None
    image_extension: str | None


@dataclass
class QuickCandidate:
    sku: str
    page_no: int
    sku_bbox: dict[str, float]
    image_bbox: dict[str, float] | None
    lines: list[str]
    quick_fingerprint: str


def category_from_sku(sku: str) -> str | None:
    prefix_match = re.match(r"^([A-Z]+)", sku)
    if not prefix_match:
        return None
    return PREFIX_CATEGORY_MAP.get(prefix_match.group(1))


def _digits_only(text: str) -> str:
    return "".join(ch for ch in text if ch.isdigit())


def _is_upc_line(text: str) -> bool:
    digits = _digits_only(text)
    return 8 <= len(digits) <= 14


def _is_pack_line(text: str) -> bool:
    return bool(PACK_HINT_RE.search(text))


def _is_strong_pack_line(text: str) -> bool:
    return bool(STRONG_PACK_RE.search(text))


def _normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(value.strip().lower().split())


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _line_text_from_words(words: list[dict[str, Any]]) -> list[str]:
    lines: list[list[Any]] = []
    for w in sorted(words, key=lambda row: (round(row["top"], 1), row["x0"])):
        if w["text"] in HEADER_LINES:
            continue
        if not lines or abs(w["top"] - lines[-1][0]) > 2.5:
            lines.append([w["top"], [w["text"]]])
        else:
            lines[-1][1].append(w["text"])
    return [" ".join(parts).strip() for _, parts in lines if " ".join(parts).strip()]


def _parse_fields_from_lines(sku: str, lines: list[str]) -> tuple[str, str | None, str | None]:
    sku_index = 0
    for idx, line in enumerate(lines):
        if line == sku:
            sku_index = idx
            break
    after = lines[sku_index + 1 :]

    upc: str | None = None
    upc_index: int | None = None
    for idx, line in enumerate(after):
        if _is_upc_line(line) and not _is_pack_line(line):
            upc = _digits_only(line)
            upc_index = idx
            break

    pack_index: int | None = None
    pack: str | None = None
    pack_candidates: list[int] = [idx for idx, line in enumerate(after) if _is_pack_line(line)]
    if pack_candidates:
        if upc_index is not None:
            after_upc = [idx for idx in pack_candidates if idx > upc_index]
            before_upc = [idx for idx in pack_candidates if idx < upc_index]
            for group in (after_upc, before_upc):
                strong = [idx for idx in group if _is_strong_pack_line(after[idx])]
                if strong:
                    pack_index = strong[0]
                    break
            if pack_index is None:
                pack_index = after_upc[0] if after_upc else pack_candidates[0]
        else:
            strong = [idx for idx in pack_candidates if _is_strong_pack_line(after[idx])]
            pack_index = strong[0] if strong else pack_candidates[0]

    if pack_index is not None:
        pack = after[pack_index]

    before_upc_name_parts: list[str] = []
    generic_name_parts: list[str] = []
    for idx, line in enumerate(after):
        if upc_index is not None and idx == upc_index:
            continue
        if pack_index is not None and idx == pack_index:
            continue
        generic_name_parts.append(line)
        if upc_index is not None and idx < upc_index:
            before_upc_name_parts.append(line)

    name_parts = before_upc_name_parts if before_upc_name_parts else generic_name_parts
    name = " ".join(name_parts).strip() or sku
    return name, upc, pack


def _assign_images_to_skus(
    words: list[dict[str, Any]],
    images: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
    skus = sorted(
        [w for w in words if SKU_RE.fullmatch(w["text"]) and w["top"] > 120],
        key=lambda row: (round(row["top"], 2), row["x0"]),
    )
    used_image_indexes: set[int] = set()
    assignments: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    for sku_word in skus:
        sx = (sku_word["x0"] + sku_word["x1"]) / 2
        sy = sku_word["top"]
        candidates: list[tuple[float, int]] = []
        for idx, img in enumerate(images):
            if idx in used_image_indexes:
                continue
            ix = (img["x0"] + img["x1"]) / 2
            it = img["top"]
            if not (it > sy + 20 and it < sy + 220):
                continue
            if abs(ix - sx) > 80:
                continue
            score = abs((it - (sy + 40))) + (0.25 * abs(ix - sx))
            candidates.append((score, idx))

        if candidates:
            candidates.sort(key=lambda row: row[0])
            best_idx = candidates[0][1]
            used_image_indexes.add(best_idx)
            assignments.append((sku_word, images[best_idx]))
        else:
            assignments.append((sku_word, None))
    return assignments


def _cell_bounds(
    page: Any,
    sku_word: dict[str, Any],
    mapped_image: dict[str, Any] | None,
) -> tuple[float, float, float, float, bool]:
    if mapped_image:
        return (
            max(0, mapped_image["x0"] - 8),
            min(page.width, mapped_image["x1"] + 8),
            max(0, sku_word["top"] - 4),
            min(page.height, mapped_image["bottom"] + 5),
            False,
        )

    return (
        max(0, sku_word["x0"] - 90),
        min(page.width, sku_word["x1"] + 140),
        max(0, sku_word["top"] - 4),
        min(page.height, sku_word["top"] + 70),
        True,
    )


def _collect_cell_words(
    words: list[dict[str, Any]],
    x0: float,
    x1: float,
    y0: float,
    y1: float,
) -> list[dict[str, Any]]:
    return [
        w
        for w in words
        if w["x0"] >= x0 and w["x1"] <= x1 and w["top"] >= y0 and w["bottom"] <= y1
    ]


def _image_signature(mapped_image: dict[str, Any] | None) -> str:
    if not mapped_image:
        return "no_image"
    return (
        f"{mapped_image.get('name','')}:"
        f"{round(mapped_image['x0'],1)}:{round(mapped_image['x1'],1)}:"
        f"{round(mapped_image['top'],1)}:{round(mapped_image['bottom'],1)}"
    )


def _quick_fingerprint(
    sku: str,
    lines: Iterable[str],
    image_signature: str,
) -> str:
    normalized_lines = " | ".join(_normalize_text(line) for line in lines)
    payload = "|".join([_normalize_text(sku), normalized_lines, image_signature])
    return _sha256(payload)


def scan_catalog_fast(pdf_path: str | Path) -> list[QuickCandidate]:
    pdf_path = Path(pdf_path)
    candidates: list[QuickCandidate] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            words = page.extract_words() or []
            images = [img for img in page.images if img["top"] > 120]
            assignments = _assign_images_to_skus(words, images)

            for sku_word, mapped_image in assignments:
                x0, x1, y0, y1, _ = _cell_bounds(page, sku_word, mapped_image)
                cell_words = _collect_cell_words(words, x0, x1, y0, y1)
                lines = _line_text_from_words(cell_words)
                quick_fp = _quick_fingerprint(
                    sku=sku_word["text"],
                    lines=lines,
                    image_signature=_image_signature(mapped_image),
                )

                candidates.append(
                    QuickCandidate(
                        sku=sku_word["text"],
                        page_no=page_index + 1,
                        sku_bbox={
                            "x0": float(sku_word["x0"]),
                            "x1": float(sku_word["x1"]),
                            "top": float(sku_word["top"]),
                            "bottom": float(sku_word["bottom"]),
                        },
                        image_bbox=(
                            {
                                "x0": float(mapped_image["x0"]),
                                "x1": float(mapped_image["x1"]),
                                "top": float(mapped_image["top"]),
                                "bottom": float(mapped_image["bottom"]),
                            }
                            if mapped_image
                            else None
                        ),
                        lines=lines,
                        quick_fingerprint=quick_fp,
                    )
                )

    return candidates


def parse_catalog_pdf(
    pdf_path: str | Path,
    sku_filter: set[str] | None = None,
) -> list[ParsedItem]:
    pdf_path = Path(pdf_path)
    reader = PdfReader(str(pdf_path))
    parsed_items: list[ParsedItem] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page_index, page in enumerate(pdf.pages):
            words = page.extract_words() or []
            images = [img for img in page.images if img["top"] > 120]
            assignments = _assign_images_to_skus(words, images)

            selected_assignments = []
            for sku_word, mapped_image in assignments:
                sku = sku_word["text"]
                if sku_filter is not None and sku not in sku_filter:
                    continue
                selected_assignments.append((sku_word, mapped_image))

            if not selected_assignments:
                continue

            image_by_name: dict[str, Any] = {}
            if any(mapped_image for _, mapped_image in selected_assignments):
                for image_obj in list(reader.pages[page_index].images):
                    image_by_name[image_obj.name] = image_obj
                    image_by_name[image_obj.name.split(".")[0]] = image_obj

            for sku_word, mapped_image in selected_assignments:
                sku = sku_word["text"]
                parse_issues: list[str] = []

                x0, x1, y0, y1, used_fallback = _cell_bounds(page, sku_word, mapped_image)
                if used_fallback:
                    parse_issues.append("missing_image")

                cell_words = _collect_cell_words(words, x0, x1, y0, y1)
                line_text = _line_text_from_words(cell_words)
                name, upc, pack = _parse_fields_from_lines(sku, line_text)

                category = category_from_sku(sku)
                if not category:
                    parse_issues.append("unknown_category")
                    category = "Uncategorized"

                if not pack:
                    parse_issues.append("missing_pack")

                image_bytes: bytes | None = None
                image_extension: str | None = None
                if mapped_image:
                    mapped_name = mapped_image.get("name", "")
                    image_obj = image_by_name.get(mapped_name)
                    if image_obj:
                        image_bytes = bytes(image_obj.data)
                        if "." in image_obj.name:
                            image_extension = image_obj.name.split(".")[-1].lower()
                    else:
                        parse_issues.append("missing_image")

                parsed_items.append(
                    ParsedItem(
                        sku=sku,
                        name=name,
                        upc=upc,
                        pack=pack,
                        category=category,
                        parse_issues=sorted(set(parse_issues)),
                        image_bytes=image_bytes,
                        image_extension=image_extension,
                    )
                )

    unique: dict[str, ParsedItem] = {}
    for item in parsed_items:
        if item.sku not in unique:
            unique[item.sku] = item
    return list(unique.values())

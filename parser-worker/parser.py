from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
    'בס"ד',
    "Bloom Packaging Corp.",
    "244 Dukes Street / Kearny N.J. 07032",
    "Tel # 718 768-1919 - Fax # 718 768-2551",
    "www.bloomskosher.com",
}

SKU_RE = re.compile(r"^[A-Z][A-Z0-9\-/]{2,}\d{2,}$")
PACK_HINT_RE = re.compile(r"(\d+\s*/\s*[\w.\- ]+)|(oz|gr|g|lb|pc)", re.I)


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

    name_parts: list[str] = []
    upc: str | None = None
    pack: str | None = None

    for line in after:
        if upc is None and _is_upc_line(line) and not _is_pack_line(line):
            upc = _digits_only(line)
            continue
        if pack is None and _is_pack_line(line):
            pack = line
            continue
        name_parts.append(line)

    # Fallback: if no pack found and trailing line exists, treat last as pack.
    if pack is None and len(name_parts) > 1:
        maybe_pack = name_parts[-1]
        if _is_pack_line(maybe_pack):
            pack = maybe_pack
            name_parts = name_parts[:-1]

    name = " ".join(name_parts).strip()
    if not name:
        name = sku
    return name, upc, pack


def parse_catalog_pdf(pdf_path: str | Path) -> list[ParsedItem]:
    pdf_path = Path(pdf_path)
    reader = PdfReader(str(pdf_path))
    with pdfplumber.open(str(pdf_path)) as pdf:
        parsed_items: list[ParsedItem] = []
        for page_index, page in enumerate(pdf.pages):
            words = page.extract_words() or []
            skus = [w for w in words if SKU_RE.fullmatch(w["text"]) and w["top"] > 120]
            images = [img for img in page.images if img["top"] > 120]

            pypdf_images = list(reader.pages[page_index].images)
            image_by_name: dict[str, Any] = {}
            for img in pypdf_images:
                base_name = img.name.split(".")[0]
                image_by_name[base_name] = img

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

            for sku_word, mapped_image in assignments:
                sku = sku_word["text"]
                parse_issues: list[str] = []

                if mapped_image:
                    x0 = max(0, mapped_image["x0"] - 8)
                    x1 = min(page.width, mapped_image["x1"] + 8)
                    y0 = max(0, sku_word["top"] - 4)
                    y1 = min(page.height, mapped_image["bottom"] + 5)
                else:
                    # Fallback to line-only extraction, still preserve row with missing image issue.
                    x0 = max(0, sku_word["x0"] - 90)
                    x1 = min(page.width, sku_word["x1"] + 140)
                    y0 = max(0, sku_word["top"] - 4)
                    y1 = min(page.height, sku_word["top"] + 70)
                    parse_issues.append("missing_image")

                cell_words = [
                    w
                    for w in words
                    if w["x0"] >= x0
                    and w["x1"] <= x1
                    and w["top"] >= y0
                    and w["bottom"] <= y1
                ]
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

        # Deduplicate by SKU, keep first.
        unique: dict[str, ParsedItem] = {}
        for item in parsed_items:
            if item.sku not in unique:
                unique[item.sku] = item
        return list(unique.values())


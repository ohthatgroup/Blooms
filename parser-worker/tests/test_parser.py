from pathlib import Path

import pytest

from parser import category_from_sku, parse_catalog_pdf


def test_category_from_sku_prefix():
    assert category_from_sku("BLM494") == "Bloom's"
    assert category_from_sku("SHL514") == "Fruit Leather"
    assert category_from_sku("UNKNOWN123") is None


def test_parse_catalog_fixture_counts():
    roots = [
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[3],
    ]
    fixture = None
    for root in roots:
        candidate = root / "BLOOMS CATALOG 2.10.2026.pdf"
        if candidate.exists():
            fixture = candidate
            break
    if fixture is None:
        fixture = roots[0] / "BLOOMS CATALOG 2.10.2026.pdf"
    if not fixture.exists():
        pytest.skip("Fixture catalog PDF not found")

    items = parse_catalog_pdf(fixture)
    assert len(items) == 858
    assert len({x.sku for x in items}) == 858
    assert sum(1 for x in items if x.image_bytes is not None) == 858
    assert sum(1 for x in items if x.upc is None) >= 1

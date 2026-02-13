from pathlib import Path

import pytest

from parser import category_from_sku, parse_catalog_pdf


def _find_fixture() -> Path | None:
    roots = [
        Path(__file__).resolve().parents[2],
        Path(__file__).resolve().parents[3],
    ]
    for root in roots:
        candidate = root / "BLOOMS CATALOG 2.10.2026.pdf"
        if candidate.exists():
            return candidate
    return None


@pytest.fixture(scope="session")
def fixture_items():
    fixture = _find_fixture()
    if fixture is None:
        pytest.skip("Fixture catalog PDF not found")
    return parse_catalog_pdf(fixture)


def test_category_from_sku_prefix():
    assert category_from_sku("BLM494") == "Bloom's"
    assert category_from_sku("SHL514") == "Fruit Leather"
    assert category_from_sku("UNKNOWN123") is None


def test_parse_catalog_fixture_counts(fixture_items):
    assert len(fixture_items) == 858
    assert len({x.sku for x in fixture_items}) == 858
    assert sum(1 for x in fixture_items if x.image_bytes is not None) == 858
    assert sum(1 for x in fixture_items if x.upc is None) >= 1


def test_parse_catalog_fixture_name_pack_regressions(fixture_items):
    by_sku = {x.sku: x for x in fixture_items}

    assert by_sku["BLM375"].name == "Candy Corn Bulk 30lb"
    assert by_sku["BLM375"].pack == "1/ 30lb"
    assert by_sku["BLM375"].upc == "032797003759"

    assert by_sku["ONG1020"].name == "Chestnuts 3 oz Bags"
    assert by_sku["ONG1020"].pack == "12/3oz"

    assert by_sku["BLM489"].name == "Whole Grain Animal Crackers"
    assert by_sku["BLM489"].pack == "12/10oz"

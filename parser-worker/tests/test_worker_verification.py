from parser import QuickCandidate
from worker import _build_capture_verification


def _make_candidates(page_counts: list[int]) -> list[QuickCandidate]:
    candidates: list[QuickCandidate] = []
    sku_index = 1
    for page_no, count in enumerate(page_counts, start=1):
        for _ in range(count):
            sku = f"SKU{sku_index:04d}"
            candidates.append(
                QuickCandidate(
                    sku=sku,
                    page_no=page_no,
                    sku_bbox={"x0": 0, "x1": 1, "top": 0, "bottom": 1},
                    image_bbox=None,
                    lines=[],
                    quick_fingerprint=f"fp-{sku}",
                )
            )
            sku_index += 1
    return candidates


def test_capture_verification_passes_for_expected_distribution():
    candidates = _make_candidates([16, 16, 5])
    result = _build_capture_verification(
        catalog_page_count=3,
        candidates=candidates,
        unique_sku_count=37,
    )

    assert result["capture_verification_passed"] is True
    assert result["expected_items_min"] == 33
    assert result["expected_items_max"] == 48
    assert result["non_last_page_count_mismatches"] == []
    assert result["last_page_item_count"] == 5


def test_capture_verification_flags_non_last_page_mismatch():
    candidates = _make_candidates([15, 16, 5])
    result = _build_capture_verification(
        catalog_page_count=3,
        candidates=candidates,
        unique_sku_count=36,
    )

    assert result["capture_verification_passed"] is False
    assert result["non_last_page_count_mismatches"] == [{"page_no": 1, "count": 15}]


def test_capture_verification_flags_out_of_range_or_invalid_last_page():
    candidates = _make_candidates([16, 16, 0])
    result = _build_capture_verification(
        catalog_page_count=3,
        candidates=candidates,
        unique_sku_count=32,
    )

    assert result["capture_verification_passed"] is False
    assert result["last_page_item_count"] == 0
    assert result["actual_unique_skus"] == 32

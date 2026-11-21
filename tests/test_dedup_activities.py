import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

from dedup_activities import _find_cycling_duplicates  # noqa: E402


def _row(run_id, start_date_local, distance, subtype):
    return {
        "run_id": run_id,
        "type": "cycling",
        "subtype": subtype,
        "start_date_local": start_date_local,
        "distance": distance,
    }


def test_cycling_duplicates_keep_road_records_from_screenshot():
    rows = [
        _row(1794142604000, "2026-11-08 20:56:44", 25817.29, "road"),
        _row(1794142814000, "2026-11-08 21:00:14", 25636.65, ""),
        _row(1794315434000, "2026-11-10 20:57:14", 26146.98, ""),
        _row(1794315453000, "2026-11-10 20:57:33", 25948.60, "road"),
        _row(1794704062000, "2026-11-15 08:54:22", 69420.13, ""),
        _row(1794704094000, "2026-11-15 08:54:54", 68873.83, "road"),
    ]

    assert _find_cycling_duplicates(rows) == [
        1794142814000,
        1794315434000,
        1794704062000,
    ]


def test_cycling_dedup_does_not_merge_two_road_records():
    rows = [
        _row(1, "2026-11-20 08:00:00", 20000, "road"),
        _row(2, "2026-11-20 08:00:30", 20010, "road"),
    ]

    assert _find_cycling_duplicates(rows) == []

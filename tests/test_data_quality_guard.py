import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"

import sys

if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

from data_quality_guard import run_guard  # noqa: E402


def _create_minimal_db(db_path: Path, rows: list[tuple]) -> None:
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("""
            CREATE TABLE activities (
                run_id INTEGER PRIMARY KEY,
                distance FLOAT,
                moving_time DATETIME,
                elapsed_time DATETIME,
                average_speed FLOAT,
                elevation_gain FLOAT,
                elevation_loss FLOAT
            )
            """)
        conn.executemany(
            """
            INSERT INTO activities (
                run_id, distance, moving_time, elapsed_time, average_speed,
                elevation_gain, elevation_loss
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()


class DataQualityGuardTest(unittest.TestCase):
    def test_guard_passes_for_valid_dataset(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            db_path = tmp / "data.db"
            json_path = tmp / "activities.json"
            _create_minimal_db(
                db_path,
                [
                    (
                        1,
                        1000.0,
                        "1970-01-01 00:10:00",
                        "1970-01-01 00:12:00",
                        1.6666666667,
                        30.0,
                        28.0,
                    )
                ],
            )
            json_path.write_text(json.dumps([{"run_id": 1}]), encoding="utf-8")

            code = run_guard(
                db_path=db_path,
                json_path=json_path,
                max_db_only=0,
                max_json_only=0,
                max_speed_mismatch_count=0,
                speed_mismatch_tolerance=0.01,
                max_invalid_speed_without_moving=0,
                max_extreme_speed_count=0,
                extreme_speed_threshold=20.0,
                max_elevation_loss_null_ratio=0.0,
            )
            self.assertEqual(code, 0)

    def test_guard_fails_when_speed_exists_but_moving_time_invalid(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            db_path = tmp / "data.db"
            json_path = tmp / "activities.json"
            _create_minimal_db(
                db_path,
                [
                    (
                        1,
                        1000.0,
                        "1970-01-01 00:00:00",
                        "1970-01-01 00:12:00",
                        2.0,
                        10.0,
                        10.0,
                    )
                ],
            )
            json_path.write_text(json.dumps([{"run_id": 1}]), encoding="utf-8")

            code = run_guard(
                db_path=db_path,
                json_path=json_path,
                max_db_only=0,
                max_json_only=0,
                max_speed_mismatch_count=0,
                speed_mismatch_tolerance=0.01,
                max_invalid_speed_without_moving=0,
                max_extreme_speed_count=10,
                extreme_speed_threshold=20.0,
                max_elevation_loss_null_ratio=0.0,
            )
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()

import argparse
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT / "run_page" / "data.db"
DEFAULT_JSON_PATH = ROOT / "src" / "static" / "activities.json"


def _load_json_records(json_path: Path) -> list[dict]:
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"{json_path} is not a list JSON file")
    return data


def _query_one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> int | float:
    cur = conn.execute(sql, params)
    row = cur.fetchone()
    return row[0] if row else 0


def run_guard(
    db_path: Path,
    json_path: Path,
    *,
    max_db_only: int,
    max_json_only: int,
    max_speed_mismatch_count: int,
    speed_mismatch_tolerance: float,
    max_invalid_speed_without_moving: int,
    max_extreme_speed_count: int,
    extreme_speed_threshold: float,
    max_elevation_loss_null_ratio: float,
) -> int:
    if not db_path.exists():
        print(f"[guard] db file not found: {db_path}")
        return 1
    if not json_path.exists():
        print(f"[guard] json file not found: {json_path}")
        return 1

    conn = sqlite3.connect(str(db_path))
    try:
        db_total = int(_query_one(conn, "SELECT count(*) FROM activities"))
        db_distinct_ids = int(
            _query_one(conn, "SELECT count(distinct run_id) FROM activities")
        )
        db_ids = {
            int(row[0])
            for row in conn.execute("SELECT run_id FROM activities").fetchall()
            if row[0] is not None
        }

        negative_distance = int(
            _query_one(conn, "SELECT count(*) FROM activities WHERE distance < 0")
        )
        negative_speed = int(
            _query_one(conn, "SELECT count(*) FROM activities WHERE average_speed < 0")
        )
        negative_gain = int(
            _query_one(conn, "SELECT count(*) FROM activities WHERE elevation_gain < 0")
        )
        negative_loss = int(
            _query_one(conn, "SELECT count(*) FROM activities WHERE elevation_loss < 0")
        )

        elapsed_lt_moving = int(
            _query_one(
                conn,
                """
                WITH t AS (
                  SELECT
                    (strftime('%s', moving_time) - strftime('%s', '1970-01-01 00:00:00')) AS moving_s,
                    (strftime('%s', elapsed_time) - strftime('%s', '1970-01-01 00:00:00')) AS elapsed_s
                  FROM activities
                )
                SELECT count(*) FROM t
                WHERE elapsed_s < moving_s
                """,
            )
        )

        speed_mismatch_count = int(
            _query_one(
                conn,
                """
                WITH t AS (
                  SELECT
                    average_speed,
                    distance,
                    (strftime('%s', moving_time) - strftime('%s', '1970-01-01 00:00:00')) AS moving_s
                  FROM activities
                )
                SELECT count(*) FROM t
                WHERE moving_s > 0
                  AND average_speed IS NOT NULL
                  AND abs(average_speed - distance / moving_s) > ?
                """,
                (speed_mismatch_tolerance,),
            )
        )

        invalid_speed_without_moving = int(
            _query_one(
                conn,
                """
                WITH t AS (
                  SELECT
                    average_speed,
                    (strftime('%s', moving_time) - strftime('%s', '1970-01-01 00:00:00')) AS moving_s
                  FROM activities
                )
                SELECT count(*) FROM t
                WHERE average_speed IS NOT NULL
                  AND average_speed > 0
                  AND (moving_s IS NULL OR moving_s <= 0)
                """,
            )
        )

        extreme_speed_count = int(
            _query_one(
                conn,
                "SELECT count(*) FROM activities WHERE average_speed > ?",
                (extreme_speed_threshold,),
            )
        )

        elevation_loss_null_count = int(
            _query_one(
                conn, "SELECT count(*) FROM activities WHERE elevation_loss IS NULL"
            )
        )
        elevation_loss_null_ratio = (
            (elevation_loss_null_count / db_total) if db_total > 0 else 0.0
        )
    finally:
        conn.close()

    json_records = _load_json_records(json_path)
    json_total = len(json_records)
    json_ids = []
    for record in json_records:
        run_id = record.get("run_id")
        if run_id is not None:
            json_ids.append(int(run_id))
    json_id_set = set(json_ids)
    json_duplicate_count = len(json_ids) - len(json_id_set)

    db_only = len(db_ids - json_id_set)
    json_only = len(json_id_set - db_ids)

    print("[guard] summary")
    print(f"  db_total={db_total}, db_distinct_ids={db_distinct_ids}")
    print(f"  json_total={json_total}, json_distinct_ids={len(json_id_set)}")
    print(
        f"  db_only={db_only}, json_only={json_only}, json_duplicates={json_duplicate_count}"
    )
    print(
        "  negatives="
        f"distance:{negative_distance}, speed:{negative_speed}, "
        f"gain:{negative_gain}, loss:{negative_loss}"
    )
    print(
        "  timing_speed="
        f"elapsed_lt_moving:{elapsed_lt_moving}, "
        f"invalid_speed_without_moving:{invalid_speed_without_moving}, "
        f"speed_mismatch:{speed_mismatch_count}, "
        f"extreme_speed:{extreme_speed_count}"
    )
    print(
        "  elevation="
        f"loss_null_count:{elevation_loss_null_count}, loss_null_ratio:{elevation_loss_null_ratio:.3f}"
    )

    violations = []
    if db_total <= 0:
        violations.append("activities table is empty")
    if json_total <= 0:
        violations.append("activities.json is empty")
    if db_total != db_distinct_ids:
        violations.append("duplicate run_id found in database")
    if json_duplicate_count > 0:
        violations.append(f"duplicate run_id found in json: {json_duplicate_count}")
    if db_only > max_db_only:
        violations.append(f"db_only {db_only} > max_db_only {max_db_only}")
    if json_only > max_json_only:
        violations.append(f"json_only {json_only} > max_json_only {max_json_only}")
    if (
        negative_distance > 0
        or negative_speed > 0
        or negative_gain > 0
        or negative_loss > 0
    ):
        violations.append("negative metric values detected")
    if elapsed_lt_moving > 0:
        violations.append(f"elapsed_time < moving_time count is {elapsed_lt_moving}")
    if speed_mismatch_count > max_speed_mismatch_count:
        violations.append(
            "speed_mismatch_count "
            f"{speed_mismatch_count} > max_speed_mismatch_count {max_speed_mismatch_count}"
        )
    if invalid_speed_without_moving > max_invalid_speed_without_moving:
        violations.append(
            "invalid_speed_without_moving "
            f"{invalid_speed_without_moving} > max_invalid_speed_without_moving {max_invalid_speed_without_moving}"
        )
    if extreme_speed_count > max_extreme_speed_count:
        violations.append(
            "extreme_speed_count "
            f"{extreme_speed_count} > max_extreme_speed_count {max_extreme_speed_count}"
        )
    if elevation_loss_null_ratio > max_elevation_loss_null_ratio:
        violations.append(
            "elevation_loss_null_ratio "
            f"{elevation_loss_null_ratio:.3f} > max_elevation_loss_null_ratio {max_elevation_loss_null_ratio:.3f}"
        )

    if violations:
        print("[guard] FAILED")
        for item in violations:
            print(f"  - {item}")
        return 1

    print("[guard] PASSED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    parser.add_argument("--json-path", default=str(DEFAULT_JSON_PATH))
    parser.add_argument("--max-db-only", type=int, default=5)
    parser.add_argument("--max-json-only", type=int, default=1)
    parser.add_argument("--max-speed-mismatch-count", type=int, default=5)
    parser.add_argument("--speed-mismatch-tolerance", type=float, default=0.01)
    parser.add_argument("--max-invalid-speed-without-moving", type=int, default=0)
    parser.add_argument("--max-extreme-speed-count", type=int, default=2)
    parser.add_argument("--extreme-speed-threshold", type=float, default=20.0)
    parser.add_argument("--max-elevation-loss-null-ratio", type=float, default=0.8)
    args = parser.parse_args()

    return run_guard(
        db_path=Path(args.db_path),
        json_path=Path(args.json_path),
        max_db_only=args.max_db_only,
        max_json_only=args.max_json_only,
        max_speed_mismatch_count=args.max_speed_mismatch_count,
        speed_mismatch_tolerance=args.speed_mismatch_tolerance,
        max_invalid_speed_without_moving=args.max_invalid_speed_without_moving,
        max_extreme_speed_count=args.max_extreme_speed_count,
        extreme_speed_threshold=args.extreme_speed_threshold,
        max_elevation_loss_null_ratio=args.max_elevation_loss_null_ratio,
    )


if __name__ == "__main__":
    sys.exit(main())

import argparse
import json
import time
from datetime import datetime
from typing import Iterable

from config import JSON_FILE, SQL_FILE
from generator import Generator
from generator.db import Activity, update_or_create_activity
from stravalib.exc import RateLimitExceeded


CYCLING_TYPE_KEYWORDS = (
    "ride",
    "cycling",
    "bike",
    "ebike",
    "mountainbike",
)

MISSING_METRIC_FIELDS = (
    "elevation_loss",
    "max_elevation",
    "min_elevation",
    "average_watts",
    "weighted_average_watts",
    "max_watts",
    "average_cadence",
    "max_cadence",
)


def is_cycling_type(activity_type: str) -> bool:
    lower = (activity_type or "").lower()
    return any(keyword in lower for keyword in CYCLING_TYPE_KEYWORDS)


def has_missing_metrics(activity: Activity) -> bool:
    return any(getattr(activity, field) is None for field in MISSING_METRIC_FIELDS)


def parse_since(since: str | None) -> datetime | None:
    if not since:
        return None
    return datetime.strptime(since, "%Y-%m-%d")


def should_backfill_activity(activity: Activity, types: set[str]) -> bool:
    if "all" in types:
        return True
    normalized = (activity.type or "").lower()
    if "cycling" in types:
        return is_cycling_type(normalized)
    return normalized in types


def snapshot_metrics(activity: Activity) -> tuple:
    return tuple(getattr(activity, field) for field in MISSING_METRIC_FIELDS)


def fetch_activity_with_retry(generator: Generator, run_id: int, max_retry: int = 2):
    last_error = None
    for retry in range(max_retry + 1):
        try:
            return generator.client.get_activity(run_id)
        except RateLimitExceeded as err:
            last_error = err
            sleep_seconds = max(int(getattr(err, "timeout", 0)), 1) + 1
            print(
                f"Rate limit hit for activity {run_id}, sleep {sleep_seconds}s then retry ({retry + 1}/{max_retry + 1})"
            )
            time.sleep(sleep_seconds)
        except Exception as err:  # pragma: no cover - keep broad to avoid run abort
            last_error = err
            break
    raise last_error  # type: ignore[misc]


def build_candidates(
    activities: Iterable[Activity],
    allowed_types: set[str],
    since_dt: datetime | None,
    limit: int,
) -> list[Activity]:
    candidates: list[Activity] = []
    for activity in activities:
        if not should_backfill_activity(activity, allowed_types):
            continue
        if since_dt is not None:
            try:
                activity_dt = datetime.strptime(
                    str(activity.start_date_local), "%Y-%m-%d %H:%M:%S"
                )
                if activity_dt < since_dt:
                    continue
            except Exception:
                continue
        if not has_missing_metrics(activity):
            continue
        candidates.append(activity)
        if limit > 0 and len(candidates) >= limit:
            break
    return candidates


def parse_types(raw_types: str) -> set[str]:
    values = {item.strip().lower() for item in raw_types.split(",") if item.strip()}
    return values or {"cycling"}


def run_backfill(
    client_id: str,
    client_secret: str,
    refresh_token: str,
    types: str,
    since: str | None,
    limit: int,
    commit_every: int,
) -> None:
    generator = Generator(SQL_FILE)
    generator.set_strava_config(client_id, client_secret, refresh_token)
    generator.check_access()

    allowed_types = parse_types(types)
    since_dt = parse_since(since)

    query = generator.session.query(Activity).order_by(Activity.start_date_local.desc())
    candidates = build_candidates(query, allowed_types, since_dt, limit)

    print(
        f"Backfill candidates: {len(candidates)} "
        f"(types={','.join(sorted(allowed_types))}, since={since or 'none'}, limit={limit})"
    )
    if not candidates:
        return

    processed = 0
    updated = 0
    unchanged = 0
    failed = 0

    for activity in candidates:
        processed += 1
        before = snapshot_metrics(activity)
        run_id = int(activity.run_id)

        try:
            detail = fetch_activity_with_retry(generator, run_id)
            detail.elevation_gain = getattr(
                detail, "total_elevation_gain", getattr(detail, "elevation_gain", None)
            )
            detail.subtype = getattr(detail, "type", activity.subtype or activity.type)
            update_or_create_activity(generator.session, detail)
            generator.session.flush()

            current = generator.session.query(Activity).filter_by(run_id=run_id).first()
            after = snapshot_metrics(current) if current else before
            if after != before:
                updated += 1
                print(f"[{processed}/{len(candidates)}] updated: {run_id}")
            else:
                unchanged += 1
                print(f"[{processed}/{len(candidates)}] unchanged: {run_id}")
        except Exception as err:  # pragma: no cover - avoid stopping batch
            failed += 1
            print(f"[{processed}/{len(candidates)}] failed: {run_id} ({err})")

        if commit_every > 0 and processed % commit_every == 0:
            generator.session.commit()

    generator.session.commit()

    activities_list = generator.load()
    with open(JSON_FILE, "w") as f:
        json.dump(activities_list, f)

    print(
        "Backfill finished: "
        f"processed={processed}, updated={updated}, unchanged={unchanged}, failed={failed}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("client_id", help="strava client id")
    parser.add_argument("client_secret", help="strava client secret")
    parser.add_argument("refresh_token", help="strava refresh token")
    parser.add_argument(
        "--types",
        default="cycling",
        help="comma-separated activity type groups, e.g. cycling or all",
    )
    parser.add_argument(
        "--since",
        default=None,
        help="only backfill activities on/after this date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=180,
        help="max candidate activities per run, set <=0 for no limit",
    )
    parser.add_argument(
        "--commit-every",
        type=int,
        default=20,
        help="commit frequency to reduce long transaction risk",
    )
    options = parser.parse_args()

    run_backfill(
        options.client_id,
        options.client_secret,
        options.refresh_token,
        options.types,
        options.since,
        options.limit,
        options.commit_every,
    )

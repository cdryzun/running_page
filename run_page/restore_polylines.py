from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

import polyline

from dataset_lock import DatasetWriteLock
from generator import Generator
from gpxtrackposter.exceptions import TrackLoadError
from gpxtrackposter.track_loader import load_fit_file


class RecoveryValidationError(ValueError):
    """Raised when recovery inputs cannot be applied without data loss."""


@dataclass(frozen=True)
class PolylineSource:
    run_id: int
    summary_polyline: str
    point_count: int
    origin: str


@dataclass(frozen=True)
class RecoveryUpdate:
    run_id: int
    current_point_count: int
    source_point_count: int
    summary_polyline: str
    origin: str


@dataclass(frozen=True)
class RecoveryPlan:
    updates: tuple[RecoveryUpdate, ...]
    missing_run_ids: tuple[int, ...]
    not_longer_run_ids: tuple[int, ...]
    diverged_run_ids: tuple[int, ...]


@dataclass(frozen=True)
class RecoveryResult:
    updated_count: int
    backup_dir: Path


def _decode_point_count(summary_polyline: str, *, context: str) -> int:
    try:
        points = polyline.decode(summary_polyline)
    except Exception as error:
        raise RecoveryValidationError(
            f"Invalid polyline in {context}: {error}"
        ) from error

    if len(points) < 2:
        raise RecoveryValidationError(
            f"Polyline in {context} contains fewer than two points"
        )
    return len(points)


def _current_point_count(summary_polyline: str | None) -> int:
    return len(_decode_current_points(summary_polyline))


def _decode_current_points(
    summary_polyline: str | None,
) -> tuple[tuple[float, float], ...]:
    if not summary_polyline:
        return ()
    try:
        return tuple(polyline.decode(summary_polyline))
    except Exception:
        return ()


def _is_ordered_subsequence(
    current_points: tuple[tuple[float, float], ...],
    source_points: tuple[tuple[float, float], ...],
) -> bool:
    source_index = 0
    for current_point in current_points:
        while (
            source_index < len(source_points)
            and source_points[source_index] != current_point
        ):
            source_index += 1
        if source_index == len(source_points):
            return False
        source_index += 1
    return True


def load_database_sources(db_path: Path, *, origin: str) -> dict[int, PolylineSource]:
    if not db_path.is_file():
        raise RecoveryValidationError(f"Source database does not exist: {db_path}")

    sources: dict[int, PolylineSource] = {}
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            rows = connection.execute(
                "SELECT run_id, summary_polyline FROM activities ORDER BY run_id"
            ).fetchall()
    except sqlite3.Error as error:
        raise RecoveryValidationError(
            f"Cannot read source database {db_path}: {error}"
        ) from error

    for run_id, summary_polyline in rows:
        if not summary_polyline:
            continue
        normalized_run_id = int(run_id)
        point_count = _decode_point_count(
            str(summary_polyline), context=f"{origin} run_id={normalized_run_id}"
        )
        sources[normalized_run_id] = PolylineSource(
            run_id=normalized_run_id,
            summary_polyline=str(summary_polyline),
            point_count=point_count,
            origin=origin,
        )
    return sources


def load_fit_sources(fit_paths: Iterable[Path]) -> dict[int, PolylineSource]:
    sources: dict[int, PolylineSource] = {}
    with tempfile.TemporaryDirectory(prefix="polyline-fit-sources-") as temporary_dir:
        temporary_path = Path(temporary_dir)
        for index, fit_path in enumerate(sorted(fit_paths)):
            if not fit_path.is_file():
                raise RecoveryValidationError(f"FIT source does not exist: {fit_path}")

            copied_fit_path = temporary_path / f"{index}-{fit_path.name}"
            shutil.copy2(fit_path, copied_fit_path)
            try:
                track = load_fit_file(str(copied_fit_path))
            except TrackLoadError as error:
                raise RecoveryValidationError(
                    f"Cannot parse FIT source {fit_path}: {error}"
                ) from error

            summary_polyline = str(getattr(track, "polyline_str", "") or "")
            if not summary_polyline:
                continue
            run_id = int(track.run_id)
            origin = f"raw-fit:{fit_path.name}"
            source = PolylineSource(
                run_id=run_id,
                summary_polyline=summary_polyline,
                point_count=_decode_point_count(summary_polyline, context=origin),
                origin=origin,
            )
            existing = sources.get(run_id)
            if existing is not None and existing.summary_polyline != summary_polyline:
                raise RecoveryValidationError(
                    f"Conflicting FIT sources for run_id={run_id}: "
                    f"{existing.origin}, {origin}"
                )
            sources[run_id] = source
    return sources


def merge_sources(
    *source_groups: Mapping[int, PolylineSource],
) -> dict[int, PolylineSource]:
    merged: dict[int, PolylineSource] = {}
    for source_group in source_groups:
        for run_id in sorted(source_group):
            candidate = source_group[run_id]
            current = merged.get(run_id)
            if current is None or candidate.point_count > current.point_count:
                merged[run_id] = candidate
            elif (
                candidate.point_count == current.point_count
                and candidate.summary_polyline != current.summary_polyline
            ):
                raise RecoveryValidationError(
                    f"Conflicting equal-length sources for run_id={run_id}: "
                    f"{current.origin}, {candidate.origin}"
                )
    return merged


def build_recovery_plan(
    db_path: Path, sources: Mapping[int, PolylineSource]
) -> RecoveryPlan:
    if not db_path.is_file():
        raise RecoveryValidationError(f"Target database does not exist: {db_path}")

    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
            target_routes = {
                int(run_id): summary_polyline
                for run_id, summary_polyline in connection.execute(
                    "SELECT run_id, summary_polyline FROM activities"
                ).fetchall()
            }
    except sqlite3.Error as error:
        raise RecoveryValidationError(
            f"Cannot read target database {db_path}: {error}"
        ) from error

    updates: list[RecoveryUpdate] = []
    missing_run_ids: list[int] = []
    not_longer_run_ids: list[int] = []
    diverged_run_ids: list[int] = []

    for run_id in sorted(sources):
        source = sources[run_id]
        if run_id not in target_routes:
            missing_run_ids.append(run_id)
            continue

        current_polyline = target_routes[run_id]
        current_point_count = _current_point_count(current_polyline)
        if source.point_count <= current_point_count:
            not_longer_run_ids.append(run_id)
            continue

        current_points = _decode_current_points(current_polyline)
        source_points = tuple(polyline.decode(source.summary_polyline))
        if current_points and not _is_ordered_subsequence(
            current_points, source_points
        ):
            diverged_run_ids.append(run_id)
            continue

        updates.append(
            RecoveryUpdate(
                run_id=run_id,
                current_point_count=current_point_count,
                source_point_count=source.point_count,
                summary_polyline=source.summary_polyline,
                origin=source.origin,
            )
        )

    return RecoveryPlan(
        updates=tuple(updates),
        missing_run_ids=tuple(missing_run_ids),
        not_longer_run_ids=tuple(not_longer_run_ids),
        diverged_run_ids=tuple(diverged_run_ids),
    )


def _copy_database(source_path: Path, destination_path: Path) -> None:
    with (
        sqlite3.connect(f"file:{source_path}?mode=ro", uri=True) as source_connection,
        sqlite3.connect(destination_path) as destination_connection,
    ):
        source_connection.backup(destination_connection)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_handle:
        for chunk in iter(lambda: file_handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _database_fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
            for statement in connection.iterdump():
                digest.update(statement.encode("utf-8"))
                digest.update(b"\n")
    except sqlite3.Error as error:
        raise RecoveryValidationError(
            f"Cannot fingerprint database {path}: {error}"
        ) from error
    return digest.hexdigest()


def _write_json(path: Path, payload: object) -> None:
    temporary_path = path.with_name(f".{path.name}.tmp")
    try:
        temporary_path.write_text(
            json.dumps(payload, ensure_ascii=True, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(temporary_path, path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


def _load_recovery_manifest(backup_dir: Path) -> dict[str, object]:
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.is_file():
        raise RecoveryValidationError(
            f"Recovery manifest does not exist: {manifest_path}"
        )
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RecoveryValidationError(
            f"Cannot read recovery manifest {manifest_path}: {error}"
        ) from error
    if not isinstance(payload, dict):
        raise RecoveryValidationError("Recovery manifest must contain an object")

    required_string_fields = (
        "status",
        "database_fingerprint_before",
        "database_fingerprint_after",
        "json_sha256_before",
        "json_sha256_after",
        "database_target",
        "json_target",
    )
    for field in required_string_fields:
        if not isinstance(payload.get(field), str):
            raise RecoveryValidationError(
                f"Recovery manifest field must be a string: {field}"
            )
    return payload


def _update_manifest_status(
    backup_dir: Path, manifest: dict[str, object], status: str
) -> None:
    manifest["status"] = status
    _write_json(backup_dir / "manifest.json", manifest)


def _validate_manifest_targets(
    manifest: Mapping[str, object], *, db_path: Path, json_path: Path
) -> None:
    if str(manifest["database_target"]) != str(db_path.resolve()) or str(
        manifest["json_target"]
    ) != str(json_path.resolve()):
        raise RecoveryValidationError(
            "Recovery targets do not match the paths recorded in the manifest"
        )


def _validate_backup_bundle(backup_dir: Path, manifest: Mapping[str, object]) -> None:
    backup_db_path = backup_dir / "data.db"
    backup_json_path = backup_dir / "activities.json"
    if not backup_db_path.is_file() or not backup_json_path.is_file():
        raise RecoveryValidationError("Recovery backup bundle is incomplete")
    if _database_fingerprint(backup_db_path) != str(
        manifest["database_fingerprint_before"]
    ) or _sha256(backup_json_path) != str(manifest["json_sha256_before"]):
        raise RecoveryValidationError("Recovery backup does not match its manifest")


def _create_backup_bundle(
    *,
    db_path: Path,
    json_path: Path,
    backup_dir: Path,
    database_fingerprint_before: str,
    json_sha256_before: str,
) -> dict[str, object]:
    backup_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = Path(
        tempfile.mkdtemp(prefix=f".{backup_dir.name}.preparing-", dir=backup_dir.parent)
    )
    try:
        backup_db_path = staging_dir / "data.db"
        backup_json_path = staging_dir / "activities.json"
        _copy_database(db_path, backup_db_path)
        shutil.copy2(json_path, backup_json_path)

        if (
            _database_fingerprint(backup_db_path) != database_fingerprint_before
            or _sha256(backup_json_path) != json_sha256_before
        ):
            raise RecoveryValidationError(
                "Target files changed while the backup was created"
            )

        manifest: dict[str, object] = {
            "status": "preparing",
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "database_fingerprint_before": database_fingerprint_before,
            "database_fingerprint_after": database_fingerprint_before,
            "backup_database_sha256": _sha256(backup_db_path),
            "json_sha256_before": json_sha256_before,
            "json_sha256_after": json_sha256_before,
            "database_target": str(db_path.resolve()),
            "json_target": str(json_path.resolve()),
            "updated_count": 0,
            "updates": [],
        }
        _write_json(staging_dir / "manifest.json", manifest)
        try:
            os.replace(staging_dir, backup_dir)
        except OSError as error:
            raise RecoveryValidationError(
                f"Cannot publish recovery backup bundle {backup_dir}: {error}"
            ) from error
        return manifest
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def _restore_database(backup_path: Path, target_path: Path) -> None:
    with tempfile.TemporaryDirectory(
        prefix=".polyline-rollback-", dir=target_path.parent
    ) as temporary_dir:
        staged_path = Path(temporary_dir) / target_path.name
        _copy_database(backup_path, staged_path)
        os.replace(staged_path, target_path)


def _restore_file(backup_path: Path, target_path: Path) -> None:
    with tempfile.TemporaryDirectory(
        prefix=".polyline-rollback-", dir=target_path.parent
    ) as temporary_dir:
        staged_path = Path(temporary_dir) / target_path.name
        shutil.copy2(backup_path, staged_path)
        os.replace(staged_path, target_path)


def recover_interrupted_recovery(
    *, db_path: Path, json_path: Path, backup_dir: Path
) -> str:
    dataset_lock = DatasetWriteLock(db_path)
    if not dataset_lock.supports_cross_process_locking:
        raise RecoveryValidationError(
            "Recovery requires POSIX cross-process file locking"
        )
    with dataset_lock:
        return _recover_interrupted_recovery_locked(
            db_path=db_path,
            json_path=json_path,
            backup_dir=backup_dir,
        )


def _recover_interrupted_recovery_locked(
    *, db_path: Path, json_path: Path, backup_dir: Path
) -> str:
    manifest = _load_recovery_manifest(backup_dir)
    _validate_manifest_targets(manifest, db_path=db_path, json_path=json_path)
    status = str(manifest["status"])
    if status in {"complete", "rolled_back", "aborted"}:
        return status

    database_before = str(manifest["database_fingerprint_before"])
    database_after = str(manifest["database_fingerprint_after"])
    json_before = str(manifest["json_sha256_before"])
    json_after = str(manifest["json_sha256_after"])
    current_database = _database_fingerprint(db_path)
    current_json = _sha256(json_path)

    if status == "preparing":
        if database_after != database_before or json_after != json_before:
            raise RecoveryValidationError(
                "Preparing recovery manifest contains invalid after-state values"
            )
        _validate_backup_bundle(backup_dir, manifest)
        if current_database != database_before or current_json != json_before:
            raise RecoveryValidationError(
                "Cannot safely recover preparation because target files changed"
            )
        _update_manifest_status(backup_dir, manifest, "rolled_back")
        return "rolled_back"

    if current_database == database_after and current_json == json_after:
        _update_manifest_status(backup_dir, manifest, "complete")
        return "complete"
    if current_database == database_before and current_json == json_before:
        _update_manifest_status(backup_dir, manifest, "rolled_back")
        return "rolled_back"

    known_database_state = current_database in {database_before, database_after}
    known_json_state = current_json in {json_before, json_after}
    if not known_database_state or not known_json_state:
        raise RecoveryValidationError(
            "Cannot safely recover because target files no longer match the "
            "journaled before/after states"
        )

    _validate_backup_bundle(backup_dir, manifest)
    backup_db_path = backup_dir / "data.db"
    backup_json_path = backup_dir / "activities.json"

    _restore_file(backup_json_path, json_path)
    _restore_database(backup_db_path, db_path)
    if (
        _database_fingerprint(db_path) != database_before
        or _sha256(json_path) != json_before
    ):
        raise RecoveryValidationError("Recovery rollback verification failed")

    _update_manifest_status(backup_dir, manifest, "rolled_back")
    return "rolled_back"


def _validate_generated_json(db_path: Path, activities: list[dict]) -> None:
    json_run_ids = [int(activity["run_id"]) for activity in activities]
    if len(json_run_ids) != len(set(json_run_ids)):
        raise RecoveryValidationError(
            "Generated activities JSON contains duplicate run_id"
        )

    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as connection:
        expected_run_ids = {
            int(row[0])
            for row in connection.execute(
                "SELECT run_id FROM activities WHERE distance > 0.1"
            ).fetchall()
        }
    if set(json_run_ids) != expected_run_ids:
        missing = sorted(expected_run_ids - set(json_run_ids))
        unexpected = sorted(set(json_run_ids) - expected_run_ids)
        raise RecoveryValidationError(
            "Generated activities JSON does not match database IDs: "
            f"missing={missing}, unexpected={unexpected}"
        )


def apply_recovery(
    *,
    db_path: Path,
    json_path: Path,
    sources: Mapping[int, PolylineSource],
    backup_dir: Path,
) -> RecoveryResult:
    dataset_lock = DatasetWriteLock(db_path)
    if not dataset_lock.supports_cross_process_locking:
        raise RecoveryValidationError(
            "Recovery requires POSIX cross-process file locking"
        )
    with dataset_lock:
        return _apply_recovery_locked(
            db_path=db_path,
            json_path=json_path,
            sources=sources,
            backup_dir=backup_dir,
        )


def _apply_recovery_locked(
    *,
    db_path: Path,
    json_path: Path,
    sources: Mapping[int, PolylineSource],
    backup_dir: Path,
) -> RecoveryResult:
    backup_manifest: dict[str, object] | None = None
    if backup_dir.exists():
        manifest_path = backup_dir / "manifest.json"
        if manifest_path.is_file():
            manifest = _load_recovery_manifest(backup_dir)
            _validate_manifest_targets(manifest, db_path=db_path, json_path=json_path)
            status = str(manifest["status"])
            if status == "preparing":
                _validate_backup_bundle(backup_dir, manifest)
                if str(manifest["database_fingerprint_after"]) != str(
                    manifest["database_fingerprint_before"]
                ) or str(manifest["json_sha256_after"]) != str(
                    manifest["json_sha256_before"]
                ):
                    raise RecoveryValidationError(
                        "Preparing recovery manifest contains invalid after-state values"
                    )
                if _database_fingerprint(db_path) != str(
                    manifest["database_fingerprint_before"]
                ) or _sha256(json_path) != str(manifest["json_sha256_before"]):
                    raise RecoveryValidationError(
                        "Cannot resume preparation because target files changed"
                    )
                backup_manifest = manifest
            elif status not in {
                "complete",
                "rolled_back",
                "aborted",
            }:
                resolved_status = _recover_interrupted_recovery_locked(
                    db_path=db_path,
                    json_path=json_path,
                    backup_dir=backup_dir,
                )
                if resolved_status == "complete":
                    updated_count = manifest.get("updated_count")
                    if not isinstance(updated_count, int) or isinstance(
                        updated_count, bool
                    ):
                        raise RecoveryValidationError(
                            "Recovery manifest has an invalid updated_count"
                        )
                    return RecoveryResult(
                        updated_count=updated_count, backup_dir=backup_dir
                    )
                raise RecoveryValidationError(
                    "Interrupted recovery was rolled back; use a new backup "
                    "directory before applying again"
                )
        if backup_manifest is None:
            raise RecoveryValidationError(
                f"Backup directory already exists: {backup_dir}"
            )

    plan = build_recovery_plan(db_path, sources)
    if plan.diverged_run_ids:
        raise RecoveryValidationError(
            "Recovery sources diverge from current route geometry for run IDs: "
            f"{list(plan.diverged_run_ids)}"
        )
    if not plan.updates:
        raise RecoveryValidationError("Recovery plan contains no route updates")
    if not json_path.is_file():
        raise RecoveryValidationError(f"Activities JSON does not exist: {json_path}")
    if backup_manifest is None:
        database_fingerprint_before = _database_fingerprint(db_path)
        json_sha256_before = _sha256(json_path)
        backup_manifest = _create_backup_bundle(
            db_path=db_path,
            json_path=json_path,
            backup_dir=backup_dir,
            database_fingerprint_before=database_fingerprint_before,
            json_sha256_before=json_sha256_before,
        )
    else:
        database_fingerprint_before = str(
            backup_manifest["database_fingerprint_before"]
        )
        json_sha256_before = str(backup_manifest["json_sha256_before"])

    backup_db_path = backup_dir / "data.db"

    with tempfile.TemporaryDirectory(
        prefix=".polyline-recovery-", dir=db_path.parent
    ) as temporary_dir:
        work_dir = Path(temporary_dir)
        work_db_path = work_dir / db_path.name
        work_json_path = work_dir / json_path.name
        _copy_database(db_path, work_db_path)

        with sqlite3.connect(work_db_path) as connection:
            connection.executemany(
                "UPDATE activities SET summary_polyline = ? WHERE run_id = ?",
                [(update.summary_polyline, update.run_id) for update in plan.updates],
            )
            connection.commit()
        expected_database_fingerprint = _database_fingerprint(work_db_path)

        generator = Generator(work_db_path)
        try:
            activities = generator.load(persist_indoor_updates=False)
        finally:
            generator.session.close()
        if _database_fingerprint(work_db_path) != expected_database_fingerprint:
            raise RecoveryValidationError(
                "Working database changed outside recovery plan"
            )
        _validate_generated_json(work_db_path, activities)
        _write_json(work_json_path, activities)

        manifest = {
            "status": "prepared",
            "created_at": backup_manifest["created_at"],
            "database_fingerprint_before": database_fingerprint_before,
            "database_fingerprint_after": expected_database_fingerprint,
            "backup_database_sha256": _sha256(backup_db_path),
            "json_sha256_before": json_sha256_before,
            "json_sha256_after": _sha256(work_json_path),
            "database_target": str(db_path.resolve()),
            "json_target": str(json_path.resolve()),
            "updated_count": len(plan.updates),
            "updates": [
                {
                    "run_id": update.run_id,
                    "current_point_count": update.current_point_count,
                    "source_point_count": update.source_point_count,
                    "origin": update.origin,
                }
                for update in plan.updates
            ],
        }
        _write_json(backup_dir / "manifest.json", manifest)

        if (
            _database_fingerprint(db_path) != database_fingerprint_before
            or _sha256(json_path) != json_sha256_before
        ):
            _update_manifest_status(backup_dir, manifest, "aborted")
            raise RecoveryValidationError("Target files changed during recovery")

        try:
            os.replace(work_json_path, json_path)
            _update_manifest_status(backup_dir, manifest, "json_replaced")
            os.replace(work_db_path, db_path)
            _update_manifest_status(backup_dir, manifest, "complete")
        except Exception as error:
            try:
                recovery_status = recover_interrupted_recovery(
                    db_path=db_path,
                    json_path=json_path,
                    backup_dir=backup_dir,
                )
            except RecoveryValidationError as recovery_error:
                raise RecoveryValidationError(
                    "Recovery commit failed and automatic rollback could not "
                    f"complete: {recovery_error}"
                ) from error
            if recovery_status == "complete":
                return RecoveryResult(
                    updated_count=len(plan.updates), backup_dir=backup_dir
                )
            raise

    return RecoveryResult(updated_count=len(plan.updates), backup_dir=backup_dir)


def _plan_payload(plan: RecoveryPlan) -> dict[str, object]:
    return {
        "update_count": len(plan.updates),
        "missing_run_ids": list(plan.missing_run_ids),
        "not_longer_count": len(plan.not_longer_run_ids),
        "not_longer_run_ids": list(plan.not_longer_run_ids),
        "diverged_run_ids": list(plan.diverged_run_ids),
        "updates": [
            {
                "run_id": update.run_id,
                "current_point_count": update.current_point_count,
                "source_point_count": update.source_point_count,
                "origin": update.origin,
            }
            for update in plan.updates
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Restore eroded activity polylines from a trusted database snapshot."
    )
    parser.add_argument("--db-path", type=Path, required=True)
    parser.add_argument("--json-path", type=Path, required=True)
    parser.add_argument("--source-db", type=Path)
    parser.add_argument("--source-origin", default="trusted-snapshot")
    parser.add_argument("--fit-dir", type=Path)
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--recover", action="store_true")
    args = parser.parse_args()

    try:
        if args.recover:
            if args.backup_dir is None:
                raise RecoveryValidationError("--backup-dir is required with --recover")
            if args.apply or args.source_db is not None or args.fit_dir is not None:
                raise RecoveryValidationError(
                    "--recover cannot be combined with source or apply options"
                )
            status = recover_interrupted_recovery(
                db_path=args.db_path,
                json_path=args.json_path,
                backup_dir=args.backup_dir,
            )
            print(f"Recovery journal resolved: status={status}")
            return 0
        if args.source_db is None and args.fit_dir is None:
            raise RecoveryValidationError(
                "At least one of --source-db or --fit-dir is required"
            )
        source_groups: list[Mapping[int, PolylineSource]] = []
        if args.source_db is not None:
            source_groups.append(
                load_database_sources(args.source_db, origin=args.source_origin)
            )
        if args.fit_dir is not None:
            if not args.fit_dir.is_dir():
                raise RecoveryValidationError(
                    f"FIT source directory does not exist: {args.fit_dir}"
                )
            source_groups.append(load_fit_sources(args.fit_dir.glob("*.fit")))
        sources = merge_sources(*source_groups)
        plan = build_recovery_plan(args.db_path, sources)
        print(json.dumps(_plan_payload(plan), indent=2, sort_keys=True))
        if not args.apply:
            print("Dry run complete. Pass --apply with --backup-dir to write changes.")
            return 0
        if args.backup_dir is None:
            raise RecoveryValidationError("--backup-dir is required with --apply")
        result = apply_recovery(
            db_path=args.db_path,
            json_path=args.json_path,
            sources=sources,
            backup_dir=args.backup_dir,
        )
        print(
            f"Recovery applied: updated={result.updated_count}, "
            f"backup={result.backup_dir}"
        )
        return 0
    except RecoveryValidationError as error:
        print(f"Recovery validation failed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

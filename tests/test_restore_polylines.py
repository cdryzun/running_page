import datetime
import hashlib
import json
import os
import select
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import polyline

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

from generator import Generator  # noqa: E402
from generator.db import Activity, init_db  # noqa: E402
import restore_polylines  # noqa: E402
from restore_polylines import (  # noqa: E402
    PolylineSource,
    RecoveryValidationError,
    apply_recovery,
    build_recovery_plan,
    load_database_sources,
    load_fit_sources,
    merge_sources,
)


def _encoded_points(count: int, *, offset: float = 0.0) -> str:
    return polyline.encode(
        [
            (24.4500 + offset + index * 0.001, 111.4700 - index * 0.001)
            for index in range(count)
        ]
    )


def _create_database(db_path: Path, routes: dict[int, str]) -> None:
    session = init_db(db_path)
    try:
        for run_id, summary_polyline in routes.items():
            session.add(
                Activity(
                    run_id=run_id,
                    name=f"Ride {run_id}",
                    distance=1000.0,
                    moving_time=datetime.timedelta(minutes=5),
                    elapsed_time=datetime.timedelta(minutes=5),
                    type="Ride",
                    subtype="Ride",
                    start_date=f"2025-10-0{run_id} 01:00:00",
                    start_date_local=f"2025-10-0{run_id} 09:00:00",
                    location_country="Hezhou, Guangxi, China",
                    summary_polyline=summary_polyline,
                    average_speed=3.333,
                    elevation_gain=10.0,
                    elevation_loss=10.0,
                )
            )
        session.commit()
    finally:
        session.close()


def _read_polyline(db_path: Path, run_id: int) -> str:
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT summary_polyline FROM activities WHERE run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        raise AssertionError(f"run_id {run_id} not found")
    return row[0]


def _read_activity_name(db_path: Path, run_id: int) -> str:
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            "SELECT name FROM activities WHERE run_id = ?", (run_id,)
        ).fetchone()
    if row is None:
        raise AssertionError(f"run_id {run_id} not found")
    return row[0]


def _database_dump(db_path: Path) -> tuple[str, ...]:
    with sqlite3.connect(db_path) as connection:
        return tuple(connection.iterdump())


class RecoveryPlanTest(unittest.TestCase):
    def test_rejects_missing_source_and_target_paths(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            missing_path = tmp / "missing"

            with self.assertRaisesRegex(
                RecoveryValidationError, "Source database does not exist"
            ):
                load_database_sources(missing_path, origin="missing-snapshot")
            with self.assertRaisesRegex(
                RecoveryValidationError, "FIT source does not exist"
            ):
                load_fit_sources([missing_path])
            with self.assertRaisesRegex(
                RecoveryValidationError, "Target database does not exist"
            ):
                build_recovery_plan(missing_path, {})

    def test_plan_recovers_empty_and_malformed_current_routes(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: _encoded_points(2, offset=1.0),
                },
            )
            _create_database(
                source_db,
                {
                    1: _encoded_points(6),
                    2: _encoded_points(6, offset=1.0),
                },
            )
            with sqlite3.connect(target_db) as connection:
                connection.execute(
                    "UPDATE activities SET summary_polyline = NULL WHERE run_id = 1"
                )
                connection.execute(
                    "UPDATE activities SET summary_polyline = '?' WHERE run_id = 2"
                )
                connection.commit()

            plan = build_recovery_plan(
                target_db,
                load_database_sources(source_db, origin="healthy-snapshot"),
            )

            self.assertEqual([update.run_id for update in plan.updates], [1, 2])
            self.assertEqual(plan.diverged_run_ids, ())

    def test_rejects_single_point_source_polyline(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            source_db = Path(tmp_dir) / "source.db"
            _create_database(source_db, {1: polyline.encode([(24.45, 111.47)])})

            with self.assertRaisesRegex(
                RecoveryValidationError, "fewer than two points"
            ):
                load_database_sources(source_db, origin="invalid-snapshot")

    def test_plan_restores_only_longer_routes_present_in_target(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: _encoded_points(5, offset=1.0),
                },
            )
            _create_database(
                source_db,
                {
                    1: _encoded_points(6),
                    2: _encoded_points(3, offset=1.0),
                    3: _encoded_points(4, offset=2.0),
                },
            )

            sources = load_database_sources(source_db, origin="healthy-snapshot")
            plan = build_recovery_plan(target_db, sources)

            self.assertEqual([item.run_id for item in plan.updates], [1])
            self.assertEqual(plan.updates[0].current_point_count, 2)
            self.assertEqual(plan.updates[0].source_point_count, 6)
            self.assertEqual(plan.missing_run_ids, (3,))
            self.assertEqual(plan.not_longer_run_ids, (2,))
            self.assertEqual(plan.diverged_run_ids, ())

    def test_plan_rejects_longer_route_with_different_geometry(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            _create_database(target_db, {1: _encoded_points(2, offset=5.0)})
            _create_database(source_db, {1: _encoded_points(6)})

            plan = build_recovery_plan(
                target_db,
                load_database_sources(source_db, origin="unrelated-snapshot"),
            )

            self.assertEqual(plan.updates, ())
            self.assertEqual(plan.diverged_run_ids, (1,))

    def test_invalid_source_polyline_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            source_db = Path(tmp_dir) / "source.db"
            _create_database(source_db, {1: "?"})

            with self.assertRaises(RecoveryValidationError):
                load_database_sources(source_db, origin="invalid-snapshot")

    def test_merge_prefers_source_with_more_route_points(self):
        snapshot_source = PolylineSource(
            run_id=1,
            summary_polyline=_encoded_points(3),
            point_count=3,
            origin="healthy-snapshot",
        )
        raw_fit_source = PolylineSource(
            run_id=1,
            summary_polyline=_encoded_points(6),
            point_count=6,
            origin="raw-fit:activity.fit",
        )

        merged = merge_sources({1: snapshot_source}, {1: raw_fit_source})

        self.assertEqual(merged[1], raw_fit_source)

    def test_merge_rejects_conflicting_equal_length_sources(self):
        first = PolylineSource(
            run_id=1,
            summary_polyline=_encoded_points(3),
            point_count=3,
            origin="first-snapshot",
        )
        second = PolylineSource(
            run_id=1,
            summary_polyline=_encoded_points(3, offset=1.0),
            point_count=3,
            origin="second-snapshot",
        )

        with self.assertRaisesRegex(
            RecoveryValidationError, "Conflicting equal-length sources"
        ):
            merge_sources({1: first}, {1: second})

    def test_manifest_validation_rejects_invalid_files(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            backup_dir = Path(tmp_dir) / "backup"

            with self.assertRaisesRegex(
                RecoveryValidationError, "manifest does not exist"
            ):
                restore_polylines._load_recovery_manifest(backup_dir)

            backup_dir.mkdir()
            manifest_path = backup_dir / "manifest.json"
            invalid_manifests = (
                ("{", "Cannot read recovery manifest"),
                ("[]", "must contain an object"),
                ('{"status":"prepared"}', "field must be a string"),
            )
            for contents, error_pattern in invalid_manifests:
                with self.subTest(contents=contents):
                    manifest_path.write_text(contents, encoding="utf-8")
                    with self.assertRaisesRegex(RecoveryValidationError, error_pattern):
                        restore_polylines._load_recovery_manifest(backup_dir)

    def test_manifest_guards_reject_mismatched_targets_and_incomplete_backup(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            db_path = tmp / "target.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            manifest = {
                "database_target": str(tmp / "other.db"),
                "json_target": str(json_path.resolve()),
                "database_fingerprint_before": "database-fingerprint",
                "json_sha256_before": "json-fingerprint",
            }

            with self.assertRaisesRegex(
                RecoveryValidationError, "targets do not match"
            ):
                restore_polylines._validate_manifest_targets(
                    manifest,
                    db_path=db_path,
                    json_path=json_path,
                )
            with self.assertRaisesRegex(
                RecoveryValidationError, "backup bundle is incomplete"
            ):
                restore_polylines._validate_backup_bundle(backup_dir, manifest)

    def test_generated_json_rejects_duplicate_run_ids(self):
        activities = [{"run_id": 1}, {"run_id": 1}]

        with self.assertRaisesRegex(RecoveryValidationError, "duplicate run_id"):
            restore_polylines._validate_generated_json(
                Path("unused-database.db"), activities
            )

    def test_generated_json_rejects_database_id_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            db_path = Path(tmp_dir) / "target.db"
            _create_database(db_path, {1: _encoded_points(2)})

            with self.assertRaisesRegex(
                RecoveryValidationError, r"missing=\[1\], unexpected=\[2\]"
            ):
                restore_polylines._validate_generated_json(db_path, [{"run_id": 2}])


class FitSourceTest(unittest.TestCase):
    def test_real_fit_source_is_loaded_without_modifying_original_file(self):
        fit_path = ROOT / "FIT_OUT" / "53120713.fit"
        original_hash = hashlib.sha256(fit_path.read_bytes()).hexdigest()

        sources = load_fit_sources([fit_path])

        source = sources[1784640763000]
        self.assertEqual(source.point_count, 5326)
        self.assertEqual(source.origin, "raw-fit:53120713.fit")
        self.assertEqual(
            hashlib.sha256(fit_path.read_bytes()).hexdigest(), original_hash
        )


class ApplyRecoveryTest(unittest.TestCase):
    def test_apply_uses_working_copy_creates_backup_and_regenerates_json(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            eroded_polyline = _encoded_points(2)
            healthy_polyline = _encoded_points(6)
            _create_database(target_db, {1: eroded_polyline})
            _create_database(source_db, {1: healthy_polyline})
            original_json = [{"run_id": 1, "summary_polyline": eroded_polyline}]
            json_path.write_text(json.dumps(original_json), encoding="utf-8")

            sources = load_database_sources(source_db, origin="healthy-snapshot")
            result = apply_recovery(
                db_path=target_db,
                json_path=json_path,
                sources=sources,
                backup_dir=backup_dir,
            )

            self.assertEqual(result.updated_count, 1)
            self.assertEqual(_read_polyline(target_db, 1), healthy_polyline)
            restored_json = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(restored_json[0]["summary_polyline"], healthy_polyline)
            self.assertEqual(_read_polyline(backup_dir / "data.db", 1), eroded_polyline)
            self.assertEqual(
                json.loads(
                    (backup_dir / "activities.json").read_text(encoding="utf-8")
                ),
                original_json,
            )
            self.assertTrue((backup_dir / "manifest.json").is_file())

    def test_apply_rolls_back_both_targets_when_database_replace_fails(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            eroded_polyline = _encoded_points(2)
            _create_database(target_db, {1: eroded_polyline})
            _create_database(source_db, {1: _encoded_points(6)})
            json_path.write_text(
                json.dumps([{"run_id": 1, "summary_polyline": eroded_polyline}]),
                encoding="utf-8",
            )
            original_db_dump = _database_dump(target_db)
            original_json_hash = hashlib.sha256(json_path.read_bytes()).hexdigest()
            real_replace = os.replace

            def fail_target_database_replace(source, destination):
                source_path = Path(source)
                destination_path = Path(destination)
                if (
                    destination_path == target_db
                    and source_path.parent.name.startswith(".polyline-recovery-")
                ):
                    raise OSError("Injected database replace failure")
                return real_replace(source, destination)

            with mock.patch(
                "restore_polylines.os.replace",
                side_effect=fail_target_database_replace,
            ):
                with self.assertRaisesRegex(
                    OSError, "Injected database replace failure"
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=backup_dir,
                    )

            self.assertEqual(_database_dump(target_db), original_db_dump)
            self.assertEqual(
                hashlib.sha256(json_path.read_bytes()).hexdigest(), original_json_hash
            )
            self.assertEqual(_read_polyline(backup_dir / "data.db", 1), eroded_polyline)
            self.assertFalse(list(tmp.glob(".polyline-recovery-*")))

    def test_interrupted_commit_can_be_rolled_back_from_journal(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            eroded_polyline = _encoded_points(2)
            healthy_polyline = _encoded_points(6)
            _create_database(target_db, {1: eroded_polyline})
            _create_database(source_db, {1: healthy_polyline})
            json_path.write_text(
                json.dumps([{"run_id": 1, "summary_polyline": eroded_polyline}]),
                encoding="utf-8",
            )
            original_db_dump = _database_dump(target_db)
            original_json = json_path.read_bytes()
            real_replace = os.replace

            def interrupt_target_database_replace(source, destination):
                source_path = Path(source)
                destination_path = Path(destination)
                if (
                    destination_path == target_db
                    and source_path.parent.name.startswith(".polyline-recovery-")
                ):
                    raise KeyboardInterrupt("Injected process interruption")
                return real_replace(source, destination)

            with mock.patch(
                "restore_polylines.os.replace",
                side_effect=interrupt_target_database_replace,
            ):
                with self.assertRaisesRegex(
                    KeyboardInterrupt, "Injected process interruption"
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=backup_dir,
                    )

            self.assertEqual(_read_polyline(target_db, 1), eroded_polyline)
            interrupted_json = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(interrupted_json[0]["summary_polyline"], healthy_polyline)

            with self.assertRaisesRegex(
                RecoveryValidationError, "Interrupted recovery was rolled back"
            ):
                apply_recovery(
                    db_path=target_db,
                    json_path=json_path,
                    sources=load_database_sources(source_db, origin="healthy-snapshot"),
                    backup_dir=backup_dir,
                )

            self.assertEqual(_database_dump(target_db), original_db_dump)
            self.assertEqual(json_path.read_bytes(), original_json)

    def test_interrupted_preparation_resumes_from_atomic_backup_bundle(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            eroded_polyline = _encoded_points(2)
            healthy_polyline = _encoded_points(6)
            _create_database(target_db, {1: eroded_polyline})
            _create_database(source_db, {1: healthy_polyline})
            json_path.write_text(
                json.dumps([{"run_id": 1, "summary_polyline": eroded_polyline}]),
                encoding="utf-8",
            )
            real_copy_database = restore_polylines._copy_database
            copy_count = 0

            def interrupt_second_database_copy(source, destination):
                nonlocal copy_count
                copy_count += 1
                if copy_count == 2:
                    raise KeyboardInterrupt("Injected preparation interruption")
                return real_copy_database(source, destination)

            with mock.patch(
                "restore_polylines._copy_database",
                side_effect=interrupt_second_database_copy,
            ):
                with self.assertRaisesRegex(
                    KeyboardInterrupt, "Injected preparation interruption"
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=backup_dir,
                    )

            manifest = json.loads(
                (backup_dir / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "preparing")
            self.assertEqual(_read_polyline(target_db, 1), eroded_polyline)

            result = apply_recovery(
                db_path=target_db,
                json_path=json_path,
                sources=load_database_sources(source_db, origin="healthy-snapshot"),
                backup_dir=backup_dir,
            )

            self.assertEqual(result.updated_count, 1)
            self.assertEqual(_read_polyline(target_db, 1), healthy_polyline)
            completed_manifest = json.loads(
                (backup_dir / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(completed_manifest["status"], "complete")

    def test_apply_rejects_database_changes_outside_the_recovery_plan(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: _encoded_points(4, offset=1.0),
                },
            )
            _create_database(source_db, {1: _encoded_points(6)})
            json_path.write_text("[]", encoding="utf-8")
            original_dump = _database_dump(target_db)
            real_load = Generator.load

            def mutate_unplanned_row(generator, *, persist_indoor_updates=True):
                activities = real_load(
                    generator, persist_indoor_updates=persist_indoor_updates
                )
                unplanned_activity = generator.session.get(Activity, 2)
                unplanned_activity.name = "Unexpected mutation"
                generator.session.commit()
                return activities

            with mock.patch(
                "restore_polylines.Generator.load", new=mutate_unplanned_row
            ):
                with self.assertRaisesRegex(
                    RecoveryValidationError, "outside recovery plan"
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=tmp / "backup",
                    )

            self.assertEqual(_database_dump(target_db), original_dump)

    def test_apply_rejects_concurrent_target_changes_before_commit(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: _encoded_points(4, offset=1.0),
                },
            )
            _create_database(source_db, {1: _encoded_points(6)})
            json_path.write_text("[]", encoding="utf-8")
            real_load = Generator.load

            def update_live_database(generator, *, persist_indoor_updates=True):
                activities = real_load(
                    generator, persist_indoor_updates=persist_indoor_updates
                )
                with sqlite3.connect(target_db) as connection:
                    connection.execute(
                        "UPDATE activities SET name = ? WHERE run_id = ?",
                        ("Concurrent update", 2),
                    )
                    connection.commit()
                return activities

            with mock.patch(
                "restore_polylines.Generator.load", new=update_live_database
            ):
                with self.assertRaisesRegex(
                    RecoveryValidationError, "changed during recovery"
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=tmp / "backup",
                    )

            self.assertEqual(_read_activity_name(target_db, 2), "Concurrent update")
            self.assertEqual(json.loads(json_path.read_text(encoding="utf-8")), [])

    def test_apply_serializes_writer_started_after_final_validation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: _encoded_points(4, offset=1.0),
                },
            )
            _create_database(source_db, {1: _encoded_points(6)})
            json_path.write_text("[]", encoding="utf-8")
            real_replace = os.replace
            writer_state = {}

            def start_concurrent_writer(source, destination):
                destination_path = Path(destination)
                source_path = Path(source)
                is_target_replace = destination_path in {target_db, json_path} and (
                    source_path.parent.name.startswith(".polyline-recovery-")
                )
                if is_target_replace and "process" not in writer_state:
                    process = subprocess.Popen(
                        [
                            sys.executable,
                            "-c",
                            (
                                "import sys; from pathlib import Path; "
                                f"sys.path.insert(0, {str(RUN_PAGE_PATH)!r}); "
                                "from generator.db import Activity, init_db; "
                                "path = Path(sys.argv[1]); "
                                "print('ready', flush=True); "
                                "session = init_db(path); "
                                "print('acquired', flush=True); "
                                "activity = session.get(Activity, 2); "
                                "activity.name = 'Concurrent update'; "
                                "session.commit(); session.close(); "
                                "print('updated', flush=True)"
                            ),
                            str(target_db),
                        ],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True,
                    )
                    writer_state["process"] = process
                    self.assertEqual(process.stdout.readline().strip(), "ready")
                    readable, _, _ = select.select([process.stdout], [], [], 0.5)
                    writer_state["blocked"] = not readable
                    if readable:
                        writer_state["early_output"] = process.stdout.readline().strip()
                return real_replace(source, destination)

            try:
                with mock.patch(
                    "restore_polylines.os.replace",
                    side_effect=start_concurrent_writer,
                ):
                    apply_recovery(
                        db_path=target_db,
                        json_path=json_path,
                        sources=load_database_sources(
                            source_db, origin="healthy-snapshot"
                        ),
                        backup_dir=tmp / "backup",
                    )
                process = writer_state["process"]
                stdout, stderr = process.communicate(timeout=10)
            finally:
                process = writer_state.get("process")
                if process is not None and process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)

            self.assertTrue(writer_state["blocked"])
            self.assertEqual(process.returncode, 0, stderr)
            self.assertIn("updated", stdout)
            self.assertEqual(_read_activity_name(target_db, 2), "Concurrent update")

    def test_apply_does_not_persist_unplanned_indoor_route_changes(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            _create_database(
                target_db,
                {
                    1: _encoded_points(2),
                    2: "",
                },
            )
            target_session = init_db(target_db)
            try:
                indoor_activity = target_session.get(Activity, 2)
                indoor_activity.subtype = "indoor"
                target_session.commit()
            finally:
                target_session.close()
            _create_database(source_db, {1: _encoded_points(6)})
            json_path.write_text("[]", encoding="utf-8")

            apply_recovery(
                db_path=target_db,
                json_path=json_path,
                sources=load_database_sources(source_db, origin="healthy-snapshot"),
                backup_dir=tmp / "backup",
            )

            self.assertEqual(_read_polyline(target_db, 2), "")


class RecoveryCliTest(unittest.TestCase):
    def test_apply_command_runs_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            target_db = tmp / "target.db"
            source_db = tmp / "source.db"
            json_path = tmp / "activities.json"
            backup_dir = tmp / "backup"
            healthy_polyline = _encoded_points(6)
            _create_database(target_db, {1: _encoded_points(2)})
            _create_database(source_db, {1: healthy_polyline})
            json_path.write_text("[]", encoding="utf-8")

            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUN_PAGE_PATH / "restore_polylines.py"),
                    "--db-path",
                    str(target_db),
                    "--json-path",
                    str(json_path),
                    "--source-db",
                    str(source_db),
                    "--source-origin",
                    "healthy-snapshot",
                    "--backup-dir",
                    str(backup_dir),
                    "--apply",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn("Recovery applied: updated=1", completed.stdout)
            self.assertEqual(_read_polyline(target_db, 1), healthy_polyline)
            manifest = json.loads(
                (backup_dir / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["status"], "complete")


if __name__ == "__main__":
    unittest.main()

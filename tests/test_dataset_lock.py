import datetime
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

import dataset_lock  # noqa: E402
import dedup_activities  # noqa: E402
from generator import db as generator_db  # noqa: E402
from dataset_lock import DatasetLockError, DatasetWriteLock  # noqa: E402


def _create_duplicate_activities(database_path: Path) -> None:
    session = generator_db.init_db(database_path)
    try:
        common_values = {
            "distance": 1000.0,
            "moving_time": datetime.timedelta(minutes=5),
            "elapsed_time": datetime.timedelta(minutes=5),
            "start_date": "2025-10-01 01:00:00",
            "start_date_local": "2025-10-01 09:00:00",
            "summary_polyline": "",
        }
        session.add_all(
            [
                generator_db.Activity(
                    run_id=1,
                    name="Cycling source",
                    type="cycling",
                    subtype="cycling",
                    **common_values,
                ),
                generator_db.Activity(
                    run_id=2,
                    name="Ride duplicate",
                    type="Ride",
                    subtype="Ride",
                    **common_values,
                ),
            ]
        )
        session.commit()
    finally:
        session.close()


class DatasetWriteLockTest(unittest.TestCase):
    def test_dedup_dry_run_preserves_duplicates_under_dataset_lock(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            database_path = Path(tmp_dir) / "data.db"
            _create_duplicate_activities(database_path)

            result = dedup_activities.dedup(database_path, dry_run=True)

            self.assertEqual(result, (1, 0, None))
            with sqlite3.connect(database_path) as connection:
                self.assertEqual(
                    connection.execute("SELECT count(*) FROM activities").fetchone()[0],
                    2,
                )

    def test_dedup_apply_removes_duplicate_and_regenerates_json(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            database_path = tmp / "data.db"
            json_path = tmp / "activities.json"
            _create_duplicate_activities(database_path)

            result = dedup_activities.dedup(
                database_path,
                json_path=json_path,
                dry_run=False,
            )

            self.assertEqual(result, (1, 0, 1))
            activities = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual([activity["run_id"] for activity in activities], [1])

    def test_session_construction_failure_releases_lock_once(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            database_path = Path(tmp_dir) / "data.db"
            release_calls: list[DatasetWriteLock] = []
            real_release = generator_db.DatasetWriteLock.release

            def record_release(lock: DatasetWriteLock) -> None:
                release_calls.append(lock)
                try:
                    real_release(lock)
                except DatasetLockError:
                    # Keep the regression assertion deterministic if a broken
                    # implementation attempts a second finalizer release.
                    pass

            with (
                mock.patch.object(
                    generator_db.DatasetWriteLock,
                    "release",
                    new=record_release,
                ),
                mock.patch.object(
                    generator_db.Session,
                    "__init__",
                    side_effect=RuntimeError("Injected session construction failure"),
                ),
            ):
                with self.assertRaisesRegex(
                    RuntimeError, "Injected session construction failure"
                ):
                    generator_db.init_db(database_path)

            self.assertEqual(len(release_calls), 1)

    def test_discarded_database_session_releases_cross_process_lock(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            database_path = Path(tmp_dir) / "data.db"
            holder = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    (
                        "import gc, sys, time; from pathlib import Path; "
                        f"sys.path.insert(0, {str(RUN_PAGE_PATH)!r}); "
                        "from generator.db import init_db; "
                        "session = init_db(Path(sys.argv[1])); "
                        "del session; gc.collect(); "
                        "print('session-discarded', flush=True); time.sleep(10)"
                    ),
                    str(database_path),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            contender = None
            try:
                self.assertEqual(holder.stdout.readline().strip(), "session-discarded")
                contender = subprocess.Popen(
                    [
                        sys.executable,
                        "-c",
                        (
                            "import sys; from pathlib import Path; "
                            f"sys.path.insert(0, {str(RUN_PAGE_PATH)!r}); "
                            "from dataset_lock import DatasetWriteLock; "
                            "lock = DatasetWriteLock(Path(sys.argv[1])); "
                            "lock.acquire(); print('acquired', flush=True); "
                            "lock.release()"
                        ),
                        str(database_path),
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
                try:
                    stdout, stderr = contender.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    contender.kill()
                    stdout, stderr = contender.communicate(timeout=5)
                    self.fail(
                        "Discarded database session retained the dataset lock; "
                        f"stdout={stdout!r}, stderr={stderr!r}"
                    )
                self.assertEqual(contender.returncode, 0, stderr)
                self.assertEqual(stdout.strip(), "acquired")
            finally:
                if contender is not None and contender.poll() is None:
                    contender.kill()
                    contender.wait(timeout=5)
                if holder.poll() is None:
                    holder.terminate()
                    try:
                        holder.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        holder.kill()
                        holder.wait(timeout=5)
                holder.communicate(timeout=5)

    def test_rejects_double_acquire_and_unbalanced_release(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            lock = DatasetWriteLock(Path(tmp_dir) / "data.db")

            with self.assertRaisesRegex(DatasetLockError, "not acquired"):
                lock.release()

            lock.acquire()
            try:
                with self.assertRaisesRegex(DatasetLockError, "already acquired"):
                    lock.acquire()
            finally:
                lock.release()

    def test_nested_instances_are_reentrant_in_the_same_thread(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            database_path = Path(tmp_dir) / "data.db"

            with DatasetWriteLock(database_path):
                with DatasetWriteLock(database_path):
                    database_path.write_text("locked", encoding="utf-8")

            self.assertEqual(database_path.read_text(encoding="utf-8"), "locked")

    def test_process_local_fallback_remains_usable_without_fcntl(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            database_path = Path(tmp_dir) / "data.db"
            with mock.patch.object(dataset_lock, "fcntl", None):
                lock = DatasetWriteLock(database_path)
                self.assertFalse(lock.supports_cross_process_locking)
                with lock:
                    database_path.write_text("locked", encoding="utf-8")

    @unittest.skipIf(dataset_lock.fcntl is None, "POSIX file locking is unavailable")
    def test_releases_process_mutex_when_file_lock_acquisition_fails(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            lock = DatasetWriteLock(Path(tmp_dir) / "data.db")
            with mock.patch.object(
                dataset_lock.fcntl,
                "flock",
                side_effect=OSError("Injected lock failure"),
            ):
                with self.assertRaisesRegex(OSError, "Injected lock failure"):
                    lock.acquire()

            with lock:
                pass

    def test_waiter_reopens_database_after_locked_inode_is_replaced(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            database_path = tmp / "data.db"
            replacement_path = tmp / "replacement.db"
            database_path.write_text("before", encoding="utf-8")
            replacement_path.write_text("after", encoding="utf-8")
            lock = DatasetWriteLock(database_path)
            lock.acquire()
            process = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    (
                        "import sys; from pathlib import Path; "
                        f"sys.path.insert(0, {str(RUN_PAGE_PATH)!r}); "
                        "from dataset_lock import DatasetWriteLock; "
                        "path = Path(sys.argv[1]); "
                        "print('waiting', flush=True); "
                        "lock = DatasetWriteLock(path); lock.acquire(); "
                        "print(path.read_text(encoding='utf-8'), flush=True); "
                        "lock.release()"
                    ),
                    str(database_path),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                self.assertEqual(process.stdout.readline().strip(), "waiting")
                time.sleep(0.2)
                self.assertIsNone(process.poll())
                os.replace(replacement_path, database_path)
            finally:
                lock.release()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)

            stdout, stderr = process.communicate()
            self.assertEqual(process.returncode, 0, stderr)
            self.assertEqual(stdout.strip(), "after")


if __name__ == "__main__":
    unittest.main()

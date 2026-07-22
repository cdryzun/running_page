import datetime
import sys
import tempfile
import unittest
from pathlib import Path

import polyline

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

import polyline_processor  # noqa: E402
from generator import Generator  # noqa: E402
from generator.db import Activity  # noqa: E402
from gpxtrackposter import track as track_module  # noqa: E402


class PolylinePersistenceTest(unittest.TestCase):
    def test_normal_load_persists_derived_indoor_route(self):
        outdoor_polyline = polyline.encode(
            [
                (24.4500, 111.4700),
                (24.4510, 111.4690),
                (24.4520, 111.4680),
                (24.4530, 111.4670),
            ]
        )
        with tempfile.TemporaryDirectory() as tmp_dir:
            generator = Generator(Path(tmp_dir) / "activities.db")
            try:
                generator.session.add_all(
                    [
                        Activity(
                            run_id=1,
                            name="Outdoor Run",
                            distance=1000.0,
                            moving_time=datetime.timedelta(minutes=5),
                            elapsed_time=datetime.timedelta(minutes=5),
                            type="Run",
                            subtype="Run",
                            start_date="2025-10-01 01:00:00",
                            start_date_local="2025-10-01 09:00:00",
                            summary_polyline=outdoor_polyline,
                        ),
                        Activity(
                            run_id=2,
                            name="Treadmill Run",
                            distance=500.0,
                            moving_time=datetime.timedelta(minutes=3),
                            elapsed_time=datetime.timedelta(minutes=3),
                            type="Run",
                            subtype="treadmill",
                            start_date="2025-10-02 01:00:00",
                            start_date_local="2025-10-02 09:00:00",
                            summary_polyline="",
                        ),
                    ]
                )
                generator.session.commit()

                generator.load()
                generator.session.expire_all()
                indoor_activity = generator.session.get(Activity, 2)

                self.assertEqual(indoor_activity.subtype, "indoor")
                self.assertTrue(indoor_activity.summary_polyline)
            finally:
                generator.session.close()

    def test_repeated_load_is_idempotent_and_preserves_stored_polyline(self):
        points = [
            (24.4500, 111.4700),
            (24.4510, 111.4690),
            (24.4520, 111.4680),
            (24.4530, 111.4670),
            (24.4540, 111.4660),
            (24.4550, 111.4650),
        ]
        original_polyline = polyline.encode(points)
        previous_start_end_range = polyline_processor.IGNORE_START_END_RANGE
        previous_ignore_polyline = polyline_processor.IGNORE_POLYLINE
        previous_ignore_range = polyline_processor.IGNORE_RANGE

        try:
            polyline_processor.IGNORE_START_END_RANGE = 0.01
            polyline_processor.IGNORE_POLYLINE = []
            polyline_processor.IGNORE_RANGE = 0.0

            with tempfile.TemporaryDirectory() as tmp_dir:
                db_path = Path(tmp_dir) / "activities.db"
                generator = Generator(db_path)
                generator.session.add(
                    Activity(
                        run_id=1,
                        name="Morning Ride",
                        distance=1000.0,
                        moving_time=datetime.timedelta(minutes=5),
                        elapsed_time=datetime.timedelta(minutes=5),
                        type="Ride",
                        subtype="Ride",
                        start_date="2025-10-01 01:00:00",
                        start_date_local="2025-10-01 09:00:00",
                        location_country="Hezhou, Guangxi, China",
                        summary_polyline=original_polyline,
                        average_speed=3.333,
                        elevation_gain=10.0,
                        elevation_loss=10.0,
                    )
                )
                generator.session.commit()

                first_export = generator.load()
                second_export = generator.load()
                generator.session.expire_all()
                stored_activity = generator.session.get(Activity, 1)

                self.assertEqual(
                    first_export[0]["summary_polyline"],
                    second_export[0]["summary_polyline"],
                )
                self.assertEqual(stored_activity.summary_polyline, original_polyline)
                generator.session.close()
        finally:
            polyline_processor.IGNORE_START_END_RANGE = previous_start_end_range
            polyline_processor.IGNORE_POLYLINE = previous_ignore_polyline
            polyline_processor.IGNORE_RANGE = previous_ignore_range


class StartEndHidingTest(unittest.TestCase):
    def test_zero_distance_keeps_all_points(self):
        points = [
            (24.4500, 111.4700),
            (24.4510, 111.4690),
            (24.4520, 111.4680),
        ]

        self.assertEqual(polyline_processor.start_end_hiding(points, 0), points)


class DbBackedTrackPrivacyTest(unittest.TestCase):
    def test_load_from_db_filters_rendered_route_without_mutating_activity(self):
        points = [
            (24.4500, 111.4700),
            (24.4510, 111.4690),
            (24.4520, 111.4680),
            (24.4530, 111.4670),
            (24.4540, 111.4660),
            (24.4550, 111.4650),
        ]
        original_polyline = polyline.encode(points)
        previous_ignore_before_saving = track_module.IGNORE_BEFORE_SAVING
        previous_start_end_range = polyline_processor.IGNORE_START_END_RANGE
        previous_ignore_polyline = polyline_processor.IGNORE_POLYLINE
        previous_ignore_range = polyline_processor.IGNORE_RANGE

        try:
            track_module.IGNORE_BEFORE_SAVING = False
            polyline_processor.IGNORE_START_END_RANGE = 0.01
            polyline_processor.IGNORE_POLYLINE = []
            polyline_processor.IGNORE_RANGE = 0.0
            activity = Activity(
                run_id=1,
                name="Morning Ride",
                distance=1000.0,
                moving_time=datetime.timedelta(minutes=5),
                elapsed_time=datetime.timedelta(minutes=5),
                type="Ride",
                subtype="Ride",
                start_date="2025-10-01 01:00:00",
                start_date_local="2025-10-01 09:00:00",
                summary_polyline=original_polyline,
                average_speed=3.333,
            )

            track = track_module.Track()
            track.load_from_db(activity)

            self.assertEqual(len(track.polylines[0]), len(points) - 2)
            self.assertEqual(activity.summary_polyline, original_polyline)
        finally:
            track_module.IGNORE_BEFORE_SAVING = previous_ignore_before_saving
            polyline_processor.IGNORE_START_END_RANGE = previous_start_end_range
            polyline_processor.IGNORE_POLYLINE = previous_ignore_polyline
            polyline_processor.IGNORE_RANGE = previous_ignore_range


if __name__ == "__main__":
    unittest.main()

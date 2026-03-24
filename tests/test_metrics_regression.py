import datetime
import io
import sys
import unittest
from pathlib import Path

import gpxpy

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

from generator.db import update_or_create_activity  # noqa: E402
from gpxtrackposter.exceptions import TrackLoadError  # noqa: E402
from gpxtrackposter.track import Track  # noqa: E402
from gpxtrackposter.utils import parse_datetime_to_local  # noqa: E402
from strava_backfill_metrics import (  # noqa: E402
    calculate_elevation_gain_loss,
    parse_types,
    should_backfill_activity,
)


class _DummyActivity:
    def __init__(self, activity_type: str):
        self.type = activity_type


class MetricsRegressionTest(unittest.TestCase):
    def test_parse_types_normalizes_aliases(self):
        parsed = parse_types("cycling,run,ride,biking")
        self.assertEqual(parsed, {"cycling", "run"})

    def test_should_backfill_activity_supports_mixed_types(self):
        allowed = {"cycling", "run"}
        self.assertTrue(should_backfill_activity(_DummyActivity("Run"), allowed))
        self.assertTrue(should_backfill_activity(_DummyActivity("Ride"), allowed))
        self.assertFalse(should_backfill_activity(_DummyActivity("Swim"), allowed))

    def test_elevation_noise_threshold_consistent_across_paths(self):
        points = [0, 0.3, 0, 0.3, 0]
        self.assertEqual(calculate_elevation_gain_loss(points), (0.0, 0.0))
        self.assertEqual(Track._calc_elevation_gain_loss(points), (0.0, 0.0))

    def test_parse_datetime_to_local_invalid_point_falls_back_without_crash(self):
        start = datetime.datetime(2026, 1, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)
        end = datetime.datetime(2026, 1, 1, 13, 0, 0, tzinfo=datetime.timezone.utc)
        local_start, local_end = parse_datetime_to_local(start, end, ("bad", "bad"))
        self.assertEqual(local_start, datetime.datetime(2026, 1, 1, 12, 0, 0))
        self.assertEqual(local_end, datetime.datetime(2026, 1, 1, 13, 0, 0))

    def test_load_gpx_with_no_start_time_raises_track_error(self):
        empty_segment_gpx = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="unittest" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Empty</name><trkseg></trkseg></trk>
</gpx>"""
        gpx = gpxpy.parse(io.StringIO(empty_segment_gpx))
        track = Track()
        with self.assertRaises(TrackLoadError):
            track._load_gpx_data(gpx)
        self.assertEqual(track.run_id, 0)

    def test_extension_speed_does_not_override_distance_over_moving_time(self):
        gpx_with_extensions = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="unittest" xmlns="http://www.topografix.com/GPX/1/1">
  <extensions>
    <distance>2197.04</distance>
    <moving_time>583</moving_time>
    <elapsed_time>847.716</elapsed_time>
    <average_speed>2.592</average_speed>
  </extensions>
</gpx>"""
        gpx = gpxpy.parse(io.StringIO(gpx_with_extensions))
        track = Track()
        track.length = 100.0
        track.moving_dict = {
            "distance": 100.0,
            "moving_time": datetime.timedelta(seconds=100),
            "elapsed_time": datetime.timedelta(seconds=100),
            "average_speed": 1.0,
        }

        track._load_gpx_extensions_data(gpx)
        expected = 2197.04 / 583.0
        self.assertAlmostEqual(track.moving_dict["average_speed"], expected, places=6)

    def test_update_or_create_activity_raises_when_enabled(self):
        with self.assertRaises(ValueError):
            update_or_create_activity(None, object(), raise_on_error=True)


if __name__ == "__main__":
    unittest.main()

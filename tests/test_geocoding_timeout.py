import datetime
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
RUN_PAGE_PATH = ROOT / "run_page"
if str(RUN_PAGE_PATH) not in sys.path:
    sys.path.insert(0, str(RUN_PAGE_PATH))

from generator import db as generator_db  # noqa: E402


class ReverseGeocodingTimeoutTest(unittest.TestCase):
    def test_initial_lookup_and_retry_use_bounded_timeout(self):
        session = mock.Mock()
        session.query.return_value.filter_by.return_value.first.return_value = None
        activity = SimpleNamespace(
            id=1,
            name="Morning Ride",
            distance=1000.0,
            moving_time=datetime.timedelta(minutes=5),
            elapsed_time=datetime.timedelta(minutes=5),
            type="Ride",
            subtype="Ride",
            start_date="2026-08-21 01:00:00",
            start_date_local="2026-08-21 09:00:00",
            start_latlng=SimpleNamespace(lat=22.54, lon=114.06),
            location_country="",
            average_heartrate=None,
            average_speed=3.333,
            map=SimpleNamespace(summary_polyline=""),
        )

        with mock.patch.object(
            generator_db.g,
            "reverse",
            side_effect=[TimeoutError("temporary failure"), "Shenzhen, China"],
        ) as reverse:
            created = generator_db.update_or_create_activity(session, activity)

        self.assertTrue(created)
        expected_call = mock.call("22.54, 114.06", language="zh-CN", timeout=15)
        self.assertEqual(reverse.call_args_list, [expected_call, expected_call])


if __name__ == "__main__":
    unittest.main()

import datetime
import importlib
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from run_page.gpxtrackposter.poster import Poster
from run_page.gpxtrackposter.github_drawer import GithubDrawer


def make_track(distance_km, sport_type):
    return SimpleNamespace(length=distance_km * 1000, type=sport_type)


class SportSpecificDistanceTest(unittest.TestCase):
    def setUp(self):
        self.poster = Poster()

    def test_each_sport_uses_its_own_inclusive_thresholds(self):
        cases = (
            ("cycling", 49.99, 0),
            ("cycling", 50, 1),
            ("Ride", 99.99, 1),
            ("Ride", 100, 2),
            ("running", 9.99, 0),
            ("Run", 10, 1),
            ("running", 20, 2),
            ("hiking", 9.99, 0),
            ("Walk", 10, 1),
            ("walking", 20, 2),
            ("multi_sport", 19.99, 0),
            ("multi_sport", 20, 1),
            ("other", 50, 2),
        )

        for sport_type, distance_km, expected_grade in cases:
            with self.subTest(sport_type=sport_type, distance_km=distance_km):
                self.assertEqual(
                    self.poster.grade_track(make_track(distance_km, sport_type)),
                    expected_grade,
                )

    def test_day_grade_takes_the_highest_individual_grade_without_summing(self):
        self.assertEqual(
            self.poster.day_grade(
                (make_track(5, "running"), make_track(60, "cycling"))
            ),
            1,
        )
        self.assertEqual(
            self.poster.day_grade(
                (make_track(30, "cycling"), make_track(30, "cycling"))
            ),
            0,
        )
        self.assertEqual(
            self.poster.day_grade(
                (make_track(20, "running"), make_track(60, "cycling"))
            ),
            2,
        )
        self.assertEqual(self.poster.day_grade(()), 0)

    def test_github_chart_colors_mixed_days_by_highest_individual_grade(self):
        def dated_track(day, distance_km, sport_type):
            return SimpleNamespace(
                start_time_local=datetime.datetime(2026, 1, day),
                length=distance_km * 1000,
                type=sport_type,
                subtype=None,
            )

        self.poster.athlete = "Test"
        self.poster.title = "Test"
        self.poster.height = 98
        self.poster.drawer_type = "title"
        self.poster.colors = {
            "background": "#222222",
            "text": "#ffffff",
            "track": "#0000ff",
            "track2": "#0000ff",
            "special": "yellow",
            "special2": "red",
        }
        self.poster.set_tracks(
            (
                dated_track(1, 5, "running"),
                dated_track(1, 60, "cycling"),
                dated_track(2, 30, "cycling"),
                dated_track(2, 30, "cycling"),
                dated_track(3, 20, "running"),
            )
        )

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "github.svg"
            self.poster.draw(GithubDrawer(self.poster), output)
            root = ET.parse(output).getroot()

        namespace = "{http://www.w3.org/2000/svg}"
        colors_by_date = {}
        for rectangle in root.iter(f"{namespace}rect"):
            title = rectangle.find(f"{namespace}title")
            if title is not None and title.text and " " in title.text:
                colors_by_date[title.text.split(" ", 1)[0]] = rectangle.get("fill")

        self.assertEqual(colors_by_date["2026-01-01"], "yellow")
        self.assertEqual(colors_by_date["2026-01-02"], "#0000ff")
        self.assertEqual(colors_by_date["2026-01-03"], "red")

    def test_circular_chart_uses_the_same_semantic_palette_as_github_chart(self):
        tracks = (
            SimpleNamespace(
                start_time_local=datetime.datetime(2026, 1, 1),
                length=30_000,
                type="cycling",
                special=False,
            ),
            SimpleNamespace(
                start_time_local=datetime.datetime(2026, 1, 2),
                length=60_000,
                type="cycling",
                special=False,
            ),
            SimpleNamespace(
                start_time_local=datetime.datetime(2026, 1, 3),
                length=110_000,
                type="cycling",
                special=False,
            ),
        )
        run_page_path = str(Path(__file__).resolve().parents[1] / "run_page")
        with patch.object(sys, "path", [run_page_path, *sys.path]):
            gen_svg = importlib.import_module("gen_svg")

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "poster.svg"
            arguments = [
                "gen_svg.py",
                "--from-db",
                "--type",
                "circular",
                "--output",
                str(output),
                "--special-color",
                "yellow",
                "--special-color2",
                "red",
            ]
            with (
                patch.object(
                    gen_svg.track_loader.TrackLoader,
                    "load_tracks_from_db",
                    return_value=tracks,
                ),
                patch.object(sys, "argv", arguments),
            ):
                gen_svg.main()

            root = ET.parse(output.with_name("year_2026.svg")).getroot()

        namespace = "{http://www.w3.org/2000/svg}"
        backgrounds = {
            rectangle.get("fill") for rectangle in root.findall(f"{namespace}rect")
        }
        activity_colors = [
            path.get("fill")
            for path in root.iter(f"{namespace}path")
            if path.get("fill") not in (None, "none")
        ]
        text_colors = {text.get("fill") for text in root.iter(f"{namespace}text")}

        self.assertEqual(backgrounds, {"#222222"})
        self.assertEqual(activity_colors, ["#4dd2ff", "yellow", "red"])
        self.assertEqual(text_colors, {"#FFFFFF"})

    def test_explicit_legacy_thresholds_can_still_override_sport_rules(self):
        self.poster.use_sport_specific_distances = False
        self.poster.special_distance = {
            "special_distance": 10,
            "special_distance2": 20,
        }

        self.assertEqual(self.poster.grade_track(make_track(15, "cycling")), 1)
        self.assertEqual(self.poster.grade_track(make_track(20, "cycling")), 2)
        self.assertEqual(
            self.poster.day_grade((make_track(6, "running"), make_track(6, "running"))),
            1,
        )
        self.poster.units = "imperial"
        self.assertEqual(self.poster.grade_track(make_track(20, "cycling")), 1)

    def test_bilingual_legend_describes_all_active_categories(self):
        self.assertEqual(
            self.poster.special_distance_legend_labels(),
            ("Bike50 Run/Hike10 Other20 km", "Bike100 Run/Hike20 Other50 km"),
        )

        self.poster.set_language("zh_CN")

        self.assertEqual(
            self.poster.special_distance_legend_labels(),
            ("骑50 跑/徒10 其他20 km", "骑100 跑/徒20 其他50 km"),
        )


if __name__ == "__main__":
    unittest.main()

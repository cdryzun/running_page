import locale
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch

from run_page.gpxtrackposter.poster import Poster

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CURRENT_YEARS = (2024, 2025, 2026)


def svg_text(path: Path) -> str:
    root = ET.parse(path).getroot()
    return " ".join(text.strip() for text in root.itertext() if text.strip())


class PosterLanguageTest(unittest.TestCase):
    def test_chinese_labels_do_not_depend_on_an_installed_system_locale(self):
        poster = Poster()

        with patch(
            "run_page.gpxtrackposter.poster.locale.setlocale",
            side_effect=locale.Error("locale unavailable"),
        ):
            poster.set_language("zh_CN")

        self.assertEqual(poster.trans("Running"), "运动记录")
        self.assertEqual(poster.trans("Runner"), "运动者")
        self.assertEqual(poster.trans("SPECIAL TRACKS"), "特殊记录")
        self.assertEqual(poster.trans("STATISTICS"), "统计")
        self.assertEqual(poster.month_name(1), "一月")
        self.assertEqual(poster.month_name(12, abbreviated=True), "12月")
        self.assertEqual(poster.year_title(2026), "2026 运动记录")

    def test_english_labels_remain_the_default(self):
        poster = Poster()

        self.assertEqual(poster.trans("Running"), "Running")
        self.assertEqual(poster.month_name(1), "January")
        self.assertEqual(poster.month_name(12, abbreviated=True), "Dec")
        self.assertEqual(poster.year_title(2026), "2026 Running")


class GeneratedSvgLanguageTest(unittest.TestCase):
    def test_current_years_have_chinese_and_english_chart_assets(self):
        for year in CURRENT_YEARS:
            with self.subTest(year=year):
                circular_en = svg_text(ASSETS / f"year_{year}.svg")
                circular_zh = svg_text(ASSETS / f"year_{year}_zh.svg")
                github_en = svg_text(ASSETS / f"github_{year}.svg")
                github_zh = svg_text(ASSETS / f"github_{year}_zh.svg")

                self.assertIn("January", circular_en)
                self.assertIn("December", circular_en)
                self.assertIn("一月", circular_zh)
                self.assertIn("十二月", circular_zh)
                self.assertIn(f"{year} Running", github_en)
                self.assertIn(f"{year} 运动记录", github_zh)
                self.assertIn("Runner", github_en)
                self.assertIn("运动者", github_zh)
                self.assertIn("特殊记录", github_zh)
                self.assertIn("统计", github_zh)


if __name__ == "__main__":
    unittest.main()

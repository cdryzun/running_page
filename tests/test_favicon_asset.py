import hashlib
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAVICON = ROOT / "public" / "images" / "favicon.png"
INDEX_HTML = ROOT / "index.html"
APPROVED_SHA256 = "2559a5246447854fc4d082e43d2c23412fdb8ba2a64b67e36e7d5195188e5105"


def read_png_header(path: Path) -> tuple[int, int, int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"invalid PNG signature: {path}")
    chunk_length = struct.unpack(">I", data[8:12])[0]
    if data[12:16] != b"IHDR" or chunk_length != 13:
        raise AssertionError(f"invalid PNG IHDR: {path}")
    return struct.unpack(">IIBB", data[16:26])


class FaviconAssetTest(unittest.TestCase):
    def test_favicon_matches_approved_cycling_icon(self):
        self.assertTrue(FAVICON.is_file(), FAVICON)
        self.assertGreater(FAVICON.stat().st_size, 0, FAVICON)
        width, height, bit_depth, color_type = read_png_header(FAVICON)
        self.assertEqual((width, height), (512, 512))
        self.assertEqual(bit_depth, 8)
        self.assertEqual(color_type, 6, "favicon must be an RGBA PNG")
        digest = hashlib.sha256(FAVICON.read_bytes()).hexdigest()
        self.assertEqual(digest, APPROVED_SHA256)

    def test_html_references_the_favicon(self):
        html = INDEX_HTML.read_text(encoding="utf-8")
        self.assertIn("%BASE_URL%/images/favicon.png", html)


if __name__ == "__main__":
    unittest.main()

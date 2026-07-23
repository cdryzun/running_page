"""Deployment configuration guard tests for the ESA Pages pipeline.

These tests verify production-grade invariants that protect the ESA
deployment chain from configuration drift, secret leakage, and accidental
regressions (e.g. someone re-introducing Vercel coupling or removing the
SPA fallback). They run as part of the unittest suite discovered by CI
and as a pre-deploy gate in esa_deploy.yml's `test` job.

Why: each test guards a real failure mode observed or foreseeable in this
project's migration from Vercel to Alibaba Cloud ESA Pages.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Files read by multiple test cases, resolved once.
ESA_JSONC = ROOT / "esa.jsonc"
ESA_WORKFLOW = ROOT / ".github" / "workflows" / "esa_deploy.yml"
VITE_CONFIG = ROOT / "vite.config.ts"
PACKAGE_JSON = ROOT / "package.json"
PNPM_LOCK = ROOT / "pnpm-lock.yaml"
SRC_DIR = ROOT / "src"
DIST_DIR = ROOT / "dist"

# Alibaba Cloud AccessKey IDs use the LTAI prefix. Catching plaintext
# leaks of these (or their secrets) is the highest-priority guard.
_ACCESS_KEY_PATTERN = re.compile(r"LTAI[0-9A-Za-z]{12,}")
# GitHub Actions secret references look like ${{ secrets.NAME }}.
_SECRET_REF_PATTERN = re.compile(r"\$\{\{\s*secrets\.[A-Z_]+\s*\}\}")


def _strip_jsonc_comments(text: str) -> str:
    """Remove // line comments and /* block */ comments from a JSONC string.

    Naive but sufficient for esa.jsonc: does not understand comments
    inside string values, which this project's esa.jsonc does not use.
    """
    without_block = re.sub(r"/\*[\s\S]*?\*/", "", text)
    without_line = re.sub(r"//[^\n]*", "", without_block)
    return without_line


class EsaConfigTest(unittest.TestCase):
    """Validate esa.jsonc: the single source of truth for ESA deployment."""

    @classmethod
    def setUpClass(cls):
        # Parse once for all tests in this class; avoids repeated long-line
        # json.loads(...) calls that black would reformat.
        raw = ESA_JSONC.read_text(encoding="utf-8")
        cls.parsed = json.loads(_strip_jsonc_comments(raw))

    def test_esa_jsonc_exists(self):
        self.assertTrue(
            ESA_JSONC.is_file(), f"{ESA_JSONC} must exist for ESA deployment"
        )

    def test_esa_jsonc_is_valid_json_after_stripping_comments(self):
        # setUpClass already parsed successfully; confirm it is a dict.
        self.assertIsInstance(self.parsed, dict)

    def test_esa_jsonc_has_project_name(self):
        self.assertEqual(self.parsed.get("name"), "running-page")

    def test_esa_jsonc_dist_directory(self):
        assets = self.parsed.get("assets", {})
        self.assertEqual(assets.get("directory"), "./dist")

    def test_esa_jsonc_spa_fallback(self):
        """SPA fallback must be singlePageApplication so client-side routes
        like /summary survive a hard refresh on ESA's static edge."""
        assets = self.parsed.get("assets", {})
        self.assertEqual(
            assets.get("notFoundStrategy"),
            "singlePageApplication",
            "Removing notFoundStrategy breaks SPA deep-link refresh",
        )


class SecretLeakageTest(unittest.TestCase):
    """Ensure no plaintext Alibaba Cloud credentials leak into the repo."""

    def _assert_no_plaintext_key(self, path: Path):
        self.assertTrue(path.is_file(), f"{path} missing")
        content = path.read_text(encoding="utf-8")
        match = _ACCESS_KEY_PATTERN.search(content)
        self.assertIsNone(
            match,
            f"Plaintext AccessKey '{match.group() if match else '?'}' found in {path}",
        )

    def test_esa_jsonc_has_no_plaintext_key(self):
        self._assert_no_plaintext_key(ESA_JSONC)

    def test_esa_workflow_has_no_plaintext_key(self):
        self._assert_no_plaintext_key(ESA_WORKFLOW)

    def test_esa_workflow_uses_secret_placeholders(self):
        """Credentials must flow through GitHub Encrypted Secrets, never
        hardcoded. The deploy/login steps must reference secrets.* placeholders."""
        content = ESA_WORKFLOW.read_text(encoding="utf-8")
        self.assertIn(
            "${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_ID }}",
            content,
            "Deploy workflow must reference ALIBABA_CLOUD_ACCESS_KEY_ID via secrets",
        )
        self.assertIn(
            "${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_SECRET }}",
            content,
            "Deploy workflow must reference ALIBABA_CLOUD_ACCESS_KEY_SECRET via secrets",
        )


class VercelRemnantTest(unittest.TestCase):
    """Guard against accidental re-introduction of Vercel coupling after the
    ESA migration. Any of these signals means the migration is incomplete."""

    def test_no_vercel_config_files(self):
        self.assertFalse(
            (ROOT / "vercel.json").is_file(),
            "vercel.json should be removed after ESA migration",
        )
        self.assertFalse(
            (ROOT / ".vercelignore").is_file(),
            ".vercelignore should be removed after ESA migration",
        )

    def test_package_json_has_no_vercel_dependency(self):
        pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
        for section in ("dependencies", "devDependencies"):
            deps = pkg.get(section, {})
            self.assertNotIn(
                "@vercel/analytics",
                deps,
                f"@vercel/analytics must not appear in {section}",
            )

    def test_vite_config_has_no_vercel_define(self):
        content = VITE_CONFIG.read_text(encoding="utf-8")
        self.assertNotIn(
            "import.meta.env.VERCEL",
            content,
            "Vercel define block must be removed from vite.config.ts",
        )

    def test_src_has_no_vercel_imports(self):
        """Scan all TypeScript source for Vercel coupling remnants."""
        offenders = []
        for ts_file in SRC_DIR.rglob("*.ts*"):
            content = ts_file.read_text(encoding="utf-8")
            for marker in ("@vercel/analytics", "import.meta.env.VERCEL"):
                if marker in content:
                    offenders.append(f"{ts_file.relative_to(ROOT)}: {marker}")
        self.assertEqual(
            offenders,
            [],
            f"Vercel remnants found in src/: {offenders}",
        )


class DependencyConsistencyTest(unittest.TestCase):
    """Ensure package.json dependencies are reflected in the lockfile, so
    CI installs do not silently drift from declared dependencies."""

    def test_declared_deps_exist_in_lockfile(self):
        pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
        lock = PNPM_LOCK.read_text(encoding="utf-8")
        declared = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        self.assertTrue(declared, "package.json has no dependencies to check")
        missing = []
        for dep_name in declared:
            # pnpm-lock.yaml lists packages as 'dep@version' under dependencies
            # or importers. A simple substring check on the bare name is a
            # pragmatic guard against a dep being declared but never locked.
            if dep_name not in lock:
                missing.append(dep_name)
        self.assertEqual(
            missing,
            [],
            f"Declared dependencies missing from pnpm-lock.yaml: {missing}",
        )


class BuildArtifactTest(unittest.TestCase):
    """Verify the build output is structurally sound for ESA hosting.

    These run after `pnpm build`; in CI they execute in the test job after
    the build step. Locally they are skipped (with a clear message) if the
    dist/ directory has not been produced, so the unittest discovery in
    ci.yml's GPX smoke step (which does not build the frontend) stays green.
    """

    def setUp(self):
        if not DIST_DIR.is_dir():
            self.skipTest(
                "dist/ not built yet — build artifact tests require `pnpm build`"
            )

    def test_index_html_exists(self):
        self.assertTrue(
            (DIST_DIR / "index.html").is_file(),
            "dist/index.html missing after build",
        )

    def test_asset_urls_are_root_relative(self):
        """Assets must be served from root path (/assets/...) for ESA root
        domain hosting. A sub-path prefix (e.g. /repo-name/) would break
        asset loading on run.treesir.pub."""
        html = (DIST_DIR / "index.html").read_text(encoding="utf-8")
        # Find all src= and href= attribute values.
        asset_refs = re.findall(r'(?:src|href)="([^"]+)"', html)
        external_or_data = {
            ref for ref in asset_refs if ref.startswith(("http", "//", "data:"))
        }
        local_refs = [r for r in asset_refs if r not in external_or_data]
        self.assertTrue(
            local_refs,
            "No local asset references found in index.html to verify",
        )
        for ref in local_refs:
            self.assertTrue(
                ref.startswith("/"),
                f"Asset URL '{ref}' is not root-relative — ESA root deploy would break",
            )


if __name__ == "__main__":
    unittest.main()

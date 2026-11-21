import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(root, '..', path), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const pnpmLock = read('pnpm-lock.yaml');
const skillDoc = read('.claude/skills/verify/SKILL.md');
const driver = read('.claude/skills/verify/helpers/cdp.mjs');

test('verify dependency is pinned in the pnpm lockfile, not installed ad hoc', () => {
  assert.equal(
    packageJson.devDependencies['chrome-remote-interface'],
    '0.34.0'
  );
  assert.match(
    pnpmLock,
    /chrome-remote-interface:\s*\n\s*specifier: 0\.34\.0\s*\n\s*version: 0\.34\.0/
  );
  assert.match(skillDoc, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(skillDoc, /(^|\s|`)npm install/);
  assert.doesNotMatch(
    driver,
    /(^|\s|`)npm install|--no-save|--no-package-lock/
  );
});

test('launch releases the detached Chrome child so the driver exits', () => {
  assert.match(driver, /\.unref\(\)/);
});

test('launch finds Chrome on the host without a hard-coded Linux path', () => {
  assert.doesNotMatch(driver, /spawn\('\/usr\/bin\/google-chrome'/);
  assert.match(driver, /VERIFY_CHROME_PATH/);
  assert.match(driver, /Google Chrome\.app/);
});

test('launch binds the debug port to the Chrome process it started', () => {
  assert.match(driver, /debug port is already occupied/);
  assert.match(driver, /once\('error'/);
  assert.match(driver, /chromePid/);
  assert.match(driver, /VERIFY_CHROME_PATH/);
});

test('goto waits for the destination document before checking its root', () => {
  assert.match(driver, /location\.href === \$\{JSON\.stringify\(url\)\}/);
});

test('launch failure keeps pre-existing evidence', () => {
  assert.doesNotMatch(driver, /rmSync\(scratchRoot/);
});

test('doctor rejects pages that are not the built preview app', () => {
  assert.match(driver, /VERIFY_PREVIEW_URL/);
  assert.match(driver, /dist', 'index\.html'/);
  assert.match(driver, /\.vite', 'manifest\.json'/);
  assert.match(driver, /manifest\['index\.html'\]/);
  assert.match(driver, /servedHtml\.includes\(entry\.file\)/);
  assert.match(driver, /id="root"/);
  assert.match(driver, /location\.origin/);
});

test('cleanup confirms the browser identity and process exit', () => {
  assert.match(driver, /SIGKILL/);
  assert.match(driver, /process\.kill\([^)]*, 0\)/);
  assert.match(driver, /isVerificationChrome/);
  assert.match(driver, /no longer matches verification target/);
});

test('feature map points to the pages that own each control', () => {
  const filters = read('.claude/skills/verify/features/activity-filters.md');
  const summary = read('.claude/skills/verify/features/summary-page.md');
  const language = read('.claude/skills/verify/features/language-switching.md');
  assert.match(filters, /http:\/\/127\.0\.0\.1:4173\/summary/);
  assert.match(summary, /Home` \/ `首页/);
  assert.doesNotMatch(summary, /header logo/);
  assert.match(language, /http:\/\/127\.0\.0\.1:4173\/summary/);
});

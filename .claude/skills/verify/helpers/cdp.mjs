#!/usr/bin/env node
/**
 * Minimal Chrome DevTools Protocol driver for the verify skill.
 * Keeps state in one scratch dir so launch/doctor/drive/cleanup can be separate calls.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let CDP;
try {
  CDP = require('chrome-remote-interface');
} catch {
  throw new Error(
    'verification dependency missing: run pnpm install --frozen-lockfile'
  );
}

const command = process.argv[2];
const scratchRoot = process.env.VERIFY_SCRATCH || '/tmp/running-page-verify';
const root = process.env.VERIFY_PROJECT_ROOT || process.cwd();
const stateFile = join(scratchRoot, 'browser-state.json');
const profileDir = join(scratchRoot, 'chrome-profile');
const port = Number(process.env.VERIFY_CHROME_PORT || 9229);
const evidenceDir = join(scratchRoot, 'evidence');
const previewUrl = process.env.VERIFY_PREVIEW_URL || 'http://127.0.0.1:4173';
const output = {};

function readState() {
  if (!existsSync(stateFile))
    throw new Error('verification browser is not running; call launch first');
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

function writeState(state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function chromePath() {
  if (process.env.VERIFY_CHROME_PATH) return process.env.VERIFY_CHROME_PATH;
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return '/usr/bin/google-chrome';
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isVerificationChrome(state) {
  if (!state.targetId) return false;
  if (!processAlive(state.chromePid)) return true;
  try {
    const targets = await CDP.List({ port: state.port });
    return targets.some((target) => target.id === state.targetId);
  } catch {
    return false;
  }
}

async function waitForEndpoint(expectedToken) {
  for (let i = 0; i < 50; i += 1) {
    try {
      const targets = await CDP.List({ port });
      const page = targets.find(
        (target) =>
          target.type === 'page' &&
          target.url ===
            `file://${join(profileDir, 'verify-token.txt')}?${expectedToken}`
      );
      if (page) return targets;
    } catch {
      /* browser is still starting */
    }
    await delay(200);
  }
  throw new Error(
    `Chrome DevTools endpoint at port ${port} is already occupied or did not become ready`
  );
}

async function withPage(fn) {
  const state = readState();
  let client;
  try {
    client = await CDP({ port, target: state.targetId });
    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();
    return await fn({ client, Page, Runtime, state });
  } finally {
    if (client) await client.close();
  }
}

async function evaluate(Runtime, expression) {
  const result = await Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function launch() {
  if (existsSync(stateFile))
    throw new Error('verification browser already launched; run cleanup first');
  try {
    const occupied = await CDP.List({ port });
    if (occupied.length) {
      throw new Error(`debug port is already occupied: ${port}`);
    }
  } catch (error) {
    if (!/debug port is already occupied/.test(error.message)) {
      /* endpoint is free */
    } else {
      throw error;
    }
  }
  mkdirSync(scratchRoot, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  const launchToken = randomUUID();
  const tokenFile = join(profileDir, 'verify-token.txt');
  writeFileSync(tokenFile, launchToken);
  let chromePid;
  try {
    await new Promise((resolve, reject) => {
      const chrome = spawn(
        chromePath(),
        [
          '--headless=new',
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-background-networking',
          '--disable-sync',
          '--disable-extensions',
          '--disable-dev-shm-usage',
          '--window-size=1440,1000',
          `file://${tokenFile}?${launchToken}`,
        ],
        { detached: true, stdio: 'ignore' }
      );
      chromePid = chrome.pid;
      chrome.unref();
      chrome.once('error', reject);
      delay(250).then(resolve);
    });
    writeState({
      chromePid,
      port,
      startedAt: new Date().toISOString(),
    });
    const targets = await waitForEndpoint(launchToken);
    const page = targets.find(
      (target) =>
        target.type === 'page' &&
        target.url === `file://${tokenFile}?${launchToken}`
    );
    writeState({
      ...readState(),
      targetId: page.id,
      url: page.url,
      launchToken,
    });
    await withPage(async ({ Page }) => {
      await Page.navigate({ url: 'about:blank' });
    });
    output.ok = true;
    output.pid = chromePid;
    output.port = port;
  } catch (error) {
    if (chromePid) {
      try {
        process.kill(chromePid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    rmSync(stateFile, { force: true });
    rmSync(profileDir, { recursive: true, force: true });
    throw error;
  }
}

async function doctor() {
  const state = readState();
  if (state.port !== port)
    throw new Error(`debug port mismatch: state=${state.port} current=${port}`);
  const targets = await CDP.List({ port });
  const target = targets.find((t) => t.id === state.targetId);
  if (!target) throw new Error('verification tab is missing');
  await withPage(async ({ Page, Runtime }) => {
    const version = await CDP.Version({ port });
    const marker = await evaluate(Runtime, '1 + 1');
    if (marker !== 2) throw new Error('browser runtime check failed');
    if (!existsSync(join(root, 'dist', 'index.html'))) {
      throw new Error('built app is missing; run pnpm run build');
    }
    const previewHtml = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
    const manifestPath = join(root, 'dist', '.vite', 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error('build manifest is missing; run pnpm run build');
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const entry = manifest['index.html'];
    if (
      !entry ||
      !previewHtml.includes('id="root"') ||
      !previewHtml.includes(entry.file)
    ) {
      throw new Error(
        'dist/index.html does not match the current build manifest; run pnpm run build'
      );
    }
    const preview = await fetch(previewUrl, { cache: 'no-store' });
    if (!preview.ok)
      throw new Error(
        `preview app health check failed: HTTP ${preview.status}`
      );
    const servedHtml = await preview.text();
    if (!servedHtml.includes(entry.file)) {
      throw new Error(
        `preview endpoint does not serve the current build entry ${entry.file}; run pnpm run build and vite preview`
      );
    }
    await Page.navigate({ url: previewUrl });
    const app = await evaluate(
      Runtime,
      `new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        const root = document.querySelector('#root');
        if (location.origin === ${JSON.stringify(new URL(previewUrl).origin)} && root && root.childElementCount) resolve(true);
        else if (Date.now() - started > 20000) resolve(false);
        else setTimeout(check, 100);
      };
      check();
    })`
    );
    if (!app) throw new Error('built app did not render at the preview URL');
    output.ok = true;
    output.browser = version.Browser;
    output.protocol = version['Protocol-Version'];
    output.targetId = state.targetId;
    output.port = state.port;
    output.previewUrl = previewUrl;
  });
}

async function goto() {
  const url = process.argv[3];
  if (!url) throw new Error('goto requires a URL');
  await withPage(async ({ Page, Runtime }) => {
    await Page.navigate({ url });
    const rendered = await evaluate(
      Runtime,
      `new Promise(resolve => { const started = Date.now(); const check = () => { const root = document.querySelector('#root'); if (location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && root?.childElementCount) resolve(true); else if (Date.now() - started > 20000) resolve(false); else setTimeout(check, 100); }; check(); })`
    );
    const info = await evaluate(
      Runtime,
      `({url: location.href, title: document.title, rootChildren: document.querySelector('#root')?.childElementCount || 0})`
    );
    if (!rendered || !info.rootChildren)
      throw new Error(`app root did not render: ${JSON.stringify(info)}`);
    output.ok = true;
    Object.assign(output, info);
  });
}

async function driveHashActivity() {
  const activityId = process.argv[3] || '1795089548000';
  await withPage(async ({ Page, Runtime }) => {
    await Page.navigate({ url: `${previewUrl}/#run_${activityId}` });
    const rendered = await evaluate(
      Runtime,
      `new Promise(resolve => { const started = Date.now(); const check = () => { const text = document.body?.innerText || ''; if (location.hash === '#run_${activityId}' && text.includes('Cycling') && text.includes('Activity')) resolve(true); else if (Date.now() - started > 20000) resolve(false); else setTimeout(check, 100); }; check(); })`
    );
    const info = await evaluate(
      Runtime,
      `({url: location.href, hash: location.hash, text: document.body.innerText || ""})`
    );
    if (!rendered || info.hash !== `#run_${activityId}`)
      throw new Error(
        `single activity view did not render: ${JSON.stringify({ url: info.url, hash: info.hash })}`
      );
    const snapshotPath = join(evidenceDir, 'activity-detail.txt');
    const screenshotPath = join(evidenceDir, 'activity-detail.png');
    writeFileSync(snapshotPath, info.text);
    const shot = await Page.captureScreenshot({
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    output.ok = true;
    output.url = info.url;
    output.activityId = activityId;
    output.snapshot = snapshotPath;
    output.screenshot = screenshotPath;
    const gainMatch = info.text.match(/Elevation Gain \(m\)\n(\d+(?:,\d+)*)/);
    const lossMatch = info.text.match(/Elevation Loss \(m\)\n(\d+(?:,\d+)*)/);
    output.gainLine = gainMatch ? `Elevation Gain (m) ${gainMatch[1]}` : null;
    output.lossLine = lossMatch ? `Elevation Loss (m) ${lossMatch[1]}` : null;
    const activityMatch = info.text.match(/Cycling\n↑\n(\d+)m\n↓\n(\d+)m/);
    output.activityGain = activityMatch ? Number(activityMatch[1]) : null;
    output.activityLoss = activityMatch ? Number(activityMatch[2]) : null;
    if (!gainMatch) throw new Error(`wrong gain display: ${output.gainLine}`);
    if (output.activityGain !== 5 || output.activityLoss !== 9)
      throw new Error(
        `wrong single activity elevation: gain=${output.activityGain} loss=${output.activityLoss}`
      );
  });
}

async function cleanup() {
  if (!existsSync(stateFile)) {
    output.ok = true;
    output.removed = false;
    return;
  }
  const state = readState();
  if (!(await isVerificationChrome(state))) {
    throw new Error(
      `refusing cleanup: recorded Chrome process ${state.chromePid} no longer matches verification target ${state.targetId}`
    );
  }
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!processAlive(state.chromePid)) break;
    try {
      process.kill(state.chromePid, signal);
    } catch {
      /* already gone */
    }
    for (let i = 0; i < 20 && processAlive(state.chromePid); i += 1)
      await delay(100);
  }
  if (processAlive(state.chromePid)) {
    throw new Error(
      `verification Chrome process ${state.chromePid} did not exit`
    );
  }
  for (let i = 0; i < 10; i += 1) {
    try {
      rmSync(profileDir, { recursive: true, force: true });
      break;
    } catch {
      await delay(100);
    }
  }
  rmSync(stateFile, { force: true });
  output.ok = true;
  output.removed = true;
  output.pid = state.chromePid;
  output.exited = true;
}

const commands = {
  launch,
  doctor,
  goto,
  'drive-hash-activity': driveHashActivity,
  cleanup,
};
if (!commands[command]) throw new Error(`unknown command: ${command}`);
await commands[command]();
console.log(JSON.stringify(output, null, 2));

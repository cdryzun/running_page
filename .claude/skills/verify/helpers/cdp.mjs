#!/usr/bin/env node
/**
 * Minimal Chrome DevTools Protocol driver for the verify skill.
 * Keeps state in one scratch dir so launch/doctor/drive/cleanup can be separate calls.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const CDP = require('chrome-remote-interface');

const command = process.argv[2];
const scratchRoot = process.env.VERIFY_SCRATCH || '/tmp/running-page-verify';
const stateFile = join(scratchRoot, 'browser-state.json');
const profileDir = join(scratchRoot, 'chrome-profile');
const port = Number(process.env.VERIFY_CHROME_PORT || 9229);
const evidenceDir = join(scratchRoot, 'evidence');
const output = {};

function readState() {
  if (!existsSync(stateFile)) throw new Error('verification browser is not running; call launch first');
  return JSON.parse(readFileSync(stateFile, 'utf8'));
}

function writeState(state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

async function waitForEndpoint() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const targets = await CDP.List({ port });
      if (targets.some((t) => t.type === 'page')) return targets;
    } catch { /* browser is still starting */ }
    await delay(200);
  }
  throw new Error('Chrome DevTools endpoint did not become ready');
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
  const result = await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function launch() {
  if (existsSync(stateFile)) throw new Error('verification browser already launched; run cleanup first');
  mkdirSync(scratchRoot, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  const chrome = spawn('/usr/bin/google-chrome', [
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
    'about:blank',
  ], { detached: true, stdio: 'ignore' });
  writeState({ chromePid: chrome.pid, port, startedAt: new Date().toISOString() });
  try {
    const targets = await waitForEndpoint();
    const page = targets.find((t) => t.type === 'page');
    writeState({ ...readState(), targetId: page.id, url: page.url });
    output.ok = true;
    output.pid = chrome.pid;
    output.port = port;
  } catch (error) {
    process.kill(chrome.pid, 'SIGTERM');
    rmSync(scratchRoot, { recursive: true, force: true });
    throw error;
  }
}

async function doctor() {
  const state = readState();
  const targets = await CDP.List({ port });
  const target = targets.find((t) => t.id === state.targetId);
  if (!target) throw new Error('verification tab is missing');
  await withPage(async ({ Page, Runtime }) => {
    const version = await CDP.Version({ port });
    await Page.navigate({ url: 'about:blank' });
    const marker = await evaluate(Runtime, '1 + 1');
    if (marker !== 2) throw new Error('browser runtime check failed');
    output.ok = true;
    output.browser = version.Browser;
    output.protocol = version['Protocol-Version'];
    output.targetId = state.targetId;
    output.port = state.port;
  });
}

async function goto() {
  const url = process.argv[3];
  if (!url) throw new Error('goto requires a URL');
  await withPage(async ({ Page, Runtime }) => {
    await Page.navigate({ url });
    const rendered = await evaluate(Runtime, `new Promise(resolve => { const started = Date.now(); const check = () => { const root = document.querySelector('#root'); if (document.readyState === 'complete' && root?.childElementCount) resolve(true); else if (Date.now() - started > 20000) resolve(false); else setTimeout(check, 100); }; check(); })`);
    const info = await evaluate(Runtime, `({url: location.href, title: document.title, rootChildren: document.querySelector('#root')?.childElementCount || 0})`);
    if (!rendered || !info.rootChildren) throw new Error(`app root did not render: ${JSON.stringify(info)}`);
    output.ok = true;
    Object.assign(output, info);
  });
}

async function driveHashActivity() {
  const activityId = process.argv[3] || '1795089548000';
  await withPage(async ({ Page, Runtime }) => {
    await Page.navigate({ url: `http://127.0.0.1:4173/#run_${activityId}` });
    await evaluate(Runtime, `new Promise(resolve => { const started = Date.now(); const check = () => { const text = document.body?.innerText || ''; if (location.hash === '#run_${activityId}' && (text.includes('Individual') || text.includes('单次'))) resolve(true); else if (Date.now() - started > 20000) resolve(false); else setTimeout(check, 100); }; check(); })`);
    const state = { ready: true, text: await evaluate(Runtime, 'document.body.innerText || ""') };
    const snapshotPath = join(evidenceDir, 'activity-detail.txt');
    const screenshotPath = join(evidenceDir, 'activity-detail.png');
    writeFileSync(snapshotPath, state.text);
    const shot = await Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
    writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'));
    output.ok = true;
    output.activityId = activityId;
    output.snapshot = snapshotPath;
    output.screenshot = screenshotPath;
    const lines = state.text.split('\n').map((s) => s.trim()).filter(Boolean);
    const gainMatch = state.text.match(/Elevation Gain \(m\)\n(\d+(?:,\d+)*)/);
    output.gainLine = gainMatch ? `Elevation Gain (m) ${gainMatch[1]}` : null;
    const lossMatch = state.text.match(/Elevation Loss \(m\)\n(\d+(?:,\d+)*)/);
    output.lossLine = lossMatch ? `Elevation Loss (m) ${lossMatch[1]}` : null;
    const activityMatch = state.text.match(/Cycling\n↑\n(\d+)m\n↓\n(\d+)m/);
    output.activityGain = activityMatch ? Number(activityMatch[1]) : null;
    output.activityLoss = activityMatch ? Number(activityMatch[2]) : null;
    if (!gainMatch) throw new Error(`wrong gain display: ${output.gainLine}`);
    if (output.activityGain !== 5 || output.activityLoss !== 9) throw new Error(`wrong single activity elevation: gain=${output.activityGain} loss=${output.activityLoss}`);
  });
}

async function cleanup() {
  if (!existsSync(stateFile)) {
    output.ok = true;
    output.removed = false;
    return;
  }
  const state = readState();
  try { process.kill(state.chromePid, 'SIGTERM'); } catch { /* already gone */ }
  for (let i = 0; i < 20; i += 1) {
    try { process.kill(state.chromePid, 0); await delay(100); } catch { break; }
  }
  for (let i = 0; i < 10; i += 1) {
    try { rmSync(profileDir, { recursive: true, force: true }); break; } catch { await delay(100); }
  }
  rmSync(stateFile, { force: true });
  output.ok = true;
  output.removed = true;
  output.pid = state.chromePid;
}

const commands = { launch, doctor, goto, 'drive-hash-activity': driveHashActivity, cleanup };
if (!commands[command]) throw new Error(`unknown command: ${command}`);
await commands[command]();
console.log(JSON.stringify(output, null, 2));

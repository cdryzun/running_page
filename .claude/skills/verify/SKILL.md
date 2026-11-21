---
name: verify
description: Drive the yihong.run static web app in a real browser to verify routes, activity summaries, indoor run detail, and visibility controls. Use for end-to-end proof of user-facing changes.
---

# Verify yihong.run

Use this skill when a change must be proven through the real rendered app, not only through unit tests. The primary surface is the Vite-built React site at `/` (map and activity list) and `/summary` (yearly statistics). A single activity can be opened with the URL hash `#run_<id>`.

All commands below assume the repository root as the working directory. The driver keeps its own Chrome process in `/tmp/running-page-verify`. Never attach to or kill an unrelated browser.

## Launch

Dependencies and the static bundle must be prepared first:

```sh
pnpm install --frozen-lockfile
npm install --no-save --no-package-lock chrome-remote-interface@0.34.0
pnpm run build
```

`chrome-remote-interface` is a verification-only helper deliberately kept out of `package.json`; the helper script imports it directly.

Serve the built site on a dedicated port in the background and remember the PID:

```sh
pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort
```

Ready means `curl -fsS http://127.0.0.1:4173/` returns HTML containing `lang="en"`, `/assets/`, and `id="root"` (the root element may be written as `<div id="root"></div>`). A listening port alone is not enough.

Start the isolated headless browser:

```sh
node .claude/skills/verify/helpers/cdp.mjs launch
```

The command writes `/tmp/running-page-verify/browser-state.json` and exits; it returns the Chrome PID and debug port. Do not reuse a scratch directory with an existing state file: run cleanup first.

## Doctor

Run this before driving any feature and whenever a page looks wrong:

```sh
node .claude/skills/verify/helpers/cdp.mjs doctor
```

It requires the verification tab to exist, Chrome DevTools to answer on the recorded port, and a trivial JS evaluation to return `2`. If it fails, stop and fix or clean up the instance; do not drive another browser.

Confirm the app server separately:

```sh
curl -fsS http://127.0.0.1:4173/ | rg 'id="root"|/assets/'
```

## Drive

The driver opens pages through Chrome DevTools and captures the rendered text and screenshot after the React root and the expected content appear.

Open the activity list:

```sh
node .claude/skills/verify/helpers/cdp.mjs goto http://127.0.0.1:4173/
```

Open a single activity by hash:

```sh
node .claude/skills/verify/helpers/cdp.mjs drive-hash-activity 1795089548000
```

Use stable UI handles where available: language button names `Switch to Chinese` / `切换到英文`, sport filter `aria-label="Sport type"` / `运动类型`, and summary interval `aria-label="Summary interval"` / `统计周期`. Search text such as `Elevation Gain` or `总海拔爬升` only after the hash view has rendered.

Do not use internal React state setters or mutate `activities.json` during a proof. If a journey needs different data, rebuild from the intended fixture in a separate scratch checkout.

## Evidence

Proof artifacts are written to `/tmp/running-page-verify/evidence` and survive cleanup:

- `activity-detail.txt`: complete visible text after opening the hash route, including the page-level summary and the single activity row.
- `activity-detail.png`: screenshot of the rendered detail view.

A valid proof must show the user action (the URL/hash opened), the resulting state (visible text and screenshot), and any assertion the driver made (for example, the single activity row contains `↑ 5m` and `↓ 9m`). Page-level `Elevation Gain` is the career/period aggregate and is not the target ride's ascent; do not confuse the two. For map or theme changes, add a screenshot at the same route after the interaction; for language changes, capture both label states. Do not treat an HTTP 200 or a DOM node count alone as behavior proof.

The Mapbox token is embedded in the app, so map tile requests are external. Verify route rendering from DOM/canvas state when offline; do not report tile imagery as verified unless network responses were observed.

## Cleanup

Stop the browser created by this run and remove its isolated profile:

```sh
node .claude/skills/verify/helpers/cdp.mjs cleanup
```

Stop only the `vite preview` process started above. Do not kill by process name. Keep `/tmp/running-page-verify/evidence` intact; remove the whole scratch directory only when the evidence has been copied elsewhere.

## Features

See [features/README.md](./features/README.md) for the maintained feature map.

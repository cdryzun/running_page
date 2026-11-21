# Notes verification map

This directory is the maintained source for verifying the user-facing behavior of the yihong.run site. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Run all commands from the repository root.
- Build the site once from the checked-out data (`pnpm run build`) and serve it at `http://127.0.0.1:4173` with `vite preview --strictPort`.
- Start the dedicated headless browser through `helpers/cdp.mjs launch`; never use a personal browser profile.
- Run `helpers/cdp.mjs doctor` before every feature.
- Keep proof artifacts under `/tmp/running-page-verify/evidence`; cleanup must not delete them.

## Driving conventions

- Start each recipe from `about:blank` unless stated otherwise.
- Use visible labels and ARIA names when interacting; avoid coordinates and CSS positional selectors.
- Treat every command as literal. Keep quoted IDs and URLs unchanged.
- Report a failed precondition instead of weakening the path.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screenshot.
- Record the feature ID and entry point with every artifact.
- If a route or control is unreachable, include the attempted URL/selector and the observed page text.
- Do not report one entry point as proof of another.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with CDP helper`, and `Gotchas`.

## Features

- [Single activity view](./single-activity.md) covers the hash route, distance and elevation summary for a known indoor ride.
- [Activity filters](./activity-filters.md) covers sport type and summary interval controls on the main page.
- [Language switching](./language-switching.md) covers the header and in-list language controls.
- [Summary page](./summary-page.md) covers the `/summary` route and yearly statistics.

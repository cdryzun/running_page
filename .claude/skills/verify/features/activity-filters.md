# Activity filters

The main page lets a user restrict the activity list by sport type and choose a summary interval such as yearly, monthly, weekly, daily, or life.

## Sub-features

- `F1` Open the main activity page.
- `F2` Change the sport type using the `Sport type` / `运动类型` select.
- `F3` Change the summary interval using the `Summary interval` / `统计周期` select.

## How to get to it (user POV)

- Open `http://127.0.0.1:4173/`.
- Use the `Sport type` dropdown beside the activity heading.
- Use the `Summary interval` dropdown beside the activity heading.

## Driving it with CDP helper

Preconditions: server healthy, browser doctor passed.

- Navigate to the main page: `node .claude/skills/verify/helpers/cdp.mjs goto http://127.0.0.1:4173/`.
- Confirm the visible text contains `Individual` or `单次` and at least one activity row.
- Use a CDP script to query `select[aria-label="Sport type"]` and `select[aria-label="Summary interval"]`, read their option values, select a different value, and capture visible summary text after each change.
- Save the before/after text to evidence files under `/tmp/running-page-verify/evidence`; do not overwrite the single-activity proof.

## Gotchas

- Language affects accessible names. Switch language only in its own mapped feature and use the corresponding names afterward.
- The `life` interval disables non-`all` sport types. Treat that as expected state, not a failed interaction.
- Activity rows are virtualized; count from summary text instead of assuming all rows are in the DOM.

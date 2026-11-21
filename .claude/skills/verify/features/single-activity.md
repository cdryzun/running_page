# Single activity view

Opening a run hash displays one activity's route and summary, including the ascent and descent recorded for that ride.

## Sub-features

- `S1` Open a single activity using `#run_<id>`.
- `S2` Read the activity distance and elevation gain from the rendered summary.
- `S3` Capture a screenshot as stable UI evidence.

## How to get to it (user POV)

- Paste `http://127.0.0.1:4173/#run_1795089548000` into the browser address bar.
- Follow a shared link that already contains the same hash.
- On the main page, open an activity row that navigates to the same hash.

## Driving it with CDP helper

Preconditions: server healthy, browser doctor passed, built data contains run `1795089548000`.

- Open the hash route and wait for the summary: `node .claude/skills/verify/helpers/cdp.mjs drive-hash-activity 1795089548000`.
- Observe the command's `snapshot`, `screenshot`, `activityGain`, and `activityLoss`. The driver asserts that the single activity row contains `↑ 5m` and `↓ 9m`.
- Inspect `snapshot` for `Cycling 2026-11-19 13.40 km` and the matching activity row; inspect `screenshot` for the same rendered view.

## Gotchas

- The URL hash is the only deterministic single-activity entry point; row selection may depend on list virtualization.
- The page-level `Elevation Gain` header is a career/period total, not the selected ride. Use the activity row's `↑` value for this feature.
- A page that only shows the generic list has not applied the hash; rerun doctor and confirm the exact URL before reporting failure.

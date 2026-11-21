# Summary page

The `/summary` route shows aggregate yearly and career statistics, including total distance and elevation metrics derived from the same activity data.

## Sub-features

- `SU1` Open the summary page directly.
- `SU2` Read the aggregate distance and elevation summary from rendered text.
- `SU3` Navigate back to the main activity page through the `Home` / `首页` button in the filter bar.

## How to get to it (user POV)

- Paste `http://127.0.0.1:4173/summary` into the address bar.
- Follow a site navigation link whose URL points to `/summary`.
- Use the `Home` / `首页` button in the filter bar to return to the main activity page; the site logo leads outside the local verification instance.

## Driving it with CDP helper

Preconditions: server healthy, browser doctor passed.

- Navigate to the summary page: `node .claude/skills/verify/helpers/cdp.mjs goto http://127.0.0.1:4173/summary`.
- Confirm the page title or visible text identifies the summary view and capture the text with distance/year labels.
- If elevation metrics are visible, record the exact label and value; do not infer them from source JSON.
- Click the filter-bar button named `Home` / `首页` and wait for URL `http://127.0.0.1:4173/`, then confirm the activity list text is visible.

## Gotchas

- The summary route uses a browser router with base path `/`; opening the built files from disk will not work.
- Some elevation metrics are hidden by configuration. Report a missing metric as a configuration/precondition issue, not as a calculation failure.
- Verify the current route from `location.href`; a `vite preview` fallback can serve HTML for unknown paths.

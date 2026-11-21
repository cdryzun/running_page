# Language switching

The language toggle changes the site between English and Simplified Chinese and persists the choice for subsequent loads.

## Sub-features

- `L1` Switch from English to Chinese using the header control.
- `L2` Switch from Chinese back to English using the in-list control.
- `L3` Confirm the selected language survives a reload.

## How to get to it (user POV)

- Open `http://127.0.0.1:4173/` and click the `中` button labelled `Switch to Chinese` in the header.
- On the Chinese page, open `http://127.0.0.1:4173/summary` and click the `EN` button labelled `切换到英文` in the summary filter bar.
- Reload the page and read the labels again.

## Driving it with CDP helper

Preconditions: server healthy, browser doctor passed, browser profile starts with no persisted `language` key.

- Navigate to the main page: `node .claude/skills/verify/helpers/cdp.mjs goto http://127.0.0.1:4173/`.
- Use a CDP script to click the button with accessible name `Switch to Chinese`, wait for reload, then capture visible text and confirm the `切换到英文` button is present.
- Navigate to the summary page: `node .claude/skills/verify/helpers/cdp.mjs goto http://127.0.0.1:4173/summary`.
- Click the button with accessible name `切换到英文`, wait for reload, then capture visible text and the `Sport type` / `Summary interval` labels.
- Reload `http://127.0.0.1:4173/summary` and verify the English labels remain.

## Gotchas

- The toggle calls `window.location.reload()` after writing `localStorage.language`; treat a navigation as success only if the new labels appear.
- This is the only feature that intentionally mutates browser storage. Run it in the dedicated verification profile and restore/cleanup that profile afterward.
- `IS_CHINESE` is computed at module load; a manual `localStorage` change without reload will not update labels.

# YMU Gala 2026 Manager

Single-page event management app for the YMU 13th Fundraising Gala (April 25, 2026). Vanilla JS, Firebase Firestore, no build tools.

## Tech Stack
Vanilla JS / HTML / CSS, Firebase Firestore (real-time), Fabric.js (venue map), SheetJS (Excel export), GitHub Pages hosting

## Structure
- `index.html` — all 7 pages as `<div class="page">` sections toggled by `switchPage()`
- `js/app.js` (~3700 lines) — all application logic in one file
- `css/styles.css` (~3800 lines) — all styles
- `js/config.js` — Firebase config (gitignored)
- `scripts/` — Python migration scripts (destructive — they clear collections)

## Commands
```
git push origin main          # Deploy (GitHub Pages auto-deploys)
open index.html               # Local dev (no build step)
cd scripts && python migrate_data.py  # Re-import data from Excel (destructive)
```

## Pages
Dashboard, Vendors, Budget, Timeline (run-of-show), Input Lists (audio/tech), Staff

## Key Patterns

**State & rendering:** Global `state` object → Firestore `onSnapshot` listeners via `setupCollectionListener()` → render callbacks rebuild HTML with `innerHTML`. No virtual DOM.

**Generic CRUD:** `openModal(config)` and `handleFormSubmit(e, config)` use a `fieldMap` dict (HTML element ID → Firestore field name). Checkboxes auto-detected via `element.type === 'checkbox'` and use `.checked` not `.value`.

**Window exports required:** Any function called from `onclick`/`onchange` in dynamically generated HTML **must** be on `window` (e.g., `window.myFunc = myFunc`). Forgetting this = silent failure.

**Budget inline editing:** Double-click rows via `makeBudgetRowEditable()`. Cells need `data-field` and `data-original` attributes — the generic handler picks them up.

**Timeline dual-field:** Completion sets both `completed: true` and `status: 'complete'` (legacy). Reads check both: `item.completed === true || item.status === 'complete'`.

## Dates and time zones

- Dates are Eastern time (America/New_York, `APP_TZ` in `js/dates.js`). Always use the helpers in `js/dates.js` (loaded before `app.js`): `todayET()` for today, `formatDateOnly()` / `parseDateOnly()` for a stored `YYYY-MM-DD`, and pass `timeZone: APP_TZ` when formatting a timestamp.
- Never use raw `Date` for calendar dates: no `toISOString().split('T')[0]` (UTC — tomorrow after 8 PM EDT), no `new Date('YYYY-MM-DD')` (UTC midnight — the previous day), no `toLocaleDateString` without `timeZone`.
- Servers stay on UTC; don't set `TZ`.
- `npm run check:dates` (also `npm run lint`) enforces this; tests: `npm test` (runs with `TZ=UTC`). A genuine exception needs a `dates-ok: <reason>` comment.

## Firestore Collections
budget, timeline, mainStageInputs, cocktailStageInputs, staff

## Repo Note
Git repo is `gala-management/`. Parent dir (`Gala Manager App/`) has source Excel spreadsheets for data migration only.

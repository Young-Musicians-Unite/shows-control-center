# Technical Cue Sheet — Design

**Date:** 2026-04-24
**Status:** Approved (pending user review of this spec)
**Author:** Zach (with Claude)

## Purpose

Add a new page, **Technical Cue Sheet**, that gives the production tech team
(audio, lighting, video, screens) a focused working view of the Saturday show
from 6:20 PM onward. The page renders the same Firestore docs as the existing
Timeline page — additional tech-specific columns are stored on the same
documents so edits sync bidirectionally with no copy logic.

The structure mirrors the first tab of
`source-data/13th Gala Run of Show 2026.xlsx` ("26 Zach"), which is the format
the tech crew already works in.

## Inclusion rule

A timeline row appears on the cue sheet when **all** of these are true:

- `item.day === 'Saturday'`
- `item.time >= '18:20'` (string comparison works because times are zero-padded
  `HH:MM`)
- `item.hiddenFromCueSheet !== true`

When the "Show hidden" toggle is on, the third clause is dropped and hidden rows
render in a muted style with an "Unhide" action.

No manual opt-in is required: any new Saturday row added on the timeline page
that meets the time cutoff appears here automatically. There is no "add row"
button on the cue sheet — rows originate from the timeline.

## Data model

One Firestore document per moment, in the existing `timeline` collection. The
cue sheet adds new fields directly to those documents:

| Field                | Type    | Notes                                        |
|----------------------|---------|----------------------------------------------|
| `audio`              | string  | Multiline allowed (textarea editor)          |
| `liveVideo`          | string  | Multiline allowed                            |
| `lighting`           | string  | Multiline allowed (e.g. "Stage: Blackout\nHouse Lights: medium") |
| `centerScreen`       | string  | Single line                                  |
| `sideScreens`        | string  | Single line                                  |
| `nameOfFile`         | string  | Single line                                  |
| `hiddenFromCueSheet` | boolean | Default false; true means row is hidden from the cue sheet but remains on the timeline |

Synced fields (read/written by both pages):

| Cue sheet column | Timeline field |
|------------------|----------------|
| TIME             | `time`         |
| DURATION         | `duration`     |
| ACTIVITY         | `event`        |
| CUE              | `screenCue`    |

No Firestore migration is required. Missing fields render as empty cells; they
are populated on first write per row.

## Page structure

A new `<div class="page" id="technical-cue-sheet-page">` is added to
`index.html`, registered in `switchPage()`, and a new nav-tab entry is added
immediately after Timeline.

### Header controls

- **"Show hidden (N)" toggle** — N is the count of currently-hidden Saturday
  rows ≥ 18:20. When on, hidden rows render in muted style with an "Unhide"
  button.
- **Print button** — triggers the dedicated print layout (see "Print layout"
  below).

### Table columns

Left to right:

| Column        | Source field                  | Editor               | Width  |
|---------------|-------------------------------|----------------------|--------|
| TIME          | synced `time`                 | inline text (HH:MM)  | narrow |
| DURATION      | synced `duration`             | inline text          | narrow |
| ACTIVITY      | synced `event`                | inline text          | medium |
| AUDIO         | new `audio`                   | inline textarea      | medium |
| LIVE VIDEO    | new `liveVideo`               | inline textarea      | medium |
| LIGHTING      | new `lighting`                | inline textarea      | medium |
| CENTER SCREEN | new `centerScreen`            | inline text          | narrow |
| SIDE SCREENS  | new `sideScreens`             | inline text          | narrow |
| CUE           | synced `screenCue`            | inline text          | narrow |
| NAME OF FILE  | new `nameOfFile`              | inline text          | medium |
| ⋯ (actions)   | —                             | "Hide" / "Unhide"    | tiny   |

Sort: by `time` ascending, same as the timeline.

## Editing behavior

Edits use the same inline-cell pattern as the existing timeline page:

- Click a cell → it becomes an `<input>` (or `<textarea>` for multiline cols).
- Blur or Enter commits via `updateDoc` on the `timeline/<id>` document.
- `state.timelineEditingRowId` is set during the edit so an incoming Firestore
  snapshot does not blow away the in-progress edit (existing pattern in
  `js/app.js`).
- Multi-line cells (`audio`, `liveVideo`, `lighting`) preserve newlines via
  `white-space: pre-wrap` in the rendered cell.

Because edits write to the same Firestore document the timeline page renders,
synced-field edits (TIME / DURATION / ACTIVITY / CUE) update the timeline view
in real time and vice versa.

### Hide / unhide

- Clicking "Hide" on a row calls
  `updateDoc(timeline/<id>, { hiddenFromCueSheet: true })`. The row vanishes
  from the cue sheet but is unchanged on the timeline page.
- "Unhide" (visible only when "Show hidden" is on) sets the field back to
  `false`.

## Print layout

A dedicated print stylesheet, scoped so it activates only when the cue sheet is
the visible page (e.g., via a `body.printing-cue-sheet` class set just before
`window.print()` and removed on `afterprint`).

Rules:

- `@page { size: landscape; }`
- Hide nav, page tabs, action column, "Show hidden" toggle, hidden rows, and
  page-header buttons.
- Compact typography (~9–10 pt body, tighter line-height, sans-serif).
- Repeat the table header on every printed page
  (`thead { display: table-header-group; }`).
- Avoid mid-row page breaks (`tr { page-break-inside: avoid; }`).
- Header strip on page 1 only:
  "YMU Gala 2026 — Technical Cue Sheet — Saturday April 25, 2026" with a small
  "printed YYYY-MM-DD HH:MM" timestamp.
- Multi-line cells preserve newlines via `white-space: pre-wrap`.

## File impact

No new files. Changes are confined to:

- **`index.html`** — new page section + nav-tab entry.
- **`js/app.js`** — additions:
  - `state.cueSheetShowHidden = false`
  - `renderCueSheet()` — filter, sort, render
  - `editCueCell(td)` — inline-edit wrapper recognizing the new field names
    (with textarea for multiline cols)
  - `hideCueRow(id)` / `unhideCueRow(id)` — toggle `hiddenFromCueSheet`
  - Wire `setupCollectionListener('timeline', …)` callback list to also call
    `renderCueSheet`
  - `switchPage()` case for `'technical-cue-sheet'`
  - `window.editCueCell`, `window.hideCueRow`, `window.unhideCueRow` exports
    (per CLAUDE.md window-export rule)
- **`css/styles.css`** — additions:
  - `.cue-sheet-table` styles (mirroring `.timeline-table` patterns)
  - Muted-row style for hidden rows under "Show hidden"
  - `@media print` block scoped to the cue sheet page

No new dependencies. Vanilla JS / HTML / CSS, consistent with the existing app.

## Out of scope (v1)

- Mobile card view. The page falls back to horizontal scroll on narrow screens
  (matches existing timeline behavior). Tech crew uses laptops/printouts.
- Excel export. Can be added later via SheetJS following the pattern used by
  other pages, if requested.
- "Add row" button on the cue sheet. New moments are created on the timeline
  page; if Saturday ≥ 18:20, they appear automatically here.
- Audit log of who edited which cue. Edits sync immediately like every other
  field in the app.

## Testing

- After scaffolding, serve locally with `python3 -m http.server` and confirm:
  - Saturday timeline rows ≥ 18:20 appear on the cue sheet automatically.
  - Editing AUDIO / LIGHTING / etc. on the cue sheet persists to Firestore.
  - Editing TIME on the cue sheet updates the timeline page in real time.
  - "Hide" removes a row from the cue sheet; the same row remains on the
    timeline.
  - "Show hidden" toggle reveals hidden rows with an "Unhide" button; counter
    matches.
  - Print preview (`window.print()`) renders landscape, no nav, header repeats,
    multi-line cells preserve newlines.
- Visual verification with Playwright MCP per global conventions; screenshots
  saved to `.playwright-screenshots/` and deleted after verification.

# Staff Print Redesign — Design Spec

**Date:** 2026-04-21
**Scope:** Staff page print flow (both Team View and Schedule toggles)
**Status:** Design approved, ready for implementation plan

## Problem

The Print button on the Staff page (`index.html:509`) currently calls `window.print()` directly. This goes through the global `@media print` rules in `css/styles.css:1977+`, which:

- Strip colored backgrounds (no `-webkit-print-color-adjust: exact`), so the color-coded Schedule (gantt) bars print as blank rectangles.
- Hide day tabs, search bars, and buttons.
- Were not designed for the staff page specifically.

Result: the printed output looks nothing like the on-screen views, and the full list (~100 staff) prints as one unwieldy block with no way to scope it to a subset.

## Goal

Replace the current Staff print with a clean, printable reference table that:

1. Resembles the Excel export (`exportStaffToExcel` at `app.js:5975`) but with a nicer, print-optimized layout.
2. Lets the user choose which teams to include before the document is generated.
3. Is independent of whichever view toggle (Team / Schedule) is currently active.

## Non-goals

- Preserving the Schedule (gantt) view's visual bars in print.
- Changing the Excel export.
- Changing the Team View or Schedule View rendering on-screen.
- Touching existing `@media print` rules.

## User flow

1. User clicks the Print button (`#print-staff-btn`) on the Staff page.
2. A modal appears listing every team found across `state.staff`, alphabetically, each with a checkbox (all checked by default), a small team-color swatch, and a staff count. `Select All` / `Deselect All` bulk actions are present.
3. User unchecks teams they don't want, clicks `Print`.
4. A new browser window opens containing a self-contained HTML document with one page per selected team, and immediately triggers `window.print()` on load.

## Approach

Pattern already used by `printSetLists` (`app.js:10255+`): modal gathers selection, then `generateSetListPrintWindow` opens a new window with its own HTML and inline CSS. This isolates the print layout from the app's global print rules and mobile breakpoints, and gives reliable color rendering.

## Dialog

**Location:** new `#print-staff-teams-modal` placed in `index.html` near `#print-copies-modal` (currently at line 1605).

**Structure:**
- Header: "Print Staff List — Select Teams"
- Hint: "Choose which teams to include. Each team prints on its own page."
- Bulk actions row: `Select All`, `Deselect All`.
- Scrollable checkbox list `#print-staff-teams-list`:
  - One row per unique team (derived from `state.staff`, including `Unassigned` for anyone with an empty `teams` array).
  - Row contents: checkbox, team-color swatch (12px circle using `getTeamColor(team)`), team name, `(N staff)` count.
- Form actions: `Cancel`, `Print` (primary).

**Defaults:** every team checked on every open. State is not remembered across opens.

**Styling:** reuses `.modal`, `.modal-content`, `.form-actions`, etc. Minor new classes (`.staff-team-row`, `.staff-team-swatch`) may be added to `css/styles.css` alongside the existing `.copies-row` rules, or inline — implementation decision during coding.

## Print document

**Paper:** letter, landscape, 0.4in margins. One team per page via `page-break-after: always`.

**Each team section:**

- **Banner** at top of page:
  - Background = `getTeamColor(team)`, white text, rendered with `-webkit-print-color-adjust: exact; print-color-adjust: exact;`.
  - Team name in ~32pt uppercase bold.
  - Subheader: `N staff · YMU Gala 2026` in smaller, lighter weight.
- **Table** below the banner (zebra-striped, thin borders):

| Column       | Width (approx) | Source                                                    |
| ------------ | -------------- | --------------------------------------------------------- |
| Name         | 1.5"           | `member.name`                                             |
| Role         | 1.8"           | `member.role`                                             |
| Other Teams  | 1.5"           | `member.teams` minus current section's team, joined `", "` |
| Thursday     | 1.3"           | `member.schedule.thursday` or `"—"`                        |
| Friday       | 1.3"           | `member.schedule.friday` or `"—"`                          |
| Saturday     | 1.3"           | `member.schedule.saturday` or `"—"`                        |
| Sunday       | 1.3"           | `member.schedule.sunday` or `"—"`                          |

- **Footer:** small centered caption `Page X of Y · Printed YYYY-MM-DD` (generated from the window opening date).

**No Placeholder column.** Placeholders render identically to real staff and sort in their natural alphabetical position.

## Data pipeline

Input: `state.staff` (in-memory Firestore-synced array) and the set of team names checked in the dialog.

1. **Expand by team.** For each member, for each `team` in `member.teams` (or `['Unassigned']` if empty), emit a row `{team, member}`.
2. **Filter** to rows whose `team` is in the selected set.
3. **Group** by team.
4. **Sort team groups** alphabetically by team name (`localeCompare`, case-insensitive).
5. **Sort rows within each team** alphabetically by `member.name` (`localeCompare`, case-insensitive).
6. **Skip empty teams** — if a selected team has zero members after filtering, don't emit a page for it.

Schedule cell text is the raw `member.schedule[day]` string (same strings the Excel export uses), or `—` when missing/empty.

## Code changes

### `index.html`
- Add `#print-staff-teams-modal` markup near line 1605.

### `js/app.js`
- Replace `printStaffBtn` click handler at line 2353-2355 with a call to `openPrintStaffTeamsModal()`.
- Add new functions, grouped near the existing set-list print code (~line 10255):
  - `openPrintStaffTeamsModal()` — computes unique teams from `state.staff` (sorted alphabetically), renders checkbox rows into `#print-staff-teams-list`, shows modal. Stores the list of teams in `_pendingPrintStaffTeams` for later use.
  - `closePrintStaffTeamsModal()` — hides modal, clears `_pendingPrintStaffTeams`.
  - `setAllPrintStaffTeams(checked)` — bulk toggle for checkboxes.
  - `confirmPrintStaffTeams()` — reads checked teams, closes modal, calls `generateStaffPrintWindow(selectedTeams)`. If zero teams are checked, shows toast `"Select at least one team to print"` and does not proceed.
  - `generateStaffPrintWindow(selectedTeams)` — runs the data pipeline, builds the HTML document as a template string, opens a new window with `window.open('', '_blank')`, writes the HTML, closes the document. The document's inline `<script>` fires `window.print()` on load. If the window handle is falsy, shows toast `"Please allow popups to print staff list"` (matches `generateSetListPrintWindow`).
- Add `window.openPrintStaffTeamsModal`, `window.closePrintStaffTeamsModal`, `window.setAllPrintStaffTeams`, `window.confirmPrintStaffTeams` exports so they're callable from inline `onclick` handlers (per the project pattern documented in `CLAUDE.md`).

### `css/styles.css`
- No changes to existing `@media print` rules.
- Optional small additions for the dialog's team-color swatch / row, alongside `.copies-row` rules.

## Edge cases

| Case                                 | Behavior                                               |
| ------------------------------------ | ------------------------------------------------------ |
| Zero teams checked                   | Toast error, don't open print window.                  |
| Popup blocked                        | Toast error, matching set-list print pattern.          |
| Staff member with no `schedule` obj  | All four day cells render `—`.                         |
| Staff member with empty `teams`      | Grouped under `Unassigned` section.                    |
| Team selected but has zero staff     | Skip silently — don't emit a blank page.               |
| Member on N teams, all N checked     | Appears on N pages (once per team).                    |
| Member on N teams, some unchecked    | Appears only on the checked teams' pages.              |

## Success criteria

- Printing the Staff page from either view toggle shows the team-selection dialog first.
- Generated PDF/paper output shows one team per page with a colored banner that prints in color (not blank).
- Table is readable at landscape letter size with full schedule text visible.
- Staff appear under every team they belong to when that team is selected.
- Alphabetical ordering is correct for both teams and names within teams.
- The Excel export still produces the same columns it does today (unchanged).

## Out of scope (future work)

- Print preview within the app before opening the window.
- Per-day filtering (e.g. "only show Saturday").
- Custom column selection.
- Remembering checkbox state between prints.

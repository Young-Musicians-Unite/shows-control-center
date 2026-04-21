# Timeline Screen Cue Column — Design Spec

**Date:** 2026-04-21
**Scope:** Timeline tab — new column, picker toggle, filter button

## Problem

The Timeline needs a place to record a Screen Cue number for each item (a cue trigger for on-screen video/graphics). The number has to be visible at a glance in the run-of-show, must be filterable so operators can see only items that have a cue, and must be toggleable like every other column.

## Requirements

1. **New column** in the Timeline table named `Screen Cue #` — numeric values 0–999, entered as a plain number.
2. **Column-picker toggle** to show/hide the column, mirroring existing toggles.
3. **New filter button** in the Timeline filter bar that shows only items whose Screen Cue field is non-blank. Joins the existing radio-style filter group (replacing whichever filter was active).

## Data

- New Firestore field on timeline docs: `screenCue` (string, optional).
- No migration. Existing docs read the field as `undefined`, which renders as blank.
- Stored as a string of digits (e.g., `"17"`), clamped to 3 digits, non-digits stripped on save. Empty string or missing = "no cue".

## UI changes

### Table column
- Position: between `Staff` and `Set List` (between existing `staff-col` and `setlist-col`).
- Header: `Screen Cue #`. Cell class: `screencue-col`. Cell has `data-field="screenCue"` and uses the existing inline text editor (`editTimelineCell`).
- Render: `escapeHtml(item.screenCue || '')`.
- Width: ~90px.

### Column picker
- New entry in `#columns-dropdown`:
  `<label class="col-toggle"><input type="checkbox" checked onchange="toggleTimelineCol('screencue', this.checked)"> Screen Cue</label>`
- New CSS rule: `.timeline-table.hide-screencue .screencue-col { display: none; }`.

### Filter button
- New button in `.timeline-filters`, placed between `Run of Show` and `Andi`:
  `<button class="filter-btn" data-filter="screencue" onclick="setTimelineFilter('screencue')">Screen Cue</button>`
- New filter branch in `renderTimeline`:
  `else if (state.timelineFilter === 'screencue') { filteredTimeline = filteredTimeline.filter(i => i.screenCue && String(i.screenCue).trim() !== ''); }`
- Extend `filterLabels` with `'screencue': ' — Screen Cue'`.

### Item modal
- New field in `#timeline-modal`, alongside Responsible/Staff row:
  `<label for="timeline-screen-cue">Screen Cue #</label>
   <input type="number" id="timeline-screen-cue" min="0" max="999" placeholder="e.g. 17">`
- Add `'timeline-screen-cue': 'screenCue'` to both `fieldMap`s (in `openTimelineModal` and `handleTimelineSubmit`).

### Inline-edit sanitization
- In `saveSingleCell`: when `field === 'screenCue'`, strip non-digits and truncate to 3 chars before saving (`newValue = newValue.replace(/\D/g, '').slice(0, 3)`).
- Phantom-row path: same sanitization when committing the new row.

## Non-changes

- Print CSS: Screen Cue column stays visible when printing the timeline (like Event/Responsible/Staff/Time/Duration). No hide rule in `body.printing-timeline`.
- Mobile card view: no change this round — Screen Cue is a low-information field that doesn't warrant mobile card real estate.
- Excel export: not updated this round (separate concern; user can ask later).

## Success criteria

- User can type a 1–3 digit number into the new column cell and it persists.
- Non-digits are stripped silently.
- Column toggle hides/shows the column live.
- Clicking the `Screen Cue` filter button collapses the table to only rows with a cue and updates the day title with ` — Screen Cue`.
- Clicking `All` or another filter button deactivates the Screen Cue filter.

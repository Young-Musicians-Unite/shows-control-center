# Technical Cue Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Technical Cue Sheet" page that gives the production tech team a focused working view of the Saturday show from 6:20 PM, with cue columns (audio, lighting, video, screens, etc.) stored on the same Firestore docs as the existing Timeline so edits sync bidirectionally.

**Architecture:** Same `timeline` Firestore collection — no new collection. New fields (`audio`, `liveVideo`, `lighting`, `centerScreen`, `sideScreens`, `nameOfFile`, `hiddenFromCueSheet`) are added directly to existing timeline documents and ignored by the timeline page. The new cue sheet page renders these docs filtered by `day === 'Saturday' && time >= '18:20' && !hiddenFromCueSheet`. Inline cell editing mirrors the existing timeline pattern.

**Tech Stack:** Vanilla JS / HTML / CSS, Firebase Firestore (`firebase.firestore.compat`), no build step. Visual verification with Playwright MCP. Project served locally with `python3 -m http.server`.

**File Structure (decisions locked here):**
- `index.html` — add one new `<a class="nav-link">` (in the Production nav-dropdown after Timeline) and one new `<div class="page" id="technical-cue-sheet-page">` section. No other HTML files.
- `js/app.js` — add a single new region with: `state.cueSheetShowHidden`, `CUE_SHEET_FIELD_ORDER`, `renderCueSheet`, `editCueCell`, `saveCueSheetCell`, `restoreCueCellDisplay`, `hideCueRow`, `unhideCueRow`, `toggleCueSheetShowHidden`. Plus three small wiring edits (switchPage case, two existing `setupCollectionListener` calls extended with `renderCueSheet`, and a `print-cue-sheet-btn` listener inside `setupExportAndPrint`). All new region code goes in one block, ideally near the existing Timeline render code (around js/app.js:1820), so a future reader finds related code together.
- `css/styles.css` — append a new region with `.cue-sheet-table` styles (mirroring `.timeline-table` patterns) and a `body.printing-cue-sheet` print-scoped block (mirroring the existing `body.printing-timeline` block at css/styles.css:2192–2380).

**Note on TDD:** This codebase has no JS test runner. "Test" steps are manual browser verification with Playwright MCP, per the project CLAUDE.md and global conventions.

**Local server convention:** Per global conventions, before starting `python3 -m http.server`, check `lsof -i :8000` and reuse if already running.

**Spec:** `docs/superpowers/specs/2026-04-24-technical-cue-sheet-design.md`

---

## Task 1: Add nav-link and empty page section

**Files:**
- Modify: `index.html` (add nav-link after timeline at index.html:38–40; add new page section after the timeline page, after index.html:471)

- [ ] **Step 1: Add the nav-link entry**

In `index.html`, find the timeline nav-link block (currently at lines 37–40):
```html
                        <a href="#timeline" class="nav-link" data-page="timeline">
                            <svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="5" x2="17" y2="5"/><line x1="1" y1="9" x2="13" y2="9"/><line x1="1" y1="13" x2="15" y2="13"/><circle cx="17" cy="9" r="0.5" fill="currentColor"/><circle cx="15" cy="13" r="0.5" fill="currentColor"/></svg>
                            <span class="nav-label">Timeline</span>
                        </a>
```

Immediately after that closing `</a>`, insert:
```html
                        <a href="#technical-cue-sheet" class="nav-link" data-page="technical-cue-sheet">
                            <svg class="nav-icon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="14" height="14" rx="1.5"/><line x1="2" y1="6" x2="16" y2="6"/><line x1="6" y1="2" x2="6" y2="16"/><circle cx="11" cy="10" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/></svg>
                            <span class="nav-label">Technical Cue Sheet</span>
                        </a>
```

- [ ] **Step 2: Add the empty page section**

In `index.html`, find the closing of the Timeline page section. The Timeline page ends at line 471 with `        </div>` followed by the comment `<!-- Input Lists Page -->` at line 473. Immediately before the `<!-- Input Lists Page -->` comment, insert:

```html
        <!-- Technical Cue Sheet Page -->
        <div id="technical-cue-sheet" class="page">
            <div class="page-header">
                <h1>Technical Cue Sheet</h1>
                <div class="header-actions">
                    <label class="cue-show-hidden-toggle">
                        <input type="checkbox" id="cue-show-hidden-checkbox" onchange="toggleCueSheetShowHidden(this.checked)">
                        <span>Show hidden (<span id="cue-hidden-count">0</span>)</span>
                    </label>
                    <button class="btn btn-icon" id="print-cue-sheet-btn" title="Print">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    </button>
                </div>
            </div>

            <div class="card cue-sheet-card">
                <div class="card-header cue-sheet-card-header">
                    <div class="cue-sheet-header-left">
                        <h2>Saturday — Technical Cue Sheet</h2>
                        <span class="cue-sheet-date">April 25, 2026 · from 6:20 PM</span>
                    </div>
                </div>
                <div class="table-container">
                    <table class="data-table cue-sheet-table" id="cue-sheet-table">
                        <thead>
                            <tr>
                                <th class="cs-time-col">Time</th>
                                <th class="cs-duration-col">Duration</th>
                                <th class="cs-activity-col">Activity</th>
                                <th class="cs-audio-col">Audio</th>
                                <th class="cs-live-video-col">Live Video</th>
                                <th class="cs-lighting-col">Lighting</th>
                                <th class="cs-center-screen-col">Center Screen</th>
                                <th class="cs-side-screens-col">Side Screens</th>
                                <th class="cs-cue-col">Cue</th>
                                <th class="cs-file-col">Name of File</th>
                                <th class="cs-actions-col no-print">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="cue-sheet-tbody">
                            <tr>
                                <td colspan="11" class="empty-state">No Saturday timeline rows ≥ 6:20 PM yet.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

```

- [ ] **Step 3: Verify navigation works**

Start (or reuse) the local server: `lsof -i :8000 || (cd "/Users/zachlarmer/Desktop/Claude Projects/Gala Manager App/gala-management" && python3 -m http.server 8000 &)`.

Then with Playwright MCP: navigate to `http://localhost:8000`, find and click the "Technical Cue Sheet" nav-link, screenshot to `.playwright-screenshots/task1-empty-page.png`. Expected: page header reads "Technical Cue Sheet", "Show hidden (0)" checkbox is visible, table shows headers Time/Duration/Activity/Audio/Live Video/Lighting/Center Screen/Side Screens/Cue/Name of File/Actions, body shows "No Saturday timeline rows ≥ 6:20 PM yet."

Delete the screenshot when done verifying.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Scaffold Technical Cue Sheet page nav + empty table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add base CSS for the cue-sheet table

**Files:**
- Modify: `css/styles.css` (append a new region near the end of the file, before the print-scoped block at css/styles.css:2182)

- [ ] **Step 1: Append cue-sheet table styles**

In `css/styles.css`, immediately before the `/* ===== Print-scoped rules ===== */` comment block at line 2182, insert:

```css
/* =============================================================================
   Technical Cue Sheet — table layout
   ============================================================================= */

.cue-sheet-card .cue-sheet-card-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
}

.cue-sheet-card-header .cue-sheet-date {
    color: #6b7280;
    font-size: 0.85rem;
}

.cue-show-hidden-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: #374151;
    user-select: none;
    cursor: pointer;
}

.cue-show-hidden-toggle input {
    margin: 0;
}

.cue-sheet-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
}

.cue-sheet-table th,
.cue-sheet-table td {
    padding: 6px 8px;
    vertical-align: top;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.85rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
    cursor: pointer;
}

.cue-sheet-table th {
    cursor: default;
    background: #f9fafb;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
}

.cue-sheet-table .cs-time-col { width: 70px; white-space: nowrap; font-weight: 600; }
.cue-sheet-table .cs-duration-col { width: 70px; white-space: nowrap; }
.cue-sheet-table .cs-activity-col { width: 14%; }
.cue-sheet-table .cs-audio-col { width: 11%; }
.cue-sheet-table .cs-live-video-col { width: 11%; }
.cue-sheet-table .cs-lighting-col { width: 12%; }
.cue-sheet-table .cs-center-screen-col { width: 9%; }
.cue-sheet-table .cs-side-screens-col { width: 9%; }
.cue-sheet-table .cs-cue-col { width: 8%; }
.cue-sheet-table .cs-file-col { width: 11%; }
.cue-sheet-table .cs-actions-col { width: 56px; cursor: default; }

.cue-sheet-table td.cs-cell-multiline {
    white-space: pre-wrap;
}

.cue-sheet-table tr.cs-hidden-row td {
    color: #9ca3af;
    background: #f3f4f6;
    font-style: italic;
}

.cue-sheet-table .cs-action-btn {
    background: none;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.75rem;
    cursor: pointer;
    color: #374151;
}

.cue-sheet-table .cs-action-btn:hover {
    background: #f3f4f6;
}

.cue-sheet-table .cs-cell-empty {
    color: #c9cdd3;
    font-style: italic;
}

.cue-sheet-table .inline-edit-input,
.cue-sheet-table .inline-edit-textarea {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    padding: 2px 4px;
    border: 1px solid #2563eb;
    border-radius: 3px;
    background: #fff;
    outline: none;
}

.cue-sheet-table .inline-edit-textarea {
    min-height: 3.6em;
    resize: vertical;
    white-space: pre-wrap;
}
```

- [ ] **Step 2: Verify styles load**

Reload `http://localhost:8000` in Playwright MCP, navigate to Technical Cue Sheet, screenshot to `.playwright-screenshots/task2-styled-empty.png`. Expected: table headers have grey background `#f9fafb`, fixed widths visible (Time narrow, Activity wider). "Show hidden" checkbox is inline-aligned with Print button.

Delete the screenshot when done.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "Add base styles for Technical Cue Sheet table

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Implement renderCueSheet (filtered, read-only display)

**Files:**
- Modify: `js/app.js` (append renderCueSheet and supporting state into the file; suggested location: immediately after the `renderTimeline` function which ends around js/app.js:1995; also add to the existing `state` object at the top, around js/app.js:17–80)

- [ ] **Step 1: Add cue-sheet state fields**

In `js/app.js`, find the `state` object declaration (around js/app.js:17). Locate the line `timelineRenderPending: false,` (around js/app.js:76). Immediately after that line, add:

```javascript
    cueSheetEditingRowId: null,
    cueSheetRenderPending: false,
    cueSheetShowHidden: false,
```

- [ ] **Step 2: Add CUE_SHEET_FIELD_ORDER constant**

In `js/app.js`, find the line `const TIMELINE_FIELD_ORDER = ['time', 'duration', 'event', 'responsible', 'staff', 'screenCue'];` (around js/app.js:3138). Immediately after it (or right next to it), add:

```javascript
const CUE_SHEET_FIELD_ORDER = ['time', 'duration', 'event', 'audio', 'liveVideo', 'lighting', 'centerScreen', 'sideScreens', 'screenCue', 'nameOfFile'];
const CUE_SHEET_MULTILINE_FIELDS = new Set(['audio', 'liveVideo', 'lighting']);
```

- [ ] **Step 3: Add renderCueSheet function**

In `js/app.js`, find the end of `renderTimeline` (the `}` closing the function around js/app.js:2070 — search for the line right before `function setupTimelineEventHandlers(`). Immediately after that closing `}` of `renderTimeline`, insert:

```javascript
// Technical Cue Sheet — same Firestore docs as timeline, filtered to Saturday >= 18:20.
// Tech-only fields (audio/liveVideo/lighting/centerScreen/sideScreens/nameOfFile)
// live on the same timeline document and are ignored by the timeline view.
function renderCueSheet() {
    const tbody = document.getElementById('cue-sheet-tbody');
    if (!tbody) return;

    if (state.cueSheetEditingRowId) {
        state.cueSheetRenderPending = true;
        return;
    }

    const all = state.timeline.filter(item =>
        item.day === 'Saturday' &&
        typeof item.time === 'string' &&
        item.time >= '18:20'
    );

    const hiddenCount = all.filter(item => item.hiddenFromCueSheet === true).length;
    const countEl = document.getElementById('cue-hidden-count');
    if (countEl) countEl.textContent = hiddenCount;

    const visible = state.cueSheetShowHidden
        ? all
        : all.filter(item => item.hiddenFromCueSheet !== true);

    const sorted = [...visible].sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No Saturday timeline rows ≥ 6:20 PM yet.</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(item => renderCueSheetRow(item)).join('');
}

function renderCueSheetRow(item) {
    const isHidden = item.hiddenFromCueSheet === true;
    const rowClass = isHidden ? 'cs-row cs-hidden-row' : 'cs-row';

    const cell = (field, colClass, opts = {}) => {
        const raw = item[field];
        const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);
        const multilineClass = isMultiline ? ' cs-cell-multiline' : '';
        let display;
        if (field === 'time') {
            display = `<span class="tl-time">${formatTime12Hour(raw)}</span>`;
        } else if (raw === undefined || raw === null || raw === '') {
            display = '<span class="cs-cell-empty">—</span>';
        } else {
            display = escapeHtml(String(raw));
        }
        return `<td class="${colClass}${multilineClass}" data-field="${field}" data-original="${escapeHtml(raw == null ? '' : String(raw))}" onclick="editCueCell(this)">${display}</td>`;
    };

    const actionBtn = isHidden
        ? `<button class="cs-action-btn" onclick="unhideCueRow('${item.id}')" title="Unhide">Unhide</button>`
        : `<button class="cs-action-btn" onclick="hideCueRow('${item.id}')" title="Hide from cue sheet">Hide</button>`;

    return `
        <tr class="${rowClass}" data-id="${item.id}">
            ${cell('time', 'cs-time-col')}
            ${cell('duration', 'cs-duration-col')}
            ${cell('event', 'cs-activity-col')}
            ${cell('audio', 'cs-audio-col')}
            ${cell('liveVideo', 'cs-live-video-col')}
            ${cell('lighting', 'cs-lighting-col')}
            ${cell('centerScreen', 'cs-center-screen-col')}
            ${cell('sideScreens', 'cs-side-screens-col')}
            ${cell('screenCue', 'cs-cue-col')}
            ${cell('nameOfFile', 'cs-file-col')}
            <td class="cs-actions-col no-print">${actionBtn}</td>
        </tr>
    `;
}
```

- [ ] **Step 4: Wire renderCueSheet into the timeline collection listener**

In `js/app.js`, find the line `setupCollectionListener('timeline', 'timeline', [renderTimeline, updateDashboard]);` (currently at js/app.js:633). Replace it with:

```javascript
    setupCollectionListener('timeline', 'timeline', [renderTimeline, renderCueSheet, updateDashboard]);
```

- [ ] **Step 5: Wire renderCueSheet into switchPage**

In `js/app.js`, find the `switchPage` function. Locate the existing `if (pageName === 'timeline') { ... }` block at js/app.js:496–504. Immediately after that block's closing `}`, insert:

```javascript
        if (pageName === 'technical-cue-sheet') {
            state.cueSheetEditingRowId = null;
            state.cueSheetRenderPending = false;
            const showHiddenCheckbox = document.getElementById('cue-show-hidden-checkbox');
            if (showHiddenCheckbox) showHiddenCheckbox.checked = state.cueSheetShowHidden;
            renderCueSheet();
        }
```

- [ ] **Step 6: Verify rows appear**

Reload `http://localhost:8000` in Playwright MCP. Navigate to Timeline → switch to Saturday tab and confirm there are entries at 18:20 or later (look for "Doors Open, Cocktail Hour Begins" at 6:20 PM). Then navigate to Technical Cue Sheet. Screenshot to `.playwright-screenshots/task3-rows.png`. Expected: each Saturday timeline row at or after 18:20 appears with its time, duration, activity. The new tech columns show "—" placeholders. Each row has a "Hide" button at the right.

Delete the screenshot when done.

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "Render Saturday timeline rows ≥ 6:20 PM on cue sheet (read-only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Implement Hide / Show hidden / Unhide

**Files:**
- Modify: `js/app.js` (append to the cue-sheet region added in Task 3)

- [ ] **Step 1: Add hideCueRow / unhideCueRow / toggleCueSheetShowHidden**

In `js/app.js`, immediately after the `renderCueSheetRow` function added in Task 3, append:

```javascript
window.hideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: true,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error hiding cue row:', error);
        showToast('Error hiding row', 'error');
    }
};

window.unhideCueRow = async (id) => {
    try {
        await collections.timeline.doc(id).update({
            hiddenFromCueSheet: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error unhiding cue row:', error);
        showToast('Error unhiding row', 'error');
    }
};

window.toggleCueSheetShowHidden = (checked) => {
    state.cueSheetShowHidden = !!checked;
    renderCueSheet();
};
```

- [ ] **Step 2: Verify hide hides, "Show hidden" reveals, unhide restores**

In Playwright MCP: navigate to Technical Cue Sheet. Pick a row (e.g., one with activity "Salad Served" or any food-related row not relevant to tech). Click its "Hide" button. Screenshot to `.playwright-screenshots/task4a-hidden.png`. Expected: the row disappears, "Show hidden" counter ticks up by 1.

Now check the "Show hidden" checkbox. Screenshot to `.playwright-screenshots/task4b-show-hidden.png`. Expected: the hidden row reappears in muted grey italic with an "Unhide" button. Click "Unhide" — screenshot to `.playwright-screenshots/task4c-unhidden.png`. Expected: row returns to normal style, counter back to 0.

Then navigate to the Timeline page → Saturday tab and confirm the same row is still present and untouched there (hide affected the cue sheet only).

Delete the screenshots when done.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Hide/unhide rows on cue sheet without deleting from timeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Inline cell editing (single-line + multiline)

**Files:**
- Modify: `js/app.js` (append cue-sheet edit functions; suggested location: alongside `editTimelineCell` at js/app.js:3142, or in the cue-sheet region — pick one and stay consistent)

- [ ] **Step 1: Add editCueCell / saveCueSheetCell / restoreCueCellDisplay**

In `js/app.js`, append (placement: just below `clearTimelineEditingFlag` which ends around js/app.js:3381, so all inline-edit logic stays together):

```javascript
// Cue Sheet inline cell editing — parallel to editTimelineCell but supports
// textarea for multiline tech fields (audio/liveVideo/lighting) and uses the
// cue-sheet's own field order for Tab navigation. Writes to the same timeline
// Firestore doc so edits sync to the timeline page.
function clearCueSheetEditingFlag() {
    state.cueSheetEditingRowId = null;
    if (state.cueSheetRenderPending) {
        state.cueSheetRenderPending = false;
        renderCueSheet();
    }
}

function editCueCell(cell) {
    if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) return;

    const row = cell.closest('tr');
    const field = cell.dataset.field;
    if (!field || !row || !row.dataset.id) return;

    state.cueSheetEditingRowId = row.dataset.id;
    row.classList.add('editing');

    const original = cell.dataset.original || '';
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    if (!isMultiline) input.type = 'text';
    input.value = original;
    input.className = isMultiline ? 'inline-edit-textarea' : 'inline-edit-input';
    input.dataset.field = field;

    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    if (!isMultiline) input.select();

    input.addEventListener('keydown', (e) => handleCueCellKeydown(e, cell, row));

    input.addEventListener('blur', () => {
        setTimeout(() => {
            const activeEl = document.activeElement;
            if (row.contains(activeEl) && (activeEl.classList.contains('inline-edit-input') || activeEl.classList.contains('inline-edit-textarea'))) return;
            if (cell.querySelector('.inline-edit-input, .inline-edit-textarea')) {
                saveCueSheetCell(cell, row);
            }
        }, 50);
    });
}
window.editCueCell = editCueCell;

function handleCueCellKeydown(e, cell, row) {
    const field = cell.dataset.field;
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    const isMultiline = CUE_SHEET_MULTILINE_FIELDS.has(field);

    if (e.key === 'Enter' && isMultiline && !e.metaKey && !e.ctrlKey) {
        // Allow newlines in textarea; only commit on Cmd/Ctrl+Enter
        return;
    }
    if (e.key === 'Tab') {
        e.preventDefault();
        const direction = e.shiftKey ? -1 : 1;
        saveCueSheetCell(cell, row, true);
        navigateCueAdjacent(row, field, direction);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        saveCueSheetCell(cell, row, true);
        navigateCueNextRow(row, field);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        restoreCueCellDisplay(cell);
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }
}

function saveCueSheetCell(cell, row, keepEditing = false) {
    const input = cell.querySelector('.inline-edit-input, .inline-edit-textarea');
    if (!input) return;

    const field = cell.dataset.field;
    const id = row.dataset.id;
    let newValue = input.value;
    if (!CUE_SHEET_MULTILINE_FIELDS.has(field)) newValue = newValue.trim();

    const item = state.timeline.find(i => i.id === id);
    const oldValue = item ? (item[field] == null ? '' : String(item[field])) : '';

    if (field === 'time' && newValue) newValue = convertTo24Hour(newValue);
    if (field === 'duration' && newValue) newValue = formatDuration(newValue);
    if (field === 'screenCue') newValue = normalizeScreenCue(newValue);

    cell.dataset.original = newValue;
    restoreCueCellDisplay(cell);

    if (!keepEditing && !row.querySelector('.inline-edit-input, .inline-edit-textarea')) {
        row.classList.remove('editing');
        clearCueSheetEditingFlag();
    }

    if (!item) return;
    if (newValue === oldValue) return;

    item[field] = newValue;

    const updates = { [field]: newValue, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    collections.timeline.doc(id).update(updates).catch(err => {
        console.error('Error saving cue cell:', err);
        if (item) item[field] = oldValue;
        cell.dataset.original = oldValue;
        restoreCueCellDisplay(cell);
        showToast('Error saving', 'error');
    });
}

function restoreCueCellDisplay(cell) {
    const field = cell.dataset.field;
    const value = cell.dataset.original || '';
    if (field === 'time') {
        cell.innerHTML = `<span class="tl-time">${formatTime12Hour(value)}</span>`;
    } else if (value === '') {
        cell.innerHTML = '<span class="cs-cell-empty">—</span>';
    } else {
        cell.textContent = value;
    }
}

function navigateCueAdjacent(row, currentField, direction) {
    const idx = CUE_SHEET_FIELD_ORDER.indexOf(currentField);
    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < CUE_SHEET_FIELD_ORDER.length) {
        const nextField = CUE_SHEET_FIELD_ORDER[nextIdx];
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextCell = liveRow.querySelector(`td[data-field="${nextField}"]`);
        if (nextCell) editCueCell(nextCell);
    } else if (direction > 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const nextRow = liveRow.nextElementSibling;
        if (nextRow && nextRow.querySelector('td[data-field]')) {
            const firstField = CUE_SHEET_FIELD_ORDER[0];
            const nextCell = nextRow.querySelector(`td[data-field="${firstField}"]`);
            if (nextCell) editCueCell(nextCell);
        }
    } else if (direction < 0) {
        const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
        const prevRow = liveRow.previousElementSibling;
        if (prevRow && prevRow.querySelector('td[data-field]')) {
            const lastField = CUE_SHEET_FIELD_ORDER[CUE_SHEET_FIELD_ORDER.length - 1];
            const prevCell = prevRow.querySelector(`td[data-field="${lastField}"]`);
            if (prevCell) editCueCell(prevCell);
        }
    }
}

function navigateCueNextRow(row, field) {
    const liveRow = document.querySelector(`#cue-sheet-tbody tr[data-id="${row.dataset.id}"]`) || row;
    const nextRow = liveRow.nextElementSibling;
    if (nextRow && nextRow.querySelector('td[data-field]')) {
        const nextCell = nextRow.querySelector(`td[data-field="${field}"]`);
        if (nextCell) editCueCell(nextCell);
    }
}
```

- [ ] **Step 2: Verify single-line edit (audio cell)**

In Playwright MCP: navigate to Technical Cue Sheet, click the AUDIO cell on the first row. Expected: a textarea appears (audio is multiline). Type "Playlist" then click outside. Screenshot to `.playwright-screenshots/task5a-audio-edit.png`. Expected: cell now shows "Playlist". Reload the page and confirm "Playlist" persists (Firestore round-trip).

- [ ] **Step 3: Verify multiline edit (lighting cell)**

Click the LIGHTING cell on the same row. Type `Stage: Blackout` then press Enter (should add a newline, NOT commit), then type `House Lights: medium`. Click outside. Screenshot to `.playwright-screenshots/task5b-lighting-edit.png`. Expected: cell shows two lines, the second below the first.

- [ ] **Step 4: Verify synced field edit propagates to Timeline**

Click the ACTIVITY cell on the same row. Replace its text with the same text + " (TEST)" appended. Press Enter. Switch to Timeline page → Saturday tab. Find the same row. Screenshot to `.playwright-screenshots/task5c-sync.png`. Expected: the activity name on the timeline includes " (TEST)". Then revert: click the cell on either page, remove " (TEST)", save. Confirm the change is gone on both pages.

Delete all screenshots when done.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "Inline cell editing on cue sheet, with multiline + bidirectional sync

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Print layout (landscape, repeating header, hidden chrome)

**Files:**
- Modify: `index.html` (no change — Print button already added in Task 1)
- Modify: `js/app.js` (one block in setupExportAndPrint at js/app.js:2957)
- Modify: `css/styles.css` (append a new `body.printing-cue-sheet` block alongside the existing print-scoped rules at css/styles.css:2192)

- [ ] **Step 1: Add a cue-sheet-specific print helper and wire the button**

We can't reuse `printWithScope` directly because the cue sheet needs landscape orientation, and CSS `@page` does NOT support body-class scoping (so `body.printing-cue-sheet @page { ... }` is invalid and a global `@page { size: landscape; }` would force every other print — including the existing Timeline print — into landscape too). Instead, dynamically inject a `<style>` element containing the `@page` rule for the duration of the print only.

In `js/app.js`, immediately above the existing `printWithScope` function definition (which is at js/app.js:2946), insert:

```javascript
function printCueSheet() {
    let pageStyle = document.getElementById('cue-sheet-page-rule');
    if (!pageStyle) {
        pageStyle = document.createElement('style');
        pageStyle.id = 'cue-sheet-page-rule';
        pageStyle.textContent = '@page { size: landscape; }';
        document.head.appendChild(pageStyle);
    }
    document.body.classList.add('printing-cue-sheet');
    requestAnimationFrame(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('printing-cue-sheet');
            const el = document.getElementById('cue-sheet-page-rule');
            if (el) el.remove();
        }, 500);
    });
}
window.printCueSheet = printCueSheet;
```

Then in `setupExportAndPrint` (around js/app.js:2957), after the existing `if (printTimelineBtn) { ... }` block (around js/app.js:2963–2965), insert:

```javascript
    const printCueSheetBtn = document.getElementById('print-cue-sheet-btn');
    if (printCueSheetBtn) {
        printCueSheetBtn.addEventListener('click', printCueSheet);
    }
```

- [ ] **Step 2: Add print-scoped CSS for the cue sheet**

In `css/styles.css`, scroll to the end of the existing print-scoped block (the timeline+stage-inputs rules end around css/styles.css:2380). Immediately after that block (after the `body.printing-timeline .timeline-card { ... }` rule), append:

```css
/* ---------- Technical Cue Sheet: landscape print ---------- */
/* NOTE: The `@page { size: landscape; }` rule is injected dynamically by
   `printCueSheet()` in js/app.js (and removed after print) to avoid forcing
   landscape on every other print in the app. Do NOT add `@page` here. */

body.printing-cue-sheet .navbar,
body.printing-cue-sheet .no-print,
body.printing-cue-sheet .page-header .header-actions,
body.printing-cue-sheet .cue-show-hidden-toggle {
    display: none !important;
}

body.printing-cue-sheet *,
body.printing-cue-sheet .cs-row {
    animation: none !important;
    transition: none !important;
    opacity: 1 !important;
    transform: none !important;
}

body.printing-cue-sheet { background: #fff !important; }

body.printing-cue-sheet .container {
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
    background: #fff !important;
}

body.printing-cue-sheet .page:not(.active) { display: none !important; }
body.printing-cue-sheet #technical-cue-sheet.page.active { display: block !important; }

body.printing-cue-sheet .card,
body.printing-cue-sheet .table-container,
body.printing-cue-sheet .cue-sheet-card,
body.printing-cue-sheet .cue-sheet-card .table-container {
    display: block !important;
    overflow: visible !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
}

body.printing-cue-sheet .cue-sheet-card-header {
    padding: 0 0 0.2rem 0 !important;
    border: none !important;
    background: none !important;
    display: block !important;
}
body.printing-cue-sheet .cue-sheet-card-header h2 {
    font-size: 12pt !important;
    font-weight: 700 !important;
    margin: 0 !important;
    color: #000 !important;
}
body.printing-cue-sheet .cue-sheet-card-header .cue-sheet-date {
    font-size: 9pt !important;
    color: #000 !important;
    font-weight: 400 !important;
    margin-left: 0.5rem;
}

/* Hide rows that are marked hidden, even if "Show hidden" was on */
body.printing-cue-sheet .cue-sheet-table tr.cs-hidden-row { display: none !important; }

/* Hide the Actions column entirely */
body.printing-cue-sheet .cue-sheet-table .cs-actions-col { display: none !important; }

body.printing-cue-sheet .cue-sheet-table {
    width: 100% !important;
    table-layout: auto !important;
    border-collapse: collapse !important;
    background: #fff !important;
}
body.printing-cue-sheet .cue-sheet-table thead {
    background: #fff !important;
    display: table-header-group !important;
}
body.printing-cue-sheet .cue-sheet-table th {
    background: #fff !important;
    color: #000 !important;
    font-weight: 700 !important;
    text-align: left !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
}
body.printing-cue-sheet .cue-sheet-table th,
body.printing-cue-sheet .cue-sheet-table td {
    padding: 3px 6px !important;
    font-size: 9pt !important;
    line-height: 1.25 !important;
    border: 1px solid #333 !important;
    background: #fff !important;
    color: #000 !important;
    vertical-align: top !important;
}
body.printing-cue-sheet .cue-sheet-table tr {
    background: #fff !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
}
body.printing-cue-sheet .cue-sheet-table .cs-time-col { white-space: nowrap !important; font-weight: 700 !important; }
body.printing-cue-sheet .cue-sheet-table .cs-duration-col { white-space: nowrap !important; }
body.printing-cue-sheet .cue-sheet-table .cs-cell-multiline { white-space: pre-wrap !important; }
body.printing-cue-sheet .cue-sheet-table .cs-cell-empty { color: #fff !important; } /* hide '—' placeholders in print */
body.printing-cue-sheet .cue-sheet-table .tl-time { color: #000 !important; font-weight: 700 !important; }
```

- [ ] **Step 3: Verify print preview**

In Playwright MCP: navigate to Technical Cue Sheet (with at least one row of cues populated from earlier tasks). Click the Print button. Capture a PDF (`mcp__plugin_playwright_playwright__browser_take_screenshot` is fine for visual; or use the Playwright `page.pdf()` if available). Save to `.playwright-screenshots/task6-print.png`. Expected:
- Landscape orientation
- No nav bar, no Print/Show-hidden buttons
- Header reads "Saturday — Technical Cue Sheet  April 25, 2026 · from 6:20 PM"
- Table has a black border, repeated header on each printed page if the content overflows
- Multi-line cells (lighting, audio) show their newlines preserved
- The "—" empty placeholders are not visually present (rendered white)

Delete the screenshot when done.

- [ ] **Step 4: Commit**

```bash
git add js/app.js css/styles.css
git commit -m "Dedicated landscape print layout for Technical Cue Sheet

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full happy-path scenario**

In Playwright MCP, with the local server still running on `http://localhost:8000`:

1. Hard-reload the page (clear any cached state).
2. Navigate to **Technical Cue Sheet**. Confirm the page renders the expected Saturday rows ≥ 18:20.
3. Pick three rows: edit AUDIO on row A, LIGHTING on row B (with a newline), CENTER SCREEN on row C. Confirm each saves on blur and reload-survives.
4. On a 4th row, click Hide. Confirm it disappears and the counter reads 1.
5. Toggle "Show hidden". Confirm the hidden row reappears in muted style with Unhide. Click Unhide. Confirm row returns.
6. Edit TIME on a row from the cue sheet (e.g., bump 18:20 to 18:21). Switch to Timeline → Saturday and confirm the same row shows the new time. Revert.
7. From Timeline → Saturday, edit ACTIVITY on a Saturday-evening row. Switch to Cue Sheet. Confirm the new activity is there.
8. Click Print. Confirm the print preview is landscape and chrome-free.

If any step fails, fix it before declaring the plan complete. Common gotchas:
- `window.editCueCell`, `window.hideCueRow`, `window.unhideCueRow`, `window.toggleCueSheetShowHidden` must be exported (per CLAUDE.md window-export rule). If a click does nothing, check the console for `editCueCell is not defined` or similar.
- If editing a synced field on the cue sheet doesn't show up on the timeline, confirm Step 4 of Task 3 was applied (the listener wiring).
- If the cue sheet doesn't refresh on initial page load, confirm Step 5 of Task 3 was applied (the switchPage case).

- [ ] **Step 2: Tear down dev server (if you started it)**

If you started a fresh `python3 -m http.server 8000` in Task 1, kill it: `pkill -f "http.server 8000"`. (Skip if the server was already running from a prior session.)

- [ ] **Step 3: Final commit (if any cleanup edits were made)**

If any small fixes were made during end-to-end verification, commit them:
```bash
git add -p   # review changes
git commit -m "Fix Technical Cue Sheet end-to-end verification issues

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no fixes were needed, no commit is required.

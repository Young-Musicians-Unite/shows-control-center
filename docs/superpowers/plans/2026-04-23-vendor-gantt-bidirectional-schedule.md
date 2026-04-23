# Vendor Schedule: Gantt View + Bidirectional Linked-Pair Sync

> **Note:** This codebase has no automated test suite (vanilla JS, GitHub Pages, per CLAUDE.md). "Tests" in this plan are **manual browser verifications** — load `index.html` on localhost, drive the feature, eyeball the result. That's the project's convention.

**Goal:** Add a gantt chart underneath the existing Vendor Schedule table (additive), and make linked-pair day cells editable from the vendor side with changes syncing bidirectionally to the staff record.

**Architecture:**
- **Gantt placement**: below the table on the same Schedule view — user wants both visible at once, no sub-toggle. Gantt has its own Thu/Fri/Sat/Sun day tab row.
- **Gantt reuse**: reuse parser helpers `parseStaffTime`, `parseStaffScheduleRange`, `formatScheduleShort`, and `getTeamColor` as-is. Write a parallel `renderVendorGantt` instead of factoring out a shared render function (the staff gantt's team/placeholder collapsing is not relevant to vendors).
- **Bidirectional sync — Option B (staff-authoritative)**: vendor-side edits on linked rows write to the **linked staff doc**, not the budget doc. Every existing consumer already reads `linked.schedule` for linked rows, so no read paths change. Staff-side edits unchanged. Commit 4d48229's single-source-of-truth invariant stays intact.

**Tech Stack:** Vanilla JS, Firebase Firestore dotted-path updates, direct DOM via `innerHTML`.

---

## Option B — rationale and consumer audit

Every read path that touches schedule data:

| Consumer | File:Line | Current behavior | Post-change |
|---|---|---|---|
| `buildCheckInPeople` vendor loop | `js/app.js:~11680` | Skips `linkedStaffId` rows entirely; staff loop pushes staff.schedule | unchanged |
| `renderVendorSchedule` day cells | `js/app.js:~960, ~998` | `linked ? linked.schedule : item.schedule` | unchanged |
| `renderVendorSchedule` needs-schedule filter | `js/app.js:~960` | Same as above | unchanged |
| Cards `summarizeVendorSchedule(item.schedule)` | `js/app.js:~869` | **Reads `item.schedule` — stale for linked pairs** | Fix: pass `linked ? linked.schedule : item.schedule` |
| Staff gantt `member.schedule[day]` | `js/app.js:~4622` | Reads staff doc directly | unchanged |
| Staff team card schedule chips | `js/app.js:~4461` | Reads staff doc directly | unchanged |
| Vendor modal hidden `budget-schedule-section` | `js/app.js:~2039` | Hidden when linked; shows `summarizeLinkedSchedule(ls.schedule)` | unchanged |

One pre-existing bug surfaces: `summarizeVendorSchedule` at the card view reads `item.schedule` even on linked rows. That's out of scope for the user's current ask but noted; I'll fix it in passing since the linked-staff is readily available there.

Write paths:

| Writer | Action | Post-change |
|---|---|---|
| `handleBudgetSubmit` | Already skips schedule write when `newLinkedStaffId` set | unchanged |
| `handleStaffSubmit` | Writes `schedule` object to staff doc | unchanged (no mirror needed) |
| `saveVendorScheduleCell` (schedule table) | Writes `collections.budget.doc(id).update({ 'schedule.{day}': v })` | **Change: if row is linked, write to `collections.staff.doc(linkedStaffId).update({ 'schedule.{day}': v })` instead** |

Link-removal edge case: when a staff member is deleted, `deleteStaff` clears `linkedStaffId` on the budget doc (js/app.js:~4895). The budget's `schedule` is whatever was last written via the unlinked path — likely empty or long-stale. This behavior is unchanged by our plan. Documented but not fixed.

---

## File Structure

- **Modify** `index.html` — add `#vendor-gantt-section` with day tabs and container below `#vendor-schedule-container` inside `#vendor-schedule-view`
- **Modify** `js/app.js`:
  - State: add `vendorGanttDay`, reset in `switchPage('vendors')`
  - New functions: `renderVendorGantt`, `setVendorGanttDay`
  - Edit `renderVendorSchedule` to call `renderVendorGantt()` at the end, change linked-row rendering so cells are clickable
  - Edit `saveVendorScheduleCell` to redirect writes on linked rows to the staff doc
  - Edit badge copy: `"managed on staff entry"` → `"also on staff tab"`
  - Fix pre-existing `summarizeVendorSchedule` call site in `renderVendorCards` to use `linked.schedule` when linked
  - Add `setupCollectionListener('staff', ...)` already re-renders vendors (line 575) — no listener wiring changes
- **Modify** `css/styles.css` — add `.vendor-gantt-*` rules that mirror `.staff-gantt-*`; mirror `.staff-day-tab` for `.vendor-gantt-day-tab`

---

## Task 1: Add vendorGanttDay state + reset on page switch

**Files:** Modify `js/app.js`

- [ ] **Step 1.1** — Add `vendorGanttDay: 'saturday'` to the state object, next to `vendorScheduleFilter`.
- [ ] **Step 1.2** — In `switchPage('vendors')`, add `state.vendorGanttDay = 'saturday';` next to the `vendorScheduleFilter = 'all'` reset.
- [ ] **Step 1.3** — Commit nothing yet (bundled at Task 6 commit).

## Task 2: HTML — add gantt section inside #vendor-schedule-view

**Files:** Modify `index.html`

Current `#vendor-schedule-view` block (search for `vendor-schedule-container`): insert a gantt section **after** the existing `<div id="vendor-schedule-container"></div>`.

- [ ] **Step 2.1** — Add this markup inside `#vendor-schedule-view`, immediately after `<div id="vendor-schedule-container"></div>`:

```html
<div id="vendor-gantt-section" style="margin-top: 2rem;">
    <h2 class="vendor-gantt-heading">Schedule Gantt</h2>
    <div class="vendor-gantt-day-tabs">
        <button class="vendor-gantt-day-tab" data-day="thursday" onclick="setVendorGanttDay('thursday')">Thu</button>
        <button class="vendor-gantt-day-tab" data-day="friday" onclick="setVendorGanttDay('friday')">Fri</button>
        <button class="vendor-gantt-day-tab active" data-day="saturday" onclick="setVendorGanttDay('saturday')">Sat</button>
        <button class="vendor-gantt-day-tab" data-day="sunday" onclick="setVendorGanttDay('sunday')">Sun</button>
    </div>
    <div id="vendor-gantt-container"></div>
</div>
```

## Task 3: CSS — mirror staff-gantt classes under vendor- prefix

**Files:** Modify `css/styles.css`

Staff gantt uses classes `.staff-gantt-time-axis`, `.staff-gantt-time-label`, `.staff-gantt-team`, `.staff-gantt-team-header`, `.staff-gantt-row`, `.staff-gantt-name`, `.staff-gantt-bar-area`, `.staff-gantt-bar`, plus `.staff-day-tab`. Do the equivalent for vendor-prefixed classes — either extend the selectors or add dedicated rules. Extending the selector lists is DRY-er.

- [ ] **Step 3.1** — Find `.staff-gantt-time-axis` (grep in `css/styles.css`). For each `.staff-gantt-*` selector, append the matching `.vendor-gantt-*` selector to the selector list. Do the same for `.staff-day-tab` → add `.vendor-gantt-day-tab`.
- [ ] **Step 3.2** — Add a small `.vendor-gantt-heading` rule:

```css
.vendor-gantt-heading {
    font-family: 'Cormorant Garamond', Georgia, serif;
    color: #1a3a35;
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0 0 0.75rem 0;
}

.vendor-gantt-day-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
}
```

## Task 4: setVendorGanttDay + renderVendorGantt

**Files:** Modify `js/app.js`

Insert these functions immediately after `toggleVendorOffSite` (which lives just before `setupVendorFilters`).

- [ ] **Step 4.1** — Add `setVendorGanttDay`:

```js
function setVendorGanttDay(day) {
    state.vendorGanttDay = day;
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderVendorGantt();
}
window.setVendorGanttDay = setVendorGanttDay;
```

- [ ] **Step 4.2** — Add `renderVendorGantt`. Key semantics:
  - Data source: for each `state.budget` item, skip if `item.offSite === true`. For linked items, use `getLinkedStaff(item).schedule[day]`. For unlinked, use `item.schedule[day]`. Skip rows with no entry on the selected day.
  - Bar click: linked → `openStaffModal(linked.id)`; unlinked → `editBudgetItem(item.id)`.
  - Group by category; sort categories alphabetically (same ordering as the table).
  - Axis: same 7–27 window as staff gantt so vendors and staff line up visually if you eyeball both.
  - Bar color: use `getTeamColor(category)` so categories get distinct colors (same helper staff gantt uses for teams).

```js
function renderVendorGantt() {
    const container = document.getElementById('vendor-gantt-container');
    if (!container) return;

    const day = state.vendorGanttDay;

    // Keep day-tab labels synced + counts per day
    const dayKeys = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayNames = ['Thu', 'Fri', 'Sat', 'Sun'];
    const dayCounts = { thursday: 0, friday: 0, saturday: 0, sunday: 0 };
    for (const b of state.budget) {
        if (b.offSite === true) continue;
        const linked = getLinkedStaff(b);
        const sched = linked ? (linked.schedule || {}) : (b.schedule || {});
        for (const d of dayKeys) if (sched[d]) dayCounts[d]++;
    }
    document.querySelectorAll('.vendor-gantt-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        const idx = dayKeys.indexOf(d);
        if (idx !== -1) tab.textContent = dayNames[idx] + ' (' + dayCounts[d] + ')';
    });

    // Resolve scheduled entries for the selected day
    const entries = [];
    for (const item of state.budget) {
        if (item.offSite === true) continue;
        const linked = getLinkedStaff(item);
        const sched = linked ? (linked.schedule || {}) : (item.schedule || {});
        const timeStr = sched[day];
        if (!timeStr) continue;
        entries.push({ item, linked, timeStr });
    }

    if (entries.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No vendors scheduled for this day</div>';
        return;
    }

    // Axis — match staff gantt window so it lines up visually
    const axisStart = 7;
    const axisEnd = 27;
    const axisRange = axisEnd - axisStart;

    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = '<div class="vendor-gantt-time-axis">' +
        axisLabels.map(l => '<span class="vendor-gantt-time-label">' + l + '</span>').join('') +
        '</div>';

    // Group by category
    const catMap = new Map();
    for (const entry of entries) {
        const cat = (entry.item.category || 'Uncategorized');
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(entry);
    }
    const sortedCats = [...catMap.keys()].sort((a, b) => a.localeCompare(b));

    let html = timeAxisHtml;
    for (const cat of sortedCats) {
        const displayCat = cat.replace(/^6811[a-g] - /, '');
        const color = getTeamColor(cat);
        const catEntries = catMap.get(cat).sort((a, b) => (a.item.vendor || '').localeCompare(b.item.vendor || ''));

        html += '<div class="vendor-gantt-team">';
        html += '<div class="vendor-gantt-team-header">' + escapeHtml(displayCat) + '</div>';

        for (const { item, linked, timeStr } of catEntries) {
            const ranges = parseStaffScheduleRange(timeStr);
            const onClick = linked
                ? `openStaffModal('${linked.id}')`
                : `editBudgetItem('${item.id}')`;
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(timeStr) || '';
                const linkedMark = linked ? ' vendor-gantt-bar-linked' : '';
                return '<div class="vendor-gantt-bar' + linkedMark + '"' +
                    ' style="left:' + left + '%;width:' + width + '%;background:' + color + '"' +
                    ` onclick="${onClick}"` +
                    ' title="' + escapeHtml(item.vendor || 'Unnamed') + ': ' + escapeHtml(timeStr) + (linked ? ' (staff: ' + escapeHtml(linked.name) + ')' : '') + '">' +
                    (ranges.length === 1 ? escapeHtml(label) : '') +
                '</div>';
            }).join('');

            const displayName = escapeHtml(item.vendor || 'Unnamed');
            const linkedTag = linked ? '<span class="multi-team-tag">staff</span>' : '';

            html += '<div class="vendor-gantt-row">' +
                `<div class="vendor-gantt-name" onclick="${onClick}">` +
                    displayName + linkedTag +
                '</div>' +
                '<div class="vendor-gantt-bar-area">' + barsHtml + '</div>' +
            '</div>';
        }

        html += '</div>';
    }

    container.innerHTML = html;
}
window.renderVendorGantt = renderVendorGantt;
```

- [ ] **Step 4.3** — Small CSS addition for the "staff" tag on linked bars (add to `css/styles.css`):

```css
.vendor-gantt-bar-linked {
    box-shadow: inset 0 0 0 2px rgba(255,255,255,0.35);
}
```

## Task 5: Wire renderVendorSchedule → renderVendorGantt

**Files:** Modify `js/app.js`

`renderVendorSchedule` currently returns after setting `container.innerHTML`. We want the gantt to re-render whenever the table does.

- [ ] **Step 5.1** — At the very end of `renderVendorSchedule` (after the `container.innerHTML = html;` line and the expanded-categories restore block), add:

```js
    // Re-render the gantt alongside the table
    renderVendorGantt();
```

- [ ] **Step 5.2** — Also guard: in `setVendorView`, when switching TO 'schedule', the first `renderVendorSchedule()` call will now also paint the gantt. No extra code needed, but verify by manual test.

## Task 6: Make linked day cells editable — redirect write to staff doc

**Files:** Modify `js/app.js` inside `renderVendorSchedule` and `saveVendorScheduleCell`

Current `renderVendorSchedule` (linked branch of day-cell rendering):

```js
if (isLinked) {
    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" title="Managed on staff entry">${display}</td>`;
}
```

Linked cells get no `onclick` and no `data-original`, so they're non-editable.

- [ ] **Step 6.1** — Change linked-cell rendering so they are click-to-edit like unlinked cells. The row still carries `linked` styling. Replace the `if (isLinked) { return ... }` branch with:

```js
if (isLinked) {
    return `<td class="vendor-sched-cell" data-field="day" data-day="${key}" data-original="${escapeHtml(raw)}" title="Also editable on staff tab" onclick="editVendorScheduleCell(this)">${display}</td>`;
}
```

That still keeps the `.vendor-sched-row.linked` class on the `<tr>`, which uses CSS to soften hover/background — but the cell itself becomes clickable. Because CSS for `.vendor-sched-row.linked .vendor-sched-cell[data-field="day"]` sets `cursor: default`, override that too — update the CSS rule so clickable linked cells show `cursor: cell`:

- [ ] **Step 6.2** — In `css/styles.css`, update:

```css
.vendor-sched-row.linked .vendor-sched-cell[data-field="day"] {
    background-color: rgba(201, 169, 97, 0.05);
    cursor: cell;
    color: #6b675b;
}
```

(change `cursor: default` → `cursor: cell`)

- [ ] **Step 6.3** — Redirect the save path for linked rows. In `saveVendorScheduleCell`, we currently do:

```js
await collections.budget.doc(id).update({
    [`schedule.${day}`]: writeValue,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
});
```

Replace that block with:

```js
// For linked rows, write to the staff doc (staff is authoritative for linked pairs — see commit 4d48229)
const budgetItem = state.budget.find(b => b.id === id);
const linkedStaffId = budgetItem && budgetItem.linkedStaffId;

if (linkedStaffId) {
    await collections.staff.doc(linkedStaffId).update({
        [`schedule.${day}`]: writeValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
} else {
    await collections.budget.doc(id).update({
        [`schedule.${day}`]: writeValue,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}
```

## Task 7: Rename badge + fix summarizeVendorSchedule on linked cards

**Files:** Modify `js/app.js`

- [ ] **Step 7.1** — In `renderVendorSchedule`, find the `vendor-sched-linked-badge` HTML and change the label:

```js
// was:
? ` <span class="vendor-sched-linked-badge" onclick="event.stopPropagation(); openStaffModal('${linked.id}')" title="Open staff entry">managed on staff entry</span>`
// change to:
? ` <span class="vendor-sched-linked-badge" onclick="event.stopPropagation(); openStaffModal('${linked.id}')" title="Open staff entry">also on staff tab</span>`
```

- [ ] **Step 7.2** — In `renderVendorCards`, find the line:

```js
${summarizeVendorSchedule(item.schedule)}
```

Immediately above, the variable `linkedStaff` is already computed (`const linkedStaff = getLinkedStaff(item);`). Change to:

```js
${summarizeVendorSchedule(linkedStaff ? linkedStaff.schedule : item.schedule)}
```

## Task 8: Manual verification (browser)

Start a local server from the repo root: `python3 -m http.server 8765`. Open `http://localhost:8765/`.

- [ ] **Step 8.1** — Navigate to Vendors. Click the Schedule toggle. Confirm:
  - Table renders as before.
  - Below the table, a "Schedule Gantt" section renders with Thu/Fri/Sat/Sun tabs and a gantt chart.
  - Day tabs show counts like "Sat (23)" matching the number of vendors scheduled that day.
  - Bars appear for both unlinked and linked vendors.
  - Off-site vendors (`offSite === true`) are absent from the gantt.

- [ ] **Step 8.2** — Click a gantt bar:
  - Unlinked vendor → opens the budget modal (via `editBudgetItem`).
  - Linked vendor → opens the staff modal (via `openStaffModal`).

- [ ] **Step 8.3** — In the table, click a linked vendor's Sat cell. Confirm an inline input opens. Type `5pm-10pm`, press Tab. Confirm toast "Updated". Open the Staff page → find the linked staff member → Saturday column shows `5pm-10pm`.

- [ ] **Step 8.4** — Reverse: on the Staff page, open the same staff member's modal, change Sat to `6pm-11pm`, Save. Return to Vendors → Schedule → the linked row's Sat cell should show `6pm–11pm` (possibly after the Firestore snapshot round-trip). The gantt bar should update too without reload.

- [ ] **Step 8.5** — Clear one side. On the vendor table, click a linked Sat cell, delete its value, press Enter. The staff entry Sat value should be empty too.

- [ ] **Step 8.6** — Two-tab realtime. Open `localhost:8765` in two browser tabs. Edit a linked vendor's Thu cell in tab A. In tab B (on Vendors → Schedule), the cell should update on its own.

- [ ] **Step 8.7** — Check-in list regression. Staff → open Check-In List → pick Saturday → Print Preview. A linked vendor whose staff Sat schedule was just edited should appear on the printout with the new time (same as before — reads come from staff).

- [ ] **Step 8.8** — Badge copy. Linked rows show "also on staff tab" (not "managed on staff entry"). Clicking it still opens the staff modal.

- [ ] **Step 8.9** — Card view regression. Switch back to Cards view. Linked vendor cards show the staff's schedule in their details row (not a stale budget schedule).

## Task 9: Commit & push

- [ ] **Step 9.1** — `git add css/styles.css index.html js/app.js` — stage only our changes, not the untracked `scripts/suggest_schedules.py`.
- [ ] **Step 9.2** — Commit with a message like: `Add Vendors gantt and make linked-pair schedule edits bidirectional`.
- [ ] **Step 9.3** — `git push origin main`.
- [ ] **Step 9.4** — Check GitHub Pages build status via `gh api repos/zach992/ymu-gala-2026/pages/builds/latest --jq '.status'`.

---

## Out of scope

- Gantt for off-site vendors (explicitly excluded per user ask).
- Migrating stale `budget.schedule` data on already-linked pairs (unnecessary under Option B — no reader touches it).
- Back-populating `budget.schedule` when a link is later removed (pre-existing edge case; document only).
- Bar-drag editing in the gantt (table is the editor).
- Sub-toggle to hide the table and show only the gantt (user wants both visible).

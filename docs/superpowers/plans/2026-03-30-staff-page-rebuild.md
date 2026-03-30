# Staff Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat staff card grid with a team-grouped card view + Gantt schedule view, backed by a new Firestore schema with teams, per-day schedules, and multi-team support.

**Architecture:** Replace all staff HTML, CSS, and JS in place (same files: `index.html`, `js/app.js`, `css/styles.css`). New Firestore schema with `teams[]` array and `schedule{}` object. One-time migration script to import CSV data. Two views toggled by buttons: Team View (default, card grid grouped by team) and Schedule View (Gantt timeline with day tabs).

**Tech Stack:** Vanilla JS, Firebase Firestore, HTML/CSS, Node.js (migration script)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `index.html` lines 472–531 | Modify | Staff page HTML: header, stats, view toggle, team grid container |
| `index.html` lines 1111–1150 | Modify | Staff modal: new form fields (teams, schedule) |
| `js/app.js` lines 3466–3628 | Modify | All staff JS: render, search, modal, submit, delete |
| `js/app.js` lines 4411–4434 | Modify | Excel export (new fields) |
| `css/styles.css` lines 3379–3520 | Modify | All staff CSS: replace with team sections, cards, Gantt |
| `scripts/populate_staff.js` | Create | One-time CSV→Firestore migration |

---

### Task 1: Migration Script — Import CSV to Firestore

**Files:**
- Create: `scripts/populate_staff.js`
- Input: `/Users/zachlarmer/Downloads/13th Gala Run of Show 2026.xlsx - Staffing List (1).csv`

This must run first so we have data to render against.

- [ ] **Step 1: Write the migration script**

```js
// Populate staff collection in Firestore from CSV
// Run with: node scripts/populate_staff.js

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'ymu-gala-2026';
const API_KEY = 'AIzaSyCStAOy_a-qGlyPljycOxcLoshpMfuXmlA';
const COLLECTION = 'staff';

// Read and parse CSV
const csvPath = path.resolve(__dirname, '../../Downloads/13th Gala Run of Show 2026.xlsx - Staffing List (1).csv');
const csvText = fs.readFileSync(csvPath, 'utf-8');
const lines = csvText.trim().split('\n');

// Parse CSV (handle commas in quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') {
            inQuotes = !inQuotes;
        } else if (line[i] === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += line[i];
        }
    }
    result.push(current.trim());
    return result;
}

// Skip header row, parse all data rows
const rows = lines.slice(1).map(parseCSVLine);

// Build person records, merging multi-team people
const peopleMap = new Map(); // keyed by normalized name
let sortCounter = 0;

for (const row of rows) {
    const [team, name, role, _price1, thu, fri, sat, sun, price2] = row;
    if (!name) continue;

    const trimmedName = name.trim();
    const isPlaceholder = trimmedName === 'ASA' || trimmedName === '?' ||
        trimmedName.startsWith('ASA (') || trimmedName.startsWith('ASA(');
    const normalizedName = trimmedName.toLowerCase();

    // For placeholders, don't merge — each row is a separate entry
    // For named people, merge by name
    const key = isPlaceholder ? `placeholder_${sortCounter}` : normalizedName;

    const parseSched = (val) => {
        if (!val || val.trim() === '' || val.trim().toUpperCase() === 'N/A' || val.trim() === 'already there') return null;
        return val.trim();
    };

    const parsePrice = (val) => {
        if (!val || val.trim() === '') return null;
        const num = parseFloat(val.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? null : num;
    };

    if (peopleMap.has(key)) {
        // Merge: add team, keep schedule from whichever row has data
        const existing = peopleMap.get(key);
        const teamName = (team || '').trim();
        if (teamName && !existing.teams.includes(teamName)) {
            existing.teams.push(teamName);
        }
        // Merge schedule — keep existing non-null values, fill in nulls
        const newSched = {
            thursday: parseSched(thu),
            friday: parseSched(fri),
            saturday: parseSched(sat),
            sunday: parseSched(sun)
        };
        for (const day of ['thursday', 'friday', 'saturday', 'sunday']) {
            if (!existing.schedule[day] && newSched[day]) {
                existing.schedule[day] = newSched[day];
            }
        }
        // Merge price
        if (!existing.price) existing.price = parsePrice(price2);
    } else {
        peopleMap.set(key, {
            name: trimmedName,
            role: (role || '').trim(),
            teams: [(team || '').trim()].filter(Boolean),
            schedule: {
                thursday: parseSched(thu),
                friday: parseSched(fri),
                saturday: parseSched(sat),
                sunday: parseSched(sun)
            },
            isPlaceholder,
            price: parsePrice(price2),
            sortOrder: sortCounter
        });
    }
    sortCounter++;
}

const people = Array.from(peopleMap.values());

// Firestore REST API helper
async function deleteAllDocs() {
    const listUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}&pageSize=300`;
    const resp = await fetch(listUrl);
    const data = await resp.json();
    if (data.documents) {
        for (const doc of data.documents) {
            const delUrl = `https://firestore.googleapis.com/v1/${doc.name}?key=${API_KEY}`;
            await fetch(delUrl, { method: 'DELETE' });
        }
        console.log(`  Deleted ${data.documents.length} existing documents`);
    } else {
        console.log('  Collection empty, nothing to delete');
    }
}

async function createDocument(person) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}?key=${API_KEY}`;

    const fields = {
        name: { stringValue: person.name },
        role: { stringValue: person.role },
        teams: {
            arrayValue: {
                values: person.teams.map(t => ({ stringValue: t }))
            }
        },
        schedule: {
            mapValue: {
                fields: {
                    thursday: person.schedule.thursday
                        ? { stringValue: person.schedule.thursday }
                        : { nullValue: null },
                    friday: person.schedule.friday
                        ? { stringValue: person.schedule.friday }
                        : { nullValue: null },
                    saturday: person.schedule.saturday
                        ? { stringValue: person.schedule.saturday }
                        : { nullValue: null },
                    sunday: person.schedule.sunday
                        ? { stringValue: person.schedule.sunday }
                        : { nullValue: null }
                }
            }
        },
        isPlaceholder: { booleanValue: person.isPlaceholder },
        sortOrder: { integerValue: String(person.sortOrder) }
    };

    if (person.price !== null) {
        fields.price = { doubleValue: person.price };
    } else {
        fields.price = { nullValue: null };
    }

    // Handle empty teams array
    if (person.teams.length === 0) {
        fields.teams = { arrayValue: {} };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to create ${person.name}: ${err}`);
    }

    const result = await response.json();
    return result.name.split('/').pop();
}

async function main() {
    console.log(`Parsed ${people.length} staff members from CSV`);
    console.log(`  (${people.filter(p => !p.isPlaceholder).length} named, ${people.filter(p => p.isPlaceholder).length} placeholders)`);
    console.log('');

    console.log('Clearing existing staff collection...');
    await deleteAllDocs();
    console.log('');

    console.log('Populating staff...');
    for (const person of people) {
        try {
            const docId = await createDocument(person);
            const teamStr = person.teams.join(', ');
            console.log(`  ✓ [${teamStr}] ${person.name} — ${person.role} (${docId})`);
        } catch (err) {
            console.error(`  ✗ ${person.name}: ${err.message}`);
        }
    }

    console.log('');
    console.log('Done!');
}

main();
```

- [ ] **Step 2: Run the migration**

Run: `cd "/Users/zachlarmer/Desktop/Claude Projects/Gala Manager App/gala-management" && node scripts/populate_staff.js`
Expected: ~60-70 staff members created (80 CSV rows minus merged multi-team duplicates)

- [ ] **Step 3: Commit**

```bash
git add scripts/populate_staff.js
git commit -m "feat: add staff CSV migration script and populate Firestore"
```

---

### Task 2: Staff Page HTML — Header, View Toggle, Containers

**Files:**
- Modify: `index.html` lines 472–531 (staff page section)
- Modify: `index.html` lines 1111–1150 (staff modal)

- [ ] **Step 1: Replace the staff page HTML**

Replace lines 472–531 in `index.html` with:

```html
        <!-- Staff Page -->
        <div id="staff" class="page">
            <div class="page-header">
                <h1>Staff</h1>
                <div class="header-actions">
                    <div class="staff-view-toggle">
                        <button class="staff-view-btn active" id="staff-team-view-btn" onclick="setStaffView('team')">Team View</button>
                        <button class="staff-view-btn" id="staff-schedule-view-btn" onclick="setStaffView('schedule')">Schedule</button>
                    </div>
                    <button class="btn btn-icon" id="print-staff-btn" title="Print" onclick="window.print()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    </button>
                    <button class="btn btn-icon" id="export-staff-btn" title="Export to Excel">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="btn btn-primary-gold" id="add-staff-btn">+ Add Staff</button>
                </div>
            </div>

            <!-- Staff Search -->
            <div class="page-search-bar">
                <div class="page-search-wrapper">
                    <svg class="page-search-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
                    </svg>
                    <input type="text" id="staff-search-input" class="search-input" placeholder="Search staff by name, role, or team..." oninput="handleStaffSearch(this.value)">
                    <button type="button" id="staff-search-clear" class="page-search-clear" onclick="clearStaffSearch()" style="display: none;">&times;</button>
                </div>
                <span id="staff-search-count" class="page-search-count"></span>
            </div>

            <!-- Staff Summary Stats -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Total Staff</div>
                        <div class="stat-value" id="staff-stat-total">0</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Teams</div>
                        <div class="stat-value" id="staff-stat-teams">0</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Unfilled</div>
                        <div class="stat-value" id="staff-stat-unfilled">0</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-content">
                        <div class="stat-label">Saturday</div>
                        <div class="stat-value" id="staff-stat-saturday">0</div>
                    </div>
                </div>
            </div>

            <!-- Team View Container -->
            <div id="staff-team-view">
                <div id="staff-team-grid"></div>
            </div>

            <!-- Schedule (Gantt) View Container -->
            <div id="staff-schedule-view" style="display: none;">
                <div class="staff-day-tabs">
                    <button class="staff-day-tab" data-day="thursday" onclick="setStaffDay('thursday')">Thu</button>
                    <button class="staff-day-tab" data-day="friday" onclick="setStaffDay('friday')">Fri</button>
                    <button class="staff-day-tab active" data-day="saturday" onclick="setStaffDay('saturday')">Sat</button>
                    <button class="staff-day-tab" data-day="sunday" onclick="setStaffDay('sunday')">Sun</button>
                    <span id="staff-day-count" class="staff-day-count"></span>
                </div>
                <div id="staff-gantt-container"></div>
            </div>
        </div>
```

- [ ] **Step 2: Replace the staff modal HTML**

Replace lines 1111–1150 in `index.html` with:

```html
    <!-- Staff Modal -->
    <div id="staff-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="staff-modal-title">Add Staff Member</h2>
                <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <form id="staff-form">
                    <input type="hidden" id="staff-id">
                    <div class="form-row">
                        <div class="form-group">
                            <label for="staff-name">Name *</label>
                            <input type="text" id="staff-name" required>
                        </div>
                        <div class="form-group">
                            <label for="staff-role">Role *</label>
                            <input type="text" id="staff-role" required>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Teams</label>
                        <div class="staff-teams-input">
                            <div id="staff-teams-tags" class="staff-teams-tags"></div>
                            <input type="text" id="staff-team-input" placeholder="Type team name..." autocomplete="off">
                            <div id="staff-team-suggestions" class="staff-team-suggestions"></div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Schedule</label>
                        <div class="staff-schedule-grid">
                            <div class="staff-schedule-row">
                                <span class="staff-schedule-day">Thu</span>
                                <input type="text" id="staff-sched-thursday" placeholder="e.g. 10:00am - 6pm">
                            </div>
                            <div class="staff-schedule-row">
                                <span class="staff-schedule-day">Fri</span>
                                <input type="text" id="staff-sched-friday" placeholder="e.g. 10:00am - 6pm">
                            </div>
                            <div class="staff-schedule-row">
                                <span class="staff-schedule-day">Sat</span>
                                <input type="text" id="staff-sched-saturday" placeholder="e.g. 10:00am - 6pm">
                            </div>
                            <div class="staff-schedule-row">
                                <span class="staff-schedule-day">Sun</span>
                                <input type="text" id="staff-sched-sunday" placeholder="e.g. 10:00am - 6pm">
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="staff-placeholder">
                            Placeholder / TBD position
                        </label>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-danger" id="staff-delete-btn" style="display:none; margin-right:auto;" onclick="deleteStaffFromModal()">Delete</button>
                        <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                        <button type="submit" class="btn btn-primary">Save</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rebuild staff page HTML with team view, schedule view, and new modal"
```

---

### Task 3: Staff CSS — Team Cards, Gantt Chart, Modal Styles

**Files:**
- Modify: `css/styles.css` lines 3379–3520 (replace entire staff section)

- [ ] **Step 1: Replace all staff CSS**

Replace from `.staff-grid {` (line 3379) through the mobile staff media query closing `}` (line 3520, just before `/* =============================================`) with:

```css
/* =============================================
   STAFF PAGE
   ============================================= */

/* View toggle */
.staff-view-toggle {
    display: flex;
    background: #f0ece3;
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
}

.staff-view-btn {
    padding: 6px 16px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: #8a8778;
    cursor: pointer;
    transition: all 0.2s ease;
}

.staff-view-btn.active {
    background: #c9a961;
    color: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

/* Team section */
.staff-team-section {
    margin-bottom: 1.5rem;
}

.staff-team-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0;
    border-bottom: 2px solid #c9a961;
    cursor: pointer;
    user-select: none;
}

.staff-team-header:hover {
    opacity: 0.85;
}

.staff-team-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: #1a3a35;
}

.staff-team-count {
    font-size: 0.85rem;
    color: #8a8778;
    font-weight: 400;
    margin-left: 0.5rem;
}

.staff-team-chevron {
    color: #8a8778;
    transition: transform 0.2s ease;
    font-size: 0.8rem;
}

.staff-team-section.collapsed .staff-team-chevron {
    transform: rotate(-90deg);
}

.staff-team-section.collapsed .staff-team-cards {
    display: none;
}

/* Card grid within a team */
.staff-team-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
    padding-bottom: 0.5rem;
}

/* Individual staff card */
@keyframes staff-card-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
}

.staff-card {
    background: #faf8f3;
    border-radius: 10px;
    padding: 1rem 1.1rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    border: 1px solid #f0ece3;
    border-left: 4px solid var(--team-color, #c9a961);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    animation: staff-card-in 0.3s ease both;
}

.staff-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(201, 169, 97, 0.15);
}

.staff-card.placeholder {
    opacity: 0.5;
    border-left-style: dashed;
}

.staff-card-name {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #1a3a35;
    line-height: 1.2;
}

.staff-card-role {
    font-size: 0.85rem;
    color: #c9a961;
    font-weight: 500;
    margin-top: 0.15rem;
}

.staff-card-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 0.4rem;
}

.staff-team-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(201, 169, 97, 0.12);
    color: #8a7a4a;
}

.staff-budget-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(106, 154, 106, 0.15);
    color: #4a7a4a;
}

/* Schedule at a glance on cards */
.staff-card-schedule {
    display: flex;
    gap: 3px;
    margin-top: 0.6rem;
}

.staff-sched-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    min-width: 0;
    padding: 4px 2px;
    border-radius: 4px;
    background: #f5f1e8;
    font-size: 0.65rem;
    line-height: 1.2;
}

.staff-sched-day.off {
    opacity: 0.3;
}

.staff-sched-day-label {
    font-weight: 600;
    color: #8a8778;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.staff-sched-day-time {
    color: #1a3a35;
    font-weight: 500;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

/* Empty states */
.staff-empty-state {
    text-align: center;
    padding: 3rem 1.5rem;
    background: #faf8f3;
    border: 1px solid #f0ece3;
    border-radius: 12px;
    color: #8a8778;
    font-size: 1rem;
}

/* === GANTT SCHEDULE VIEW === */

.staff-day-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 1.25rem;
    align-items: center;
}

.staff-day-tab {
    padding: 6px 18px;
    border: none;
    background: #f0ece3;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #8a8778;
    cursor: pointer;
    transition: all 0.2s ease;
}

.staff-day-tab.active {
    background: #c9a961;
    color: #fff;
}

.staff-day-count {
    font-size: 0.85rem;
    color: #8a8778;
    margin-left: 0.5rem;
}

/* Gantt chart */
.staff-gantt-team {
    margin-bottom: 1.25rem;
}

.staff-gantt-team-header {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #1a3a35;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid #e8e3d8;
    margin-bottom: 0.5rem;
}

.staff-gantt-time-axis {
    display: flex;
    margin-left: 140px;
    margin-right: 4px;
    margin-bottom: 4px;
    font-size: 0.7rem;
    color: #8a8778;
}

.staff-gantt-time-label {
    flex: 1;
    text-align: left;
}

.staff-gantt-row {
    display: flex;
    align-items: center;
    margin-bottom: 3px;
    height: 26px;
}

.staff-gantt-row:hover {
    background: rgba(201, 169, 97, 0.04);
    border-radius: 4px;
}

.staff-gantt-name {
    width: 140px;
    min-width: 140px;
    font-size: 0.8rem;
    color: #1a3a35;
    padding-right: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

.staff-gantt-name:hover {
    color: #c9a961;
}

.staff-gantt-name .placeholder-name {
    color: #8a8778;
    font-style: italic;
}

.staff-gantt-name .multi-team-tag {
    font-size: 0.65rem;
    color: #8888cc;
    margin-left: 4px;
}

.staff-gantt-name .budget-tag {
    font-size: 0.65rem;
    color: #4a7a4a;
    margin-left: 2px;
}

.staff-gantt-bar-area {
    flex: 1;
    position: relative;
    height: 100%;
    background: repeating-linear-gradient(
        90deg,
        transparent,
        transparent calc(100% / 19 - 1px),
        #f0ece3 calc(100% / 19 - 1px),
        #f0ece3 calc(100% / 19)
    );
    border-radius: 4px;
}

.staff-gantt-bar {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 500;
    color: #fff;
    padding: 0 6px;
    display: flex;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: filter 0.15s ease;
}

.staff-gantt-bar:hover {
    filter: brightness(1.1);
}

.staff-gantt-bar.placeholder-bar {
    opacity: 0.4;
}

/* Modal team tags input */
.staff-teams-input {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    background: #fff;
    position: relative;
}

.staff-teams-input:focus-within {
    border-color: #c9a961;
    box-shadow: 0 0 0 2px rgba(201, 169, 97, 0.2);
}

.staff-teams-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.staff-team-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #c9a961;
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
}

.staff-team-tag-remove {
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.7;
}

.staff-team-tag-remove:hover {
    opacity: 1;
}

.staff-teams-input input {
    border: none;
    outline: none;
    flex: 1;
    min-width: 100px;
    font-size: 0.9rem;
    padding: 4px;
    background: transparent;
}

.staff-team-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    margin-top: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    z-index: 10;
    display: none;
    max-height: 200px;
    overflow-y: auto;
}

.staff-team-suggestion {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 0.85rem;
}

.staff-team-suggestion:hover {
    background: #f5f1e8;
}

/* Modal schedule grid */
.staff-schedule-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.staff-schedule-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.staff-schedule-day {
    width: 32px;
    font-weight: 600;
    font-size: 0.85rem;
    color: #8a8778;
}

.staff-schedule-row input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.9rem;
}

.staff-schedule-row input:focus {
    border-color: #c9a961;
    outline: none;
    box-shadow: 0 0 0 2px rgba(201, 169, 97, 0.2);
}

/* Checkbox label for placeholder toggle */
.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: #555;
    cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
    accent-color: #c9a961;
}

/* Mobile */
@media (max-width: 768px) {
    .staff-team-cards {
        grid-template-columns: 1fr;
        gap: 0.75rem;
    }

    .staff-view-toggle {
        width: 100%;
    }

    .staff-view-btn {
        flex: 1;
        text-align: center;
    }

    .staff-gantt-name {
        width: 90px;
        min-width: 90px;
        font-size: 0.7rem;
    }

    .staff-gantt-time-axis {
        margin-left: 90px;
        font-size: 0.6rem;
    }

    .staff-card-schedule {
        gap: 2px;
    }

    .staff-sched-day {
        font-size: 0.6rem;
        padding: 3px 1px;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat: add staff team view, Gantt chart, and modal CSS"
```

---

### Task 4: Staff JavaScript — State, Rendering, View Toggle

**Files:**
- Modify: `js/app.js` — add `staffView` and `staffDay` to state (around line 27), replace staff functions (lines 3466–3628)

- [ ] **Step 1: Add state variables**

Add to the `state` object (after line 27, near the other state vars):

```js
    staffSearch: '',
    staffView: 'team',       // 'team' or 'schedule'
    staffDay: 'saturday',    // selected day for Gantt view
```

Note: `staffSearch` may already exist — if so, just add `staffView` and `staffDay`.

- [ ] **Step 2: Define team color palette**

Add right before the staff functions section (before the `staffItemMatchesSearch` function):

```js
// ==========================================
// STAFF PAGE
// ==========================================

const STAFF_TEAM_COLORS = {
    'Check In': '#4a90a4',
    'FOH Team': '#7b6cb0',
    'Silent Auction': '#c9a961',
    'Bathroom/FOH': '#8a8778',
    'Marketing': '#d4795c',
    'Mainstage Production Team': '#c9a961',
    'Talent': '#e06b8a',
    'Power 20 team': '#4aaa7a',
    'Greenroom Team': '#6a9a6a'
};

function getTeamColor(teamName) {
    if (STAFF_TEAM_COLORS[teamName]) return STAFF_TEAM_COLORS[teamName];
    // Hash-based fallback for new teams
    let hash = 0;
    for (let i = 0; i < teamName.length; i++) hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
    const colors = ['#4a90a4', '#7b6cb0', '#d4795c', '#e06b8a', '#4aaa7a', '#6a9a6a', '#8a6a4a', '#5a7a9a'];
    return colors[Math.abs(hash) % colors.length];
}
```

- [ ] **Step 3: Replace search function**

Replace `staffItemMatchesSearch` (line 3466–3476) with:

```js
function staffItemMatchesSearch(member, query) {
    if (!query) return true;
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const fields = [
        member.name || '',
        member.role || '',
        ...(member.teams || [])
    ];
    const text = fields.join(' ').toLowerCase();
    return tokens.every(t => text.includes(t));
}
```

- [ ] **Step 4: Add view toggle and day tab functions**

Add after `clearStaffSearch`:

```js
function setStaffView(view) {
    state.staffView = view;
    document.getElementById('staff-team-view-btn').classList.toggle('active', view === 'team');
    document.getElementById('staff-schedule-view-btn').classList.toggle('active', view === 'schedule');
    document.getElementById('staff-team-view').style.display = view === 'team' ? '' : 'none';
    document.getElementById('staff-schedule-view').style.display = view === 'schedule' ? '' : 'none';
    renderStaff();
}

function setStaffDay(day) {
    state.staffDay = day;
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    renderStaffGantt();
}

window.setStaffView = setStaffView;
window.setStaffDay = setStaffDay;
```

- [ ] **Step 5: Write helper to format schedule for card display**

```js
function formatScheduleShort(timeStr) {
    if (!timeStr) return null;
    // Shorten "10:00am - 6pm" to "10a-6p"
    return timeStr
        .replace(/:00/g, '')
        .replace(/\s*-\s*/g, '-')
        .replace(/12:30:00 PM/gi, '12:30p')
        .replace(/(\d{1,2})(:\d{2})?(am)/gi, '$1$2a')
        .replace(/(\d{1,2})(:\d{2})?(pm)/gi, '$1$2p')
        .replace(/ /g, '');
}
```

- [ ] **Step 6: Replace renderStaff with Team View renderer**

Replace the entire `renderStaff` function (lines 3496–3569) with:

```js
function renderStaff() {
    // Update stats
    const total = state.staff.length;
    const allTeams = new Set();
    state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));
    const unfilled = state.staff.filter(m => m.isPlaceholder).length;
    const satCount = state.staff.filter(m => m.schedule && m.schedule.saturday).length;

    const setStat = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    setStat('staff-stat-total', total);
    setStat('staff-stat-teams', allTeams.size);
    setStat('staff-stat-unfilled', unfilled);
    setStat('staff-stat-saturday', satCount);

    // Search
    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    const countEl = document.getElementById('staff-search-count');
    const clearBtn = document.getElementById('staff-search-clear');

    if (state.staffView === 'team') {
        renderStaffTeamView(isSearching, searchQuery);
    } else {
        renderStaffGantt();
    }

    // Update search count
    const filteredCount = state.staff.filter(m => staffItemMatchesSearch(m, searchQuery)).length;
    if (countEl) {
        countEl.textContent = isSearching ? `${filteredCount} of ${total} staff` : `${total} staff`;
        countEl.style.display = total > 0 ? '' : 'none';
    }
    if (clearBtn) clearBtn.style.display = isSearching ? '' : 'none';
}

function renderStaffTeamView(isSearching, searchQuery) {
    const container = document.getElementById('staff-team-grid');
    if (!container) return;

    const total = state.staff.length;
    if (total === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff members added yet. Click "+ Add Staff" to get started.</div>';
        return;
    }

    // Build team → members map
    const teamMap = new Map();
    const members = isSearching
        ? state.staff.filter(m => staffItemMatchesSearch(m, searchQuery))
        : state.staff;

    if (members.length === 0) {
        container.innerHTML = `<div class="staff-empty-state">No staff match "${escapeHtml(searchQuery)}"</div>`;
        return;
    }

    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        for (const team of teams) {
            if (!teamMap.has(team)) teamMap.set(team, []);
            teamMap.get(team).push(member);
        }
    }

    // Sort teams: use a preferred order, then alphabetical
    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let cardIndex = 0;
    const days = ['thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Thu', 'Fri', 'Sat', 'Sun'];

    container.innerHTML = sortedTeams.map(teamName => {
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const color = getTeamColor(teamName);

        const cardsHtml = teamMembers.map(member => {
            const idx = cardIndex++;
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const badgesHtml = otherTeams.map(t =>
                `<span class="staff-team-badge">+${escapeHtml(t)}</span>`
            ).join('');
            const budgetHtml = member.price ? '<span class="staff-budget-badge">$</span>' : '';

            const schedHtml = days.map((day, i) => {
                const val = member.schedule && member.schedule[day];
                const short = formatScheduleShort(val);
                return `<div class="staff-sched-day${val ? '' : ' off'}">
                    <span class="staff-sched-day-label">${dayLabels[i]}</span>
                    <span class="staff-sched-day-time">${short ? escapeHtml(short) : '—'}</span>
                </div>`;
            }).join('');

            return `<div class="staff-card${member.isPlaceholder ? ' placeholder' : ''}"
                        style="--team-color: ${color}; animation-delay: ${idx * 30}ms"
                        onclick="openStaffModal('${member.id}')">
                <div class="staff-card-name">${escapeHtml(member.name || '')}</div>
                <div class="staff-card-role">${escapeHtml(member.role || '')}</div>
                ${(badgesHtml || budgetHtml) ? `<div class="staff-card-badges">${badgesHtml}${budgetHtml}</div>` : ''}
                <div class="staff-card-schedule">${schedHtml}</div>
            </div>`;
        }).join('');

        return `<div class="staff-team-section" id="staff-team-${teamName.replace(/\s+/g, '-').toLowerCase()}">
            <div class="staff-team-header" onclick="toggleStaffTeam(this)">
                <div>
                    <span class="staff-team-title">${escapeHtml(teamName)}</span>
                    <span class="staff-team-count">${teamMembers.length}</span>
                </div>
                <span class="staff-team-chevron">▼</span>
            </div>
            <div class="staff-team-cards">${cardsHtml}</div>
        </div>`;
    }).join('');
}

function toggleStaffTeam(headerEl) {
    headerEl.closest('.staff-team-section').classList.toggle('collapsed');
}
window.toggleStaffTeam = toggleStaffTeam;
```

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: add staff team view rendering with card grid and schedule indicators"
```

---

### Task 5: Staff JavaScript — Gantt Schedule View

**Files:**
- Modify: `js/app.js` — add `renderStaffGantt` after `renderStaffTeamView`

- [ ] **Step 1: Write time parsing helper**

Add after `formatScheduleShort`:

```js
function parseStaffTime(timeStr) {
    // Parse time strings like "10:00am", "6pm", "2:30am", "12:30:00 PM" to hours (decimal)
    if (!timeStr) return null;
    let s = timeStr.trim().toLowerCase().replace(/\s+/g, '');
    // Handle "12:30:00 pm" format
    s = s.replace(/(\d{1,2}:\d{2}):\d{2}(am|pm)/i, '$1$2');
    const match = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = (match[3] || '').toLowerCase();
    if (ampm === 'pm' || ampm === 'p') {
        if (hours !== 12) hours += 12;
    } else if (ampm === 'am' || ampm === 'a') {
        if (hours === 12) hours = 0;
    }
    return hours + minutes / 60;
}

function parseStaffScheduleRange(schedStr) {
    // Parse "10:00am - 6pm" or "1-5pm / 10:30pm - 2:30am" into [{start, end}]
    if (!schedStr) return [];
    // Split on " / " for split shifts
    const parts = schedStr.split('/').map(p => p.trim());
    const ranges = [];
    for (const part of parts) {
        const halves = part.split(/\s*-\s*/);
        if (halves.length !== 2) continue;
        let start = parseStaffTime(halves[0]);
        let end = parseStaffTime(halves[1]);
        if (start === null || end === null) continue;
        // Handle overnight: if end <= start, end is next day
        if (end <= start) end += 24;
        ranges.push({ start, end });
    }
    return ranges;
}
```

- [ ] **Step 2: Write the Gantt renderer**

```js
function renderStaffGantt() {
    const container = document.getElementById('staff-gantt-container');
    if (!container) return;

    const day = state.staffDay;
    const searchQuery = state.staffSearch;
    const isSearching = searchQuery && searchQuery.trim().length > 0;

    // Filter to members working this day
    let members = state.staff.filter(m => m.schedule && m.schedule[day]);
    if (isSearching) {
        members = members.filter(m => staffItemMatchesSearch(m, searchQuery));
    }

    // Update day count
    const dayCountEl = document.getElementById('staff-day-count');
    if (dayCountEl) {
        dayCountEl.textContent = `${members.length} staff`;
    }

    // Update day tab counts
    const dayCounts = {};
    for (const d of ['thursday', 'friday', 'saturday', 'sunday']) {
        dayCounts[d] = state.staff.filter(m => m.schedule && m.schedule[d]).length;
    }
    document.querySelectorAll('.staff-day-tab').forEach(tab => {
        const d = tab.dataset.day;
        tab.textContent = tab.textContent.split(' ')[0]; // keep just day name
        tab.textContent = `${['Thu', 'Fri', 'Sat', 'Sun'][['thursday','friday','saturday','sunday'].indexOf(d)]} (${dayCounts[d]})`;
    });

    if (members.length === 0) {
        container.innerHTML = '<div class="staff-empty-state">No staff scheduled for this day</div>';
        return;
    }

    // Group by team
    const teamMap = new Map();
    for (const member of members) {
        const teams = member.teams && member.teams.length > 0 ? member.teams : ['Unassigned'];
        // For Gantt, show under primary team only (first team)
        const team = teams[0];
        if (!teamMap.has(team)) teamMap.set(team, []);
        teamMap.get(team).push(member);
    }

    // Gantt axis: 7am to 3am (next day) = 20 hours
    const axisStart = 7;
    const axisEnd = 27; // 3am next day
    const axisRange = axisEnd - axisStart;

    // Time axis labels
    const axisLabels = [];
    for (let h = axisStart; h < axisEnd; h++) {
        const displayH = h > 24 ? h - 24 : h;
        const suffix = displayH < 12 || displayH === 24 ? 'a' : 'p';
        const label = displayH === 0 ? '12a' : displayH === 12 ? '12p' : (displayH > 12 ? displayH - 12 : displayH) + suffix;
        axisLabels.push(label);
    }

    const timeAxisHtml = `<div class="staff-gantt-time-axis">${axisLabels.map(l => `<span class="staff-gantt-time-label">${l}</span>`).join('')}</div>`;

    // Collapse identical placeholders
    function collapseTeamMembers(teamMembers) {
        const result = [];
        const placeholderGroups = new Map(); // schedStr → {member, count}
        for (const m of teamMembers) {
            if (m.isPlaceholder) {
                const key = m.schedule[day] || '';
                if (placeholderGroups.has(key)) {
                    placeholderGroups.get(key).count++;
                } else {
                    placeholderGroups.set(key, { member: m, count: 1 });
                }
            } else {
                result.push({ member: m, count: 1 });
            }
        }
        for (const { member, count } of placeholderGroups.values()) {
            result.push({ member, count });
        }
        return result;
    }

    // Sort teams
    const teamOrder = [
        'Mainstage Production Team', 'Check In', 'FOH Team', 'Silent Auction',
        'Bathroom/FOH', 'Marketing', 'Talent', 'Power 20 team',
        'Greenroom Team', 'Unassigned'
    ];
    const sortedTeams = [...teamMap.keys()].sort((a, b) => {
        const ai = teamOrder.indexOf(a);
        const bi = teamOrder.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    let html = timeAxisHtml;

    for (const teamName of sortedTeams) {
        const color = getTeamColor(teamName);
        const teamMembers = teamMap.get(teamName).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const collapsed = collapseTeamMembers(teamMembers);

        html += `<div class="staff-gantt-team">`;
        html += `<div class="staff-gantt-team-header">${escapeHtml(teamName)}</div>`;

        for (const { member, count } of collapsed) {
            const otherTeams = (member.teams || []).filter(t => t !== teamName);
            const multiTag = otherTeams.length > 0
                ? `<span class="multi-team-tag">+${escapeHtml(otherTeams[0])}</span>` : '';
            const budgetTag = member.price ? '<span class="budget-tag">$</span>' : '';
            const nameDisplay = member.isPlaceholder && count > 1
                ? `<span class="placeholder-name">${escapeHtml(member.name)} x${count}</span>`
                : member.isPlaceholder
                ? `<span class="placeholder-name">${escapeHtml(member.name)}</span>`
                : escapeHtml(member.name);

            const ranges = parseStaffScheduleRange(member.schedule[day]);
            const barsHtml = ranges.map(r => {
                const left = Math.max(0, (r.start - axisStart) / axisRange * 100);
                const width = Math.min(100 - left, (r.end - r.start) / axisRange * 100);
                const label = formatScheduleShort(member.schedule[day]) || '';
                return `<div class="staff-gantt-bar${member.isPlaceholder ? ' placeholder-bar' : ''}"
                    style="left:${left}%;width:${width}%;background:${color}"
                    onclick="openStaffModal('${member.id}')"
                    title="${escapeHtml(member.name)}: ${escapeHtml(member.schedule[day])}">${ranges.length === 1 ? escapeHtml(label) : ''}</div>`;
            }).join('');

            html += `<div class="staff-gantt-row">
                <div class="staff-gantt-name" onclick="openStaffModal('${member.id}')">${nameDisplay}${multiTag}${budgetTag}</div>
                <div class="staff-gantt-bar-area">${barsHtml}</div>
            </div>`;
        }

        html += `</div>`;
    }

    container.innerHTML = html;
}
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: add staff Gantt schedule view with time parsing and team colors"
```

---

### Task 6: Staff JavaScript — Modal (Edit/Add/Delete) and Team Tag Input

**Files:**
- Modify: `js/app.js` — replace `openStaffModal`, `handleStaffSubmit`, update delete handler

- [ ] **Step 1: Replace openStaffModal**

Replace the existing `openStaffModal` function (lines 3571–3595) with:

```js
let staffModalTeams = []; // current teams in the modal

function openStaffModal(memberId = null) {
    const modal = document.getElementById('staff-modal');
    const form = document.getElementById('staff-form');
    const title = document.getElementById('staff-modal-title');
    const deleteBtn = document.getElementById('staff-delete-btn');

    form.reset();
    staffModalTeams = [];

    if (memberId) {
        const member = state.staff.find(s => s.id === memberId);
        if (member) {
            title.textContent = 'Edit Staff Member';
            document.getElementById('staff-id').value = member.id;
            document.getElementById('staff-name').value = member.name || '';
            document.getElementById('staff-role').value = member.role || '';
            document.getElementById('staff-placeholder').checked = member.isPlaceholder || false;
            staffModalTeams = [...(member.teams || [])];

            // Populate schedule fields
            const sched = member.schedule || {};
            document.getElementById('staff-sched-thursday').value = sched.thursday || '';
            document.getElementById('staff-sched-friday').value = sched.friday || '';
            document.getElementById('staff-sched-saturday').value = sched.saturday || '';
            document.getElementById('staff-sched-sunday').value = sched.sunday || '';

            deleteBtn.style.display = '';
        }
    } else {
        title.textContent = 'Add Staff Member';
        document.getElementById('staff-id').value = '';
        document.getElementById('staff-sched-thursday').value = '';
        document.getElementById('staff-sched-friday').value = '';
        document.getElementById('staff-sched-saturday').value = '';
        document.getElementById('staff-sched-sunday').value = '';
        deleteBtn.style.display = 'none';
    }

    renderStaffTeamTags();
    modal.classList.add('active');
}

function renderStaffTeamTags() {
    const container = document.getElementById('staff-teams-tags');
    container.innerHTML = staffModalTeams.map(t =>
        `<span class="staff-team-tag">${escapeHtml(t)}<span class="staff-team-tag-remove" onclick="removeStaffTeam('${escapeHtml(t)}')">&times;</span></span>`
    ).join('');
}

function removeStaffTeam(teamName) {
    staffModalTeams = staffModalTeams.filter(t => t !== teamName);
    renderStaffTeamTags();
}
window.removeStaffTeam = removeStaffTeam;

function setupStaffTeamInput() {
    const input = document.getElementById('staff-team-input');
    const sugBox = document.getElementById('staff-team-suggestions');
    if (!input || !sugBox) return;

    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        if (!val) { sugBox.style.display = 'none'; return; }

        // Get all known team names
        const allTeams = new Set();
        state.staff.forEach(m => (m.teams || []).forEach(t => allTeams.add(t)));

        const matches = [...allTeams]
            .filter(t => t.toLowerCase().includes(val) && !staffModalTeams.includes(t));

        if (matches.length === 0 && val.length > 1) {
            // Offer to create new team
            sugBox.innerHTML = `<div class="staff-team-suggestion" onclick="addStaffTeam('${escapeHtml(input.value.trim())}')">Create "${escapeHtml(input.value.trim())}"</div>`;
            sugBox.style.display = '';
        } else if (matches.length > 0) {
            sugBox.innerHTML = matches.map(t =>
                `<div class="staff-team-suggestion" onclick="addStaffTeam('${escapeHtml(t)}')">${escapeHtml(t)}</div>`
            ).join('');
            sugBox.style.display = '';
        } else {
            sugBox.style.display = 'none';
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val && !staffModalTeams.includes(val)) {
                addStaffTeam(val);
            }
        }
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.staff-teams-input')) {
            sugBox.style.display = 'none';
        }
    });
}

function addStaffTeam(teamName) {
    if (!staffModalTeams.includes(teamName)) {
        staffModalTeams.push(teamName);
        renderStaffTeamTags();
    }
    const input = document.getElementById('staff-team-input');
    input.value = '';
    document.getElementById('staff-team-suggestions').style.display = 'none';
}
window.addStaffTeam = addStaffTeam;
```

- [ ] **Step 2: Replace handleStaffSubmit**

Replace the existing `handleStaffSubmit` function (lines 3597–3625) with:

```js
async function handleStaffSubmit(e) {
    e.preventDefault();

    const staffData = {
        name: document.getElementById('staff-name').value,
        role: document.getElementById('staff-role').value,
        teams: [...staffModalTeams],
        schedule: {
            thursday: document.getElementById('staff-sched-thursday').value.trim() || null,
            friday: document.getElementById('staff-sched-friday').value.trim() || null,
            saturday: document.getElementById('staff-sched-saturday').value.trim() || null,
            sunday: document.getElementById('staff-sched-sunday').value.trim() || null
        },
        isPlaceholder: document.getElementById('staff-placeholder').checked,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const staffId = document.getElementById('staff-id').value;

    try {
        if (staffId) {
            await collections.staff.doc(staffId).update(staffData);
            showToast('Staff member updated');
        } else {
            staffData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            staffData.sortOrder = state.staff.length;
            staffData.price = null;
            await collections.staff.add(staffData);
            showToast('Staff member added');
        }
        closeAllModals();
    } catch (error) {
        console.error('Error saving staff member:', error);
        showToast('Error saving staff member. Please try again.', 'error');
    }
}
```

- [ ] **Step 3: Add delete-from-modal helper**

```js
function deleteStaffFromModal() {
    const staffId = document.getElementById('staff-id').value;
    if (staffId) {
        closeAllModals();
        deleteStaff(staffId);
    }
}
window.deleteStaffFromModal = deleteStaffFromModal;
```

- [ ] **Step 4: Update event listener setup**

Find the line that sets up the staff form listener (around line 1537):
```js
document.getElementById('staff-form').addEventListener('submit', handleStaffSubmit);
```

Add after it:
```js
    setupStaffTeamInput();
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat: add staff modal with team tags, schedule fields, and delete"
```

---

### Task 7: Update Excel Export

**Files:**
- Modify: `js/app.js` lines 4411–4434

- [ ] **Step 1: Replace exportStaffToExcel**

```js
function exportStaffToExcel() {
    const data = state.staff.map(member => ({
        'Name': member.name || '',
        'Role': member.role || '',
        'Teams': (member.teams || []).join(', '),
        'Thursday': (member.schedule && member.schedule.thursday) || '',
        'Friday': (member.schedule && member.schedule.friday) || '',
        'Saturday': (member.schedule && member.schedule.saturday) || '',
        'Sunday': (member.schedule && member.schedule.sunday) || '',
        'Placeholder': member.isPlaceholder ? 'Yes' : ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
        { wch: 22 },  // Name
        { wch: 28 },  // Role
        { wch: 30 },  // Teams
        { wch: 18 },  // Thursday
        { wch: 18 },  // Friday
        { wch: 18 },  // Saturday
        { wch: 18 },  // Sunday
        { wch: 10 }   // Placeholder
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Staff_List_${today}.xlsx`);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat: update staff Excel export for new schema"
```

---

### Task 8: Verification & Screenshot

- [ ] **Step 1: Run migration script**

Run: `cd "/Users/zachlarmer/Desktop/Claude Projects/Gala Manager App/gala-management" && node scripts/populate_staff.js`
Expected: Staff members populated successfully

- [ ] **Step 2: Serve locally and take screenshot**

Run: `lsof -i :8000` to check if server is running, then:
`cd "/Users/zachlarmer/Desktop/Claude Projects/Gala Manager App/gala-management" && python3 -m http.server 8000`

Use Playwright MCP to navigate to `http://localhost:8000` and click on the Staff page. Take screenshots of:
1. Team View — verify cards display with team sections, schedule indicators, multi-team badges
2. Schedule View — switch to Gantt view, verify Saturday is selected, time bars render correctly
3. Modal — click a staff card, verify edit modal opens with team tags, schedule fields populated

- [ ] **Step 3: Fix any visual issues found in screenshots**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: polish staff page based on visual verification"
```

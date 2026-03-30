# Staff Page Rebuild — Design Spec

## Context

The current staff page is a flat card grid with name/role/responsibilities/contact fields. The actual staffing data lives in a spreadsheet organized by **team** with **per-day schedules** across 4 days (Thu–Sun). The page needs to be rebuilt to display this team-and-schedule-based data clearly, and become the source of truth (fully editable) replacing the spreadsheet.

## Data Model

One Firestore document per person in the `staff` collection:

```js
{
  name: "Luisana Salazar",
  role: "Guest Check In Supervisor",
  teams: ["Check In", "Power 20"],     // array — supports multi-team
  schedule: {
    thursday: null,                      // null = not working
    friday: "10:00am - 6pm",            // raw text string
    saturday: "10:00am - 6pm",
    sunday: null
  },
  isPlaceholder: false,                  // true for ASA / ? entries
  price: null,                           // stored but not displayed as $
  sortOrder: 0,                          // preserves ordering within teams
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

- `isPlaceholder` = true for entries named "ASA" or "?" — rendered dimmed
- `teams` is always an array (even for single-team members)
- `schedule` values are free-text strings (not parsed times)
- `price` is stored to power a subtle "$" badge indicating budget linkage
- Teams are derived from data — no separate teams collection

## Views

### Team View (default)

- Card grid grouped under team headers
- Each team has a header bar with team name and staff count, collapsible
- Person cards show:
  - **Name** (bold)
  - **Role** (gold accent)
  - **Schedule at a glance** — compact day indicators (Thu/Fri/Sat/Sun) showing hours for working days, dimmed dash for off days
  - **Multi-team badges** — small "+TeamName" pills for additional teams
  - **Placeholder styling** — ASA/? cards rendered with reduced opacity and dashed border
- Click any card → opens edit modal
- Multi-team people appear under each of their teams
- Search filters across name/role/team

### Schedule View (Gantt)

- Day tabs: Thu / Fri / Sat / Sun with headcount per day
- Horizontal timeline axis: 7am – 2am
- Rows grouped by team, each person gets a row with time bar(s)
- Split shifts rendered as multiple bars (e.g., "1-5pm" + "10:30p-2:30a")
- Identical placeholder entries collapsed: "ASA ×11" as single row
- "$" badge next to names with a price value (budget linkage)
- Multi-team tags shown inline next to names
- Team-specific bar colors from a preset palette (assigned by team name)
- Click a bar or name → opens edit modal
- Time parsing: extract start/end times from schedule text to position bars

### Header Bar

- Page title "Staff"
- Toggle: Team View / Schedule View
- Search input
- "+ Add Staff" button
- Stats row: total staff, team count, unfilled positions count

## Edit Modal

Opens on card click or "+ Add Staff":

- **Name** — text input
- **Role** — text input
- **Teams** — tag-style multi-select. Shows current teams as removable pills. "+ Add team" to type/select a new team name. Autocompletes from existing team names.
- **Schedule** — 4 rows (Thu/Fri/Sat/Sun), each with a text input for hours. Leave blank for "not working."
- **Is Placeholder** — checkbox (auto-set for ASA/? on import, editable)
- Save / Cancel / Delete buttons

## Initial Data Import

Migration script (`scripts/populate_staff.js`) that:
1. Reads the CSV
2. Deduplicates people appearing on multiple teams (merges into single record with multiple teams)
3. Clears existing staff collection
4. Populates Firestore with new schema

## What's Removed

- Phone/email contact fields (dropped per user request)
- Responsibilities textarea (replaced by role + schedule)
- The old flat card rendering and stats (total/unique roles/contact info)

## What's Preserved

- Real-time Firestore sync via `setupCollectionListener`
- Search functionality (adapted to new fields)
- Export to Excel (adapted to new fields)
- Print support
- Staggered card entrance animations

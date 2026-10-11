// Run: node --test tests/   (no dependencies; Node 18+)
const test = require('node:test');
const assert = require('node:assert');
const { todayET, parseDateOnly, isBeforeTodayET, formatDateOnly } = require('../js/dates.js');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 11:30 PM EDT on Oct 10 — the UTC date is already Oct 11.
const LATE_EVENING = new Date('2026-10-10T23:30:00-04:00');

test('todayET is the Eastern date when UTC is already tomorrow', () => {
    assert.strictEqual(LATE_EVENING.toISOString().split('T')[0], '2026-10-11'); // the old bug
    assert.strictEqual(todayET(LATE_EVENING), '2026-10-10');
});

test('todayET across the Nov 1, 2026 DST change', () => {
    assert.strictEqual(todayET(new Date('2026-10-31T23:30:00-04:00')), '2026-10-31');
    assert.strictEqual(todayET(new Date('2026-11-01T01:30:00-05:00')), '2026-11-01');
    assert.strictEqual(todayET(new Date('2026-11-01T19:30:00-05:00')), '2026-11-01');
});

test('a task due today is not overdue, yesterday is', () => {
    assert.strictEqual(isBeforeTodayET('2026-10-10', LATE_EVENING), false);
    assert.strictEqual(isBeforeTodayET('2026-10-09', LATE_EVENING), true);
    assert.strictEqual(isBeforeTodayET('', LATE_EVENING), false);
});

test('parseDateOnly keeps the calendar day in any time zone', () => {
    const d = parseDateOnly('2026-04-25');
    assert.strictEqual(d.getFullYear(), 2026);
    assert.strictEqual(d.getMonth(), 3);
    assert.strictEqual(d.getDate(), 25);
});

test('formatDateOnly prints the stored calendar day regardless of zone', () => {
    assert.strictEqual(formatDateOnly('2026-04-25', { month: 'short', day: 'numeric', year: 'numeric' }), 'Apr 25, 2026');
    assert.strictEqual(formatDateOnly('2026-11-01', { weekday: 'long', month: 'long', day: 'numeric' }), 'Sunday, November 1');
});

test('check:dates passes on the codebase and catches raw date patterns', () => {
    const repo = path.join(__dirname, '..');
    execFileSync('node', ['scripts/check-dates.mjs'], { cwd: repo });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dates-'));
    fs.mkdirSync(path.join(tmp, 'js'));
    fs.copyFileSync(path.join(repo, 'scripts/check-dates.mjs'), path.join(tmp, 'check.mjs'));
    fs.writeFileSync(path.join(tmp, 'js/bad.js'), [
        "const a = new Date().toISOString().split('T')[0];",
        "const b = new Date().toLocaleDateString('en-US');",
        "const c = new Date('2026-10-10');",
        "const ok = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York' });",
    ].join('\n'));
    const r = spawnSync('node', ['check.mjs'], { cwd: tmp, encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /3 raw date pattern/);
});

// Run: node --test tests/   (no dependencies; Node 18+)
const test = require('node:test');
const assert = require('node:assert');
const { todayET, parseDateOnly, isBeforeTodayET } = require('../js/dates.js');

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

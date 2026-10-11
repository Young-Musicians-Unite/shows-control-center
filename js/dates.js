// Eastern-time date helpers (YMU is in Miami: America/New_York).
//
// `new Date().toISOString().split('T')[0]` is the UTC date, which is already
// tomorrow after 8 PM EDT / 7 PM EST, and `new Date('YYYY-MM-DD')` is UTC
// midnight — the previous evening in Eastern time. Use these instead.
// Loaded before app.js (plain script, functions land on window); also
// require()-able from Node for tests.
(function (root) {
    var APP_TZ = 'America/New_York';

    /** Today's date (YYYY-MM-DD) in Eastern time. */
    function todayET(now) {
        var parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(now || new Date());
        var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value || ''; };
        return get('year') + '-' + get('month') + '-' + get('day');
    }

    /** A date-only string ("YYYY-MM-DD") as a local Date at noon (never shifts a day). */
    function parseDateOnly(value) {
        return new Date(String(value).slice(0, 10) + 'T12:00:00');
    }

    /**
     * Format a date-only string ("YYYY-MM-DD") with toLocaleDateString options.
     * Pinned to UTC noon so the printed day never shifts with the viewer's zone.
     */
    function formatDateOnly(value, options, locale) {
        var ymd = String(value).slice(0, 10).split('-').map(Number);
        var d = new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2], 12));
        var opts = Object.assign({}, options || {}, { timeZone: 'UTC' });
        return d.toLocaleDateString(locale || 'en-US', opts);
    }

    /** True when a date-only due date is before today's Eastern date. */
    function isBeforeTodayET(value, now) {
        return !!value && String(value).slice(0, 10) < todayET(now);
    }

    var api = { APP_TZ: APP_TZ, todayET: todayET, parseDateOnly: parseDateOnly, isBeforeTodayET: isBeforeTodayET, formatDateOnly: formatDateOnly };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    for (var k in api) root[k] = api[k];
})(typeof window !== 'undefined' ? window : globalThis);

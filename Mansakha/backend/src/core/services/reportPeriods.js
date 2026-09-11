// Calendar-aware period resolution for the Detailed PDF Reports feature -
// sits alongside (does not replace) reportBuckets.js, which only knows
// "N even slices of an arbitrary day-count window" (Reports page's own
// 7d/30d/90d/custom chart filter). A generated report needs a REAL, fixed
// calendar period ("August 2026", "Q3 2026"), the way periodic government
// reports actually work - not a rolling "last N days" window.
//
// All boundaries are computed in UTC (Date.UTC, 'Z'-suffixed parsing),
// matching reportBuckets.js's own convention, so a report generated from
// any server/client timezone resolves the same calendar period. Labels are
// also formatted with an explicit UTC timeZone (unlike reportBuckets.js's
// existing labels) since a wrong-by-one-day month/quarter label here would
// be a visible, confusing bug - not just a chart axis mislabel.
const { resolveBuckets } = require('./reportBuckets');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function startOfMonthUtc(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function endOfMonthUtc(year, monthIndex) {
  // Day 0 of the NEXT month is the last day of THIS month - a standard JS
  // Date quirk (rolls back one day), not a bug.
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

// ISO 8601 week date math: week 1 of a year is the week containing that
// year's first Thursday; weeks run Monday-Sunday. Jan 4th always falls
// inside week 1 by definition, so anchoring on it and walking back to that
// week's Monday gives week 1's start regardless of what weekday Jan 1st is.
function isoWeekStartUtc(isoYear, isoWeek) {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Weekday);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7);
  return monday;
}

function formatFullDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function formatDayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
function formatMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

// { periodType, year, month (1-12), quarter (1-4), week (ISO week number),
//   customStart, customEnd (YYYY-MM-DD) } -> { periodStart, periodEnd, label }
// (real Date objects, not ISO strings - callers .toISOString() at the DB
// boundary, matching every other date this codebase passes around internally.)
function resolveReportPeriod({ periodType, year, month, quarter, week, customStart, customEnd }) {
  const now = new Date();
  const y = Number(year) || now.getUTCFullYear();

  if (periodType === 'monthly') {
    const m = Math.min(12, Math.max(1, Number(month) || now.getUTCMonth() + 1)) - 1;
    return { periodStart: startOfMonthUtc(y, m), periodEnd: endOfMonthUtc(y, m), label: `${MONTH_NAMES[m]} ${y}` };
  }

  if (periodType === 'quarterly') {
    const q = Math.min(4, Math.max(1, Number(quarter) || Math.floor(now.getUTCMonth() / 3) + 1));
    const firstMonth = (q - 1) * 3;
    return { periodStart: startOfMonthUtc(y, firstMonth), periodEnd: endOfMonthUtc(y, firstMonth + 2), label: `Q${q} ${y}` };
  }

  if (periodType === 'weekly') {
    const w = Math.min(53, Math.max(1, Number(week) || 1));
    const monday = isoWeekStartUtc(y, w);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return { periodStart: monday, periodEnd: sunday, label: `Week ${w}, ${y}` };
  }

  // 'custom' - also the graceful-degrade fallback for an unrecognized/
  // missing periodType, same philosophy as reportBuckets.js's own
  // resolveDateWindow (bad input -> a sane default, not a thrown error).
  const start = customStart ? new Date(`${customStart}T00:00:00.000Z`) : new Date(now.getTime() - 30 * 86400000);
  const end = customEnd ? new Date(`${customEnd}T23:59:59.999Z`) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    const fallbackEnd = now;
    const fallbackStart = new Date(fallbackEnd.getTime() - 30 * 86400000);
    return { periodStart: fallbackStart, periodEnd: fallbackEnd, label: `${formatFullDate(fallbackStart)} – ${formatFullDate(fallbackEnd)}` };
  }
  return { periodStart: start, periodEnd: end, label: `${formatFullDate(start)} – ${formatFullDate(end)}` };
}

// Buckets sized to how a reader actually thinks about each period type - a
// monthly report's trend reads week-by-week, a quarterly report's reads
// month-by-month, a weekly report's reads day-by-day. 'custom' has no
// natural calendar subdivision, so it falls back to reportBuckets.js's own
// "6 even slices" convention (the same one every live Reports.jsx chart uses).
//
// Every branch below builds each bucket's `end` as either the next natural
// boundary or `periodEnd` itself (whichever is smaller) - so only the final
// bucket ever ends exactly at periodEnd, matching bucketize()'s own
// "last bucket's end is inclusive" handling in reportBuckets.js.
function resolveTrendBuckets(periodStart, periodEnd, periodType) {
  if (periodType === 'weekly') {
    const buckets = [];
    for (let i = 0; i < 7; i += 1) {
      const start = new Date(periodStart.getTime() + i * 86400000);
      if (start > periodEnd) break;
      const naturalEnd = new Date(start.getTime() + 86400000);
      const end = naturalEnd < periodEnd ? naturalEnd : periodEnd;
      buckets.push({ start, end, label: formatDayLabel(start) });
    }
    return buckets;
  }

  if (periodType === 'quarterly') {
    const buckets = [];
    let cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      const start = startOfMonthUtc(y, m);
      const naturalEnd = endOfMonthUtc(y, m);
      const end = naturalEnd < periodEnd ? naturalEnd : periodEnd;
      buckets.push({ start, end, label: formatMonthLabel(start) });
      cursor = startOfMonthUtc(y, m + 1);
    }
    return buckets;
  }

  if (periodType === 'monthly') {
    // Weekly buckets aligned to periodStart (not ISO week boundaries) - a
    // calendar month never divides evenly into ISO weeks, and aligning to
    // the report's own start date is simpler to read than a partial ISO
    // week hanging off each end.
    const buckets = [];
    let cursor = new Date(periodStart);
    while (cursor <= periodEnd) {
      const start = new Date(cursor);
      const naturalEnd = new Date(start.getTime() + 7 * 86400000);
      const end = naturalEnd < periodEnd ? naturalEnd : periodEnd;
      const labelEnd = new Date(end.getTime() - 1); // display the last INCLUDED day, not the exclusive boundary
      buckets.push({ start, end, label: `${formatShortDate(start)}–${formatShortDate(labelEnd)}` });
      cursor = naturalEnd;
    }
    return buckets;
  }

  // 'custom'
  const { buckets } = resolveBuckets(periodStart, periodEnd);
  return buckets;
}

module.exports = { resolveReportPeriod, resolveTrendBuckets };

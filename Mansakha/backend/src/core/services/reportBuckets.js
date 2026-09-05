// Shared date-bucketing for the Reports page's charts (trend line, stacked
// severity matrix) - role-agnostic (Counsellor/District/State/National all
// use the same "pick N buckets across the resolved window" logic), so it
// lives here alongside jurisdictionTree.js rather than being copy-pasted
// per role like the route files themselves.
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };
const BUCKET_COUNT = 6;

// Resolves the `range`/`start`/`end` query params (as sent by Reports.jsx's
// time-range filter) into a concrete [since, until] window and a list of
// even buckets across it. `range` is one of '7d'|'30d'|'90d'|'custom';
// 'custom' requires `start`/`end` (ISO date strings, inclusive).
function resolveDateWindow({ range, start, end }) {
  const until = range === 'custom' && end ? new Date(`${end}T23:59:59.999Z`) : new Date();
  let since;
  if (range === 'custom' && start) {
    since = new Date(`${start}T00:00:00.000Z`);
  } else {
    const days = RANGE_DAYS[range] || RANGE_DAYS['30d'];
    since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  }
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime()) || since >= until) {
    // Malformed/inverted custom range - fall back to the 30-day default
    // rather than erroring, so a bad query param degrades gracefully.
    const days = RANGE_DAYS['30d'];
    const fallbackUntil = new Date();
    return resolveBuckets(new Date(fallbackUntil.getTime() - days * 24 * 60 * 60 * 1000), fallbackUntil);
  }
  return resolveBuckets(since, until);
}

function resolveBuckets(since, until) {
  const totalMs = until.getTime() - since.getTime();
  const bucketMs = totalMs / BUCKET_COUNT;
  const spanDays = totalMs / (24 * 60 * 60 * 1000);
  const buckets = [];
  for (let i = 0; i < BUCKET_COUNT; i += 1) {
    const bucketStart = new Date(since.getTime() + i * bucketMs);
    const bucketEnd = new Date(since.getTime() + (i + 1) * bucketMs);
    buckets.push({ start: bucketStart, end: bucketEnd, label: formatBucketLabel(bucketStart, bucketEnd, spanDays) });
  }
  return { since, until, buckets };
}

function formatBucketLabel(start, end, spanDays) {
  // Sub-3-day buckets (a 7-30 day window split 6 ways) read better as a
  // single date; wider buckets (90-day/custom windows) read better as a
  // short range so the reader knows it's an aggregate, not one day.
  // en-US (not en-IN) for a consistent 3-letter month abbreviation - en-IN
  // renders September as the 4-letter "Sept", clashing with every other
  // month's 3-letter form ("Aug", "Jul") in the same label row.
  const oneDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (spanDays / BUCKET_COUNT <= 3) return oneDate(start);
  return `${oneDate(start)}–${oneDate(new Date(end.getTime() - 1))}`;
}

// Places each row (anything with a Date-parseable `dateField`) into the
// bucket whose [start,end) it falls in; rows outside every bucket (clock
// skew, an edge exactly at `until`) are dropped rather than crashing.
function bucketize(rows, buckets, dateField) {
  const perBucket = buckets.map(() => []);
  for (const row of rows) {
    const t = new Date(row[dateField]).getTime();
    for (let i = 0; i < buckets.length; i += 1) {
      const isLast = i === buckets.length - 1;
      const inBucket = t >= buckets[i].start.getTime() && (isLast ? t <= buckets[i].end.getTime() : t < buckets[i].end.getTime());
      if (inBucket) {
        perBucket[i].push(row);
        break;
      }
    }
  }
  return perBucket;
}

// resolveBuckets is also exported (previously internal-only) for
// reportPeriods.js's 'custom' period type to reuse directly - same "6 even
// slices across a window" logic, without duplicating it.
module.exports = { resolveDateWindow, bucketize, resolveBuckets };

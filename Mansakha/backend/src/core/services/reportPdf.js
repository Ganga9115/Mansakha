// Detailed PDF Reports - HTML->PDF rendering. renderReportHtml() is a pure
// function (no I/O) so it's trivially testable on hand-built sample data;
// generatePdfBuffer() is the only part that touches Puppeteer.
const puppeteer = require('puppeteer');

// Mansakha's own existing risk-color tokens (reused exactly, not invented
// here) - same convention as every risk badge elsewhere in this codebase.
const RISK_COLORS = {
  Critical: { fg: '#7c3aed', bg: '#f1e9fd' },
  High: { fg: '#dc4545', bg: '#fce6e6' },
  Moderate: { fg: '#b8860b', bg: '#fdf3d9' },
  Low: { fg: '#519BCE', bg: '#EBF4FA' },
};
const NAVY = '#3D5A80';
const PANEL_BG = '#EBF4FA';
const BORDER = '#e6eaef';

const TIER_LABEL = { district: 'District', state: 'State', national: 'National' };

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function riskBadge(riskLevel) {
  if (!riskLevel) return '<span style="color:#9aa5b1;">&mdash;</span>';
  const c = RISK_COLORS[riskLevel] || { fg: '#555', bg: '#eee' };
  return `<span class="badge" style="color:${c.fg};background:${c.bg};">${escapeHtml(riskLevel)}</span>`;
}

function formatScore(score) {
  return score === null || score === undefined ? '&mdash;' : escapeHtml(String(score));
}

function formatMinutes(mins) {
  return mins === null || mins === undefined ? '&mdash;' : `${escapeHtml(String(mins))} min`;
}

// Small inline bar-chart SVG - placed directly above a compact table
// repeating the same numbers (never a chart with no backing table), per the
// reference PDF's own convention. `maxLabelChars` truncates only the CHART's
// own x-axis label (with an ellipsis) - the full, untruncated value is
// always still readable in the table underneath, so a long case-type name
// doesn't overlap its neighbors when there are many bars.
function buildBarChartSvg(items, { valueKey, labelKey, width = 640, height = 200, maxLabelChars = null }) {
  const padding = { top: 24, right: 16, bottom: 34, left: 16 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const n = Math.max(1, items.length);
  const barGap = 10;
  const barWidth = Math.max(4, chartWidth / n - barGap);

  const numericValues = items.map((it) => Number(it[valueKey])).filter((v) => !Number.isNaN(v));
  const maxValue = numericValues.length ? Math.max(...numericValues, 1) : 1;

  const bars = items
    .map((item, i) => {
      const raw = item[valueKey];
      const v = raw === null || raw === undefined || Number.isNaN(Number(raw)) ? 0 : Number(raw);
      const barHeight = maxValue > 0 ? (v / maxValue) * chartHeight : 0;
      const x = padding.left + i * (chartWidth / n) + (chartWidth / n - barWidth) / 2;
      const y = padding.top + (chartHeight - barHeight);
      let labelText = String(item[labelKey]);
      if (maxLabelChars && labelText.length > maxLabelChars) labelText = `${labelText.slice(0, maxLabelChars - 1)}…`;
      const label = escapeHtml(labelText);
      const displayValue = raw === null || raw === undefined ? '-' : String(raw);
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, barHeight).toFixed(1)}" fill="#519BCE" rx="2"/>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="10" text-anchor="middle" fill="${NAVY}">${escapeHtml(displayValue)}</text>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${(height - padding.bottom + 16).toFixed(1)}" font-size="9" text-anchor="middle" fill="#5a6570">${label}</text>
      `;
    })
    .join('');

  const baselineY = (padding.top + chartHeight).toFixed(1);
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px;display:block;margin:0 auto;">
    <line x1="${padding.left}" y1="${baselineY}" x2="${width - padding.right}" y2="${baselineY}" stroke="${BORDER}" stroke-width="1"/>
    ${bars}
  </svg>`;
}

// `description` (optional) is a one-line framing sentence rendered right
// under the banner - added so a section never collapses to just a bare
// table with no context, per user feedback that the report "looks empty"
// even where it does have real data.
function sectionBanner(title, description) {
  const desc = description ? `<p class="section-desc">${escapeHtml(description)}</p>` : '';
  return `<div class="section-banner"><h3>${escapeHtml(title)}</h3></div>${desc}`;
}

// Semantic color mapping for a 30-day trend arrow next to a rollup row -
// 'up' means the average DISTRESS score rose (a bad sign, so it borrows the
// existing High risk-color token), 'down' means it fell (good, existing
// Reviewed-badge green), 'flat' is neutral grey. Reuses tokens already
// defined elsewhere in this file rather than inventing new colors.
function trendGlyph(direction) {
  if (direction === 'up') return `<span style="color:${RISK_COLORS.High.fg};font-weight:700;" title="Average distress score rising">&#9650;</span>`;
  if (direction === 'down') return `<span style="color:#1a7f45;font-weight:700;" title="Average distress score falling">&#9660;</span>`;
  return `<span style="color:#9aa5b1;font-weight:700;" title="Steady">&#9644;</span>`;
}

function table(headers, rows) {
  return `<table>
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}" class="empty">No data for this period</td></tr>`}</tbody>
  </table>`;
}

function buildCasesSection(cases, summary) {
  const rows = cases.map((c) => [
    escapeHtml(c.docketNumber),
    escapeHtml(c.caseTypeName),
    escapeHtml(c.caseStage),
    escapeHtml(c.counsellorName),
    riskBadge(c.riskLevel),
    formatScore(c.score),
  ]);
  const stats = `<div class="stat-strip">
    <div class="stat"><span class="stat-value">${summary.totalCases}</span><span class="stat-label">Total Cases</span></div>
    <div class="stat"><span class="stat-value" style="color:${RISK_COLORS.Critical.fg}">${summary.criticalCases}</span><span class="stat-label">Critical</span></div>
    <div class="stat"><span class="stat-value" style="color:${RISK_COLORS.High.fg}">${summary.highRiskCases}</span><span class="stat-label">High</span></div>
    <div class="stat"><span class="stat-value" style="color:${RISK_COLORS.Moderate.fg}">${summary.moderateCases}</span><span class="stat-label">Moderate</span></div>
    <div class="stat"><span class="stat-value" style="color:${RISK_COLORS.Low.fg}">${summary.lowRiskCases}</span><span class="stat-label">Low</span></div>
  </div>`;
  return `${sectionBanner('Case Load & Risk Distribution', 'Every case currently open in this district, with its most recent risk assessment.')}${stats}${table(
    ['Docket Number', 'Case Type', 'Stage', 'Counsellor', 'Risk Level', 'Score'],
    rows
  )}`;
}

function buildComparisonSection(title, description, items, itemLabel) {
  const stats = `<div class="stat-strip">
    <div class="stat"><span class="stat-value">${items.length}</span><span class="stat-label">${escapeHtml(itemLabel)}s Reporting</span></div>
  </div>`;
  const rows = items.map((it) => [
    escapeHtml(it.name),
    String(it.totalCases),
    `<span style="color:${RISK_COLORS.Critical.fg};font-weight:600;">${it.criticalCases}</span>`,
    `<span style="color:${RISK_COLORS.High.fg};font-weight:600;">${it.highRiskCases}</span>`,
    `<span style="color:${RISK_COLORS.Moderate.fg};font-weight:600;">${it.moderateCases}</span>`,
    trendGlyph(it.trendDirection),
  ]);
  return `${sectionBanner(title, description)}${stats}${table([itemLabel, 'Total Cases', 'Critical', 'High', 'Moderate', '30d Trend'], rows)}`;
}

function buildDistressTrendSection(distressTrend) {
  const chart = buildBarChartSvg(distressTrend, { valueKey: 'avgScore', labelKey: 'label' });
  const rows = distressTrend.map((t) => [escapeHtml(t.label), t.avgScore === null ? '&mdash;' : String(t.avgScore)]);
  return `${sectionBanner('Distress Trend', 'Average distress score over time across this report’s own sub-periods.')}<div class="chart-wrap">${chart}</div>${table(['Period', 'Average Distress Score'], rows)}`;
}

function buildCounsellorsSection(counsellors) {
  const desc = 'Each counsellor’s current caseload and observed impact (earliest vs. most recent distress score per assigned case).';
  if (counsellors.length === 0) {
    return `${sectionBanner('Counsellor Workload', desc)}<p class="empty-note">No counsellors are currently assigned to this district.</p>`;
  }
  const rows = counsellors.map((c) => [
    escapeHtml(c.fullName || 'Unknown'),
    String(c.activeCaseCount),
    c.avgDistressPointDrop === null ? '&mdash;' : String(c.avgDistressPointDrop),
    String(c.usersConsideredForEfficacy),
  ]);
  return `${sectionBanner('Counsellor Workload', desc)}${table(
    ['Counsellor', 'Active Cases', 'Avg. Distress Point Drop', 'Cases Considered'],
    rows
  )}`;
}

function buildResponseTimesSection(rt) {
  const rows = [
    ['Total SOS Events', String(rt.totalSosCount)],
    ['Open SOS Events', String(rt.openSosCount)],
    ['Avg. Time to Acknowledge', formatMinutes(rt.avgAcknowledgeMinutes)],
    ['Avg. Time to Resolve', formatMinutes(rt.avgResolveMinutes)],
  ];
  return `${sectionBanner('Alert & SOS Response Times', 'User-initiated SOS events (separate from the automatic Critical-score alerts covered under Alert Volume & Status) and how quickly this district responded.')}${table(['Metric', 'Value'], rows)}`;
}

function buildRecipientsSection(recipients) {
  const rows = (recipients || []).map((r) => [
    escapeHtml(r.recipientType === 'ministry' ? 'Ministry' : r.jurisdictionName || 'Unknown jurisdiction'),
    r.isPrimary ? 'Primary' : 'Cc',
    `<span class="badge" style="${r.status === 'Reviewed' ? `color:#1a7f45;background:#e3f6ea;` : `color:${NAVY};background:${PANEL_BG};`}">${escapeHtml(r.status)}</span>`,
    r.reviewedAt ? formatDate(r.reviewedAt) : '&mdash;',
  ]);
  return `${sectionBanner('Submission & Review Trail', 'Who this report was sent to and whether each recipient has reviewed it.')}${table(['Recipient', 'Role', 'Status', 'Reviewed On'], rows)}`;
}

// ===== "Looks empty" fixes - new sections =====

function buildCaseTypeDistributionSection(caseTypeDistribution, scopeLabel) {
  const desc = `Current breakdown of ${scopeLabel} by legal case type (a snapshot of the caseload as it stands today, not scoped to this reporting period).`;
  if (!caseTypeDistribution || caseTypeDistribution.length === 0) {
    return `${sectionBanner('Case Type Distribution', desc)}<p class="empty-note">No cases recorded.</p>`;
  }
  // Charted bars capped to the top 8 by count (long case-type names can
  // otherwise overlap once there are more than a handful) - the table right
  // below still lists every type in full.
  const chartItems = caseTypeDistribution.slice(0, 8);
  const chart = buildBarChartSvg(chartItems, { valueKey: 'count', labelKey: 'caseTypeName', maxLabelChars: 14 });
  const rows = caseTypeDistribution.map((c) => [escapeHtml(c.caseTypeName), String(c.count)]);
  return `${sectionBanner('Case Type Distribution', desc)}<div class="chart-wrap">${chart}</div>${table(['Case Type', 'Count'], rows)}`;
}

function buildCaseStageDistributionSection(caseStageDistribution) {
  const desc = 'Where each of this district’s cases currently stands in the judicial/rehabilitation process (a current snapshot, not scoped to this reporting period).';
  if (!caseStageDistribution || caseStageDistribution.length === 0) {
    return `${sectionBanner('Case Stage Distribution', desc)}<p class="empty-note">No cases recorded.</p>`;
  }
  const chart = buildBarChartSvg(caseStageDistribution, { valueKey: 'count', labelKey: 'caseStage' });
  const rows = caseStageDistribution.map((c) => [escapeHtml(c.caseStage), String(c.count)]);
  return `${sectionBanner('Case Stage Distribution', desc)}<div class="chart-wrap">${chart}</div>${table(['Case Stage', 'Count'], rows)}`;
}

function buildNewEnrollmentsSection(newEnrollments) {
  const desc = 'Cases newly registered in this district during this reporting period.';
  if (newEnrollments.count === 0) {
    return `${sectionBanner('New Enrollments', desc)}<p class="empty-note">No new cases were registered during this period.</p>`;
  }
  const rows = newEnrollments.cases.map((c) => [escapeHtml(c.docketNumber), escapeHtml(c.caseTypeName), formatDate(c.enrolledAt)]);
  return `${sectionBanner('New Enrollments', desc)}<p class="stat-line"><span class="stat-line-value">${newEnrollments.count}</span> new case(s) registered this period.</p>${table(['Docket Number', 'Case Type', 'Enrolled On'], rows)}`;
}

// Distinct layout (not a plain table) per explicit user request: a
// mid-page callout of 3 colored stat tiles for the Open/Acknowledged/
// Resolved 3-state breakdown, a matching stacked bar showing their relative
// share, and a small exact-numbers table underneath (same "chart always
// paired with its table" rule as the rest of the document, just with a
// tile+bar pairing here instead of the usual bar-chart-above-table).
function buildAlertVolumeSection(alertVolume) {
  const desc = 'Critical-score-triggered alerts raised for this district’s cases during this period (separate from the user-initiated SOS events covered under Alert & SOS Response Times), and where each currently stands.';
  const { open, acknowledged, resolved, total } = alertVolume;
  if (total === 0) {
    return `${sectionBanner('Alert Volume & Status', desc)}<p class="empty-note">No alerts were triggered for this district’s cases during this period.</p>`;
  }
  const tiles = `<div class="alert-tiles">
    <div class="alert-tile alert-tile-open"><span class="alert-tile-value">${open}</span><span class="alert-tile-label">Open</span></div>
    <div class="alert-tile alert-tile-ack"><span class="alert-tile-value">${acknowledged}</span><span class="alert-tile-label">Acknowledged</span></div>
    <div class="alert-tile alert-tile-resolved"><span class="alert-tile-value">${resolved}</span><span class="alert-tile-label">Resolved</span></div>
  </div>`;
  const seg = (n) => (total > 0 ? ((n / total) * 100).toFixed(1) : '0');
  const bar = `<div class="stacked-bar">
    ${open > 0 ? `<div class="stacked-seg seg-open" style="width:${seg(open)}%"></div>` : ''}
    ${acknowledged > 0 ? `<div class="stacked-seg seg-ack" style="width:${seg(acknowledged)}%"></div>` : ''}
    ${resolved > 0 ? `<div class="stacked-seg seg-resolved" style="width:${seg(resolved)}%"></div>` : ''}
  </div>`;
  const exactTable = table(['Open', 'Acknowledged', 'Resolved', 'Total'], [[String(open), String(acknowledged), String(resolved), String(total)]]);
  return `${sectionBanner('Alert Volume & Status', desc)}${tiles}${bar}${exactTable}`;
}

// Distinct layout per explicit user request: one row per intervention type,
// each a compact split-bar (completed vs. not-yet-completed share) with the
// exact counts as inline badges - reads as "status of interventions" at a
// glance rather than a generic count table, without a second table repeating
// the same two numbers (already fully explicit inline on each row).
function buildInterventionSummarySection(interventionSummary) {
  const desc = 'Interventions (counselling, medical, legal aid, etc.) recommended for this district’s cases during this period, and how many have been completed.';
  if (!interventionSummary || interventionSummary.length === 0) {
    return `${sectionBanner('Intervention Summary', desc)}<p class="empty-note">No interventions were recommended for this district’s cases during this period.</p>`;
  }
  const rows = interventionSummary
    .map((it) => {
      const pct = it.totalCount > 0 ? (it.completedCount / it.totalCount) * 100 : 0;
      return `<div class="intervention-row">
        <div class="intervention-label">${escapeHtml(it.interventionTypeName)}</div>
        <div class="intervention-bar"><div class="intervention-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="intervention-counts"><span class="badge-completed">${it.completedCount} completed</span><span class="badge-pending">${it.notCompletedCount} in progress</span></div>
      </div>`;
    })
    .join('');
  return `${sectionBanner('Intervention Summary', desc)}<div class="intervention-grid">${rows}</div>`;
}

function buildLegalProceedingsSection(legalProceedings) {
  const desc = 'Court case records synced for this district’s cases (via the eCourts-style simulation) – filing status, key Acts/Sections, and hearings scheduled this period.';
  if (legalProceedings.casesWithRecord === 0) {
    return `${sectionBanner('Legal Proceedings', desc)}<p class="empty-note">${escapeHtml(legalProceedings.message)}.</p>`;
  }
  const stats = `<div class="stat-strip">
    <div class="stat"><span class="stat-value">${legalProceedings.casesWithRecord}</span><span class="stat-label">Cases w/ Record</span></div>
    <div class="stat"><span class="stat-value" style="color:${RISK_COLORS.High.fg}">${legalProceedings.pendingCount}</span><span class="stat-label">Pending</span></div>
    <div class="stat"><span class="stat-value" style="color:#1a7f45">${legalProceedings.disposedCount}</span><span class="stat-label">Disposed</span></div>
  </div>`;
  const actsSection = legalProceedings.topActsSections.length
    ? `<p class="subheading">Most Common Acts &amp; Sections</p>${table(['Act / Section', 'Cases'], legalProceedings.topActsSections.map((a) => [escapeHtml(a.label), String(a.count)]))}`
    : '';
  const hearingsSection = `<p class="subheading">Hearings Scheduled This Period</p>${table(
    ['Docket Number', 'Hearing Date', 'Purpose'],
    legalProceedings.upcomingHearings.map((h) => [escapeHtml(h.docketNumber), formatDate(h.nextHearingDate), escapeHtml(h.nextHearingPurpose || '—')])
  )}`;
  return `${sectionBanner('Legal Proceedings', desc)}${stats}${actsSection}${hearingsSection}`;
}

function buildReportingComplianceSection(reportingCompliance, tier) {
  const childLabel = tier === 'state' ? 'District' : 'State';
  const reportedCount = reportingCompliance.filter((r) => r.hasReported).length;
  const desc = tier === 'state'
    ? 'Which of this state’s districts have submitted their own report for this same period.'
    : 'Which of this nation’s states have submitted their own report for this same period.';
  const statLine = `<p class="stat-line"><span class="stat-line-value">${reportedCount} of ${reportingCompliance.length}</span> ${childLabel.toLowerCase()}(s) reported this period.</p>`;
  const rows = reportingCompliance.map((r) => [
    escapeHtml(r.name),
    r.hasReported
      ? `<span class="badge" style="color:#1a7f45;background:#e3f6ea;">${escapeHtml(r.reportStatus)}</span>`
      : `<span class="badge" style="color:#9aa5b1;background:#f1f2f4;">Not Reported</span>`,
  ]);
  return `${sectionBanner('Reporting Compliance', desc)}${statLine}${table([childLabel, 'Status'], rows)}`;
}

function statusBadgeColor(status) {
  if (status === 'Reviewed') return { fg: '#1a7f45', bg: '#e3f6ea' };
  if (status === 'Submitted') return { fg: NAVY, bg: PANEL_BG };
  return { fg: '#6b7280', bg: '#f1f2f4' }; // Draft
}

// report: { jurisdictionName, periodLabel, periodType, tier, snapshot,
//   commentary, status, generatedByName, generatedAt, recipients }
function renderReportHtml(report) {
  const { jurisdictionName, periodLabel, tier, snapshot, commentary, status, generatedByName, generatedAt, recipients } = report;
  const tierLabel = TIER_LABEL[tier] || 'Jurisdiction';
  const title = `${jurisdictionName} ${tierLabel} Progress Report`;
  const statusColor = statusBadgeColor(status);

  // Build the section list dynamically from which snapshot keys are
  // actually present - District has Counsellor Workload/Response Times/etc,
  // State/National don't, so the TOC (and the sections themselves) must
  // never be a hardcoded fixed list across all 3 tiers.
  const sections = [];
  if (snapshot.cases) sections.push({ title: 'Case Load & Risk Distribution', html: buildCasesSection(snapshot.cases, snapshot.summary) });
  if (snapshot.districts) sections.push({ title: 'District Load Comparison', html: buildComparisonSection('District Load Comparison', 'Each of this state’s districts, side by side, with its own 30-day distress-score trend.', snapshot.districts, 'District') });
  if (snapshot.states) sections.push({ title: 'State Load Comparison', html: buildComparisonSection('State Load Comparison', 'Each of this nation’s states, side by side, with its own 30-day distress-score trend.', snapshot.states, 'State') });
  if (snapshot.caseTypeDistribution) {
    const scopeLabel = snapshot.cases ? 'this district’s cases' : snapshot.districts ? 'this state’s cases' : 'this nation’s cases';
    sections.push({ title: 'Case Type Distribution', html: buildCaseTypeDistributionSection(snapshot.caseTypeDistribution, scopeLabel) });
  }
  if (snapshot.caseStageDistribution) sections.push({ title: 'Case Stage Distribution', html: buildCaseStageDistributionSection(snapshot.caseStageDistribution) });
  if (snapshot.newEnrollments) sections.push({ title: 'New Enrollments', html: buildNewEnrollmentsSection(snapshot.newEnrollments) });
  if (snapshot.distressTrend) sections.push({ title: 'Distress Trend', html: buildDistressTrendSection(snapshot.distressTrend) });
  if (snapshot.alertVolume) sections.push({ title: 'Alert Volume & Status', html: buildAlertVolumeSection(snapshot.alertVolume) });
  if (snapshot.interventionSummary) sections.push({ title: 'Intervention Summary', html: buildInterventionSummarySection(snapshot.interventionSummary) });
  if (snapshot.legalProceedings) sections.push({ title: 'Legal Proceedings', html: buildLegalProceedingsSection(snapshot.legalProceedings) });
  if (snapshot.counsellors) sections.push({ title: 'Counsellor Workload', html: buildCounsellorsSection(snapshot.counsellors) });
  if (snapshot.responseTimes) sections.push({ title: 'Alert & SOS Response Times', html: buildResponseTimesSection(snapshot.responseTimes) });
  if (snapshot.reportingCompliance) sections.push({ title: 'Reporting Compliance', html: buildReportingComplianceSection(snapshot.reportingCompliance, snapshot.tier) });
  sections.push({ title: 'Submission & Review Trail', html: buildRecipientsSection(recipients) });

  // No live page-number column - Puppeteer only exposes the running
  // pageNumber/totalPages counters inside the fixed header/footer template,
  // not to the page body's own content, so this TOC can't know each
  // section's real final page ahead of the render. Dotted leaders alone
  // still read as a proper TOC (and the footer on every page already gives
  // the reader a live page count to navigate by).
  const tocItems = sections
    .map((s, i) => `<li><span class="toc-title">${i + 1}. ${escapeHtml(s.title)}</span><span class="dots"></span></li>`)
    .join('');

  const commentaryBlock = commentary
    ? `<div class="section"><div class="section-banner"><h3>Commentary</h3></div><p class="commentary">${escapeHtml(commentary).replace(/\n/g, '<br/>')}</p></div>`
    : '';

  const html = `<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; font-size: 12px; }
  h1, h2, h3 { margin: 0; }
  .page { padding: 24px 4px; }
  .cover { page-break-after: always; height: 100vh; display: flex; align-items: center; justify-content: center; background: ${PANEL_BG}; }
  .cover-inner { text-align: center; max-width: 560px; }
  .cover-title { color: ${NAVY}; font-size: 30px; font-weight: 700; margin-bottom: 14px; line-height: 1.3; }
  .cover-subtitle { font-style: italic; font-size: 16px; color: #445; margin-bottom: 28px; }
  .cover-caption { font-size: 11px; color: #667; margin-bottom: 18px; }
  .status-badge { display: inline-block; padding: 5px 16px; border-radius: 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: ${statusColor.fg}; background: ${statusColor.bg}; }
  .toc-page { page-break-after: always; padding: 40px 30px; }
  .toc-page h2 { color: ${NAVY}; font-size: 20px; margin-bottom: 24px; border-bottom: 2px solid ${PANEL_BG}; padding-bottom: 10px; }
  .toc-page ul { list-style: none; margin: 0; padding: 0; }
  .toc-page li { display: flex; align-items: baseline; font-size: 13px; padding: 8px 0; }
  .toc-title { white-space: nowrap; color: #263; font-weight: 600; }
  .dots { flex: 1; border-bottom: 1px dotted #aab; margin: 0 8px; height: 1px; }
  .section { padding: 0 30px 26px; }
  .section-banner { background: ${PANEL_BG}; border-radius: 6px; padding: 8px 14px; margin-bottom: 6px; }
  .section-banner h3 { color: ${NAVY}; font-size: 14px; }
  .section-desc { font-size: 10.5px; color: #5a6570; margin: 0 0 12px; line-height: 1.4; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 11px; }
  th, td { border: 1px solid ${BORDER}; padding: 6px 8px; text-align: left; }
  th { background: #f4f6f8; text-transform: uppercase; font-size: 9.5px; font-weight: 700; color: #4b5563; letter-spacing: 0.02em; }
  td.empty { text-align: center; color: #9aa5b1; font-style: italic; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 10.5px; font-weight: 600; }
  .stat-strip { display: flex; gap: 10px; margin-bottom: 14px; }
  .stat { flex: 1; border: 1px solid ${BORDER}; border-radius: 6px; padding: 8px 6px; text-align: center; }
  .stat-value { display: block; font-size: 18px; font-weight: 700; color: ${NAVY}; }
  .stat-label { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.02em; margin-top: 2px; }
  .stat-line { font-size: 12px; margin: 0 0 10px; color: #374151; }
  .stat-line-value { font-weight: 700; color: ${NAVY}; }
  .chart-wrap { border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 8px; margin-bottom: 12px; background: #fff; }
  .commentary { white-space: pre-wrap; line-height: 1.5; }
  .empty-note { font-size: 11px; color: #6b7280; font-style: italic; border: 1px dashed ${BORDER}; border-radius: 6px; padding: 12px 14px; margin: 0 0 12px; }
  .subheading { font-size: 11px; font-weight: 700; color: ${NAVY}; margin: 14px 0 6px; }
  /* Alert Volume & Status - distinct stat-tile + stacked-bar treatment,
     deliberately different from the plain bar-chart-above-table pattern
     used everywhere else, per explicit request. */
  .alert-tiles { display: flex; gap: 10px; margin-bottom: 10px; }
  .alert-tile { flex: 1; border-radius: 8px; padding: 14px 8px; text-align: center; }
  .alert-tile-value { display: block; font-size: 22px; font-weight: 700; }
  .alert-tile-label { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.03em; margin-top: 4px; }
  .alert-tile-open { background: ${RISK_COLORS.High.bg}; }
  .alert-tile-open .alert-tile-value { color: ${RISK_COLORS.High.fg}; }
  .alert-tile-open .alert-tile-label { color: ${RISK_COLORS.High.fg}; }
  .alert-tile-ack { background: ${RISK_COLORS.Moderate.bg}; }
  .alert-tile-ack .alert-tile-value { color: ${RISK_COLORS.Moderate.fg}; }
  .alert-tile-ack .alert-tile-label { color: ${RISK_COLORS.Moderate.fg}; }
  .alert-tile-resolved { background: #e3f6ea; }
  .alert-tile-resolved .alert-tile-value { color: #1a7f45; }
  .alert-tile-resolved .alert-tile-label { color: #1a7f45; }
  .stacked-bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: #f1f2f4; margin-bottom: 12px; }
  .seg-open { background: ${RISK_COLORS.High.fg}; }
  .seg-ack { background: ${RISK_COLORS.Moderate.fg}; }
  .seg-resolved { background: #1a7f45; }
  /* Intervention Summary - distinct split-bar-per-type treatment, also
     deliberately different from both the tile layout above and the plain
     table pattern elsewhere. */
  .intervention-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .intervention-row { display: flex; align-items: center; gap: 10px; }
  .intervention-label { flex: 0 0 140px; font-size: 11px; font-weight: 600; color: #263; }
  .intervention-bar { flex: 1; height: 10px; border-radius: 5px; background: ${RISK_COLORS.Moderate.bg}; overflow: hidden; }
  .intervention-bar-fill { height: 100%; background: #1a7f45; }
  .intervention-counts { flex: 0 0 190px; text-align: right; font-size: 9.5px; white-space: nowrap; }
  .badge-completed { display: inline-block; padding: 2px 7px; border-radius: 9px; background: #e3f6ea; color: #1a7f45; font-weight: 600; margin-right: 4px; }
  .badge-pending { display: inline-block; padding: 2px 7px; border-radius: 9px; background: ${RISK_COLORS.Moderate.bg}; color: ${RISK_COLORS.Moderate.fg}; font-weight: 600; }
</style>
<div class="cover">
  <div class="cover-inner">
    <div class="cover-title">${escapeHtml(title)}</div>
    <div class="cover-subtitle">${escapeHtml(periodLabel)}</div>
    <div class="cover-caption">Generated by ${escapeHtml(generatedByName || 'Unknown')} on ${escapeHtml(formatDate(generatedAt))}</div>
    <div class="status-badge">${escapeHtml(status)}</div>
  </div>
</div>
<div class="toc-page">
  <h2>Table of Contents</h2>
  <ul>${tocItems}</ul>
</div>
${sections.map((s) => `<div class="section">${s.html}</div>`).join('')}
${commentaryBlock}
`;

  return { html, title, periodLabel };
}

// puppeteer.launch/page.setContent/page.pdf, per the already-run feasibility
// spike. printBackground:true is required for any of the above CSS (cover
// panel, section banners, risk badges, status badge) to actually render in
// the output PDF - Chromium's PDF export omits background colors by default.
async function generatePdfBuffer(html, { periodLabel, title } = {}) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    const headerTemplate = `<div style="font-size:8px;width:100%;padding:0 40px;display:flex;justify-content:space-between;color:#667;font-family:Arial,sans-serif;">
      <span>${escapeHtml(periodLabel || '')}</span><span>${escapeHtml(title || '')}</span>
    </div>`;
    const footerTemplate = `<div style="font-size:8px;width:100%;text-align:center;color:#667;font-family:Arial,sans-serif;">Mansakha &middot; <span class="pageNumber"></span> / <span class="totalPages"></span></div>`;

    const pdfData = await page.pdf({
      format: 'A4',
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: '70px', bottom: '50px', left: '40px', right: '40px' },
      printBackground: true,
    });
    // Puppeteer (this version) resolves page.pdf() to a plain Uint8Array,
    // not a Node Buffer - confirmed live: handing that straight to Express's
    // res.send() silently fails closed. res.send() only recognizes a real
    // Buffer as binary; a plain Uint8Array fails its Buffer.isBuffer() check
    // and falls through to res.json(), which JSON-stringifies the typed
    // array index-by-index (`{"0":37,"1":80,...}`) instead of sending the
    // actual PDF bytes - every downstream route "succeeded" (200, non-trivial
    // byte count) while actually serving a broken file. Buffer.from() here
    // wraps the same underlying bytes in a real Buffer with no copy.
    return Buffer.from(pdfData);
  } finally {
    await browser.close();
  }
}

module.exports = { renderReportHtml, generatePdfBuffer, buildBarChartSvg };

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
// reference PDF's own convention.
function buildBarChartSvg(items, { valueKey, labelKey, width = 640, height = 200 }) {
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
      const label = escapeHtml(String(item[labelKey]));
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

function sectionBanner(title) {
  return `<div class="section-banner"><h3>${escapeHtml(title)}</h3></div>`;
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
  return `${sectionBanner('Case Load & Risk Distribution')}${stats}${table(
    ['Docket Number', 'Case Type', 'Stage', 'Counsellor', 'Risk Level', 'Score'],
    rows
  )}`;
}

function buildComparisonSection(title, items, itemLabel) {
  const stats = `<div class="stat-strip">
    <div class="stat"><span class="stat-value">${items.length}</span><span class="stat-label">${escapeHtml(itemLabel)}s Reporting</span></div>
  </div>`;
  const rows = items.map((it) => [
    escapeHtml(it.name),
    String(it.totalCases),
    `<span style="color:${RISK_COLORS.Critical.fg};font-weight:600;">${it.criticalCases}</span>`,
    `<span style="color:${RISK_COLORS.High.fg};font-weight:600;">${it.highRiskCases}</span>`,
    `<span style="color:${RISK_COLORS.Moderate.fg};font-weight:600;">${it.moderateCases}</span>`,
  ]);
  return `${sectionBanner(title)}${stats}${table([itemLabel, 'Total Cases', 'Critical', 'High', 'Moderate'], rows)}`;
}

function buildDistressTrendSection(distressTrend) {
  const chart = buildBarChartSvg(distressTrend, { valueKey: 'avgScore', labelKey: 'label' });
  const rows = distressTrend.map((t) => [escapeHtml(t.label), t.avgScore === null ? '&mdash;' : String(t.avgScore)]);
  return `${sectionBanner('Distress Trend')}<div class="chart-wrap">${chart}</div>${table(['Period', 'Average Distress Score'], rows)}`;
}

function buildCounsellorsSection(counsellors) {
  const rows = counsellors.map((c) => [
    escapeHtml(c.fullName || 'Unknown'),
    String(c.activeCaseCount),
    c.avgDistressPointDrop === null ? '&mdash;' : String(c.avgDistressPointDrop),
    String(c.usersConsideredForEfficacy),
  ]);
  return `${sectionBanner('Counsellor Workload')}${table(
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
  return `${sectionBanner('Alert & SOS Response Times')}${table(['Metric', 'Value'], rows)}`;
}

function buildRecipientsSection(recipients) {
  const rows = (recipients || []).map((r) => [
    escapeHtml(r.recipientType === 'ministry' ? 'Ministry' : r.jurisdictionName || 'Unknown jurisdiction'),
    r.isPrimary ? 'Primary' : 'Cc',
    `<span class="badge" style="${r.status === 'Reviewed' ? `color:#1a7f45;background:#e3f6ea;` : `color:${NAVY};background:${PANEL_BG};`}">${escapeHtml(r.status)}</span>`,
    r.reviewedAt ? formatDate(r.reviewedAt) : '&mdash;',
  ]);
  return `${sectionBanner('Submission & Review Trail')}${table(['Recipient', 'Role', 'Status', 'Reviewed On'], rows)}`;
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
  // actually present - District has Counsellor Workload/Response Times,
  // State/National don't, so the TOC (and the sections themselves) must
  // never be a hardcoded fixed list across all 3 tiers.
  const sections = [];
  if (snapshot.cases) sections.push({ title: 'Case Load & Risk Distribution', html: buildCasesSection(snapshot.cases, snapshot.summary) });
  if (snapshot.districts) sections.push({ title: 'District Load Comparison', html: buildComparisonSection('District Load Comparison', snapshot.districts, 'District') });
  if (snapshot.states) sections.push({ title: 'State Load Comparison', html: buildComparisonSection('State Load Comparison', snapshot.states, 'State') });
  if (snapshot.distressTrend) sections.push({ title: 'Distress Trend', html: buildDistressTrendSection(snapshot.distressTrend) });
  if (snapshot.counsellors) sections.push({ title: 'Counsellor Workload', html: buildCounsellorsSection(snapshot.counsellors) });
  if (snapshot.responseTimes) sections.push({ title: 'Alert & SOS Response Times', html: buildResponseTimesSection(snapshot.responseTimes) });
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
  .section-banner { background: ${PANEL_BG}; border-radius: 6px; padding: 8px 14px; margin-bottom: 12px; }
  .section-banner h3 { color: ${NAVY}; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 11px; }
  th, td { border: 1px solid ${BORDER}; padding: 6px 8px; text-align: left; }
  th { background: #f4f6f8; text-transform: uppercase; font-size: 9.5px; font-weight: 700; color: #4b5563; letter-spacing: 0.02em; }
  td.empty { text-align: center; color: #9aa5b1; font-style: italic; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 10.5px; font-weight: 600; }
  .stat-strip { display: flex; gap: 10px; margin-bottom: 14px; }
  .stat { flex: 1; border: 1px solid ${BORDER}; border-radius: 6px; padding: 8px 6px; text-align: center; }
  .stat-value { display: block; font-size: 18px; font-weight: 700; color: ${NAVY}; }
  .stat-label { display: block; font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.02em; margin-top: 2px; }
  .chart-wrap { border: 1px solid ${BORDER}; border-radius: 6px; padding: 12px 8px; margin-bottom: 12px; background: #fff; }
  .commentary { white-space: pre-wrap; line-height: 1.5; }
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

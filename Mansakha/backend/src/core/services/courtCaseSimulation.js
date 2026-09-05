// Case Details (victim app) - simulated eCourts CNR data. No free/official
// eCourts API exists (confirmed - only paid, unofficial third-party
// scrapers of the government portal, which this project isn't built on
// top of), so this generates deterministic, plausible-looking case data
// instead - the exact same "plausible not random" approach Data Operator's
// own POST /fetch-case (dataoperator.routes.js) already uses to simulate
// the NHAA/Integrated Portal lookup. Every function here is pure (no DB/
// network calls) - that's what makes swapping in a real eCourts fetch later
// a matter of replacing the call site in user.routes.js, not touching the
// data shape or any of the calling code.

const VALID_COURT_STAGES = ['Trial', 'Rehabilitation', 'Compensation', 'Case Closed'];

// A case only realistically has a CNR once it's actually been filed in
// court - not during pure police Investigation, before any court has taken
// it up.
function isCourtCaseEligible(caseStage) {
  return VALID_COURT_STAGES.includes(caseStage);
}

// Deterministic seed - same technique as /fetch-case's own char-sum, plus a
// coarse year+month component so results visibly "progress" over calendar
// time (new hearings, an advancing next-hearing-date) without any
// background sync job - the whole point of a pure, time-varying generator
// instead of a static fixture.
function seedFor(docketNumber, monthBucket) {
  const base = String(docketNumber).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return base + monthBucket;
}

function monthBucketFor(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

const ADVOCATE_FIRST = ['Rajesh', 'Sunita', 'Anil', 'Deepa', 'Vikram', 'Neha', 'Suresh', 'Pooja'];
const ADVOCATE_LAST = ['Kulkarni', 'Rao', 'Bhat', 'Menon', 'Trivedi', 'Malhotra', 'Pillai', 'Deshmukh'];
const JUDGE_TITLES = ['District & Sessions Judge', 'Additional Sessions Judge', 'Special Judge (SC/ST Act)'];
const HEARING_BUSINESS = [
  'Matter listed for framing of charges',
  'Prosecution evidence recorded',
  'Cross-examination of witness conducted',
  'Adjourned on request of defence counsel',
  'Matter listed for arguments',
  'Case called, next date fixed',
  'Documents exhibited on record',
];
const NEXT_HEARING_PURPOSES = ['For evidence', 'For arguments', 'For orders', 'For appearance', 'For framing of charges'];
const HEARING_MODES = ['Physical', 'Video Conference'];

// Sections most relevant to SC/ST (Prevention of Atrocities) Act cases,
// keyed by a keyword in the case type name - falls back to the Atrocities
// Act alone when nothing more specific matches.
const ACTS_BY_KEYWORD = [
  { keyword: 'rape', acts: ['IPC Section 376', 'SC/ST (POA) Act Section 3(2)(v)'] },
  { keyword: 'murder', acts: ['IPC Section 302', 'SC/ST (POA) Act Section 3(2)(v)'] },
  { keyword: 'hurt', acts: ['IPC Section 325', 'SC/ST (POA) Act Section 3(1)(r)'] },
  { keyword: 'arson', acts: ['IPC Section 435', 'SC/ST (POA) Act Section 3(2)(iv)'] },
  { keyword: 'intimidation', acts: ['IPC Section 506', 'SC/ST (POA) Act Section 3(1)(r)'] },
];

function actsFor(caseTypeName) {
  const lower = (caseTypeName || '').toLowerCase();
  const match = ACTS_BY_KEYWORD.find((a) => lower.includes(a.keyword));
  return match ? match.acts : ['SC/ST (Prevention of Atrocities) Act, 1989'];
}

// 16 characters, matching the real CNR's length - 4 letters derived from
// the jurisdiction name (a plausible state/establishment code) + an
// 8-digit running number derived from the seed + a 4-digit year, mirroring
// the real format's shape without claiming to replicate NIC's actual
// encoding scheme.
function generateCnrNumber(docketNumber, jurisdictionName) {
  const letters = (jurisdictionName || 'XXXX').replace(/[^a-zA-Z]/g, '').toUpperCase().padEnd(4, 'X').slice(0, 4);
  const seed = seedFor(docketNumber, 0); // CNR itself doesn't change month to month once assigned
  const running = String(1000000 + (seed * 7919) % 89999999).padStart(8, '0').slice(0, 8);
  const year = String(new Date().getFullYear());
  return `${letters}${running}${year}`.slice(0, 16).padEnd(16, '0');
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// The main generator - pure function, deterministic per (docketNumber,
// current month). Returns exactly the court_case_details row shape.
function generateSimulatedCourtCaseDetails({ docketNumber, cnrNumber, caseTypeName, jurisdictionName, caseStage, enrolledAt, victimFullName }) {
  const now = new Date();
  const seed = seedFor(docketNumber, monthBucketFor(now));
  const enrolled = enrolledAt ? new Date(enrolledAt) : addDays(now, -180);

  const registrationDate = addDays(enrolled, 14 + (seed % 30));
  const filingDate = addDays(registrationDate, -(3 + (seed % 7)));
  const firstHearingDate = addDays(registrationDate, 21 + (seed % 20));

  const isDisposed = caseStage === 'Case Closed';
  const caseStageLabel = isDisposed
    ? 'Disposed'
    : caseStage === 'Trial'
    ? (seed % 3 === 0 ? 'Evidence' : seed % 3 === 1 ? 'Arguments' : 'Framing of Charges')
    : 'Post-Trial Proceedings'; // Rehabilitation/Compensation - case adjudicated, compensation/rehab process ongoing

  // Hearing history: one entry roughly every 30-40 days from first hearing
  // up to (but not past) today. When firstHearingDate itself is still in
  // the future (a just-enrolled case), this loop never runs and `cursor`
  // stays at firstHearingDate - which is exactly right, since the next
  // hearing IS the first one in that case. Either way, `cursor` after the
  // loop always holds the next not-yet-held hearing date, so nextHearingDate
  // below is never computed independently of this timeline (a bug caught in
  // testing: an independently-"now + offset" next-hearing-date could land
  // BEFORE firstHearingDate for a recently-enrolled case).
  const hearingHistory = [];
  let cursor = firstHearingDate;
  let i = 0;
  while (cursor < now && i < 24) {
    hearingHistory.push({
      date: isoDate(cursor),
      business: HEARING_BUSINESS[(seed + i) % HEARING_BUSINESS.length],
    });
    cursor = addDays(cursor, 30 + ((seed + i) % 12));
    i += 1;
  }

  const orders = hearingHistory
    .filter((_, idx) => (seed + idx) % 3 === 0)
    .map((h, idx) => ({ title: idx === 0 ? 'Interim Order' : `Interim Order ${idx + 1}`, date: h.date, type: 'Interim' }));
  if (isDisposed) {
    orders.push({ title: 'Final Judgment', date: isoDate(addDays(now, -(seed % 10))), type: 'Judgment' });
  }

  const nextHearingDate = isDisposed ? null : cursor;
  const accusedName = `${ADVOCATE_FIRST[(seed * 3) % ADVOCATE_FIRST.length]} ${ADVOCATE_LAST[(seed * 5) % ADVOCATE_LAST.length]}`;
  const prosecutorName = `Adv. ${ADVOCATE_FIRST[seed % ADVOCATE_FIRST.length]} ${ADVOCATE_LAST[seed % ADVOCATE_LAST.length]}`;
  const defenceName = `Adv. ${ADVOCATE_FIRST[(seed + 1) % ADVOCATE_FIRST.length]} ${ADVOCATE_LAST[(seed + 1) % ADVOCATE_LAST.length]}`;
  const judgeName = `Hon'ble ${JUDGE_TITLES[seed % JUDGE_TITLES.length]}`;

  // Bail-related interlocutory applications live here, not as a standalone
  // "bail status" field - matches how a real eCourts record has no such
  // field either (see the eCourts data-model research this feature is
  // based on).
  const iaDetails = seed % 4 === 0
    ? [{
        iaNumber: `IA/${1000 + (seed % 8999)}/${registrationDate.getFullYear()}`,
        iaType: 'Bail Application',
        filingDate: isoDate(addDays(registrationDate, 5)),
        status: seed % 2 === 0 ? 'Disposed' : 'Pending',
      }]
    : [];

  return {
    cnrNumber,
    caseType: caseTypeName || null,
    caseCategory: 'Atrocities Act',
    caseSubCategory: caseTypeName || null,
    filingNumber: `FIL/${2000 + (seed % 7999)}/${filingDate.getFullYear()}`,
    filingDate: isoDate(filingDate),
    registrationNumber: `REG/${3000 + (seed % 6999)}/${registrationDate.getFullYear()}`,
    registrationDate: isoDate(registrationDate),
    courtComplex: `${jurisdictionName || 'District'} Court Complex`,
    courtEstablishment: `Court of the ${JUDGE_TITLES[seed % JUDGE_TITLES.length]}, ${jurisdictionName || 'District'}`,
    courtNumber: `Court No. ${1 + (seed % 12)}`,
    coram: [judgeName],
    caseStageLabel,
    firstHearingDate: isoDate(firstHearingDate),
    nextHearingDate: nextHearingDate ? isoDate(nextHearingDate) : null,
    nextHearingPurpose: nextHearingDate ? NEXT_HEARING_PURPOSES[seed % NEXT_HEARING_PURPOSES.length] : null,
    caseStatus: isDisposed ? 'Disposed' : 'Pending',
    decisionDate: isDisposed ? isoDate(addDays(now, -(seed % 10))) : null,
    disposalNature: isDisposed ? (seed % 2 === 0 ? 'Convicted' : 'Acquitted') : null,
    petitionerNames: [
      { name: `State of ${jurisdictionName || 'the State'}`, role: 'State' },
      ...(victimFullName ? [{ name: victimFullName, role: 'Complainant' }] : []),
    ],
    respondentNames: [{ name: accusedName, role: 'Accused' }],
    advocateNames: [
      { name: prosecutorName, role: 'Public Prosecutor' },
      { name: defenceName, role: 'Defence Counsel' },
    ],
    actsSections: actsFor(caseTypeName),
    firPoliceStation: `${jurisdictionName || 'Local'} Police Station`,
    firNumber: String(100 + (seed % 899)),
    firYear: String(enrolled.getFullYear()),
    iaDetails,
    hearingHistory,
    orders,
    connectedCases: [],
    originatingCaseNumber: null, // this app's cases originate at trial court - no lower-forum history to show
    transferHistory: [],
    objections: [],
    hearingMode: HEARING_MODES[seed % HEARING_MODES.length],
  };
}

module.exports = { isCourtCaseEligible, generateCnrNumber, generateSimulatedCourtCaseDetails, VALID_COURT_STAGES };

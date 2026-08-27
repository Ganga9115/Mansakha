require('dotenv').config();
const fs = require('fs');
const bcrypt = require('bcrypt'); // unused directly, routes hash server-side; kept for parity if needed
const { signToken } = require('./src/utils/jwt');

const BASE = 'http://localhost:4000';
const districts = JSON.parse(fs.readFileSync('seed_districts.json', 'utf8'));
const caseTypes = JSON.parse(fs.readFileSync('seed_casetypes.json', 'utf8'));

const MINISTRY_ID = 'e9fce617-3f1f-4c4a-b7d3-4281b0b246d7';
const DATA_OP_IDS = [
  'b9bd9584-497f-4539-a26d-c81e2c50fdf3',
  '78089a3d-0e3f-4bbd-8907-73901789e689',
  '94ef494f-d2a4-46bd-bc4b-74431f39e5fb',
];

const ministryToken = signToken({ type: 'official', officialId: MINISTRY_ID, selectedRole: 'Ministry' });
const dataOpTokens = DATA_OP_IDS.map((id) => signToken({ type: 'official', officialId: id, selectedRole: 'Data Operator' }));

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pad(n, len) { return String(n).padStart(len, '0'); }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const FIRST_NAMES = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Krishna','Ishaan','Rohan',
  'Ananya','Diya','Saanvi','Aadhya','Kiara','Myra','Anika','Riya','Ishita','Priya',
  'Rahul','Amit','Sanjay','Vikram','Manoj','Deepak','Suresh','Ramesh','Anil','Ajay',
  'Pooja','Neha','Kavita','Sunita','Meena','Geeta','Rekha','Shalini','Divya','Swati',
  'Mohammed','Imran','Farhan','Zoya','Ayesha','Sara','Fatima','Nusrat','Aftab','Kabir'];
const LAST_NAMES = ['Sharma','Verma','Gupta','Reddy','Nair','Iyer','Patel','Singh','Kumar','Das',
  'Mukherjee','Chatterjee','Banerjee','Rao','Naidu','Pillai','Menon','Joshi','Deshmukh','Patil',
  'Yadav','Chauhan','Thakur','Mishra','Pandey','Tiwari','Agarwal','Bansal','Kapoor','Malhotra',
  'Khan','Ansari','Sheikh','Bora','Gogoi','Hazarika','Barman','Saikia','Lepcha','Bhutia'];

function randomName() { return `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`; }
function randomPhone() { return `${rand(['7','8','9'])}${randInt(100000000, 999999999)}`; }

const CASE_STAGE_WEIGHTS = [
  ['Investigation', 35], ['Trial', 30], ['Rehabilitation', 20], ['Compensation', 12], ['Case Closed', 3],
];
function randomCaseStage() {
  const total = CASE_STAGE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [stage, w] of CASE_STAGE_WEIGHTS) { if (r < w) return stage; r -= w; }
  return 'Investigation';
}

const CASE_BACKGROUND_TEMPLATES = {
  'Rape / Gang Rape': [
    'Survivor requires ongoing medical follow-up and trauma counselling; family has expressed concern over community pressure to withdraw the complaint.',
    'Case registered after victim was referred by a local NGO; investigation is examining witness statements from neighbours.',
  ],
  'Murder / Grievous Hurt / Arson': [
    'Family of the deceased is under threat from the accused party\'s relatives; police protection requested for two family members.',
    'Victim survived a grievous assault and is recovering at a district hospital; case background includes a prior land dispute.',
  ],
  'Witness Facing Intimidation or Threats': [
    'Key witness in an ongoing SC/ST Act case has reported repeated threatening phone calls; relocation is being evaluated.',
    'Witness has requested identity protection during trial proceedings after being confronted outside the local court.',
  ],
  'Family Affected by Caste-Based Violence': [
    'Family home was vandalised following a caste-based dispute; children in the household have been enrolled in a nearby school under a new address.',
    'Household has faced social boycott by neighbours since filing the complaint; compensation claim is under review.',
  ],
};
function randomCaseBackground(caseTypeName) {
  const templates = CASE_BACKGROUND_TEMPLATES[caseTypeName] || ['Case under active review by the district administration.'];
  return rand(templates);
}

async function postJson(path, token, body, { retries = 4 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method: path.includes('counsellor-preference') ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 4000 + attempt * 2000));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }
  return { status: 429, json: { success: false, message: 'gave up after retries' } };
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await worker(items[my], my);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

async function main() {
  // ---- 1. Pick 50 districts spread across many states, for counsellors ----
  const byState = new Map();
  for (const d of districts) {
    if (!byState.has(d.state_name)) byState.set(d.state_name, []);
    byState.get(d.state_name).push(d);
  }
  const states = shuffle([...byState.keys()]);
  const counsellorDistricts = [];
  let si = 0;
  while (counsellorDistricts.length < 50) {
    const stateName = states[si % states.length];
    const pool = byState.get(stateName);
    const pickIdx = Math.floor(counsellorDistricts.length / states.length);
    if (pool[pickIdx]) counsellorDistricts.push(pool[pickIdx]);
    si++;
    if (si > 2000) break;
  }

  // ---- 2. Create 50 counsellors ----
  console.log(`Creating ${counsellorDistricts.length} counsellors...`);
  const counsellorRecords = [];
  const counsellorResults = await runPool(counsellorDistricts, async (d, i) => {
    const fullName = randomName();
    const phone = randomPhone();
    const email = `${fullName.toLowerCase().replace(/\s+/g, '.')}.c${i}@counsellor.mansakha.seed`;
    const password = 'Counsellor123';
    const body = { fullName, email, roleName: 'Counsellor', jurisdictionId: d.district_id, password, phone };
    const { status, json } = await postJson('/api/ministry/staff', ministryToken, body);
    if (status === 201 && json.success) {
      const rec = { officialId: json.data.officialId, fullName, email, phone, password, district: d.district_name, state: d.state_name, districtId: d.district_id };
      counsellorRecords.push(rec);
      return rec;
    }
    console.error('counsellor create failed', status, json.message);
    return null;
  }, 6);
  console.log(`Counsellors created: ${counsellorRecords.length}/${counsellorDistricts.length}`);

  const counsellorByDistrict = new Map(counsellorRecords.map((c) => [c.districtId, c]));

  // ---- 3. Pick victim districts: the 50 counsellor districts + 15 extra with no counsellor ----
  const usedIds = new Set(counsellorDistricts.map((d) => d.district_id));
  const extraDistricts = shuffle(districts.filter((d) => !usedIds.has(d.district_id))).slice(0, 15);
  const victimDistricts = shuffle([...counsellorDistricts, ...extraDistricts]);

  // ---- 4. Create 500 victims spread across those districts ----
  const TOTAL_VICTIMS = 500;
  const victimJobs = [];
  for (let i = 0; i < TOTAL_VICTIMS; i++) {
    const d = victimDistricts[i % victimDistricts.length];
    victimJobs.push({ i, district: d });
  }

  console.log(`Creating ${TOTAL_VICTIMS} victims...`);
  const seedRunId = Date.now().toString().slice(-6);
  const victimRecords = [];
  let created = 0;
  await runPool(victimJobs, async ({ i, district }) => {
    const caseType = rand(caseTypes);
    const fullName = randomName();
    const docketNumber = `SEED${seedRunId}-${pad(i + 1, 4)}`;
    const contactNumber = randomPhone();
    const caseStage = randomCaseStage();
    const wantsManual = Math.random() < 0.5;
    const token = dataOpTokens[i % dataOpTokens.length];
    const body = {
      docketNumber,
      fullName,
      contactNumber,
      jurisdictionId: district.district_id,
      caseTypeId: caseType.case_type_id,
      caseStage,
      address: `${district.district_name}, ${district.state_name}`,
      caseBackground: randomCaseBackground(caseType.name),
    };
    const { status, json } = await postJson('/api/data-intake/register-victim', token, body);
    if (status === 201 && json.success) {
      created++;
      victimRecords.push({
        victimId: json.data.victimId, docketNumber, fullName, district: district.district_name, state: district.state_name,
        districtId: district.district_id, caseStage, wantsManual, hasCounsellorInDistrict: counsellorByDistrict.has(district.district_id),
      });
    } else {
      console.error('victim create failed', status, json.message, docketNumber);
    }
  }, 12);
  console.log(`Victims created: ${created}/${TOTAL_VICTIMS}`);

  // ---- 5. For victims wanting manual counsellor, opt in via their own victim JWT (real assignment path) ----
  const manualCandidates = victimRecords.filter((v) => v.wantsManual);
  console.log(`Opting in ${manualCandidates.length} victims for manual counsellor assignment...`);
  let assignedCount = 0;
  let noneAvailableCount = 0;
  await runPool(manualCandidates, async (v) => {
    const victimToken = signToken({ type: 'victim', victimId: v.victimId });
    const { status, json } = await postJson('/api/victim/counsellor-preference', victimToken, { optedIn: true });
    if (status === 200 && json.success) {
      assignedCount++;
    } else {
      noneAvailableCount++;
    }
  }, 15);
  console.log(`Manual assignment: ${assignedCount} succeeded, ${noneAvailableCount} had no counsellor available (left auto/unassigned).`);

  // ---- 6. Write counsellor details document ----
  const lines = [];
  lines.push('# Seeded Counsellor Accounts (Mansakha)');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} - ${counsellorRecords.length} accounts, one per district, spread across states.`);
  lines.push('All accounts use password `Counsellor123` (must be changed on first login).');
  lines.push('');
  lines.push('| # | Full Name | Email | Phone | District | State | Official ID |');
  lines.push('|---|-----------|-------|-------|----------|-------|--------------|');
  counsellorRecords.forEach((c, i) => {
    lines.push(`| ${i + 1} | ${c.fullName} | ${c.email} | ${c.phone} | ${c.district} | ${c.state} | ${c.officialId} |`);
  });
  fs.writeFileSync('seed_counsellors.md', lines.join('\n'));
  console.log('Wrote seed_counsellors.md');

  fs.writeFileSync('seed_summary.json', JSON.stringify({
    counsellors: counsellorRecords.length,
    victims: victimRecords.length,
    manualOptIns: manualCandidates.length,
    manualAssigned: assignedCount,
    manualNoneAvailable: noneAvailableCount,
    seedRunId,
    sampleVictimDistrictIds: [...new Set(victimRecords.map(v => v.districtId))].slice(0, 5),
    counsellorRecords: counsellorRecords.map(c => ({ officialId: c.officialId, districtId: c.districtId, district: c.district, state: c.state })),
  }, null, 2));
  console.log('Wrote seed_summary.json');
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });

// 10 more demo cases (NHAA-2026-0000013..0000022), this time specifically
// for the Investigating Officer's own queue - the IO for Pravin's station
// (Porbandar Sadar Police Station, IO-520) had exactly one case, Pravin's
// own (NHAA-2026-0000001), and it's already Handed Off (case_stage past
// Investigation). IO routing is users.station_id-based, not
// agency_referrals like every other coordination role (see io.routes.js's
// own header comment), so the earlier 10-victim batch (seedPravinRoleDemo.js)
// never touched this queue at all - it only ever set jurisdiction_id.
//
// Same full treatment as seedPravinRoleDemoData.js gave the first 10:
// distress-score history through the real pipeline (so alerts fire
// correctly), a case note, a short chat thread - plus an
// investigation_records row per case so the IO's Active/Handed Off tabs
// both have real chargesheet/accused-status data, not bare skeleton rows.
// Usage: node src/core/db/seedPravinRoleDemoIO.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { recordInteraction, recordOllamaDistressScore } = require('../services/interactionPipeline');
const { applyStressResponse } = require('../services/stressResponse');

const JURISDICTION_ID = 'd00806e9-f0ed-48d6-9d4f-415ad4d67f7e'; // Porbandar
const STATION_ID = 'dc9b26c9-ec97-48f9-ad4e-f559a079c33e'; // Porbandar Sadar Police Station (IO-520)
const ASSIGNED_COUNSELLOR_ID = 'e8c9f0c6-d382-49ce-91f6-8743bb04b1f1'; // Sunita Sharma
const CASE_TYPE_NAMES = [
  'Murder', 'Rape', 'Gang Rape', 'Grievous Hurt', 'Arson',
  'Family Affected by Caste-Based Violence', 'Witness Facing Intimidation or Threats',
];

// case_stage drives which IO tab a case lands in (Active = 'Investigation',
// Handed Off = anything past it) - 4 still active, 6 already handed off,
// so both tabs have real, varied content instead of one being empty.
const CASE_PLANS = [
  { stage: 'Investigation', accusedStatus: 'In Custody', chargesheetStatus: 'Not Filed', tier: 'High', earlier: 48, latest: 62 },
  { stage: 'Investigation', accusedStatus: 'Absconding', chargesheetStatus: 'Not Filed', tier: 'Critical', earlier: 55, latest: 83 },
  { stage: 'Investigation', accusedStatus: 'Out on Bail', chargesheetStatus: 'Not Filed', tier: 'Moderate', earlier: 35, latest: 41 },
  { stage: 'Investigation', accusedStatus: 'In Custody', chargesheetStatus: 'Not Filed', tier: 'Low', earlier: 24, latest: 19 },
  { stage: 'Trial', accusedStatus: 'In Custody', chargesheetStatus: 'Filed', tier: 'Moderate', earlier: 44, latest: 39 },
  { stage: 'Trial', accusedStatus: 'Out on Bail', chargesheetStatus: 'Filed', tier: 'High', earlier: 52, latest: 68 },
  { stage: 'Trial', accusedStatus: 'Convicted', chargesheetStatus: 'Filed', tier: 'Low', earlier: 28, latest: 21 },
  { stage: 'Compensation', accusedStatus: 'Convicted', chargesheetStatus: 'Filed', tier: 'Low', earlier: 22, latest: 16 },
  { stage: 'Compensation', accusedStatus: 'In Custody', chargesheetStatus: 'Filed', tier: 'Moderate', earlier: 40, latest: 36 },
  { stage: 'Compensation', accusedStatus: 'Out on Bail', chargesheetStatus: 'Filed', tier: 'High', earlier: 58, latest: 64 },
];

const SUMMARY_BY_TIER = {
  Low: 'Reports feeling steady this week. Sleeping and eating normally, spending time with family. No immediate concerns raised.',
  Moderate: 'Some difficulty coping day to day - mentions feeling on edge and occasional trouble sleeping. Managing with support from family, open to more regular check-ins.',
  High: 'Notable distress this week - reports feeling anxious most days, some isolation from usual support network. Recommend closer follow-up.',
  Critical: 'Significant distress indicators this week - reports feeling overwhelmed and unsafe. Recommend urgent follow-up and review of current support/protection measures.',
};

const CHAT_TURNS_BY_TIER = {
  Low: [
    { sender: 'user', body: 'Hi, just checking in. Things have been okay this week.' },
    { sender: 'ai', body: "That's good to hear. Is there anything on your mind you'd like to talk through?" },
    { sender: 'user', body: 'Not really, just wanted to say things are steadier now. Thank you for checking.' },
  ],
  Moderate: [
    { sender: 'user', body: "I've been feeling a bit on edge the last few days, hard to explain why." },
    { sender: 'ai', body: "Thank you for sharing that. It's okay to not have a clear reason - what's it been like day to day?" },
    { sender: 'user', body: "Trouble sleeping mostly. I'm managing but it's been tiring." },
    { sender: 'ai', body: 'That sounds draining. Would it help to have your counsellor check in with you this week?' },
  ],
  High: [
    { sender: 'user', body: "I haven't been doing well honestly. Feeling anxious most of the time." },
    { sender: 'ai', body: "I'm glad you told me. You don't have to carry this alone - is there someone with you right now?" },
    { sender: 'user', body: "My family is around, but I've been keeping to myself a lot." },
    { sender: 'ai', body: "That's understandable. I'll make sure your counsellor knows so they can reach out to you soon." },
  ],
  Critical: [
    { sender: 'user', body: "I don't know how much more of this I can take. Everything feels like too much right now." },
    { sender: 'ai', body: "I'm really glad you reached out. What you're feeling matters, and you're not alone in this. Is it safe where you are right now?" },
    { sender: 'user', body: 'I think so, I\'m at home.' },
    { sender: 'ai', body: 'Okay. I\'m letting your counsellor know right away so someone can reach you today. Please call the NHAA Helpline at 14566 if things feel unsafe before then.' },
  ],
};

const INVESTIGATION_PROGRESS_BY_STAGE = {
  Investigation: 'Statement recorded, evidence collection in progress. Forensic report awaited.',
  Trial: 'Chargesheet filed and case handed off to trial court. IO retains custody/bail oversight.',
  Compensation: 'Investigation and trial concluded. Case retained read-only for record.',
};

function pad(n, width = 7) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { data: caseTypes } = await supabase.from('case_types').select('case_type_id, name').in('name', CASE_TYPE_NAMES);
  const { data: languages } = await supabase.from('languages').select('language_id').is('deleted_at', null);
  if (!caseTypes?.length || !languages?.length) throw new Error('Missing case_types or languages lookup data');

  const { data: existing } = await supabase
    .from('users')
    .select('docket_number')
    .like('docket_number', 'NHAA-2026-%')
    .order('docket_number', { ascending: false })
    .limit(1);
  const nextNum = existing?.[0]?.docket_number
    ? parseInt(existing[0].docket_number.split('-')[2], 10) + 1
    : 13;

  console.log(`Seeding 10 IO demo cases starting at NHAA-2026-${pad(nextNum)}...`);

  for (let i = 0; i < CASE_PLANS.length; i++) {
    const plan = CASE_PLANS[i];
    const docket = `NHAA-2026-${pad(nextNum + i)}`;
    const caseType = caseTypes[i % caseTypes.length];
    const lang = languages[i % languages.length];

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .insert({
        docket_number: docket,
        case_type_id: caseType.case_type_id,
        jurisdiction_id: JURISDICTION_ID,
        station_id: STATION_ID,
        case_stage: plan.stage,
        preferred_language: lang.language_id,
        auth_method: 'district_admin',
        assigned_counsellor_id: ASSIGNED_COUNSELLOR_ID,
      })
      .select('user_id')
      .single();
    if (userError) throw new Error(`Could not create ${docket}: ${userError.message}`);

    console.log(`\n${docket} (${caseType.name}, ${plan.stage}) - ${plan.tier} tier`);

    // Investigation record - chargesheet/accused status tied to case_stage,
    // same reasoning as Pravin's own record set up earlier this session.
    const filedAt = plan.chargesheetStatus === 'Filed' ? new Date(Date.now() - (30 + i * 3) * 24 * 60 * 60 * 1000).toISOString() : null;
    const { error: irError } = await supabase.from('investigation_records').insert({
      user_id: userRow.user_id,
      accused_status: plan.accusedStatus,
      investigation_progress: INVESTIGATION_PROGRESS_BY_STAGE[plan.stage],
      chargesheet_status: plan.chargesheetStatus,
      chargesheet_filed_at: filedAt,
      investigation_complete_at: plan.stage !== 'Investigation' ? filedAt : null,
    });
    if (irError) throw new Error(`investigation_records failed for ${docket}: ${irError.message}`);
    console.log(`  Investigation record: ${plan.accusedStatus}, chargesheet ${plan.chargesheetStatus}`);

    // Distress score history through the real pipeline, same as the first
    // 10 - recordOllamaDistressScore auto-classifies risk tier, and only
    // the latest score drives applyStressResponse (real alert for
        // High/Critical), matching a real check-in's own behaviour.
    const scores = [
      { value: plan.earlier, label: 'earlier' },
      { value: plan.latest, label: 'latest' },
    ];
    let latestRiskLevel = null;
    for (const s of scores) {
      const { interactionId } = await recordInteraction({
        userId: userRow.user_id,
        channelName: s.label === 'latest' ? 'Mobile App' : 'Chatbot',
        transcriptText: `Mansakha: How have you been feeling lately?\nPerson: ${SUMMARY_BY_TIER[plan.tier]}`,
      });
      const { scoreId, riskLevel } = await recordOllamaDistressScore(
        userRow.user_id,
        interactionId,
        { score: s.value, summary: SUMMARY_BY_TIER[plan.tier] },
        'demo-seed-v1'
      );
      latestRiskLevel = riskLevel;
      if (s.label === 'latest') {
        await applyStressResponse(userRow.user_id, scoreId, riskLevel).catch((err) => console.error(`  applyStressResponse failed: ${err.message}`));
      }
    }
    console.log(`  Recorded 2 distress scores (${plan.earlier} -> ${plan.latest}, ${latestRiskLevel})`);

    const { error: noteError } = await supabase.from('case_notes').insert({
      user_id: userRow.user_id,
      official_id: null,
      note_text: SUMMARY_BY_TIER[plan.tier],
      authored_by: 'ai',
    });
    if (noteError) throw new Error(`Case note failed for ${docket}: ${noteError.message}`);

    const turns = CHAT_TURNS_BY_TIER[plan.tier];
    const now = Date.now();
    const chatRows = turns.map((t, idx) => ({
      user_id: userRow.user_id,
      sender: t.sender,
      body: t.body,
      channel: 'text',
      sent_at: new Date(now - (turns.length - idx) * 60000).toISOString(),
    }));
    const { error: chatError } = await supabase.from('chat_messages').insert(chatRows);
    if (chatError) throw new Error(`Chat messages failed for ${docket}: ${chatError.message}`);
    console.log(`  Added 1 case note, ${chatRows.length} chat messages`);
  }

  console.log('\nDone. IO-520 (Porbandar Sadar) now has 10 more cases - 4 Active (Investigation), 6 Handed Off - each with real distress-score history, an investigation record, a case note, and a chat thread.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

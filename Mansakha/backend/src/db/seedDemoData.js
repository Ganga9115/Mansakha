// Demo dataset for Build Prompt Section 10: "realistic sample victims,
// multi-check-in history, a demo escalating trend, one already-triggered
// alert." This is the larger, still-tracked task seedDummyAccounts.js's own
// header comment pointed at - NOT a replacement for that file. It reuses the
// existing "India" national root and the Maharashtra/Pune jurisdiction pair
// and dummy victim (DUMMY-0001) seedDummyAccounts.js already created, and
// never touches or duplicates them.
//
// Every check-in is driven through the REAL pipeline - the same
// analyzeInteraction() (real Gemini call) + insert logic routes/victim.js's
// POST /checkin uses - never a hand-inserted distress_scores row with a
// made-up number. occurred_at/computed_at default to now() on insert, so
// each check-in is backdated afterward with a corrective UPDATE to build a
// real, spread-out history instead of everything landing in the same second.
//
// Idempotent - safe to re-run. Every insert is check-then-insert against a
// stable identifier (jurisdiction name+level, victim docket_number, existing
// interaction count), matching seedDummyAccounts.js's pattern. Re-running
// resumes any victim that didn't finish its check-in history last time
// instead of duplicating what already exists - important since this makes
// real Gemini calls against a shared free-tier quota that can run out
// mid-run.
//
// Usage: npm run seed:demo

require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { analyzeInteraction } = require('../services/ai');
const { isEscalatingTrend } = require('../services/scoring');

// ===== Check-in response text, hand-written per target severity tier =====
// Real Gemini scoring decides the actual number - this is "plausible", not
// guaranteed, per the brief. Several variants per tier so consecutive
// check-ins for the same victim don't repeat verbatim.

const LOW = [
  "Things have been steady this week. I went back to work and my family has been really supportive. I'm sleeping well and I haven't felt unsafe at all.",
  "I'm doing fine, thank you for checking in. The community support group has been really helpful and I feel like I'm slowly getting back to a normal routine.",
  'No new problems to report. I spent time with my children this weekend and felt genuinely happy. I feel hopeful about how the case is moving forward.',
  "I'm managing well these days. My neighbors have been kind and I don't feel threatened anymore. Life feels a lot more normal now.",
];

const MODERATE = [
  "It's been an okay week but I'm a little anxious about the upcoming court date. I've had some trouble concentrating, though I'm still going to work every day.",
  "I've been feeling stressed about money and the case dragging on for so long. Nothing scary has happened, just a lot of pressure and a few restless nights.",
  "I saw a couple of people connected to the other side near the market and it made me uneasy, even though nothing was said to me directly. I'm keeping my guard up.",
  "Things are a bit difficult right now. I'm tired most of the time and worried about how the case will turn out, but I'm holding on and coping.",
];

const HIGH = [
  "I'm scared. A car I didn't recognize was parked outside our house for two nights in a row and I haven't been able to sleep properly since then.",
  "Someone from the accused's family confronted my brother in the village yesterday and warned him to \"convince us to drop the case.\" I feel very unsafe right now.",
  "I've been having panic attacks and I'm afraid to let my children walk to school alone anymore. I feel like I'm being watched all the time.",
  "I got a threatening phone call last night telling me to withdraw my statement. My hands are still shaking and I don't know who I can trust anymore.",
];

const CRITICAL = [
  "I can't do this anymore. They threatened to hurt my daughter if I testify and I don't feel safe anywhere, not even inside my own home. I feel completely hopeless.",
  'Someone attacked my husband outside our house last night and warned us this was "just a warning." I am terrified and I don\'t think we are safe here at all. I don\'t know what to do anymore.',
  'I haven\'t slept in three days. They know where my children go to school now and I feel like something terrible is going to happen to us. I feel like giving up on everything.',
  "I found a note on our door last night threatening to kill my whole family if I don't withdraw the case. I am terrified, I don't know who to call, and I feel completely alone.",
];

// Base 3, oldest -> newest, deliberately graduated mild -> moderate -> severe
// so the LAST THREE scores have a real shot at satisfying isEscalatingTrend().
const ESCALATING_BASE = [
  "Things have been fairly calm this week. I'm a little worried about the case in general but nothing specific has happened. I'm managing okay.",
  "I've started noticing a car circling our street a couple of times this week and it's making me anxious. I haven't been sleeping well the last few nights.",
  "Two men I didn't recognize stopped my son on his way home and asked questions about me. I'm extremely frightened and I haven't left the house in two days.",
];
// Only used if the base 3 don't actually come back monotonic/+10 from real Gemini scoring.
const ESCALATING_FALLBACK = [
  "They came to my house last night and threatened my family directly. I am terrified for my children's safety and I don't feel safe anywhere anymore.",
  "I received a direct threat on my life last night and I believe they mean it. I am in complete panic and don't know what to do - I feel like my family is in immediate danger right now.",
];

// ===== Small helpers =====

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateFromDaysAgo(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000);
}

// Shared free-tier Gemini key (see .env) - abort the whole run rather than
// silently burn the rest of the quota on a dead key. Already-seeded data is
// safe and idempotent, so a later re-run just resumes.
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 4;

async function callAnalyzeWithRetry(victimId, text, label) {
  const backoffs = [4000, 8000, 16000];
  let lastErr;
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const analysis = await analyzeInteraction(victimId, text);
      consecutiveFailures = 0;
      return analysis;
    } catch (err) {
      lastErr = err;
      console.error(`  Gemini call failed for ${label} (attempt ${attempt + 1}/${backoffs.length + 1}): ${err.message}`);
      if (attempt < backoffs.length) await sleep(backoffs[attempt]);
    }
  }
  consecutiveFailures += 1;
  throw new Error(`Gemini call permanently failed for ${label} after retries: ${lastErr.message}`);
}

// ===== Jurisdictions (idempotent - same pattern as seedDummyAccounts.js) =====

async function ensureJurisdiction(name, level, parentId) {
  const { data: existing, error: findErr } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('name', name).eq('level', level).maybeSingle();
  if (findErr) throw new Error(`Could not check existing ${level} jurisdiction "${name}": ${findErr.message}`);
  if (existing) {
    console.log(`Using existing ${level} jurisdiction: ${name}`);
    return existing.jurisdiction_id;
  }
  const { data, error } = await supabase.from('jurisdictions').insert({ name, level, parent_id: parentId }).select('jurisdiction_id').single();
  if (error) throw new Error(`Could not create ${level} jurisdiction "${name}": ${error.message}`);
  console.log(`Created ${level} jurisdiction: ${name}`);
  return data.jurisdiction_id;
}

// ===== Lookup maps, fetched once =====

async function buildMaps() {
  const { data: caseTypes, error: ctErr } = await supabase.from('case_types').select('case_type_id, name');
  if (ctErr) throw new Error(`Could not load case_types: ${ctErr.message}`);
  const { data: channels, error: chErr } = await supabase.from('channels').select('channel_id, channel_name');
  if (chErr) throw new Error(`Could not load channels: ${chErr.message}`);
  const { data: languages, error: langErr } = await supabase.from('languages').select('language_id, code').is('deleted_at', null);
  if (langErr) throw new Error(`Could not load languages: ${langErr.message}`);
  const { data: signalTypes, error: stErr } = await supabase.from('signal_types').select('signal_type_id, name');
  if (stErr) throw new Error(`Could not load signal_types: ${stErr.message}`);
  const { data: riskLevels, error: rlErr } = await supabase.from('risk_levels').select('risk_level_id, name');
  if (rlErr) throw new Error(`Could not load risk_levels: ${rlErr.message}`);
  const { data: openStatus, error: asErr } = await supabase.from('alert_statuses').select('alert_status_id').eq('name', 'Open').single();
  if (asErr) throw new Error(`Could not load "Open" alert_status: ${asErr.message}`);

  return {
    caseTypeIdByName: Object.fromEntries(caseTypes.map((c) => [c.name, c.case_type_id])),
    channelIdByName: Object.fromEntries(channels.map((c) => [c.channel_name, c.channel_id])),
    languageIdByCode: Object.fromEntries(languages.map((l) => [l.code, l.language_id])),
    signalTypeIdByName: Object.fromEntries(signalTypes.map((s) => [s.name, s.signal_type_id])),
    riskLevelIdByName: Object.fromEntries(riskLevels.map((r) => [r.name, r.risk_level_id])),
    openAlertStatusId: openStatus.alert_status_id,
  };
}

// ===== Victims =====

async function ensureDemoVictim(config) {
  const { data: existing, error: findErr } = await supabase.from('victims').select('victim_id').eq('docket_number', config.docketNumber).maybeSingle();
  if (findErr) throw new Error(`Could not check existing victim ${config.docketNumber}: ${findErr.message}`);
  if (existing) {
    console.log(`Using existing demo victim: ${config.docketNumber} (${config.fullName})`);
    return existing.victim_id;
  }

  const { data: victim, error: victimErr } = await supabase
    .from('victims')
    .insert({
      docket_number: config.docketNumber,
      case_type_id: config.caseTypeId,
      jurisdiction_id: config.jurisdictionId,
      case_stage: config.caseStage,
      preferred_language: config.languageId || null,
      auth_method: 'email_otp',
    })
    .select('victim_id')
    .single();
  if (victimErr) throw new Error(`Could not create demo victim ${config.docketNumber}: ${victimErr.message}`);

  const { error: identityErr } = await supabase.from('victim_identity').insert({
    victim_id: victim.victim_id,
    full_name: config.fullName,
    email: config.email,
  });
  if (identityErr) throw new Error(`Could not create identity for ${config.docketNumber}: ${identityErr.message}`);

  // Realism: enrolled before their first check-in, not "now".
  const earliestDaysAgo = config.checkins[0].daysAgo + 5;
  const { error: enrollErr } = await supabase.from('victims').update({ enrolled_at: dateFromDaysAgo(earliestDaysAgo).toISOString() }).eq('victim_id', victim.victim_id);
  if (enrollErr) throw new Error(`Could not backdate enrolled_at for ${config.docketNumber}: ${enrollErr.message}`);

  console.log(`Created demo victim: ${config.docketNumber} (${config.fullName})`);
  return victim.victim_id;
}

async function countExistingInteractions(victimId) {
  const { count, error } = await supabase.from('interactions').select('interaction_id', { count: 'exact', head: true }).eq('victim_id', victimId);
  if (error) throw new Error(`Could not count interactions for victim ${victimId}: ${error.message}`);
  return count || 0;
}

// ===== The real check-in pipeline, replicated from routes/victim.js POST /checkin =====

async function doRealCheckin(victimId, channelId, text, label, maps) {
  const { data: interaction, error: interactionErr } = await supabase
    .from('interactions')
    .insert({ victim_id: victimId, channel_id: channelId, transcript_ref: text })
    .select('interaction_id')
    .single();
  if (interactionErr) throw new Error(`Could not record interaction for ${label}: ${interactionErr.message}`);

  const analysis = await callAnalyzeWithRetry(victimId, text, label);

  const modelVersion = 'gemini-phase1-v1';
  const { error: signalsErr } = await supabase.from('interaction_signals').insert([
    { interaction_id: interaction.interaction_id, signal_type_id: maps.signalTypeIdByName.sentiment_score, value: analysis.sentimentRaw, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: maps.signalTypeIdByName.voice_stress_score, value: 0, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: maps.signalTypeIdByName.emotion_score, value: analysis.emotion, model_version: modelVersion },
    { interaction_id: interaction.interaction_id, signal_type_id: maps.signalTypeIdByName.engagement_score, value: analysis.engagementDelta, model_version: modelVersion },
  ]);
  if (signalsErr) throw new Error(`Could not record interaction_signals for ${label}: ${signalsErr.message}`);

  const riskLevelId = maps.riskLevelIdByName[analysis.riskLevel];
  if (!riskLevelId) throw new Error(`Unknown risk level "${analysis.riskLevel}" returned for ${label}`);

  const { data: scoreRow, error: scoreErr } = await supabase
    .from('distress_scores')
    .insert({
      victim_id: victimId,
      interaction_id: interaction.interaction_id,
      score_value: analysis.scoreValue,
      risk_level_id: riskLevelId,
      model_version: modelVersion,
      explanation: analysis.reason || null,
      suggested_intervention_type_id: analysis.suggestedInterventionTypeId,
    })
    .select('score_id')
    .single();
  if (scoreErr) throw new Error(`Could not record distress_scores for ${label}: ${scoreErr.message}`);

  let alertId = null;
  if (analysis.riskLevel === 'High' || analysis.riskLevel === 'Critical') {
    const { data: alert, error: alertErr } = await supabase
      .from('alerts')
      .insert({ victim_id: victimId, distress_score_id: scoreRow.score_id, alert_status_id: maps.openAlertStatusId })
      .select('alert_id')
      .single();
    if (alertErr) throw new Error(`Could not create alert for ${label}: ${alertErr.message}`);
    alertId = alert.alert_id;

    const { data: victimRow, error: victimRowErr } = await supabase.from('victims').select('jurisdiction_id').eq('victim_id', victimId).single();
    if (victimRowErr) throw new Error(`Could not look up jurisdiction for alert routing (${label}): ${victimRowErr.message}`);

    const { data: districtOfficials, error: officialsErr } = await supabase
      .from('official_roles')
      .select('official_id, roles(role_name)')
      .eq('jurisdiction_id', victimRow.jurisdiction_id)
      .is('revoked_at', null);
    if (officialsErr) throw new Error(`Could not look up officials for alert routing (${label}): ${officialsErr.message}`);

    const recipients = (districtOfficials || [])
      .filter((r) => r.roles.role_name === 'Administration' || r.roles.role_name === 'Counsellor')
      .map((r) => ({ alert_id: alertId, official_id: r.official_id }));
    if (recipients.length > 0) {
      const { error: notifErr } = await supabase.from('alert_notifications').insert(recipients);
      if (notifErr) throw new Error(`Could not create alert_notifications for ${label}: ${notifErr.message}`);
    }
  }

  return { interactionId: interaction.interaction_id, scoreId: scoreRow.score_id, scoreValue: analysis.scoreValue, riskLevel: analysis.riskLevel, alertId };
}

async function backdate(result, targetDate) {
  const iso = targetDate.toISOString();
  const { error: interErr } = await supabase.from('interactions').update({ occurred_at: iso }).eq('interaction_id', result.interactionId);
  if (interErr) throw new Error(`Could not backdate interaction ${result.interactionId}: ${interErr.message}`);
  const { error: scoreErr } = await supabase.from('distress_scores').update({ computed_at: iso }).eq('score_id', result.scoreId);
  if (scoreErr) throw new Error(`Could not backdate distress_score ${result.scoreId}: ${scoreErr.message}`);
  if (result.alertId) {
    const { error: alertErr } = await supabase.from('alerts').update({ triggered_at: iso }).eq('alert_id', result.alertId);
    if (alertErr) throw new Error(`Could not backdate alert ${result.alertId}: ${alertErr.message}`);
    const { error: notifErr } = await supabase.from('alert_notifications').update({ notified_at: iso }).eq('alert_id', result.alertId);
    if (notifErr) throw new Error(`Could not backdate alert_notifications for alert ${result.alertId}: ${notifErr.message}`);
  }
}

async function checkEscalating(victimId) {
  const { data: scores, error } = await supabase.from('distress_scores').select('score_value, computed_at').eq('victim_id', victimId).order('computed_at', { ascending: false }).limit(3);
  if (error) throw new Error(`Could not fetch scores to check escalation for victim ${victimId}: ${error.message}`);
  if (!scores || scores.length < 3) return false;
  return isEscalatingTrend([...scores].reverse().map((s) => s.score_value));
}

async function runCheckinsForVictim(config, victimId, maps) {
  const label = `${config.docketNumber} (${config.fullName})`;
  const existingCount = await countExistingInteractions(victimId);

  if (!config.isEscalating) {
    if (existingCount >= config.checkins.length) {
      console.log(`${label}: already has ${existingCount} check-in(s), skipping.`);
      return;
    }
    const remaining = config.checkins.slice(existingCount);
    for (const [idx, ci] of remaining.entries()) {
      const num = existingCount + idx + 1;
      try {
        const result = await doRealCheckin(victimId, config.channelId, ci.text, `${label} checkin#${num}`, maps);
        await backdate(result, dateFromDaysAgo(ci.daysAgo));
        console.log(`${label}: checkin#${num} -> score ${result.scoreValue} (${result.riskLevel})${result.alertId ? ' [ALERT]' : ''}`);
        await sleep(1200);
      } catch (err) {
        console.error(`${label}: checkin#${num} failed permanently: ${err.message}`);
        break; // stop this victim's remaining check-ins; safely resumable next run
      }
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
    }
    return;
  }

  // Escalating-trend victim: base 3 first, then fallback (more severe) check-ins
  // appended one at a time until the last 3 scores actually satisfy
  // isEscalatingTrend(), or the fallback pool runs out.
  const baseRemaining = config.checkins.slice(Math.min(existingCount, config.checkins.length));
  for (const [idx, ci] of baseRemaining.entries()) {
    const num = existingCount + idx + 1;
    try {
      const result = await doRealCheckin(victimId, config.channelId, ci.text, `${label} checkin#${num}`, maps);
      await backdate(result, dateFromDaysAgo(ci.daysAgo));
      console.log(`${label}: checkin#${num} -> score ${result.scoreValue} (${result.riskLevel})${result.alertId ? ' [ALERT]' : ''}`);
      await sleep(1200);
    } catch (err) {
      console.error(`${label}: checkin#${num} failed permanently: ${err.message}`);
      return; // can't safely proceed to fallback logic without the base data
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
  }

  let fallbackIdx = 0;
  let confirmed = await checkEscalating(victimId);
  while (!confirmed && fallbackIdx < ESCALATING_FALLBACK.length) {
    const text = ESCALATING_FALLBACK[fallbackIdx];
    const daysAgo = Math.max(0, 1 - fallbackIdx * 0.5); // squeeze closer to "now", staying after the base 3
    try {
      const result = await doRealCheckin(victimId, config.channelId, text, `${label} fallback-checkin#${fallbackIdx + 1}`, maps);
      await backdate(result, dateFromDaysAgo(daysAgo));
      console.log(`${label}: fallback-checkin#${fallbackIdx + 1} -> score ${result.scoreValue} (${result.riskLevel})${result.alertId ? ' [ALERT]' : ''}`);
      await sleep(1200);
    } catch (err) {
      console.error(`${label}: fallback-checkin#${fallbackIdx + 1} failed permanently: ${err.message}`);
      break;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
    fallbackIdx += 1;
    confirmed = await checkEscalating(victimId);
  }
}

// ===== Victim configuration =====

function buildVictimConfigs(maps, districts) {
  const CT = maps.caseTypeIdByName;
  const CH = maps.channelIdByName;
  const LANG = maps.languageIdByCode;

  const withDaysAgo = (texts, daysAgoList) => texts.map((text, i) => ({ text, daysAgo: daysAgoList[i] }));

  return [
    // ----- Low (4) -----
    { docketNumber: 'DEMO-0001', fullName: 'Priya Deshmukh', email: 'priya.deshmukh@example.com', caseTypeId: CT['Witness Facing Intimidation or Threats'], jurisdictionId: districts.pune, caseStage: 'Investigation', channelId: CH.Chatbot, languageId: LANG.hi, checkins: withDaysAgo([LOW[0], LOW[1]], [35, 10]) },
    { docketNumber: 'DEMO-0002', fullName: 'Ramesh Naik', email: 'ramesh.naik@example.com', caseTypeId: CT['Murder / Grievous Hurt / Arson'], jurisdictionId: districts.bengaluru, caseStage: 'Trial', channelId: CH['Web Portal'], languageId: LANG.en, checkins: withDaysAgo([LOW[1], LOW[2]], [40, 15]) },
    { docketNumber: 'DEMO-0003', fullName: 'Sunita Kamble', email: 'sunita.kamble@example.com', caseTypeId: CT['Family Affected by Caste-Based Violence'], jurisdictionId: districts.mysuru, caseStage: 'Rehabilitation', channelId: CH['Mobile App'], languageId: LANG.mr, checkins: withDaysAgo([LOW[2], LOW[3]], [30, 8]) },
    { docketNumber: 'DEMO-0004', fullName: 'Arjun Solanki', email: 'arjun.solanki@example.com', caseTypeId: CT['Rape / Gang Rape'], jurisdictionId: districts.lucknow, caseStage: 'Compensation', channelId: CH.SMS, languageId: LANG.hi, checkins: withDaysAgo([LOW[0], LOW[3]], [50, 20]) },

    // ----- Moderate (4) -----
    { docketNumber: 'DEMO-0005', fullName: 'Kavita Yadav', email: 'kavita.yadav@example.com', caseTypeId: CT['Witness Facing Intimidation or Threats'], jurisdictionId: districts.varanasi, caseStage: 'Trial', channelId: CH.Chatbot, languageId: LANG.bn, checkins: withDaysAgo([MODERATE[0], MODERATE[1], MODERATE[2]], [35, 12, 3]) },
    { docketNumber: 'DEMO-0006', fullName: 'Manoj Pawar', email: 'manoj.pawar@example.com', caseTypeId: CT['Family Affected by Caste-Based Violence'], jurisdictionId: districts.pune, caseStage: 'Investigation', channelId: CH['Helpline Follow-Up'], languageId: LANG.mr, checkins: withDaysAgo([MODERATE[1], MODERATE[3]], [28, 9]) },
    { docketNumber: 'DEMO-0007', fullName: 'Geeta Shinde', email: 'geeta.shinde@example.com', caseTypeId: CT['Rape / Gang Rape'], jurisdictionId: districts.bengaluru, caseStage: 'Rehabilitation', channelId: CH['Web Portal'], languageId: LANG.te, checkins: withDaysAgo([MODERATE[2], MODERATE[0]], [25, 7]) },
    { docketNumber: 'DEMO-0008', fullName: 'Vikram Chauhan', email: 'vikram.chauhan@example.com', caseTypeId: CT['Murder / Grievous Hurt / Arson'], jurisdictionId: districts.mysuru, caseStage: 'Compensation', channelId: CH['Mobile App'], languageId: LANG.ta, checkins: withDaysAgo([MODERATE[3], MODERATE[1], MODERATE[2]], [33, 11, 4]) },

    // ----- High (4) -----
    { docketNumber: 'DEMO-0009', fullName: 'Rekha More', email: 'rekha.more@example.com', caseTypeId: CT['Witness Facing Intimidation or Threats'], jurisdictionId: districts.lucknow, caseStage: 'Investigation', channelId: CH.SMS, languageId: LANG.en, checkins: withDaysAgo([HIGH[0], HIGH[1]], [20, 6]) },
    { docketNumber: 'DEMO-0010', fullName: 'Suresh Waghmare', email: 'suresh.waghmare@example.com', caseTypeId: CT['Family Affected by Caste-Based Violence'], jurisdictionId: districts.varanasi, caseStage: 'Trial', channelId: CH.Chatbot, languageId: LANG.hi, checkins: withDaysAgo([HIGH[1], HIGH[2]], [24, 5]) },
    { docketNumber: 'DEMO-0011', fullName: 'Anita Jadhav', email: 'anita.jadhav@example.com', caseTypeId: CT['Rape / Gang Rape'], jurisdictionId: districts.pune, caseStage: 'Rehabilitation', channelId: CH['Web Portal'], languageId: LANG.mr, checkins: withDaysAgo([HIGH[2], HIGH[3]], [18, 2]) },
    { docketNumber: 'DEMO-0012', fullName: 'Deepak Rathod', email: 'deepak.rathod@example.com', caseTypeId: CT['Murder / Grievous Hurt / Arson'], jurisdictionId: districts.bengaluru, caseStage: 'Compensation', channelId: CH['Mobile App'], languageId: LANG.bn, checkins: withDaysAgo([HIGH[0], HIGH[1], HIGH[3]], [22, 9, 1]) },

    // ----- Critical (3) -----
    { docketNumber: 'DEMO-0013', fullName: 'Meena Salunkhe', email: 'meena.salunkhe@example.com', caseTypeId: CT['Witness Facing Intimidation or Threats'], jurisdictionId: districts.mysuru, caseStage: 'Investigation', channelId: CH['Helpline Follow-Up'], languageId: LANG.te, checkins: withDaysAgo([CRITICAL[0], CRITICAL[1]], [14, 2]) },
    { docketNumber: 'DEMO-0014', fullName: 'Ravi Bhosale', email: 'ravi.bhosale@example.com', caseTypeId: CT['Family Affected by Caste-Based Violence'], jurisdictionId: districts.lucknow, caseStage: 'Trial', channelId: CH.SMS, languageId: LANG.ta, checkins: withDaysAgo([CRITICAL[1], CRITICAL[2]], [16, 1]) },
    { docketNumber: 'DEMO-0015', fullName: 'Sangeeta Kale', email: 'sangeeta.kale@example.com', caseTypeId: CT['Rape / Gang Rape'], jurisdictionId: districts.varanasi, caseStage: 'Rehabilitation', channelId: CH.Chatbot, languageId: LANG.hi, checkins: withDaysAgo([CRITICAL[2], CRITICAL[3]], [19, 0]) },

    // ----- Escalating trend (1) -----
    { docketNumber: 'DEMO-0016', fullName: 'Ajay Gaikwad', email: 'ajay.gaikwad@example.com', caseTypeId: CT['Witness Facing Intimidation or Threats'], jurisdictionId: districts.pune, caseStage: 'Investigation', channelId: CH['Web Portal'], languageId: LANG.en, isEscalating: true, checkins: withDaysAgo(ESCALATING_BASE, [30, 14, 2]) },
  ];
}

const ESCALATING_DOCKET = 'DEMO-0016';

// ===== Final verification/report =====

async function finalReport(victimConfigs, maps) {
  console.log('\n=== Demo dataset verification ===');
  const counts = { Low: 0, Moderate: 0, High: 0, Critical: 0, None: 0 };
  const victimIdByDocket = {};

  for (const config of victimConfigs) {
    const { data: victim, error } = await supabase.from('victims').select('victim_id').eq('docket_number', config.docketNumber).maybeSingle();
    if (error) throw new Error(`Could not verify victim ${config.docketNumber}: ${error.message}`);
    if (!victim) {
      console.warn(`  ${config.docketNumber}: victim row missing (seed did not complete)`);
      continue;
    }
    victimIdByDocket[config.docketNumber] = victim.victim_id;

    const { data: latest, error: scoreErr } = await supabase
      .from('distress_scores')
      .select('score_value, risk_levels(name)')
      .eq('victim_id', victim.victim_id)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (scoreErr) throw new Error(`Could not fetch latest score for ${config.docketNumber}: ${scoreErr.message}`);
    const tier = latest ? latest.risk_levels.name : 'None';
    counts[tier] = (counts[tier] || 0) + 1;
    console.log(`  ${config.docketNumber} ${config.fullName}: ${latest ? `${latest.score_value} (${tier})` : 'no scores yet'}`);
  }
  console.log('\nRisk-level distribution across demo victims:', counts);

  const escConfig = victimConfigs.find((c) => c.docketNumber === ESCALATING_DOCKET);
  const escVictimId = victimIdByDocket[ESCALATING_DOCKET];
  let escalating = false;
  if (escVictimId) {
    const { data: last3, error: last3Err } = await supabase
      .from('distress_scores')
      .select('score_value, computed_at')
      .eq('victim_id', escVictimId)
      .order('computed_at', { ascending: false })
      .limit(3);
    if (last3Err) throw new Error(`Could not fetch escalating victim's scores: ${last3Err.message}`);
    const oldestFirst = [...(last3 || [])].reverse().map((s) => s.score_value);
    escalating = isEscalatingTrend(oldestFirst);
    console.log(`\nEscalating trend check for ${ESCALATING_DOCKET} (${escConfig.fullName}): scores oldest->newest = [${oldestFirst.join(', ')}] -> isEscalatingTrend() = ${escalating}`);
    if (!escalating) console.warn('WARNING: could not confirm an escalating trend within the fallback budget.');
  } else {
    console.warn(`WARNING: escalating-trend victim ${ESCALATING_DOCKET} was not found.`);
  }

  const demoVictimIds = Object.values(victimIdByDocket);
  const { data: openAlerts, error: alertsErr } = await supabase
    .from('alerts')
    .select('alert_id, triggered_at, victim_id, distress_scores(score_value, risk_levels(name))')
    .in('victim_id', demoVictimIds)
    .eq('alert_status_id', maps.openAlertStatusId);
  if (alertsErr) throw new Error(`Could not fetch alerts: ${alertsErr.message}`);

  const docketByVictimId = Object.fromEntries(Object.entries(victimIdByDocket).map(([d, v]) => [v, d]));
  const nameByDocket = Object.fromEntries(victimConfigs.map((c) => [c.docketNumber, c.fullName]));
  console.log(`\nOpen alerts among demo victims: ${(openAlerts || []).length}`);
  for (const a of openAlerts || []) {
    const docket = docketByVictimId[a.victim_id];
    console.log(`  ALERT ${a.alert_id}: ${docket} (${nameByDocket[docket]}) - score ${a.distress_scores?.score_value} (${a.distress_scores?.risk_levels?.name}) - triggered ${a.triggered_at}`);
  }

  return { counts, escalating, openAlertCount: (openAlerts || []).length };
}

// ===== Main =====

async function main() {
  if (process.env.NODE_ENV !== 'development') {
    console.error('Refusing to seed demo data outside NODE_ENV=development.');
    process.exit(1);
  }

  const { data: national, error: natErr } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('level', 'national').limit(1).maybeSingle();
  if (natErr) throw new Error(`Could not look up national jurisdiction: ${natErr.message}`);
  if (!national) throw new Error('No national jurisdiction found - run `npm run seed:super-admin` first.');

  const maharashtraId = await ensureJurisdiction('Maharashtra', 'state', national.jurisdiction_id);
  const puneId = await ensureJurisdiction('Pune', 'district', maharashtraId);
  const karnatakaId = await ensureJurisdiction('Karnataka', 'state', national.jurisdiction_id);
  const bengaluruId = await ensureJurisdiction('Bengaluru Urban', 'district', karnatakaId);
  const mysuruId = await ensureJurisdiction('Mysuru', 'district', karnatakaId);
  const upId = await ensureJurisdiction('Uttar Pradesh', 'state', national.jurisdiction_id);
  const lucknowId = await ensureJurisdiction('Lucknow', 'district', upId);
  const varanasiId = await ensureJurisdiction('Varanasi', 'district', upId);

  const districts = { pune: puneId, bengaluru: bengaluruId, mysuru: mysuruId, lucknow: lucknowId, varanasi: varanasiId };

  const maps = await buildMaps();
  const victimConfigs = buildVictimConfigs(maps, districts);

  console.log(`\nSeeding ${victimConfigs.length} demo victims with real check-in histories (this makes real Gemini API calls and can take a few minutes)...\n`);

  for (const config of victimConfigs) {
    const victimId = await ensureDemoVictim(config);
    await runCheckinsForVictim(config, victimId, maps);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`\nAborting: ${MAX_CONSECUTIVE_FAILURES} consecutive Gemini failures - likely quota exhausted. Data seeded so far is safe and idempotent; re-run npm run seed:demo later to continue.`);
      await finalReport(victimConfigs, maps);
      process.exit(1);
    }
  }

  const report = await finalReport(victimConfigs, maps);

  console.log('\nDemo dataset seed complete.');
  console.log(`Victims: ${victimConfigs.length}, distribution: ${JSON.stringify(report.counts)}, escalating trend confirmed: ${report.escalating}, open alerts: ${report.openAlertCount}.`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

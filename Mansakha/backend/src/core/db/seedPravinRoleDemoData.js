// Fleshes out the 10 demo cases seedPravinRoleDemo.js created
// (NHAA-2026-0000003..0000012) with realistic data across everything an
// official actually looks at when they open one: distress-score history
// (via the same recordInteraction/recordOllamaDistressScore/
// applyStressResponse pipeline real check-ins and chat use, so it's
// schema-correct and drives real alerts the same way), case notes, and a
// short chat thread. Without this they were bare skeleton rows - open
// referrals with nothing behind them.
// Usage: node src/core/db/seedPravinRoleDemoData.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { recordInteraction, recordOllamaDistressScore } = require('../services/interactionPipeline');
const { applyStressResponse } = require('../services/stressResponse');

// One profile per victim (10 total) - a mix of risk tiers so dashboards/
// trend charts/alert feeds show real variety instead of 10 identical cases.
// `earlier`/`latest` scores give the trend chart two points to draw a line
// between (rising/falling/flat, matching the tier's story).
const PROFILES = [
  { tier: 'Low', earlier: 22, latest: 18, trend: 'improving' },
  { tier: 'Moderate', earlier: 30, latest: 42, trend: 'rising' },
  { tier: 'High', earlier: 50, latest: 66, trend: 'rising' },
  { tier: 'Critical', earlier: 58, latest: 87, trend: 'rising sharply' },
  { tier: 'Moderate', earlier: 48, latest: 44, trend: 'stable' },
  { tier: 'Low', earlier: 25, latest: 14, trend: 'improving' },
  { tier: 'High', earlier: 60, latest: 71, trend: 'rising' },
  { tier: 'Moderate', earlier: 40, latest: 37, trend: 'stable' },
  { tier: 'Critical', earlier: 70, latest: 91, trend: 'rising sharply' },
  { tier: 'Low', earlier: 20, latest: 24, trend: 'stable' },
];

// Generic, non-clinical, non-identifying summaries per tier - same
// supportive-but-honest tone as the rest of this app's own AI copy, never
// naming a case type or offense.
const SUMMARY_BY_TIER = {
  Low: 'Reports feeling steady this week. Sleeping and eating normally, spending time with family. No immediate concerns raised.',
  Moderate: 'Some difficulty coping day to day - mentions feeling on edge and occasional trouble sleeping. Managing with support from family, open to more regular check-ins.',
  High: 'Notable distress this week - reports feeling anxious most days, some isolation from usual support network. Recommend closer follow-up.',
  Critical: 'Significant distress indicators this week - reports feeling overwhelmed and unsafe. Recommend urgent follow-up and review of current support/protection measures.',
};

const CHAT_TURNS_BY_TIER = {
  Low: [
    { sender: 'user', body: "Hi, just checking in. Things have been okay this week." },
    { sender: 'ai', body: "That's good to hear. Is there anything on your mind you'd like to talk through?" },
    { sender: 'user', body: "Not really, just wanted to say things are steadier now. Thank you for checking." },
  ],
  Moderate: [
    { sender: 'user', body: "I've been feeling a bit on edge the last few days, hard to explain why." },
    { sender: 'ai', body: "Thank you for sharing that. It's okay to not have a clear reason - what's it been like day to day?" },
    { sender: 'user', body: "Trouble sleeping mostly. I'm managing but it's been tiring." },
    { sender: 'ai', body: "That sounds draining. Would it help to have your counsellor check in with you this week?" },
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
    { sender: 'user', body: "I think so, I'm at home." },
    { sender: 'ai', body: "Okay. I'm letting your counsellor know right away so someone can reach you today. Please call the NHAA Helpline at 14566 if things feel unsafe before then." },
  ],
};

async function main() {
  const { data: victims, error: victimError } = await supabase
    .from('users')
    .select('user_id, docket_number')
    .like('docket_number', 'NHAA-2026-%')
    .order('docket_number', { ascending: true });
  if (victimError) throw new Error(victimError.message);

  const targets = (victims || []).filter((v) => {
    const n = parseInt(v.docket_number.split('-')[2], 10);
    return n >= 3 && n <= 12;
  });
  if (targets.length !== 10) {
    console.warn(`Expected 10 target victims (0000003-0000012), found ${targets.length}. Proceeding with what's found.`);
  }

  for (let i = 0; i < targets.length; i++) {
    const victim = targets[i];
    const profile = PROFILES[i % PROFILES.length];
    console.log(`\n${victim.docket_number} - profile: ${profile.tier} (${profile.trend})`);

    // Two interactions (earlier + latest) so the trend chart has two real
    // points, each scored through the exact same pipeline a real check-in
    // uses - recordOllamaDistressScore auto-classifies the risk tier from
    // the numeric score via classifyRiskLevel, same as /chat/log's own path.
    const scores = [
      { value: profile.earlier, label: 'earlier' },
      { value: profile.latest, label: 'latest' },
    ];
    let latestRiskLevel = null;
    for (const s of scores) {
      const { interactionId } = await recordInteraction({
        userId: victim.user_id,
        channelName: s.label === 'latest' ? 'Mobile App' : 'Chatbot',
        transcriptText: `Mansakha: How have you been feeling lately?\nPerson: ${SUMMARY_BY_TIER[profile.tier]}`,
      });
      const { riskLevel } = await recordOllamaDistressScore(
        victim.user_id,
        interactionId,
        { score: s.value, summary: SUMMARY_BY_TIER[profile.tier] },
        'demo-seed-v1'
      );
      latestRiskLevel = riskLevel;
      if (s.label === 'latest') {
        // Only the latest score should drive the tiered response (wellness
        // push / AI proactive contact / real alert) - matches real
        // behaviour, where each new score re-evaluates the response, not
        // every historical one.
        const { alertId } = await applyStressResponse(victim.user_id, null, riskLevel).catch(() => ({ alertId: null }));
      }
    }
    console.log(`  Recorded 2 distress scores (${profile.earlier} -> ${profile.latest}, ${latestRiskLevel})`);

    // Case note (AI-authored, same as a real check-in's auto-saved summary).
    const { error: noteError } = await supabase.from('case_notes').insert({
      user_id: victim.user_id,
      official_id: null,
      note_text: SUMMARY_BY_TIER[profile.tier],
      authored_by: 'ai',
    });
    if (noteError) throw new Error(`Case note failed for ${victim.docket_number}: ${noteError.message}`);
    console.log('  Added 1 case note');

    // Short chat thread for the CaseChat feature.
    const turns = CHAT_TURNS_BY_TIER[profile.tier];
    const now = Date.now();
    const chatRows = turns.map((t, idx) => ({
      user_id: victim.user_id,
      sender: t.sender,
      body: t.body,
      channel: 'text',
      sent_at: new Date(now - (turns.length - idx) * 60000).toISOString(),
    }));
    const { error: chatError } = await supabase.from('chat_messages').insert(chatRows);
    if (chatError) throw new Error(`Chat messages failed for ${victim.docket_number}: ${chatError.message}`);
    console.log(`  Added ${chatRows.length} chat messages`);
  }

  console.log('\nDone. All 10 demo cases now have distress-score history (with real alerts for High/Critical tiers), a case note, and a short chat thread.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

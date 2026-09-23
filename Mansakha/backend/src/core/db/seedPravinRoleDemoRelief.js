// Fleshes out the same 10 demo cases (NHAA-2026-0000003..0000012) with real
// DWO Relief/Compensation data - the Referral Queue's "Relief: ... /
// Compensation: X/Y paid" summary (web-frontend/src/dwo/pages/
// ReferralQueue.jsx's reliefSummary()) was showing "-" for all 10 because
// their agency_referrals.metadata was still the bare {} seedPravinRoleDemo.js
// left it at - nothing had ever verified compensation or approved relief for
// them. Builds metadata with the exact same shapes the real DWO routes
// produce (core/services/compensationSchedule.js's own helpers, same
// immediateRelief object shape as dwo.routes.js's approve/mark-provided
// handlers) so this is indistinguishable from a DWO having actually worked
// these cases, following Pravin's own case (NHAA-2026-0000001) as the
// reference for what "real" looks like here.
// Usage: node src/core/db/seedPravinRoleDemoRelief.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');
const { getCompensationSchedule, buildCompensationStages, isCompensationStageUnlocked } = require('../services/compensationSchedule');

// How many of the 3 compensation stages are even unlocked yet, purely a
// function of case_stage (same logic isCompensationStageUnlocked applies
// per-stage) - Investigation only unlocks Stage 1, Trial unlocks Stage 1+2,
// Compensation unlocks all 3.
const UNLOCKED_COUNT = { Investigation: 1, Trial: 2, Compensation: 3 };

const DEMO_IDENTITIES = [
  { fullName: 'Ramesh Solanki', contact: '9825100301', bank: 'State Bank of India', ifsc: 'SBIN0001234' },
  { fullName: 'Kavita Chauhan', contact: '9825100302', bank: 'Bank of Baroda', ifsc: 'BARB0PORBAN' },
  { fullName: 'Jayesh Parmar', contact: '9825100303', bank: 'Punjab National Bank', ifsc: 'PUNB0123400' },
  { fullName: 'Nirmala Vaghela', contact: '9825100304', bank: 'State Bank of India', ifsc: 'SBIN0001234' },
  { fullName: 'Bharat Rathva', contact: '9825100305', bank: 'Bank of Baroda', ifsc: 'BARB0PORBAN' },
  { fullName: 'Sunita Makwana', contact: '9825100306', bank: 'Union Bank of India', ifsc: 'UBIN0812345' },
  { fullName: 'Dinesh Bariya', contact: '9825100307', bank: 'State Bank of India', ifsc: 'SBIN0001234' },
  { fullName: 'Anita Zala', contact: '9825100308', bank: 'Bank of Baroda', ifsc: 'BARB0PORBAN' },
  { fullName: 'Mahesh Damor', contact: '9825100309', bank: 'Punjab National Bank', ifsc: 'PUNB0123400' },
  { fullName: 'Rekha Chavda', contact: '9825100310', bank: 'Union Bank of India', ifsc: 'UBIN0812345' },
];

// Every one of the 10 gets an immediateRelief object EXCEPT a deliberate
// couple left as "not requested yet" - real variety, not every case needs
// financial/essential support this early, matching how case_stage above
// also isn't uniformly at the same point.
const RELIEF_PLANS = [
  { assistanceTypes: ['Financial'], financialAmount: 12000, status: 'Provided' },
  { assistanceTypes: ['Essential Support'], essentialSupportNotes: 'Emergency groceries and temporary housing support arranged via district welfare office.', status: 'Approved' },
  null,
  { assistanceTypes: ['Financial', 'Essential Support'], financialAmount: 15000, essentialSupportNotes: 'Medical follow-up costs and transport assistance approved.', status: 'Provided' },
  { assistanceTypes: ['Financial'], financialAmount: 8000, status: 'Approved' },
  { assistanceTypes: ['Essential Support'], essentialSupportNotes: 'Temporary relocation support pending threat review.', status: 'Provided' },
  null,
  { assistanceTypes: ['Financial'], financialAmount: 10000, status: 'Provided' },
  { assistanceTypes: ['Financial', 'Essential Support'], financialAmount: 9000, essentialSupportNotes: 'School fee waiver coordinated for dependent children.', status: 'Approved' },
  { assistanceTypes: ['Essential Support'], essentialSupportNotes: 'Livelihood support kit provided pending long-term rehabilitation opt-in.', status: 'Provided' },
];

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  const { rows } = await pool.query(`
    select u.user_id, u.docket_number, u.case_stage, ct.name as case_type_name, ar.referral_id
    from users u
    join case_types ct on ct.case_type_id = u.case_type_id
    join agency_referrals ar on ar.user_id = u.user_id and ar.referred_to_role = 'District Welfare Officer'
    where u.docket_number like 'NHAA-2026-%'
    order by u.docket_number
  `);
  const targets = rows.filter((r) => {
    const n = parseInt(r.docket_number.split('-')[2], 10);
    return n >= 3 && n <= 12;
  });
  if (targets.length !== 10) {
    console.warn(`Expected 10 target victims, found ${targets.length}. Proceeding with what's found.`);
  }

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const identity = DEMO_IDENTITIES[i % DEMO_IDENTITIES.length];
    const reliefPlan = RELIEF_PLANS[i % RELIEF_PLANS.length];
    console.log(`\n${row.docket_number} - ${row.case_type_name} (${row.case_stage})`);

    // ---- Compensation: verify for every one of them, so the queue never
    // shows "-" again, then pay however many stages are unlocked at this
    // case's current stage, minus a random 0-1 held back "still pending" -
    // same variety principle as seedPravinRoleDemoData.js's distress
    // profiles (not every case is fully caught up).
    const schedule = getCompensationSchedule(row.case_type_name);
    const variance = 0.9 + Math.random() * 0.2; // DWO-adjusted +/-10% off the suggested statutory amount
    const verifiedAmount = Math.round((schedule.suggestedAmount * variance) / 100) * 100;
    const stages = buildCompensationStages(verifiedAmount);

    const unlockedCount = UNLOCKED_COUNT[row.case_stage] || 1;
    const paidCount = Math.max(0, unlockedCount - (Math.random() < 0.5 ? 0 : 1));
    for (let s = 0; s < paidCount; s++) {
      stages[s].status = 'Paid';
      stages[s].paidAt = daysAgo(20 - s * 6);
    }

    const compensation = {
      statutoryCategory: schedule.statutoryCategory,
      suggestedAmount: schedule.suggestedAmount,
      verifiedAmount,
      verifiedAt: daysAgo(25),
      stages,
    };

    const metadata = { compensation };
    if (reliefPlan) {
      metadata.immediateRelief = {
        assistanceTypes: reliefPlan.assistanceTypes,
        financialAmount: reliefPlan.assistanceTypes.includes('Financial') ? reliefPlan.financialAmount : null,
        essentialSupportNotes: reliefPlan.assistanceTypes.includes('Essential Support') ? reliefPlan.essentialSupportNotes : null,
        status: reliefPlan.status,
        approvedAt: daysAgo(18),
        providedAt: reliefPlan.status === 'Provided' ? daysAgo(12) : null,
        confirmedAt: null,
      };
    }

    const { error: refError } = await supabase
      .from('agency_referrals')
      .update({ metadata })
      .eq('referral_id', row.referral_id);
    if (refError) throw new Error(`Referral update failed for ${row.docket_number}: ${refError.message}`);
    console.log(`  Compensation verified: Rs ${verifiedAmount} (${paidCount}/3 stages paid)${reliefPlan ? `, Immediate Relief: ${reliefPlan.status}` : ', Immediate Relief: not requested'}`);

    // ---- Bank details: only needed once a stage is actually Paid (the
    // real mark-paid route itself refuses without one) - keeps the paid
    // stages we just wrote consistent with the app's own invariant.
    if (paidCount > 0) {
      const { error: identityError } = await supabase.from('user_identity').upsert({
        user_id: row.user_id,
        full_name: identity.fullName,
        contact_number: identity.contact,
        bank_account_name: identity.fullName,
        bank_account_number: `${5000000000 + i * 137}`,
        bank_ifsc: identity.ifsc,
        bank_name: identity.bank,
        bank_details_updated_at: daysAgo(21),
      }, { onConflict: 'user_id' });
      if (identityError) throw new Error(`user_identity upsert failed for ${row.docket_number}: ${identityError.message}`);
      console.log(`  Bank details added (${identity.bank})`);
    }
  }

  console.log('\nDone. All 10 demo cases now have verified compensation (with paid-stage progress tied to their case stage) and immediate relief data where applicable.');
  await pool.end();
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

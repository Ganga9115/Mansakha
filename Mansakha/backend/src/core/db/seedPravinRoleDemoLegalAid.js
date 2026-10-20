// The DLSA Coordinator's Legal Aid Requests screen (New/Active/History
// tabs) had exactly one row - Pravin's own real "Under Review" request.
// Every other demo victim (NHAA-2026-0000003..0000022, seeded earlier this
// session) has never touched the victim-side "Request Legal Aid" flow, so
// legal_aid_requests has no row for them at all - this is a DIFFERENT table
// from agency_referrals (see dlsa.routes.js's own header), so their
// existing DLSA Coordinator referral doesn't put them here.
// idx_legal_aid_requests_one_open_per_case is a plain unique index on
// user_id (one Legal Aid request per case, ever) - each victim below gets
// exactly one, spread across all 3 tabs the DLSA screen actually has:
// New (Submitted/Under Review), Active (a real Public Prosecutor has
// accepted), History (Rejected/Completed). Uses the exact same
// request->assign->accept sequence the real routes apply (dlsa.routes.js's
// assign-representative + legalRepresentative.routes.js's accept) so the
// Active case is indistinguishable from one actually worked end to end.
// Usage: node src/core/db/seedPravinRoleDemoLegalAid.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');

const PP_PORBANDAR = '44c16092-dd24-4956-b9dd-60834886749a'; // Diya Reddy, PP-521
const DLSA_OFFICIAL_ID = '03b69f07-b049-4c04-b134-7366bb453b8e'; // Porbandar DLSA Coordinator, DLSA-521

const PLAN = [
  { docket: 'NHAA-2026-0000004', status: 'Submitted', reason: 'Family unable to afford private counsel for the ongoing caste-based violence case; requesting Legal Aid support.' },
  { docket: 'NHAA-2026-0000006', status: 'Submitted', reason: 'Requesting legal representation to assist with FIR follow-up and upcoming court proceedings.' },
  { docket: 'NHAA-2026-0000009', status: 'Under Review', reason: 'No family member has legal knowledge; requesting a Legal Aid lawyer to represent the case in court.', daysAgo: 5 },
  { docket: 'NHAA-2026-0000013', status: 'Active', reason: 'Requesting Legal Aid support through trial; case involves a serious offence and the family cannot afford private counsel.', daysAgo: 18 },
  { docket: 'NHAA-2026-0000015', status: 'Rejected', reason: 'Requesting legal aid for case follow-up.', rejectionReason: 'Case already has private legal representation on record; Legal Aid is for cases without existing counsel.', daysAgo: 12 },
  { docket: 'NHAA-2026-0000020', status: 'Completed', reason: 'Requesting Legal Aid support - case has reached compensation stage and needs help closing remaining formalities.', daysAgo: 40 },
];

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  for (const plan of PLAN) {
    const { rows } = await pool.query('select user_id from users where docket_number = $1', [plan.docket]);
    if (!rows[0]) throw new Error(`Victim not found: ${plan.docket}`);
    const userId = rows[0].user_id;

    const { data: request, error: reqError } = await supabase
      .from('legal_aid_requests')
      .insert({
        user_id: userId,
        reason: plan.reason,
        status: plan.status === 'Active' ? 'Under Review' : plan.status, // Active is reached via the accept flow below, same as real usage
        rejection_reason: plan.rejectionReason || null,
        created_at: daysAgo(plan.daysAgo || 3),
      })
      .select('request_id')
      .single();
    if (reqError) throw new Error(`legal_aid_requests insert failed for ${plan.docket}: ${reqError.message}`);
    console.log(`${plan.docket}: legal aid request created (${plan.status})`);

    if (plan.status === 'Active') {
      const { data: assignment, error: assignError } = await supabase
        .from('legal_aid_assignments')
        .insert({
          request_id: request.request_id,
          representative_official_id: PP_PORBANDAR,
          assigned_by_official_id: DLSA_OFFICIAL_ID,
          status: 'Active',
          assigned_at: daysAgo(plan.daysAgo || 18),
        })
        .select('assignment_id')
        .single();
      if (assignError) throw new Error(`legal_aid_assignments insert failed for ${plan.docket}: ${assignError.message}`);

      const { error: updateError } = await supabase
        .from('legal_aid_requests')
        .update({ status: 'Active', reviewed_by_official_id: DLSA_OFFICIAL_ID, reviewed_at: daysAgo((plan.daysAgo || 18) - 2), updated_at: daysAgo(1) })
        .eq('request_id', request.request_id);
      if (updateError) throw new Error(`legal_aid_requests update to Active failed for ${plan.docket}: ${updateError.message}`);
      console.log(`  Assigned to Diya Reddy (PP-521), accepted - now Active`);
    } else if (plan.status === 'Rejected') {
      console.log(`  Rejected: ${plan.rejectionReason}`);
    } else if (plan.status === 'Completed') {
      // Completed requests in real usage passed through Active first - mirror
      // that shape (an assignment that later ended) rather than jumping
      // straight to Completed with no history behind it.
      const { error: assignError } = await supabase.from('legal_aid_assignments').insert({
        request_id: request.request_id,
        representative_official_id: PP_PORBANDAR,
        assigned_by_official_id: DLSA_OFFICIAL_ID,
        status: 'Completed',
        ended_reason: 'Case concluded - Legal Aid representation no longer required.',
        assigned_at: daysAgo(plan.daysAgo),
        ended_at: daysAgo(3),
      });
      if (assignError) throw new Error(`legal_aid_assignments (Completed) insert failed for ${plan.docket}: ${assignError.message}`);
      const { error: updateError } = await supabase
        .from('legal_aid_requests')
        .update({ status: 'Completed', reviewed_by_official_id: DLSA_OFFICIAL_ID, reviewed_at: daysAgo(plan.daysAgo - 2), updated_at: daysAgo(3) })
        .eq('request_id', request.request_id);
      if (updateError) throw new Error(`legal_aid_requests update to Completed failed for ${plan.docket}: ${updateError.message}`);
      console.log(`  Representation concluded - now Completed`);
    }
  }

  console.log('\nDone. Legal Aid Requests now has 3 New, 1 Active, 2 History cases alongside Pravin\'s own.');
  await pool.end();
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

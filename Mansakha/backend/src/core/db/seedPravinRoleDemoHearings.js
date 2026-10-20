// Diya Reddy's (PP-521, Porbandar) "Hearings" screen only showed Pravin's
// one case - not because she had no other Active Legal Aid assignments
// (NHAA-2026-0000013 from the earlier legal-aid seed IS Active), but
// because hearings-upcoming only surfaces cases eligible for court data
// (isCourtCaseEligible - Trial stage or beyond), and 0000013 is still in
// Investigation. Picks 4 more Porbandar demo victims who are already at
// Trial/Compensation AND don't yet have a legal_aid_requests row (that
// table's one-request-per-case-ever unique index rules out the ones the
// earlier legal-aid seed already used), runs them through the same real
// assign->accept sequence, then calls ensureCourtCaseDetails directly
// (courtCaseSync.js's own DB-orchestration wrapper, the exact function
// hearings-upcoming itself calls) so their simulated eCourt hearing dates
// exist immediately rather than waiting for her next page load to
// generate them.
// Usage: node src/core/db/seedPravinRoleDemoHearings.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');
const { pool } = require('./pgPool');
const { ensureCourtCaseDetails } = require('../services/courtCaseSync');

const PP_PORBANDAR = '44c16092-dd24-4956-b9dd-60834886749a'; // Diya Reddy, PP-521
const DLSA_OFFICIAL_ID = '03b69f07-b049-4c04-b134-7366bb453b8e'; // Porbandar DLSA Coordinator
const JURISDICTION_NAME = 'Porbandar';

const DOCKETS = ['NHAA-2026-0000007', 'NHAA-2026-0000011', 'NHAA-2026-0000017', 'NHAA-2026-0000021'];

const REASONS = [
  'Requesting Legal Aid support through trial proceedings; unable to afford private counsel.',
  'Requesting Legal Aid support - case has reached compensation stage, needs representation for remaining formalities.',
  'Family cannot afford private counsel; requesting Legal Aid support for trial.',
  'Requesting Legal Aid support - case at compensation stage, family unable to afford private counsel.',
];

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  for (let i = 0; i < DOCKETS.length; i++) {
    const docket = DOCKETS[i];
    const { rows } = await pool.query(
      `select u.user_id, u.case_stage, u.cnr_number, u.enrolled_at, ct.name as case_type_name
       from users u join case_types ct on ct.case_type_id = u.case_type_id
       where u.docket_number = $1`,
      [docket]
    );
    if (!rows[0]) throw new Error(`Victim not found: ${docket}`);
    const c = rows[0];

    const { data: request, error: reqError } = await supabase
      .from('legal_aid_requests')
      .insert({ user_id: c.user_id, reason: REASONS[i], status: 'Under Review', created_at: daysAgo(15 + i * 2) })
      .select('request_id')
      .single();
    if (reqError) throw new Error(`legal_aid_requests insert failed for ${docket}: ${reqError.message}`);

    const { error: assignError } = await supabase.from('legal_aid_assignments').insert({
      request_id: request.request_id,
      representative_official_id: PP_PORBANDAR,
      assigned_by_official_id: DLSA_OFFICIAL_ID,
      status: 'Active',
      assigned_at: daysAgo(13 + i * 2),
    });
    if (assignError) throw new Error(`legal_aid_assignments insert failed for ${docket}: ${assignError.message}`);

    const { error: updateError } = await supabase
      .from('legal_aid_requests')
      .update({ status: 'Active', reviewed_by_official_id: DLSA_OFFICIAL_ID, reviewed_at: daysAgo(14 + i * 2), updated_at: daysAgo(1) })
      .eq('request_id', request.request_id);
    if (updateError) throw new Error(`legal_aid_requests update to Active failed for ${docket}: ${updateError.message}`);
    console.log(`${docket}: Legal Aid Active, assigned to Diya Reddy (PP-521)`);

    const courtCase = await ensureCourtCaseDetails({
      userId: c.user_id,
      caseStage: c.case_stage,
      docketNumber: docket,
      cnrNumber: c.cnr_number,
      caseTypeName: c.case_type_name,
      jurisdictionName: JURISDICTION_NAME,
      enrolledAt: c.enrolled_at,
      victimFullName: null,
    });
    console.log(`  Court case ${courtCase.available ? 'generated' : 'NOT eligible: ' + courtCase.reason}${courtCase.available ? `, next hearing ${courtCase.row.next_hearing_date}` : ''}`);
  }

  console.log('\nDone. Diya Reddy now has 5 upcoming hearings (Pravin + 4 more).');
  await pool.end();
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

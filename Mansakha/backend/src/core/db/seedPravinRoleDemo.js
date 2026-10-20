// One-off seed: 10 new demo victim cases in Pravin's own jurisdiction
// (docket NHAA-2026-0000001, Porbandar), referred to the same 4 live roles
// Pravin's own case touches (Protection Officer, District Welfare Officer,
// DLSA Coordinator, Rehabilitation Officer) and assigned to Pravin's same
// counsellor - so those officials' queues have realistic multi-case demo
// data instead of just the one case. Skips "District Collector" (Pravin has
// an open referral to it, but that role no longer exists in the live
// officials roster - orphaned by the Sept 18 role-removal migration) and
// "Public Prosecutor" (not part of the agency_referrals routing system).
// Usage: node src/core/db/seedPravinRoleDemo.js
require('dotenv').config();
const { supabase } = require('./supabaseClient');

const JURISDICTION_ID = 'd00806e9-f0ed-48d6-9d4f-415ad4d67f7e'; // Porbandar - same as Pravin
const ASSIGNED_COUNSELLOR_ID = 'e8c9f0c6-d382-49ce-91f6-8743bb04b1f1'; // Sunita Sharma - Pravin's own counsellor

const ROLE_REFERRALS = ['Protection Officer', 'District Welfare Officer', 'DLSA Coordinator', 'Rehabilitation Officer'];
const CASE_STAGES = ['Investigation', 'Trial', 'Compensation'];
const CASE_TYPE_NAMES = [
  'Murder', 'Rape', 'Gang Rape', 'Grievous Hurt', 'Arson',
  'Family Affected by Caste-Based Violence', 'Witness Facing Intimidation or Threats',
];

function pad(n, width = 7) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { data: caseTypes } = await supabase.from('case_types').select('case_type_id, name').in('name', CASE_TYPE_NAMES);
  const { data: languages } = await supabase.from('languages').select('language_id, name');
  if (!caseTypes?.length || !languages?.length) throw new Error('Missing case_types or languages lookup data');

  const { data: existing } = await supabase
    .from('users')
    .select('docket_number')
    .like('docket_number', 'NHAA-2026-%')
    .order('docket_number', { ascending: false })
    .limit(1);
  let nextNum = existing?.[0]?.docket_number
    ? parseInt(existing[0].docket_number.split('-')[2], 10) + 1
    : 3;

  console.log(`Seeding 10 demo cases starting at NHAA-2026-${pad(nextNum)}...`);

  for (let i = 0; i < 10; i++) {
    const docket = `NHAA-2026-${pad(nextNum + i)}`;
    const caseType = caseTypes[i % caseTypes.length];
    const stage = CASE_STAGES[i % CASE_STAGES.length];
    const lang = languages[i % languages.length];

    const { data: userRow, error: userError } = await supabase
      .from('users')
      .insert({
        docket_number: docket,
        case_type_id: caseType.case_type_id,
        jurisdiction_id: JURISDICTION_ID,
        case_stage: stage,
        preferred_language: lang.language_id,
        auth_method: 'district_admin',
        assigned_counsellor_id: ASSIGNED_COUNSELLOR_ID,
      })
      .select('user_id')
      .single();
    if (userError) throw new Error(`Could not create ${docket}: ${userError.message}`);

    const referralRows = ROLE_REFERRALS.map((role) => ({
      user_id: userRow.user_id,
      referred_to_role: role,
      status: 'Open',
      reason: 'Demo data seeded for role-queue testing.',
      metadata: {},
    }));
    const { error: refError } = await supabase.from('agency_referrals').insert(referralRows);
    if (refError) throw new Error(`Could not create referrals for ${docket}: ${refError.message}`);

    console.log(`  Created ${docket} (${caseType.name}, ${stage}) -> referred to ${ROLE_REFERRALS.join(', ')}`);
  }

  console.log('\nDone. 10 new cases created, each referred to Protection Officer, District Welfare Officer, DLSA Coordinator, and Rehabilitation Officer, and assigned to Sunita Sharma (counsellor) - same set as Pravin\'s own case.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

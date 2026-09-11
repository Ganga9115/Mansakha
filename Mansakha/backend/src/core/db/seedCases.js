// Provisions multiple cases for a few specific users to demonstrate multi-case support.
// Usage: node src/core/db/seedCases.js

require('dotenv').config();
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function main() {
  const { data: jurisdictions } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'district').limit(2);
  if (!jurisdictions || jurisdictions.length === 0) throw new Error('No districts found');

  const { data: caseTypes } = await supabase.from('case_types').select('case_type_id, name');
  const { data: languages } = await supabase.from('languages').select('language_id').limit(1);
  
  if (!caseTypes || caseTypes.length < 3) throw new Error('Not enough case types');

  const users = [
    { name: 'Asha Patil', identity: '123456789012', phone: '9876543210' },
    { name: 'Kiran Desai', identity: '987654321098', phone: '8765432109' }
  ];

  console.log(`Provisioning multi-case users...`);

  let docketCounter = 500;
  
  for (const u of users) {
    const district = jurisdictions[0];
    const langId = languages[0].language_id;
    
    // Check if user identity exists (anchor case)
    let anchorUserId;
    const { data: idData } = await supabase.from('user_identity').select('user_id').eq('aadhaar_number', u.identity).maybeSingle();
    
    if (idData) {
      anchorUserId = idData.user_id;
    } else {
      // 1. Create the anchor user row
      const anchorDocket = `DOC-${pad(docketCounter++)}`;
      const caseType = caseTypes[0];
      const { data: userData, error: userError } = await supabase.from('users').insert({
        docket_number: anchorDocket,
        case_type_id: caseType.case_type_id,
        jurisdiction_id: district.jurisdiction_id,
        case_stage: 'Investigation',
        preferred_language: langId,
        auth_method: 'district_admin'
      }).select('user_id').single();
      
      if (userError) throw new Error(`Could not create anchor user: ${userError.message}`);
      anchorUserId = userData.user_id;

      // 2. Create the identity for the anchor
      const { error: idError } = await supabase.from('user_identity').insert({
        user_id: anchorUserId,
        full_name: u.name,
        contact_number: u.phone,
        aadhaar_number: u.identity
      });
      if (idError) throw new Error(`Could not create identity: ${idError.message}`);
      
      console.log(`  Created anchor case ${anchorDocket} for ${u.name}`);
    }

    // 3. Create 2 dependent cases for this user
    const stages = ['Trial', 'Compensation'];
    for (let i = 0; i < 2; i++) {
      const caseType = caseTypes[(i + 1) % caseTypes.length];
      const stage = stages[i % stages.length];
      const docket = `DOC-${pad(docketCounter++)}`;

      const { data: existingUser } = await supabase.from('users').select('user_id').eq('docket_number', docket).maybeSingle();
      if (!existingUser) {
        const { error: userError } = await supabase.from('users').insert({
          docket_number: docket,
          case_type_id: caseType.case_type_id,
          jurisdiction_id: district.jurisdiction_id,
          case_stage: stage,
          preferred_language: langId,
          auth_method: 'district_admin',
          linked_to_user_id: anchorUserId // Dependent link
        });
        
        if (userError) throw new Error(`Could not create case ${docket}: ${userError.message}`);
        
        console.log(`  Created dependent case ${docket} for ${u.name} at stage ${stage}`);
      }
    }
  }

  console.log('\nDone seeding multiple cases per user.');
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

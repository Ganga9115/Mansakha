// Provisions Coordinator accounts (DWO, DLSA, SPP).
// ID schemes:
//   District Welfare Officer: DWO-001...
//   DLSA Coordinator:         DLSA-001...
//   Special Public Prosecutor: SPP-001...
// Email: <role_slug>.<district_slug>@mansakha.gov.in
// Password: Mansakha@2026
// Idempotent - safe to re-run. Usage: node src/core/db/seedCoordinators.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const { supabase } = require('./supabaseClient');

const PASSWORD = 'Mansakha@2026';
const DOMAIN = '@mansakha.gov.in';

function slugify(name) {
  return name.replace(/[()]/g, ' ').replace(/&/g, ' and ').toLowerCase().replace(/[^a-z]/g, '');
}

function pad(n, width = 3) {
  return String(n).padStart(width, '0');
}

async function ensureOfficial(fullName, email, officialIdentifier, jurisdictionId, roleId, roleName) {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const { data: existing } = await supabase.from('officials').select('official_id').eq('official_identifier', officialIdentifier).maybeSingle();
  let officialId;
  if (existing) {
    officialId = existing.official_id;
    await supabase.from('officials').update({
      password_hash: passwordHash, full_name: fullName,
      must_change_password: false, staff_id: officialIdentifier,
      email: email,
    }).eq('official_id', officialId);
  } else {
    const { data, error } = await supabase.from('officials').insert({
      full_name: fullName, email, password_hash: passwordHash,
      must_change_password: false, staff_id: officialIdentifier,
      official_identifier: officialIdentifier,
    }).select('official_id').single();
    if (error) throw new Error(`Could not create official ${email}: ${error.message}`);
    officialId = data.official_id;
  }

  const { data: existingRole } = await supabase.from('official_roles')
    .select('official_role_id').eq('official_id', officialId)
    .eq('role_id', roleId).eq('jurisdiction_id', jurisdictionId).is('revoked_at', null).maybeSingle();

  if (!existingRole) {
    const { error } = await supabase.from('official_roles').insert({
      official_id: officialId, role_id: roleId, jurisdiction_id: jurisdictionId,
    });
    if (error) throw new Error(`Could not assign ${roleName} role to ${email}: ${error.message}`);
  }
}

async function main() {
  const { data: roles, error: rolesError } = await supabase.from('roles').select('role_id, role_name');
  if (rolesError) throw new Error('Could not fetch roles');

  const dwoRole = roles.find(r => r.role_name === 'District Welfare Officer');
  const dlsaRole = roles.find(r => r.role_name === 'DLSA Coordinator');
  const sppRole = roles.find(r => r.role_name === 'Special Public Prosecutor');

  if (!dwoRole || !dlsaRole || !sppRole) {
    throw new Error('Could not find one or more coordinator roles in the DB.');
  }

  const { data: districts } = await supabase.from('jurisdictions').select('jurisdiction_id, name, parent_id').eq('level', 'district').order('name');
  
  const sortedDistricts = [...districts].sort((a, b) => a.name.localeCompare(b.name));

  const { data: states } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  const stateCodeById = new Map();
  states.forEach(s => {
    let name = s.name.replace(/\s*\((UT|NCT)\)/gi, '').trim();
    // basic abbreviation if missing
    stateCodeById.set(s.jurisdiction_id, name.substring(0, 2).toLowerCase());
  });

  console.log(`Provisioning Coordinators for ${sortedDistricts.length} districts...`);

  // Simple chunking for concurrency
  const CONCURRENCY = 10;
  
  async function runWithConcurrency(items, limit, worker) {
    const results = [];
    let index = 0;
    async function next() {
      while (index < items.length) {
        const i = index++;
        results[i] = await worker(items[i], i);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
    return results;
  }

  await runWithConcurrency(sortedDistricts, CONCURRENCY, async (d, i) => {
    const slug = slugify(d.name);
    const stateCode = stateCodeById.get(d.parent_id) || 'xx';
    const idSuffix = pad(i + 1);
    
    // 1. DWO
    await ensureOfficial(
      `${d.name} District Welfare Officer`,
      `dwo.${slug}.${stateCode}${DOMAIN}`,
      `DWO-${idSuffix}`,
      d.jurisdiction_id,
      dwoRole.role_id,
      'District Welfare Officer'
    );
    
    // 2. DLSA
    await ensureOfficial(
      `${d.name} DLSA Coordinator`,
      `dlsa.${slug}.${stateCode}${DOMAIN}`,
      `DLSA-${idSuffix}`,
      d.jurisdiction_id,
      dlsaRole.role_id,
      'DLSA Coordinator'
    );
    
    // 3. SPP
    await ensureOfficial(
      `${d.name} Special Public Prosecutor`,
      `spp.${slug}.${stateCode}${DOMAIN}`,
      `SPP-${idSuffix}`,
      d.jurisdiction_id,
      sppRole.role_id,
      'Special Public Prosecutor'
    );
  });

  console.log('\nDone.');
  console.log(`Password for all: ${PASSWORD}`);
  console.log('\nSample IDs:');
  console.log(`  DWO:  DWO-001  / dwo.${slugify(sortedDistricts[0].name)}@mansakha.gov.in`);
  console.log(`  DLSA: DLSA-001 / dlsa.${slugify(sortedDistricts[0].name)}@mansakha.gov.in`);
  console.log(`  SPP:  SPP-001  / spp.${slugify(sortedDistricts[0].name)}@mansakha.gov.in`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

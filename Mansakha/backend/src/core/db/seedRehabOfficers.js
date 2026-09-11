// Provisions Rehabilitation Providers and Rehabilitation Officer accounts.
// ID scheme: RO-001, RO-002... (alphabetical by district name)
// Email: <provider_slug>.ro@mansakha.gov.in
// Password: Mansakha@2026
// Idempotent - safe to re-run. Usage: node src/core/db/seedRehabOfficers.js

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

async function ensureOfficial(fullName, email, officialIdentifier, jurisdictionId, roleId, providerId) {
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
    if (error) throw new Error(`Could not assign Rehabilitation Officer role to ${email}: ${error.message}`);
  }

  // Assign to the specific rehab provider (via rehabilitation_officers table if it exists, but typically officers are just staff linked to jurisdictions in Mansakha unless specified otherwise. Let's check schema. Rehabilitation officers are actually not linked to providers via a table right now in the schema - they are just staff with 'Rehabilitation Officer' role for the jurisdiction).
}

async function ensureProvider(name, type, jurisdictionId) {
  const { data: existing } = await supabase.from('rehabilitation_providers')
    .select('provider_id').eq('name', name).eq('jurisdiction_id', jurisdictionId).maybeSingle();
    
  if (existing) return existing.provider_id;
  
  const { data, error } = await supabase.from('rehabilitation_providers').insert({
    name, provider_type: type, jurisdiction_id: jurisdictionId,
    contact_info: '18001234567, Main District Road'
  }).select('provider_id').single();
  
  if (error) throw new Error(`Could not create provider ${name}: ${error.message}`);
  return data.provider_id;
}

async function main() {
  const { data: role } = await supabase.from('roles').select('role_id').eq('role_name', 'Rehabilitation Officer').single();
  if (!role) throw new Error('Rehabilitation Officer role not found');

  const { data: districts } = await supabase.from('jurisdictions').select('jurisdiction_id, name, parent_id').eq('level', 'district').order('name');
  const sortedDistricts = [...districts].sort((a, b) => a.name.localeCompare(b.name));

  const { data: states } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  const stateCodeById = new Map();
  states.forEach(s => {
    let name = s.name.replace(/\s*\((UT|NCT)\)/gi, '').trim();
    stateCodeById.set(s.jurisdiction_id, name.substring(0, 2).toLowerCase());
  });

  console.log(`Provisioning Rehabilitation Providers and Officers for ${sortedDistricts.length} districts...`);

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
    
    // 1. Create a primary rehab center for the district
    const providerName = `${d.name} District Rehabilitation Center, ${stateCode.toUpperCase()}`;
    const providerId = await ensureProvider(providerName, 'NGO', d.jurisdiction_id);
    
    // 2. Create the RO for this center/district
    await ensureOfficial(
      `${d.name} Center RO`,
      `${slug}.ro.${stateCode}${DOMAIN}`,
      `RO-${idSuffix}`,
      d.jurisdiction_id,
      role.role_id,
      providerId
    );
  });

  console.log('\nDone.');
  console.log(`Password for all: ${PASSWORD}`);
  console.log('\nSample IDs:');
  console.log(`  RO-001  / ${slugify(sortedDistricts[0].name)}.ro@mansakha.gov.in`);
}

main().catch((err) => { console.error('Seed failed:', err.message); process.exit(1); });

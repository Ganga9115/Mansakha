require('dotenv').config();
const { supabase } = require('./supabaseClient');

async function seedJurisdictions() {
  console.log('Fetching states and districts data...');
  const res = await fetch('https://raw.githubusercontent.com/sab99r/Indian-States-And-Districts/master/states-and-districts.json');
  const data = await res.json();
  
  // Get national jurisdiction
  const { data: national } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('level', 'national').limit(1).maybeSingle();
  if (!national) {
    console.error('Run seed:super-admin first to create India jurisdiction.');
    process.exit(1);
  }
  
  console.log('Seeding states...');
  for (const stateObj of data.states) {
    const stateName = stateObj.state;
    // ensure state
    let stateId;
    const { data: existingState } = await supabase.from('jurisdictions').select('jurisdiction_id').eq('name', stateName).eq('level', 'state').maybeSingle();
    
    if (existingState) {
      stateId = existingState.jurisdiction_id;
    } else {
      const { data: createdState } = await supabase.from('jurisdictions').insert({ name: stateName, level: 'state', parent_id: national.jurisdiction_id }).select('jurisdiction_id').single();
      stateId = createdState.jurisdiction_id;
    }
    
    // Seed districts in bulk
    const districtsToInsert = [];
    for (const districtName of stateObj.districts) {
       districtsToInsert.push({ name: districtName, level: 'district', parent_id: stateId });
    }
    
    // UPSERT districts to avoid duplicates, or just ignore conflicts.
    // Supabase JS insert doesn't have ignore conflicts out of box without unique constraint on name+parent_id.
    // Instead we will fetch existing districts for this state.
    const { data: existingDistricts } = await supabase.from('jurisdictions').select('name').eq('level', 'district').eq('parent_id', stateId);
    const existingDistrictNames = new Set(existingDistricts.map(d => d.name));
    
    const newDistricts = districtsToInsert.filter(d => !existingDistrictNames.has(d.name));
    if (newDistricts.length > 0) {
      await supabase.from('jurisdictions').insert(newDistricts);
      console.log(`Inserted ${newDistricts.length} districts for ${stateName}`);
    }
  }
  
  console.log('Done seeding jurisdictions.');
  process.exit(0);
}

seedJurisdictions().catch(console.error);

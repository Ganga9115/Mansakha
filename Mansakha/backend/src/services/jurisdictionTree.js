const { supabase } = require('../db/supabaseClient');

// The jurisdictions table is small (bounded by India's district/state/national
// count), so loading it into memory for tree walks is simpler and safer than
// trying to express recursive descent through supabase-js's query builder.
async function loadJurisdictionTree() {
  const { data } = await supabase.from('jurisdictions').select('jurisdiction_id, name, level, parent_id');
  const byParent = new Map();
  for (const j of data || []) {
    const key = j.parent_id || 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(j);
  }
  return { all: data || [], byParent };
}

async function getDescendantJurisdictionIds(rootId) {
  const { byParent } = await loadJurisdictionTree();
  const result = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = byParent.get(current) || [];
    for (const child of children) {
      result.push(child.jurisdiction_id);
      queue.push(child.jurisdiction_id);
    }
  }
  return result;
}

async function getChildJurisdictions(rootId) {
  const { byParent } = await loadJurisdictionTree();
  return byParent.get(rootId) || [];
}

module.exports = { getDescendantJurisdictionIds, getChildJurisdictions };

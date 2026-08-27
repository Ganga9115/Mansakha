const { supabase } = require('../db/supabaseClient');

// The jurisdictions table is small (bounded by India's district/state/national
// count - ~760 rows) but static (districts/states are never added or renamed
// at runtime), so it's cached in-process rather than re-fetched from Supabase
// on every call. Before this cache, a single National-tier dashboard request
// called this once per state (~35 times) PLUS once per state for its own
// trend computation - each one re-downloading the full table over the
// network - confirmed live as the dominant cause of a 30+ second dashboard
// load. TTL (not "forever") only so a real jurisdiction edit eventually
// takes effect without a server restart.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { expiresAt, promise }

async function loadJurisdictionTree() {
  if (cache && cache.expiresAt > Date.now()) return cache.promise;

  const promise = (async () => {
    const { data } = await supabase.from('jurisdictions').select('jurisdiction_id, name, level, parent_id');
    const byParent = new Map();
    for (const j of data || []) {
      const key = j.parent_id || 'root';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(j);
    }
    return { all: data || [], byParent };
  })();

  cache = { expiresAt: Date.now() + CACHE_TTL_MS, promise };
  // Don't cache a failed fetch - let the next call retry immediately instead
  // of being stuck returning a rejected promise for the rest of the TTL.
  promise.catch(() => { cache = null; });
  return promise;
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

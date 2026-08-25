const { supabase } = require('../db/supabaseClient');
const { fail } = require('../services/responseEnvelope');

// Reusable jurisdiction-scope check - Build Prompt Section 0b. Checks a requested
// resource's jurisdiction path against the caller's assigned scope, instead of
// re-implementing this in every route handler. Ministry role bypasses this entirely
// (unrestricted access across every jurisdiction, per Section 3).
//
// resolveTargetJurisdictionId(req) -> jurisdictionId | Promise<jurisdictionId>
// lets each route say how to find the jurisdiction of the thing being accessed
// (e.g. from a :jurisdictionId param, or by looking up a victim's jurisdiction_id).
function requireJurisdiction(resolveTargetJurisdictionId) {
  return async (req, res, next) => {
    if (!req.auth || req.auth.type !== 'official') {
      return fail(res, 'Staff account required', 403);
    }

    if (req.auth.roles.some((r) => r.roleName === 'Ministry')) {
      return next(); // unrestricted, per Section 3
    }

    const targetJurisdictionId = await resolveTargetJurisdictionId(req);
    if (!targetJurisdictionId) {
      return fail(res, 'Could not resolve target jurisdiction', 400);
    }

    // Walk up the target's jurisdiction chain (District -> State -> National) and
    // check whether it matches any jurisdiction the caller is assigned to.
    let currentId = targetJurisdictionId;
    const assignedIds = new Set(req.auth.roles.map((r) => r.jurisdictionId).filter(Boolean));

    while (currentId) {
      if (assignedIds.has(currentId)) return next();

      const { data: node, error } = await supabase
        .from('jurisdictions')
        .select('parent_id')
        .eq('jurisdiction_id', currentId)
        .single();

      if (error || !node) break;
      currentId = node.parent_id;
    }

    return fail(res, 'Outside your assigned jurisdiction', 403);
  };
}

module.exports = { requireJurisdiction };

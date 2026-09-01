const { supabase } = require('../db/supabaseClient');

// Build Prompt Section 0b: "write to it on every read/write of sensitive user
// data, not just on writes." Deliberately fire-and-forget (doesn't block or fail
// the caller's response if logging itself has an issue) but always awaited by the
// caller so a failure is visible in server logs during development.
async function writeAuditLog({ officialId = null, userId = null, action, entityType, entityId = null }) {
  const { error } = await supabase.from('audit_log').insert({
    official_id: officialId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
  });
  if (error) {
    console.error('audit_log write failed:', error.message, { action, entityType, entityId });
  }
}

module.exports = { writeAuditLog };

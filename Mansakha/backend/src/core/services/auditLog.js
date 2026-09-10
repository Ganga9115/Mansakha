const { supabase } = require('../db/supabaseClient');

// Build Prompt Section 0b: "write to it on every read/write of sensitive user
// data, not just on writes." Deliberately fire-and-forget (doesn't block or fail
// the caller's response if logging itself has an issue) but always awaited by the
// caller so a failure is visible in server logs during development.
//
// `details` (migration_040) is an optional free-form jsonb payload - the only
// place a state transition's previous/new value actually gets recorded (e.g.
// Legal Aid's {fromStatus, toStatus, reason}). Defaults to null so every
// existing call site across the app is unaffected.
async function writeAuditLog({ officialId = null, userId = null, action, entityType, entityId = null, details = null }) {
  const { error } = await supabase.from('audit_log').insert({
    official_id: officialId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
  if (error) {
    console.error('audit_log write failed:', error.message, { action, entityType, entityId });
  }
}

module.exports = { writeAuditLog };

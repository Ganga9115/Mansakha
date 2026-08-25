const { fail } = require('../services/responseEnvelope');

// Route-level role gating. Must run after verifyToken (reads req.auth.roles).
// Usage: requireRole(['Ministry']) or requireRole(['Administration', 'Counsellor']).
function requireRole(allowedRoleNames) {
  return (req, res, next) => {
    if (!req.auth || req.auth.type !== 'official') {
      return fail(res, 'Staff account required', 403);
    }

    const hasAllowedRole = req.auth.roles.some((r) => allowedRoleNames.includes(r.roleName));
    if (!hasAllowedRole) {
      return fail(res, 'Insufficient role for this action', 403);
    }

    next();
  };
}

module.exports = { requireRole };

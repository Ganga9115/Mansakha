const rateLimit = require('express-rate-limit');
const { fail } = require('../services/responseEnvelope');

// Numbers from Build Prompt Section 9 - not final, but every auth-adjacent endpoint
// needs SOME limit.
const handler = (req, res) => fail(res, 'Too many requests, please try again later', 429);

const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.ip,
  handler,
});

const victimOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.body.mobile || req.body.email || req.ip,
  handler,
});

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (req) => (req.auth ? req.auth.officialId || req.auth.victimId : req.ip),
  handler,
});

module.exports = { staffLoginLimiter, victimOtpLimiter, generalApiLimiter };

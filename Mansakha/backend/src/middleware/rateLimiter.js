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

// Feature Catalog Section 1.1: docket+name+state+district is now a
// guessable-secret login surface (no OTP step in front of it any more), so
// it gets the same 10/15min/IP shape as staff login.
const victimLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.ip,
  handler,
});

// GPS lookup is unauthenticated and makes a third-party (Nominatim) request
// on the caller's behalf - a generous but real cap, not a guessable-secret
// concern like the two limiters above.
const gpsLookupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.ip,
  handler,
});

// Feature Catalog Section 1.3: chat is turn-by-turn, so one back-and-forth
// (or a retry-loop bug) can burn a meaningful chunk of the Gemini free
// tier's shared 20/day quota in minutes - a purpose-specific guard
// alongside generalApiLimiter, not a replacement for it.
const victimChatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  keyGenerator: (req) => (req.auth ? req.auth.victimId : req.ip),
  handler,
});

const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (req) => (req.auth ? req.auth.officialId || req.auth.victimId : req.ip),
  handler,
});

module.exports = { staffLoginLimiter, victimLoginLimiter, gpsLookupLimiter, victimChatLimiter, generalApiLimiter };

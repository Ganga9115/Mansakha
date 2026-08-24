const express = require('express');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { supabase } = require('../db/supabaseClient');
const { verifyFirebasePhoneToken } = require('../services/firebaseAdmin');
const { signToken, signPendingRegistrationToken, verifyJwt } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { victimOtpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

// Dev-only fixed OTP for seeded dummy accounts (see db/seedDummyAccounts.js) -
// lets the real email-OTP UI flow be tested with a memorable code instead of
// needing access to a real inbox, without touching Supabase's actual email
// delivery/quota for these specific addresses. Strictly gated to development;
// production and any email not in this list always goes through real Supabase
// OTP verification below, unchanged.
const DEV_DUMMY_OTP = '123456';
const DEV_DUMMY_VICTIM_EMAILS = ['victim@gmail.com'];
const isDevDummyEmail = (email) => process.env.NODE_ENV === 'development' && DEV_DUMMY_VICTIM_EMAILS.includes(email);

// Victim Login surface - Build Prompt Section 3: OTP via mobile, OTP via email, or
// Gmail/Google OAuth. Victims self-register; there is no Ministry provisioning step.
//
// A verified contact that doesn't yet match an existing `victims` row is NOT
// silently turned into a fake/placeholder victim record here - case_type,
// jurisdiction, and docket number are real required fields the actual registration
// screen (Victim Module, next build pass) needs to collect. This endpoint's job is
// only to prove who the person is; `registered: false` tells the frontend to route
// to registration instead of a dashboard.

async function findVictimByContact({ email, phone }) {
  let query = supabase.from('victim_identity').select('victim_id, contact_number, email');
  if (email) query = query.eq('email', email);
  if (phone) query = query.eq('contact_number', phone);
  const { data } = await query.maybeSingle();
  return data ? data.victim_id : null;
}

async function issueVictimSession(res, victimId, verifiedContact) {
  if (!victimId) {
    // Short-lived token proving exactly this contact was just verified - the
    // only thing /register accepts as proof of identity, so a client can't
    // register a victim record for a contact it never actually verified.
    const pendingToken = signPendingRegistrationToken(verifiedContact);
    return ok(res, { registered: false, verifiedContact, pendingToken }, 'Contact verified; registration required');
  }
  const token = signToken({ type: 'victim', victimId });
  return ok(res, { registered: true, token });
}

// Email OTP: uses Supabase Auth's built-in email OTP (Build Prompt Section 1) -
// no separate email-sending service needed.
router.post('/otp/request', victimOtpLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return fail(res, 'email is required for email OTP', 400);

  if (isDevDummyEmail(email)) {
    // No real Supabase send for the dummy account - nothing to deliver, the
    // fixed code below is what /otp/verify will accept.
    return ok(res, { requestId: email }, `Dev mode: use code ${DEV_DUMMY_OTP}`);
  }

  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) return fail(res, 'Could not send OTP', 500);

  return ok(res, { requestId: email }, 'OTP sent to email');
});

router.post('/otp/verify', async (req, res) => {
  const { requestId, code } = req.body;
  if (!requestId || !code) return fail(res, 'requestId and code are required', 400);

  if (isDevDummyEmail(requestId)) {
    if (code !== DEV_DUMMY_OTP) return fail(res, 'Invalid or expired code', 401);
  } else {
    const { error } = await supabase.auth.verifyOtp({ email: requestId, token: code, type: 'email' });
    if (error) return fail(res, 'Invalid or expired code', 401);
  }

  const victimId = await findVictimByContact({ email: requestId });
  return issueVictimSession(res, victimId, { email: requestId, via: 'email_otp' });
});

// Mobile OTP: sending the SMS happens client-side via the Firebase Phone Auth SDK
// (frontend/src/services/firebaseClient.js) - Firebase, not this backend, delivers
// the SMS. This endpoint only verifies the resulting Firebase ID token server-side.
router.post('/phone-otp/verify', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return fail(res, 'idToken is required', 400);

  let phoneNumber;
  try {
    phoneNumber = await verifyFirebasePhoneToken(idToken);
  } catch (err) {
    return fail(res, 'Invalid or expired phone verification', 401);
  }

  const victimId = await findVictimByContact({ phone: phoneNumber });
  return issueVictimSession(res, victimId, { phone: phoneNumber, via: 'mobile_otp' });
});

router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return fail(res, 'idToken is required', 400);

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
    payload = ticket.getPayload();
  } catch (err) {
    return fail(res, 'Invalid Google token', 401);
  }

  if (!payload || !payload.email) return fail(res, 'Google account has no email', 400);

  const victimId = await findVictimByContact({ email: payload.email });
  return issueVictimSession(res, victimId, { email: payload.email, name: payload.name, via: 'google' });
});

const VALID_CASE_STAGES = ['Investigation', 'Trial', 'Rehabilitation', 'Compensation'];

// Completes registration for a contact that was JUST verified via one of the
// routes above (OTP or Google) - the pendingToken is the only source of truth
// for which email/phone this record gets, never the request body, so a
// client can't register a victim record for a contact it never proved it owns.
router.post('/register', async (req, res) => {
  const { pendingToken, fullName, caseTypeId, jurisdictionId, caseStage, docketNumber, preferredLanguageId, address, password } = req.body;
  if (!pendingToken) return fail(res, 'pendingToken is required', 400);

  let payload;
  try {
    payload = verifyJwt(pendingToken);
  } catch (err) {
    return fail(res, 'Verification expired - please verify your contact again', 401);
  }
  if (payload.type !== 'victim_pending') return fail(res, 'Invalid registration token', 401);

  if (!fullName || !caseTypeId || !jurisdictionId || !caseStage) {
    return fail(res, 'fullName, caseTypeId, jurisdictionId, and caseStage are required', 400);
  }
  if (!VALID_CASE_STAGES.includes(caseStage)) return fail(res, `caseStage must be one of: ${VALID_CASE_STAGES.join(', ')}`, 400);

  // Contact may already be registered (e.g. token reused after a previous
  // registration in another tab) - re-check rather than trust the token alone.
  const existingVictimId = await findVictimByContact({ email: payload.email, phone: payload.phone });
  if (existingVictimId) return fail(res, 'This contact is already registered - please sign in instead', 409);

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;
  const authMethod = payload.via || (payload.email ? 'email_otp' : 'mobile_otp');

  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .insert({
      case_type_id: caseTypeId,
      jurisdiction_id: jurisdictionId,
      case_stage: caseStage,
      docket_number: docketNumber || null,
      preferred_language: preferredLanguageId || null,
      auth_method: authMethod,
      password_hash: passwordHash,
    })
    .select('victim_id')
    .single();
  if (victimError) return fail(res, `Could not complete registration: ${victimError.message}`, 500);

  const { error: identityError } = await supabase.from('victim_identity').insert({
    victim_id: victim.victim_id,
    full_name: fullName,
    contact_number: payload.phone || null,
    email: payload.email || null,
    address: address || null,
  });
  if (identityError) return fail(res, `Could not complete registration: ${identityError.message}`, 500);

  const token = signToken({ type: 'victim', victimId: victim.victim_id });
  return ok(res, { token }, 'Registration complete', 201);
});

// Password login - the OTP/Google routes above remain the account-recovery
// path if a victim forgets this password, so there's no separate reset flow.
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return fail(res, 'identifier and password are required', 400);

  const isEmail = identifier.includes('@');
  const victimId = await findVictimByContact(isEmail ? { email: identifier } : { phone: identifier });

  // Same generic message whether the contact doesn't exist or the password is
  // wrong or no password was ever set - don't leak which case it was.
  const genericFailure = () => fail(res, 'Invalid email/phone or password', 401);
  if (!victimId) return genericFailure();

  const { data: victim } = await supabase.from('victims').select('password_hash').eq('victim_id', victimId).single();
  if (!victim || !victim.password_hash) return genericFailure();

  const matches = await bcrypt.compare(password, victim.password_hash);
  if (!matches) return genericFailure();

  const token = signToken({ type: 'victim', victimId });
  return ok(res, { token });
});

module.exports = router;

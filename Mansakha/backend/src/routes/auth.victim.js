const express = require('express');
const { supabase } = require('../db/supabaseClient');
const { signToken } = require('../utils/jwt');
const { ok, fail } = require('../services/responseEnvelope');
const { victimLoginLimiter, gpsLookupLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Victim Login surface - Feature Catalog Section 1.1. Replaces the old OTP
// (mobile/email) + Google Sign-In + self-registration model entirely: a
// victim record is now created BY staff (District Admin - routes/admin.js,
// or Data Intake Admin - routes/dataIntake.js), and a victim logs in with
// the three identifying fields staff entered for them - docket number, full
// name, and mobile number. No password, no OTP: knowing all three fields
// (which only the victim and the provisioning official should know together)
// IS the credential, matching how many Indian govt beneficiary-lookup
// portals already work. Removed alongside this: otpService.js,
// twilioVerify.js, mailer.js, the Google OAuth client, and the "forgot
// password"/"change password" flow (there's no password left to change) -
// none of the deleted files are referenced anywhere else (confirmed via a
// repo-wide search before deletion).

// Escapes LIKE/ILIKE special characters so an exact case-insensitive match
// can't be turned into a wildcard pattern by a crafted docketNumber (e.g. a
// literal "%" or "_" in the input).
function escapeLikePattern(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

router.post('/login', victimLoginLimiter, async (req, res) => {
  const { docketNumber, fullName, contactNumber } = req.body;
  if (!docketNumber || !fullName || !contactNumber) {
    return fail(res, 'docketNumber, fullName, and contactNumber are required', 400);
  }

  // Same generic message for every failure reason - don't reveal which field was
  // wrong to something probing for a valid docket number.
  const genericFailure = () => fail(res, 'No matching record found - check your details and try again', 401);

  console.log('Login attempt:', { docketNumber, fullName, contactNumber });
  const { data: victim, error: victimError } = await supabase
    .from('victims')
    .select('victim_id')
    .ilike('docket_number', escapeLikePattern(docketNumber.trim()))
    .maybeSingle();
  
  if (victimError) console.error('Victim query error:', victimError);
  if (!victim) {
    console.log('Victim not found for docket:', docketNumber);
    return genericFailure();
  }

  const { data: identity, error: identityError } = await supabase.from('victim_identity').select('full_name, contact_number').eq('victim_id', victim.victim_id).maybeSingle();
  if (identityError) console.error('Identity query error:', identityError);
  
  if (!identity || 
      identity.full_name.trim().toLowerCase() !== fullName.trim().toLowerCase() ||
      (identity.contact_number || '').trim() !== contactNumber.trim()) {
    console.log('Identity mismatch:', identity, { providedName: fullName, providedPhone: contactNumber });
    return genericFailure();
  }

  console.log('Login successful for:', victim.victim_id);

  const token = signToken({ type: 'victim', victimId: victim.victim_id });
  return ok(res, { token });
});

// Loosely normalizes a jurisdiction name for comparison against OpenStreetMap's
// naming, which won't always exactly match our seeded names (e.g. "NCT of
// Delhi" vs "Delhi", "Bengaluru Urban" vs "Bengaluru").
function namesLooselyMatch(a, b) {
  const normalize = (s) => (s || '').toLowerCase()
    .replace(/\b(district|state|nct of|union territory of)\b/g, '')
    .replace(/th/g, 't')
    .replace(/[^a-z]/g, '');
  return normalize(a) === normalize(b) && normalize(a).length > 0;
}

// Feature Catalog Section 1.1 - "Auto-detect State & District (GPS)". Public
// (called pre-login, from the Login screen's optional convenience button),
// rate-limited since it's an unauthenticated route making a third-party call
// on the caller's behalf. Always responds 200 with nulls on any failure to
// find/match a location - this is optional convenience, never a blocker, so
// it should never surface as an error the victim has to dismiss.
router.post('/gps-lookup', gpsLookupLimiter, async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return fail(res, 'lat and lng (numbers) are required', 400);
  }

  let osm;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1`;
    const osmRes = await fetch(url, {
      // Nominatim's usage policy requires a real identifying User-Agent.
      headers: { 'User-Agent': 'Mansakha-SIH26094/1.0 (victim GPS state/district lookup)' },
    });
    if (!osmRes.ok) throw new Error(`Nominatim error (${osmRes.status})`);
    osm = await osmRes.json();
  } catch (err) {
    console.warn('GPS lookup: reverse-geocode failed, returning empty match:', err.message);
    return ok(res, { stateName: null, jurisdictionId: null });
  }

  const address = osm?.address || {};
  const osmState = address.state;
  const osmDistrict = address.state_district || address.county || address.district;
  if (!osmState) return ok(res, { stateName: null, jurisdictionId: null });

  const { data: states } = await supabase.from('jurisdictions').select('jurisdiction_id, name').eq('level', 'state');
  const matchedState = (states || []).find((s) => namesLooselyMatch(s.name, osmState));
  if (!matchedState) {
    console.warn(`GPS lookup: no seeded state matched OSM state "${osmState}"`);
    return ok(res, { stateName: null, jurisdictionId: null });
  }

  let matchedJurisdictionId = null;
  if (osmDistrict) {
    const { data: districts } = await supabase
      .from('jurisdictions')
      .select('jurisdiction_id, name')
      .eq('level', 'district')
      .eq('parent_id', matchedState.jurisdiction_id);
    const matchedDistrict = (districts || []).find((d) => namesLooselyMatch(d.name, osmDistrict));
    matchedJurisdictionId = matchedDistrict ? matchedDistrict.jurisdiction_id : null;
  }

  return ok(res, { stateName: matchedState.name, jurisdictionId: matchedJurisdictionId });
});

module.exports = router;

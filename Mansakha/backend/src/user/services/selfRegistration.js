const crypto = require('crypto');
const { createUser, ProvisioningError } = require('./userProvisioning');
const { pool } = require('../../core/db/pgPool');
const { requestOllama } = require('../../ai/ollama');
const { sendSms } = require('../../core/services/smsService');

// Replaces Data Operator's manual register-user form entirely - the victim
// registers themselves (mirrors the real NHAA/SAMBAL portal's own
// self-service "Register Grievance" flow), keyed on Aadhaar the same way
// that portal uses it for identity. No staff role reviews or confirms
// before the record exists; the account is usable the moment this
// function returns, matching the reference site's own submit-and-done flow.

// NHAA-2026-0158049 style, matching the real portal's own reference-number
// format (confirmed live) rather than the internal DOC-XXXXXX scheme staff
// intake used - this docket is the credential a victim sees and reads back
// over the phone, so it should look like the real thing.
function generateDocketNumber() {
  const year = new Date().getFullYear();
  const suffix = String(crypto.randomInt(0, 10000000)).padStart(7, '0');
  return `NHAA-${year}-${suffix}`;
}

// Not the predictable 'User123' staff-intake default - this path has no
// human verifying identity before a password goes out, so a per-registration
// random temp password is the safer default. Still forced to change on
// first login via must_change_password, same as every other account.
function generateTempPassword() {
  return crypto.randomBytes(6).toString('base64url'); // 8 chars, url-safe
}

// jurisdictionId is deliberately the VICTIM's own district (used for relief/
// compensation routing to that district's DWO), separate from stationId
// (the police station nearest the offense, used for FIR/investigation
// assignment to that station's IO) - the same distinction the real
// NHAA/SAMBAL portal draws with its own "Is Place of Offence same as
// Victim Address?" question, since the two can genuinely differ (e.g. a
// victim who has since relocated). stationId is optional - a case can
// exist before an IO is assigned, same as staff-provisioned intake.
async function autoRegisterVictim({ fullName, contactNumber, aadhaarNumber, jurisdictionId, caseTypeId, address = null, description = null, stationId = null }) {
  if (!fullName || !contactNumber || !aadhaarNumber || !jurisdictionId || !caseTypeId) {
    throw new ProvisioningError('fullName, contactNumber, aadhaarNumber, jurisdictionId, and caseTypeId are required', 400);
  }

  const tempPassword = generateTempPassword();

  // createUser already 409s on a docket collision - vanishingly unlikely
  // with a 7-digit random suffix, but retried a few times rather than
  // trusting randomness never repeats.
  let result;
  let lastErr;
  for (let attempt = 0; attempt < 5 && !result; attempt += 1) {
    try {
      result = await createUser({
        docketNumber: generateDocketNumber(),
        fullName,
        contactNumber,
        jurisdictionId,
        caseTypeId,
        address,
        stationId,
        caseBackground: description || null,
        password: tempPassword,
        aadhaarNumber,
        provisionedVia: 'self_registered',
      });
    } catch (err) {
      lastErr = err;
      if (!(err instanceof ProvisioningError && err.status === 409)) throw err;
    }
  }
  if (!result) throw lastErr;

  // Best-effort - the account already exists and works via in-app login
  // even if SMS delivery fails (e.g. TWILIO_PHONE_NUMBER not provisioned).
  // Never blocks registration success on a delivery channel being down.
  let smsSent = false;
  try {
    await sendSms(
      contactNumber,
      `Mansakha: Your case has been registered. Docket ID: ${result.docketNumber}. Temporary password: ${tempPassword}. Open the app and log in to set your own password.`
    );
    smsSent = true;
  } catch (err) {
    console.error('autoRegisterVictim: SMS delivery failed', err.message, { docketNumber: result.docketNumber });
  }

  return { docketNumber: result.docketNumber, smsSent };
}

// Lightweight automation touch mirroring NHAA/SAMBAL's own "Suggested: ...
// (based on your description)" chips - suggests, never decides. The victim
// still picks the actual case type from a required dropdown; this just
// pre-highlights the likely one so they don't have to know the legal
// category themselves. Best-effort: returns null on any failure (Ollama
// unreachable, malformed response) rather than blocking the form.
async function suggestCaseType(description) {
  if (!description || !description.trim()) return null;

  const { rows: caseTypes } = await pool.query('select case_type_id, name from case_types where deleted_at is null order by name');
  if (!caseTypes.length) return null;

  const prompt = `A person is describing an incident to report under India's SC/ST (Prevention of Atrocities) Act. Given their description, pick the SINGLE closest matching category from this exact list (return the name EXACTLY as written, nothing else):
${caseTypes.map((c) => `- ${c.name}`).join('\n')}

Description: "${description.trim()}"

Return ONLY a JSON object: {"caseTypeName": "<exact name from the list above>"}`;

  try {
    const raw = await requestOllama(prompt, true, 12000);
    const parsed = JSON.parse(raw);
    const match = caseTypes.find((c) => c.name === parsed.caseTypeName);
    return match ? { caseTypeId: match.case_type_id, caseTypeName: match.name } : null;
  } catch (err) {
    console.error('suggestCaseType: classification failed', err.message);
    return null;
  }
}

module.exports = { autoRegisterVictim, suggestCaseType };

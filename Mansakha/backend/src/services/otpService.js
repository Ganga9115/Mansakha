const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { supabase } = require('../db/supabaseClient');

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// Issues a fresh code for `email`, overwriting any previous one (see
// email_otp_codes in schema.sql). Returns the plaintext code so the caller can
// email it - only the bcrypt hash is ever persisted.
async function issueEmailOtp(email) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const { error } = await supabase
    .from('email_otp_codes')
    .upsert({ email, code_hash: codeHash, expires_at: expiresAt, attempts: 0 });
  if (error) throw new Error(`Could not store OTP: ${error.message}`);
  return code;
}

async function verifyEmailOtp(email, code) {
  const { data } = await supabase
    .from('email_otp_codes')
    .select('code_hash, expires_at, attempts')
    .eq('email', email)
    .maybeSingle();
  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) return false;
  if (data.attempts >= MAX_ATTEMPTS) return false;

  const matches = await bcrypt.compare(code, data.code_hash);
  if (!matches) {
    await supabase.from('email_otp_codes').update({ attempts: data.attempts + 1 }).eq('email', email);
    return false;
  }

  await supabase.from('email_otp_codes').delete().eq('email', email);
  return true;
}

module.exports = { issueEmailOtp, verifyEmailOtp };

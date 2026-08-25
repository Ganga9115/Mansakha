const twilio = require('twilio');

// Twilio Verify handles OTP generation, delivery, expiry, and attempt-limiting
// entirely on its side - no local storage needed for phone codes (unlike the
// email OTP path, which owns that itself via email_otp_codes; see otpService.js).
let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID must be set in .env');
  }
  client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendPhoneOtp(phone) {
  await getClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verifications.create({ to: phone, channel: 'sms' });
}

async function checkPhoneOtp(phone, code) {
  const result = await getClient().verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({ to: phone, code });
  return result.status === 'approved';
}

module.exports = { sendPhoneOtp, checkPhoneOtp };

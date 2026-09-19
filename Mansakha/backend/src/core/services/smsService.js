// Shared Twilio Messages API sender - extracted from dispatchWorker.js's
// own two near-identical send blocks (sendSmsCheckinPrompt,
// sendAdminBroadcastSms) once a third caller (self-registration's
// credential delivery) needed the exact same call. "Never fabricate
// success" rule preserved: throws if TWILIO_PHONE_NUMBER isn't configured
// rather than silently pretending the message went out.
async function sendSms(toNumber, body) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('SMS provider not configured (TWILIO_PHONE_NUMBER missing)');
  }
  // eslint-disable-next-line global-require
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    to: toNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    body,
  });
}

module.exports = { sendSms };

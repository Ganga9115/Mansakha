const nodemailer = require('nodemailer');

// SMTP-based email OTP delivery - replaces Supabase Auth's built-in email OTP.
// Lazy-initialized so importing this module never throws before SMTP_* is set.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_HOST, SMTP_USER, SMTP_PASS must be set in .env');
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function sendOtpEmail(email, code) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Your Mansakha verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

module.exports = { sendOtpEmail };

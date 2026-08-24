const admin = require('firebase-admin');

// Firebase is used ONLY to verify mobile OTP (Phone Authentication) tokens - see
// Build Prompt Section 1. Supabase remains the system of record; once Firebase
// confirms a phone number, this backend issues its own JWT (utils/jwt.js).
let app = null;

function getFirebaseApp() {
  if (app) return app;

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY must be set in .env');
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env stores the private key with literal \n escapes; restore real newlines.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  return app;
}

// idToken is the Firebase ID token the frontend gets back after a successful
// Phone Auth verification (see frontend/src/services/firebaseClient.js).
async function verifyFirebasePhoneToken(idToken) {
  const decoded = await admin.auth(getFirebaseApp()).verifyIdToken(idToken);
  if (!decoded.phone_number) {
    throw new Error('Firebase token does not contain a verified phone number');
  }
  return decoded.phone_number;
}

module.exports = { getFirebaseApp, verifyFirebasePhoneToken };

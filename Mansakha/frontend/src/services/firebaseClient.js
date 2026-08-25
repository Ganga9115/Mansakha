import { initializeApp } from 'firebase/app';
import { getAuth, PhoneAuthProvider, signInWithCredential } from 'firebase/auth';

// Firebase Phone Authentication (free Spark plan quota) - Build Prompt Section 1.
// Used ONLY for mobile OTP verification; the resulting ID token is sent to
// POST /api/auth/victim/phone-otp/verify, which issues our own app JWT.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Lazy-initialized, not run at module load - the same class of bug that crashed
// the whole app on an unconfigured Google client ID (see victim/LoginScreen.js)
// applies here too: initializeApp() with an empty config can throw, and this file
// gets imported by whatever screen wires up Mobile OTP next. Deferring the actual
// init until first use means importing this module is always safe regardless of
// whether Firebase env vars are set yet.
let _firebaseAuth = null;

function getFirebaseAuth() {
  if (_firebaseAuth) return _firebaseAuth;
  if (!firebaseConfig.apiKey) {
    throw new Error('Firebase is not configured - set EXPO_PUBLIC_FIREBASE_* in frontend/.env before using Mobile OTP.');
  }
  const app = initializeApp(firebaseConfig);
  _firebaseAuth = getAuth(app);
  return _firebaseAuth;
}

// verificationId comes from a platform-specific phone sign-in flow (Expo's Firebase
// recaptcha verifier on web, or a native module on Android) - that flow is left to
// wire up when Mobile OTP is actually built; this helper is the shared "confirm the
// code" step both platforms end at.
export async function confirmPhoneCode(verificationId, code) {
  const credential = PhoneAuthProvider.credential(verificationId, code);
  const result = await signInWithCredential(getFirebaseAuth(), credential);
  return result.user.getIdToken();
}

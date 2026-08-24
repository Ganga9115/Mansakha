# Last Priority

Deferred items, tracked deliberately rather than left as silent gaps (same
principle as the build prompt's own Section 0 — a named tradeoff, not a hidden
one). Nothing here blocks the app running end-to-end on what's already wired;
each item is a specific, scoped piece of follow-up.

Last updated 2026-08-24, after a large pass that closed most of the items
this file used to track (design-system overhaul, victim self-registration,
Counsellor case notes, Ministry staff/language edit, Administration CSV
export + Alerts screen, priority sort, escalating-trend wiring,
mark-intervention-complete, persisted Gemini explanations, AI-suggested
intervention type, real Supabase Storage transcripts, dashboard pagination,
audit-log coverage, a real dispatch queue/worker, a minimal adaptive
check-in follow-up, and partial multilingual UI). What's below is what's
still genuinely open.

## Testing accounts (dev-only, do not ship to production)

`npm run seed:dummy` (backend) creates one account per role for testing every
login surface: `district.admin@mansakha.gov.in` / `state.admin@mansakha.gov.in` /
`national.admin@mansakha.gov.in` (Administration, each at a different jurisdiction
tier), `counsellor@mansakha.gov.in` (Counsellor) — all password `Mansakha@2026` —
and `victim@gmail.com` for Victim login via the Email OTP tab (password
`TestPass123!` also works via the new password-login option).

The victim account uses a **dev-only fixed OTP bypass** in
`routes/auth.victim.js` (`DEV_DUMMY_OTP = '123456'`) instead of a real Supabase
email send. It's gated to `NODE_ENV === 'development'` and only matches the
one seeded dummy email — confirm this gate is still in place (or remove the
bypass entirely) before any real deployment.

`npm run seed:demo` creates a larger realistic dataset (Section 10) driven
through the real check-in/Gemini scoring pipeline — see "Data" below for its
actual current status.

## Credentials (external service setup)

- **Google OAuth Client ID** — needed for Victim Gmail sign-in. Deliberately
  *not* reused from FarmConnect. Setup: console.cloud.google.com → APIs &
  Services → Credentials → Create OAuth Client ID → fill
  `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` (frontend `.env`) and
  `GOOGLE_OAUTH_CLIENT_ID` (backend `.env`).
- **Firebase project** — needed for Mobile OTP (Phone Authentication).
  Setup: a new Firebase project (Spark/free plan) → enable Phone
  Authentication → Project Settings gives the web API key
  (`FIREBASE_WEB_API_KEY`) and, via Service Accounts → Generate new private
  key, the backend Admin SDK credentials (`FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
- **Exotel** (IVRS) — trial account needed; not a free tier at any provider
  — see the note already in `backend/.env.example`.
- **Expo/EAS project association** — `services/dispatchWorker.js`'s push
  send (Expo push API) is real and wired, and the backend registration
  endpoint (`PATCH /api/me/push-token`) is ready, but the frontend never
  calls it: `expo-notifications` (the package that gets a real device token)
  doesn't support web at all, and web has been the only reliably-testable
  platform this session. Wiring it needs a native build/device to test
  against, plus associating the app with an Expo/EAS project ID for
  reliable delivery once built. Until then, every `dispatch_queue` row will
  fail with "No push token registered" — that's expected, not a bug.

## Frontend gaps (disclosed, not silently faked)

- **Mobile OTP** — screen UI exists (Victim Login's Mobile OTP tab), but
  sending the actual code needs a phone-number verifier
  (`expo-firebase-recaptcha` on web, native config on Android) wired up once
  Firebase (above) is configured.
- **Voice input for check-ins** — TTS *output* (reading prompts aloud) is
  real and built (`expo-speech`). Voice *input* (recording + transcription)
  is not; text input is the fully-working path today.
- **Multilingual UI coverage is partial.** `LanguageSelectScreen.js` (the
  Victim App's real first screen now, per Section 8) and the Check-in
  prompts/labels are translated across the six seeded languages via a new
  hand-rolled `i18n/strings.js` + `LanguageContext`. Everything else Victim-
  facing (Home, Distress History, Support, Settings, Consent, the
  Login/Signup screen itself) is still English-only text with a language
  *preference* stored but not applied to their own copy. Staff/Ministry stay
  English by design (Section 8 only calls out Language Select for Victim).
  The translations that do exist are AI-produced, not reviewed by a native
  speaker — fine for a demo, flagged as needing human review before any real
  deployment to this population. **Planned direction (not yet built):**
  replace/extend this hand-rolled 6-language dictionary with the Hugging
  Face translation API FarmConnect already uses, to cover all 22 scheduled
  languages instead of the 6 seeded today - this is a real, larger swap
  (a translation API call per string/screen instead of a static dictionary
  lookup), not a drop-in.
- **The adaptive check-in follow-up is English-keyword-only.**
  `CheckinScreen.js`'s distress-keyword heuristic (deciding whether to show
  a 4th targeted prompt) checks against a fixed English word list — a
  response given in Hindi/Bengali/etc. won't trigger it, even though the
  prompts themselves are now translatable.
- **Administration's CSV export is web-only.** `expo-sharing`/
  `expo-file-system` aren't installed, so the native (Android) app shows
  "Export is available on the web app for now" instead of downloading a
  file, rather than silently failing.

## Data

- **`npm run seed:demo` (Section 10 realistic dataset)** — genuinely
  partial, stopped cleanly rather than faked. Real check-ins through the
  actual Gemini-scoring pipeline ran into the Gemini free-tier's daily quota
  (20 requests/day for `gemini-2.5-flash`, confirmed live via a 429
  `GenerateRequestsPerDayPerProjectPerModel-FreeTier` response) partway
  through. Current DB state: **8 of 16 intended demo victims fully seeded**
  (DEMO-0001 through DEMO-0008, real multi-check-in history, 2-3 check-ins
  each, backdated) with a **Low=4 / High=4 / Moderate=0 / Critical=0**
  distribution; DEMO-0009–0012 exist with one recorded interaction each but
  no score (the Gemini call for that check-in genuinely failed - the same
  "recorded, analysis failed" state the real `/checkin` route itself
  produces on a Gemini error, left as-is rather than backfilled);
  DEMO-0013–0016 (the intended Critical-tier victims and the dedicated
  escalating-trend victim) were **never created** - the script aborted
  before reaching them, so `isEscalatingTrend()` has nothing to confirm yet.
  The **alert requirement is genuinely met**: 10 real Open alerts exist,
  auto-created by the real pipeline across DEMO-0005–0008. The script
  (`backend/src/db/seedDemoData.js`) is idempotent and resumable - re-run
  `npm run seed:demo` once the daily quota resets (or sooner, with a
  dedicated `GEMINI_API_KEY` instead of a shared one) and it picks up
  exactly where it left off, no code changes needed. This quota is also a
  real operational constraint worth planning around generally: any serious
  demo/testing session involving more than ~20 real check-ins in a day will
  hit it, not just seeding.
- **IVRS/SMS channel dispatch** — the `channels` table has rows for these
  and the schema supports them, but actual outbound dispatch logic
  (placing a call, sending an SMS) isn't implemented — depends on the
  Exotel setup above.

## Found during the Phase 5 re-audit (2026-08-24, against the build prompt itself)

Verified genuinely working: both required unit-test suites pass
(`npm test` — 13/13, covering the distress-score formula and
`verifyToken`/`requireRole`/`requireJurisdiction`), and all three rate
limits match Section 9 exactly (staff login 10/15min, victim OTP 5/hour,
general API 100/min — `middleware/rateLimiter.js`). New gaps found, not
previously tracked:

- **The "AI chatbot" is really a fixed conversational-style form, not a
  dynamic chat interface.** `CheckinScreen.js` submits with a hardcoded
  `channel: 'Mobile App'`, never `'Chatbot'` (a distinct row that exists in
  the `channels` table) - there's no turn-by-turn chat UI where the AI
  drives the next question; the new adaptive follow-up (Phase 4f) is a
  fixed client-side keyword check, not a live model deciding what to ask
  next. Section 4.1's "AI chatbot (text + voice)" reads as a more dynamic
  conversational agent than what's built - a real, previously-undisclosed
  simplification, not a broken feature (the check-in flow itself fully
  works end to end).
- **No lazy-loading of screens/routes.** Section 9 explicitly wants this
  ("lazy-load screens/routes rather than bundling everything into one
  initial load"); every screen is imported eagerly at the top of
  `StaffShell.js`/`VictimShell.js`/`RootNavigator.js`, so the whole app
  ships in one bundle regardless of role or which screen loads first.
- **Responsive layout was never actually tested at multiple breakpoints.**
  Section 9 requires this explicitly, not just "should work" - the
  sidebar/drawer breakpoint (768px, `StaffShell.js`) and the web "phone
  frame" treatment (`VictimShell.js`) were designed with specific widths in
  mind, but no session this session had a browser tool to confirm 320px
  through 4K actually render correctly, especially post-redesign across
  Phases 0-2's new components.
## Left as-is, not a code task

- **OTP edge-case numbers** (3 verify attempts / 60s resend cooldown /
  10-minute expiry, per Section 9) are Supabase Auth project *settings*,
  not application code, and there's no SQL/admin-API path to them from this
  project's existing credentials — needs a 2-minute manual check in the
  Supabase dashboard (Authentication → Providers → Email).
- **Navigation types differ from Section 1's literal text** ("a stack
  navigator per role") — Victim uses bottom tabs, Staff uses a drawer, per
  an explicit, deliberate design decision. Editing the canonical
  `SIH26094_Build_Prompt.md` itself is out of scope unless separately
  requested.
- **Transcript "(encrypted)" now means Supabase Storage's own at-rest
  encryption**, not additional client-side/application-level encryption on
  top — `interactions.transcript_ref` is a real Storage path now (not
  plaintext in Postgres), which is the meaningful part of that gap; going
  further would be new scope, not a fix to what was broken.

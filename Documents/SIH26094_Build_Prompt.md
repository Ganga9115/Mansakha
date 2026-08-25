# Build Prompt — Mansakha (SIH26094): AI-Powered Dynamic Mental Health Monitoring and Distress Prediction System for Victims of Atrocities

**Product name:** Mansakha — *"Mind matters. We're listening."*

You are building a full-stack application for SIH26094, a system commissioned by the
Ministry of Social Justice and Empowerment (MoSJE) that continuously monitors the
psychological well-being of victims registered under the SC/ST (Prevention of
Atrocities) Act, 1989 — reached via NHAA (14566), the Integrated Portal, chatbot,
mobile app, IVRS, or SMS — and predicts distress escalation before it becomes a
crisis. The
core loop: the system checks in with a victim regularly (not once), analyzes their
response with AI, computes a Dynamic Distress Score with a trend, and — when risk
crosses a threshold — alerts a counsellor/official in real time so an intervention
(counselling, medical support, legal aid, etc.) can happen before, not after, a crisis.

Build the whole application: client apps, backend, database, and the AI scoring
pipeline described below.

---

## 0. Scope for This Build (Internal Hackathon)

- **This is not a dummy app.** No hardcoded fake responses standing in for a real
  flow, no button that looks wired up but isn't, no screen backed by static JSON
  instead of the actual database. **Frontend and backend are both built fully, end
  to end, for every module below** — every screen, every API route, every DB table in
  this spec should actually work against real data, not simulate working.
- **AI is the one deliberate exception — a phased plan, not a shortcut:** for this
  build, AI capabilities are delivered via external APIs (Gemini for text
  sentiment/emotion) — no custom-trained model. This is phase 1 of a two-phase plan:
  phase 2 (post-hackathon) adds our own trained models, starting with the
  voice-stress component. Don't build the custom voice-stress microservice
  (SpeechBrain/wav2vec2) yet. Instead, put a **clean, well-defined API boundary** in
  front of AI analysis (e.g. a single `POST /api/ai/analyze-interaction` route) and
  implement it now with straightforward Gemini calls. Design that boundary so the
  custom model can be dropped in behind the same interface later without touching
  any calling code.
- **Every design decision should trace back to an actual victim problem, not just a
  PS checkbox.** Before adding a screen or flow, the question is "does this reduce
  friction, fear, or delay for someone using this while going through an atrocity
  case" — not just "does the PS mention this." Multilingual voice input isn't a
  feature to check off; it's what makes the app usable by someone who can't
  comfortably type in English. Keep that framing throughout the Victim Module
  specifically.
- **Named tradeoff, not a silent gap:** the official PS lists exactly 8 "Innovation
  Components" — Emotion AI, Voice Stress Analytics, Sentiment Analysis, Predictive
  Risk Modelling, Multilingual Conversational AI, Explainable AI, Automated Case
  Prioritisation, Real-Time Risk Alerts. This build covers 7 of the 8 for the
  hackathon phase; **Voice Stress Analytics specifically is deferred**, not
  implemented behind a fake result. Be ready to say this plainly if asked, rather than
  implying it works.
- **Everything else must be genuinely scalable, not a prototype shortcut:** proper
  layered structure (routes → controllers/services → data access), parameterized
  queries, environment-based config (no hardcoded secrets/keys), consistent error
  handling and response shapes, pagination on list endpoints, and RBAC enforced at the
  API layer (not just hidden in the UI).
---

## 0b. Architecture Guidance (apply throughout, not just at the end)

- **Auth middleware:** a `verifyToken` middleware that checks the JWT, then
  **re-reads the official's role/status from the database on every request** rather
  than trusting only what's embedded in the token — this way, suspending or
  reassigning a Counsellor/Administration account takes effect immediately, not after
  their token expires. Pair it with a `requireRole([...])` middleware for route-level
  gating.
- **Revocable, scoped role assignments:** don't hardcode one role per official row.
  Model it as a join table (`official_id`, `role_id`, `jurisdiction_id`,
  `assigned_by`, `assigned_at`, `revoked_at`) so an official's access can be time-bound
  and revoked without deleting their account, and so jurisdiction scope (which
  district/state they can see) is data, not application logic scattered across routes.
- **Jurisdiction-scoping middleware:** write a single `requireJurisdiction(level)`
  middleware that checks a requested resource's jurisdiction path against the caller's
  assigned scope, instead of re-implementing that check inside every route handler.
- **Audit log as a first-class table, not an afterthought:** already in the schema
  below (`audit_log`) — write to it on every read/write of sensitive victim data, not
  just on writes. Given what this system stores, the audit trail is as important as
  the feature itself.
- **Alert/notification delivery as a queue, not a direct call:** write alerts to a
  table and have a worker/poller dispatch them (SMS/push/in-app), with retry on
  failure — more reliable than firing a notification inline inside the request that
  triggered it, and it's what makes the "real-time alert system" actually durable.
- **Frontend role-based routing via one config, not five route trees:** a single
  mapping of `role → { navItems, allowedPages }` consumed by one route resolver, so
  adding a new page to a role's dashboard means editing one config object, not
  duplicating a router file per role.

---

## 1. Tech Stack (fixed — do not substitute)

- **Client:** React Native — a single codebase producing both the Android app
  and the web app (via Expo / React Native Web). This is deliberate: it's what makes
  "identical features on mobile and web" true by construction rather than by
  discipline. iOS is out of scope for this build — don't add iOS-only dependencies
  or configuration.
- **State management:** React Context for auth/session/global app state; TanStack
  Query (React Query) for server state (data fetching, caching, refetch-on-focus) —
  don't hand-roll a Redux store for this.
- **Navigation:** React Navigation — a stack navigator per role (Victim, Staff) with
  nested tab navigators for each dashboard's sections.
- **Backend:** Node.js + Express.
- **Platform:** Supabase — Postgres (schema below), Supabase Auth, Supabase Storage
  (encrypted transcripts/audio), Supabase Realtime (for live alert/dashboard updates).
  **Use Supabase's free tier** — sufficient for this build's scale.
- **Cost constraint (applies to every service below and anything added later): free
  tier only, no paid plan, no billing account added anywhere in this stack.** Where a
  service has no genuine free tier, that's flagged explicitly rather than silently
  assumed to be free.
- **Mobile OTP:** Firebase Phone Authentication (Spark/free plan) — a free verification
  quota, standard for exactly this use case, avoids per-SMS billing entirely at this
  build's scale. Firebase is used *only* for phone-number verification here; Supabase
  remains the system of record for the user/session once verified (the backend issues
  its own JWT after Firebase confirms the code).
- **Email OTP:** Supabase Auth's built-in email OTP — no separate service needed, no
  extra cost, already covered by the Supabase free tier above.
- **Google OAuth:** free (no per-login cost from Google).
- **IVRS provider:** Exotel — **flagged, not a free service.** Real phone calls cost
  money to terminate on the telecom network; no provider (Exotel, Twilio, or anyone
  else) has a genuine ongoing free tier for actual voice calls, only trial credit.
  For this build, run IVRS on Exotel's free trial credit — genuinely $0 for
  hackathon-scale demo call volume — but this is a trial allowance, not a permanent
  free tier; scaling past it requires a paid recharge. Don't add a payment method
  during this build; if trial credit runs out, that's a signal to stop testing IVRS,
  not to upgrade the account.
- **AI services** — *space intentionally left here; do not fill in specifics beyond
  what Section 0 already scopes.* Phase 1 (this build): external APIs only —
  Gemini for text sentiment/emotion, behind the `POST /api/ai/analyze-interaction`
  boundary. **Use the Gemini API free tier** (Google AI Studio) — it's rate-limited,
  not billed; stay within the free quota and don't attach a billing account. Phase 2
  (later, not this build): our own trained models, starting with voice-stress,
  replacing/supplementing the API calls behind that same boundary. The actual system
  prompt/conversation design for the chatbot, and the phase-2 model work itself, are
  explicitly not specified here — treat that as an open integration point for a later
  phase, not a gap to guess-fill now.

**Deployment (hackathon phase):** backend on Render or Railway; web app on Vercel;
Android app built via Expo EAS (internal/dev build, not a Play Store submission for
this phase). Supabase hosts the DB/Auth/Storage/Realtime regardless of where the
backend runs. Note for later: a production rollout of this system would need to move to
empanelled government cloud infrastructure (NIC/MeitY) given the sensitivity of the
data — not a hackathon-phase concern, but don't architect anything that assumes a
specific non-Indian cloud region permanently.

**Environment variables (backend `.env`):**
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
GEMINI_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FIREBASE_WEB_API_KEY=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
PORT=
NODE_ENV=
CORS_ORIGINS=
FRONTEND_URL=
```
No secret in this list is ever hardcoded or committed — load all of it via `dotenv`
locally and via the hosting platform's secret manager in deployment.

## 2. Theme

**Blue and white**, applied consistently across both the victim-facing app and the
staff-facing (Ministry/Administration/Counsellor) screens. Use blue as the primary
brand/action color and white as the dominant background — this should read as calm,
trustworthy, and government-appropriate, not playful or consumer-app bright.

## 3. Roles & Auth Model

Four roles, **three separate login surfaces**:

| Login surface | Role(s) | How the account is created | How they log in |
|---|---|---|---|
| **Ministry Super-login** | Ministry (Super Admin) | Seeded/manually provisioned — the top-level account(s) | Email + password |
| **Staff Login** | Administration (District / State / National tiers), Counsellor | Provisioned **by the Ministry** — assigned an email + a generated password | Email + password. On first login, prompt an optional "change your password" step. Role (Administration vs Counsellor, and jurisdiction level for Administration) determines the post-login dashboard. |
| **Victim Login** | Victim / User | Self-registers, linked to their case ID (reused from NHAA/Integrated Portal where available) | Three options: OTP via mobile number, OTP via email, or Gmail/Google OAuth |

Do not merge these into one login screen — build three distinct entry points. The
Ministry can create Administration and Counsellor accounts (this is an admin action
inside the Ministry's own console, not a public sign-up flow).

**Ministry (Super Admin) is not just "National Administration with a different
name" — it has genuinely distinct capabilities, not the same screens with a wider
data filter:**
- Unrestricted access across **every** jurisdiction — no `requireJurisdiction` scope
  limit applies to this role
- **Staff Management** — create, edit, and revoke Administration and Counsellor
  accounts at any jurisdiction level (nobody else can create accounts)
- **System configuration access** — manages the lookup tables every other role only
  reads: `case_types`, `intervention_types`, `channels`, supported languages —
  Administration and Counsellor never edit these, only the Ministry does
- **Cross-module visibility** no single Administration tier gets — e.g. correlating
  intervention effectiveness against case type nationally, or auditing officials'
  activity via `audit_log` directly
- Everything National Administration can see, plus all of the above — Ministry is
  a superset, not a sibling, of the Administration hierarchy

## 4. The 5 Modules

### 4.1 Victim Module
- Login / registration — sign in via OTP (mobile or email) or Gmail; profile is linked
  to a registered case
- Victim dashboard: case status, current distress level, upcoming check-in, alerts/
  important notifications, available support resources
- Mental health check-in questionnaire — conversational prompts such as *"How are you
  feeling?"*, *"Do you feel safe?"*, *"Are you experiencing stress/fear?"*
- AI chatbot (text + voice)
- IVRS interaction (automated phone check-in)
- SMS channel — for victims who don't use the app regularly
- Multilingual interaction — Hindi, English, Bengali, Marathi, Telugu, Tamil at
  launch; build the language list as data (a `languages` table/config), not a
  hardcoded set, so more can be added without a code change
- Distress score visibility (the victim can see their own trend)
- Support / help section
- Follow-up / counselling access

### 4.2 Mental Health Monitoring Module
The delivery layer for regular well-being checks across all channels:
- Scheduling and dispatch of check-ins via chatbot, app push, SMS, and IVRS
- Questionnaire logic (adaptive follow-up based on response)
- Multilingual support shared across all channels

### 4.3 AI Risk Engine (backend)
- AI response analysis (text sentiment/emotion via LLM; voice stress via the
  acoustic model)
- Dynamic Distress Score Engine — combines signals into one score per check-in
- Distress history / trend tracking across check-ins
- Distress prediction — is the trend escalating, not just what's the current value
- Risk-level classification (e.g. Low / Moderate / High / Critical)
- Automated case prioritisation — ranks active cases for counsellor attention

### 4.4 Official / Counsellor Module

**Counsellor is the only role that acts on individual cases** — Administration
(4.5) oversees and monitors, Counsellor is the one role that actually logs
interventions and works assigned cases day to day. Don't blur this distinction —
Administration accounts should not have an "intervention" action available; that
button only exists for Counsellors.

- Login via Staff Login
- Risk monitoring dashboard — case counts by risk tier for the cases this counsellor
  handles (e.g. Total Cases / Low / High, etc.)
- Victim case details view — case info, current distress score, previous score,
  trend, risk level, intervention status
- Real-time alert system (Supabase Realtime — new high-risk alerts appear live)
- Explainable risk report — shows *why* a case was flagged (which signals/words/voice
  cues drove the score), not just a number
- Intervention recommendation — surfaces that a specific victim needs counselling/
  support and what kind
- AI follow-up tracking — whether a recommended intervention was actually carried out

**Alert routing — three recipient types, per the PS ("trigger alerts to counsellors,
district authorities, and designated officials"), not just the assigned Counsellor:**
when a High/Critical alert fires, `alert_notifications` writes a row for the assigned
Counsellor **and** for every District Administration official in that case's
jurisdiction — District Administration's real-time alert feed (4.5) is a live feed of
actual alerts, not just a count on a dashboard tile. "Designated officials" covers
whichever of Counsellor/Administration is relevant per case; there's no third role to
invent here.

### 4.5 Administration & Security Module

**District, State, and National are not the same dashboard with a wider data
filter — each tier has a genuinely different job:**

- **District Administration** — the operational-oversight tier: sees full case-level
  detail for every case in the district (not just aggregates), monitors individual
  Counsellor workload and response times, is the escalation point when a Counsellor
  needs support on a case. Closest to the ground truth. Also receives High/Critical
  alerts on a **live, real-time feed** (Supabase Realtime, same mechanism as the
  Counsellor's), not just an aggregate count — this is a direct PS requirement
  ("trigger alerts to counsellors, district authorities...").
- **State Administration** — the comparison tier: sees district-level rollups side
  by side (which districts have rising trends, which are understaffed), drills into
  a specific district's case-level detail only when a rollup signals a problem —
  not as the default view.
- **National Administration** — the policy tier: state-level comparisons, national
  trend lines for evidence-based policy input, drills down through state → district
  → case only as an exception, not routinely.
- Each dashboard shows: total cases, vulnerable victims, high-risk cases, critical
  cases, alerts, distress trends — but **District's default view is case-level,
  State's and National's default view is aggregate-with-drill-down**. Don't build
  three identical dashboards that only differ by a `WHERE jurisdiction_id = ?`
  filter — the depth of what's shown by default should differ by tier.
- Role-based access control enforcing the **National → State → District → Victims**
  jurisdiction hierarchy (an Administration account only sees data within its own
  jurisdiction and below)

## 5. End-to-End Workflow

Build the system so a case actually flows like this:

1. **Case registered & victim profile linked** — a Victim ID is created and linked to
   the NHAA/Integrated Portal case ID
2. **Regular well-being check** — dispatched via chatbot, mobile app, SMS, or IVRS call
3. **Victim response** — captured as text, voice, or structured questionnaire answers
4. **AI analysis** — NLP, sentiment, emotion, voice stress, and behaviour/engagement
   patterns are all analyzed
5. **Distress score + trend analysis & prediction** — is distress increasing over
   recent check-ins, not just what is it right now. Starting formula (tune weights
   once real signals are flowing; voice_stress_score defaults to 0 while that
   component is deferred, per Section 0):
   ```
   distress_score = clamp(
     0.4 * sentiment_score       // -1..+1, inverted so higher = more distress
   + 0.3 * voice_stress_score    // 0..1 (0 for now — component deferred)
   + 0.2 * emotion_score         // 0..1, weighted toward fear/sadness
   + 0.1 * engagement_delta      // drop in response length/frequency vs. baseline
   , 0, 100)

   risk_level:
     score < 30            -> Low
     30 <= score < 55      -> Moderate
     55 <= score < 80      -> High
     score >= 80           -> Critical

   trend flag: "escalating" if the last 3 scores are monotonically increasing
   by >= 10 points total
   ```
6. **Risk level classified**, then branches:
   - **Low / Moderate** → continue regular monitoring (loop back to step 2)
   - **High / Critical** → real-time alert triggered → counsellor/authorized official
     notified → they view the victim's case (score, trend, risk factors, AI
     explanation) → an intervention is logged (counselling, medical support, etc.) →
     monitoring continues (loop back to step 2)

The AI never acts autonomously on a person's safety — it scores, predicts, and alerts;
a human official always makes the intervention decision.

## 6. Database Schema (Postgres, 3NF, ACID)

**Victims & identity** (kept in separate tables so the scoring/alert pipeline never
touches raw PII):
- `case_types` — case_type_id, name (Rape / Gang Rape, Murder / Grievous Hurt / Arson,
  Witness Facing Intimidation or Threats, Family Affected by Caste-Based Violence) —
  the exact Priority Use Cases named in the PS
- `victims` — victim_id, docket_number, case_type_id, jurisdiction_id, case_stage
  (Investigation / Trial / Rehabilitation / Compensation — the PS scopes monitoring
  as running "throughout the investigation, trial, rehabilitation, and compensation
  process," so this is tracked, not inferred), preferred_language, auth_method
  (mobile_otp / email_otp / google), enrolled_at, status
- `victim_identity` — victim_id, full_name, contact_number, address, id_ref_encrypted

**Channels & interactions:**
- `channels` — channel_id, channel_name (Chatbot, IVRS, SMS, Mobile App, Web Portal,
  NHAA Helpline (14566), Integrated Portal, Helpline Follow-Up) — all channels named
  in the PS get their own row, even where two map to similar underlying tech (e.g.
  NHAA Helpline and IVRS are both voice-based, but tracked separately since they're
  named as distinct intake points)
- `interactions` — interaction_id, victim_id, channel_id, occurred_at,
  duration_seconds, transcript_ref

**AI signals & scoring:**
- `signal_types` — signal_type_id, name (sentiment_score, voice_stress_score,
  emotion_score, engagement_score)
- `interaction_signals` — signal_id, interaction_id, signal_type_id, value,
  confidence, model_version
- `risk_levels` — risk_level_id, name (Low/Moderate/High/Critical), sort_order
- `distress_scores` — score_id, victim_id, interaction_id, score_value,
  risk_level_id, model_version, computed_at *(a predicted/forecasted score is just
  another row here with a distinct model_version — no separate table needed)*

**Alerts & interventions:**
- `alert_statuses` — alert_status_id, name (Open, Acknowledged, Resolved)
- `alerts` — alert_id, victim_id, distress_score_id, alert_status_id, triggered_at,
  resolved_at
- `alert_notifications` — alert_id, official_id, notified_at
- `intervention_types` — intervention_type_id, name (Counselling, Medical, Witness
  Protection, Relocation, Financial Assistance, Legal Aid, Rehabilitation)
- `interventions` — intervention_id, victim_id, alert_id, intervention_type_id,
  assigned_official_id, recommended_at, completed_at

**Roles, jurisdictions & access:**
- `jurisdictions` — jurisdiction_id, name, level (district/state/national), parent_id
- `roles` — role_id, role_name (Ministry, Administration, Counsellor)
- `officials` — official_id, full_name, email, phone, password_hash,
  must_change_password, provisioned_by
- `official_roles` — official_id, role_id, jurisdiction_id, assigned_by,
  assigned_at, revoked_at *(join table — an official's role and jurisdiction scope
  live here, not as flat columns on `officials`, so access can be time-bound and
  revoked without touching the account itself; see Section 0b)*

**Privacy & compliance:**
- `consent_records` — consent_id, victim_id, channel_id, granted_at, revoked_at
- `audit_log` — log_id, official_id, victim_id, action, entity_type, entity_id,
  occurred_at

## 7. API Contract (representative — extend as needed, keep the shape consistent)

```
Victim Module:
  POST /api/auth/victim/otp/request          { mobile? , email? }
  POST /api/auth/victim/otp/verify           { requestId, code } -> { token }
  POST /api/auth/victim/google               { idToken } -> { token }
  GET  /api/victim/dashboard                 -> { caseStatus, currentDistressLevel, nextCheckIn, alerts, supportLinks }
  POST /api/victim/checkin                   { channel, responses[] } -> { interactionId }
  GET  /api/victim/distress-history          -> { scores[] }

Staff Login (Administration + Counsellor):
  POST /api/auth/staff/login                 { email, password } -> { token, mustChangePassword }
  POST /api/auth/staff/change-password       { newPassword }

Counsellor:
  GET  /api/counsellor/cases                 ?riskLevel=&page= -> { cases[], total }
  GET  /api/counsellor/cases/:victimId       -> { score, trend, riskFactors, aiExplanation, interventionStatus }
  POST /api/counsellor/cases/:victimId/intervention   { interventionTypeId, notes }
  GET  /api/counsellor/alerts                (Realtime-subscribed)

Administration:
  GET  /api/admin/dashboard/:jurisdictionId  -> { totalCases, vulnerable, highRisk, critical, trends }
  GET  /api/admin/alerts/:jurisdictionId     (Realtime-subscribed — District tier only, per PS alert routing)

AI (internal, called by the backend only — never directly by a client):
  POST /api/ai/analyze-interaction           { interactionId, text?, audioRef? } -> { sentiment, emotion, signals[] }
```

Keep every response in one consistent envelope shape (e.g. `{ success, data, message }`
on success and error alike) so error handling on the client doesn't need per-endpoint
special cases.

## 8. Screen Inventory

```
Victim App: Language Select -> OTP/Gmail Login -> Consent -> Home Dashboard ->
  Check-in Chat -> Check-in Confirmation -> My Distress History -> Support/Help -> Settings

Staff Login: Email+Password Login -> Change Password (first login only)

Counsellor: Dashboard (case counts by risk) -> Case Queue (sorted by priority) ->
  Case Detail (score/trend/explainability) -> Log Intervention -> Alerts Feed

Administration:
  District tier: District Dashboard (case-level default view) -> Case Detail (read-only) ->
    Counsellor Workload View
  State tier: State Dashboard (district-rollup default view) -> District Drill-down ->
    Case Detail (exception path, not default)
  National tier: National Dashboard (state-rollup default view) -> State Drill-down ->
    District Drill-down -> Case Detail (exception path, not default)

Ministry: National Dashboard (unrestricted, no jurisdiction filter) ->
  Staff Management (create/revoke Administration & Counsellor accounts, any tier) ->
  System Configuration (case types, intervention types, channels, languages) ->
  Audit Log Viewer
```

## 9. Non-Functional Requirements

- **Performance & responsiveness:** the web app must be genuinely fast and
  responsive — this is a real usage requirement, not just a nice-to-do. Responsive
  layout across mobile/tablet/desktop widths (React Native Web's flexbox layout
  makes this achievable, but it has to actually be tested at multiple breakpoints,
  not just assumed to work); paginate every list endpoint (already required above)
  so a dashboard with thousands of cases doesn't load them all at once; lazy-load
  screens/routes rather than bundling everything into one initial load. A victim in
  a moment of distress, or a counsellor working through an alert queue, should never
  be waiting on a slow screen.
- **Testing:** at minimum, unit tests for the distress-score formula (Section 5) and
  the auth middleware (`verifyToken`/`requireRole`/`requireJurisdiction`) — these are
  the two places a silent bug is most costly. Full coverage isn't expected for this
  phase; these two are not optional.
- **Rate limits:** Staff login — 10 attempts / 15 min per IP. Victim OTP request — 5 /
  hour per mobile/email. General authenticated API — 100 requests / min per user.
  Tune later; the point is that every auth-adjacent endpoint has *some* limit, not
  that these exact numbers are final.
- **OTP handling edge cases:** max 3 verification attempts per requested OTP, then it
  expires and a new one must be requested; a resend has a 60-second cooldown; a
  requested-but-unverified OTP expires after 10 minutes.
- **Accessibility / low-literacy design:** the victim-facing app is used by a
  population that may be rural, elderly, or low-literacy. Every check-in screen needs
  a voice/audio option alongside text (not text-only with voice as an afterthought),
  large touch targets, icon-driven navigation where possible, and TTS playback of any
  on-screen prompt. This applies to the Victim Module specifically, not the staff
  side.
- **Repo structure (representative):**
  ```
  backend/
    src/
      routes/          one file per resource (victim.js, counsellor.js, admin.js, ai.js...)
      middleware/       verifyToken.js, requireRole.js, requireJurisdiction.js
      services/         scoring.js, notifications.js, ai.js (calls the AI API boundary)
      db/               supabase client, query helpers
      utils/
    server.js
  frontend/
    src/
      screens/          grouped by role: victim/, staff/, admin/
      navigation/        stack + tab navigators per role
      context/          AuthContext, etc.
      services/          api client, query hooks
      components/        shared UI
  ```

## 10. Seed / Demo Data

For the hackathon demo, an empty database doesn't show anything. Build a seed script
that populates:
- A handful of officials across all three roles (Ministry, Administration at
  district/state/national, Counsellor), with known login credentials for the demo
- 15-20 sample victims spread across all four `case_types` and across every
  `risk_level` (don't seed them all as Low — the demo needs visible High/Critical
  cases for the alert flow to be worth showing)
- A realistic interaction history per victim (multiple check-ins over simulated
  time) so the distress-score **trend** actually shows a line, not a single point —
  at least one victim's history should show a clearly escalating trend to
  demonstrate the prediction/alert flow end to end
- At least one already-triggered alert with a logged intervention, so the
  Counsellor Module doesn't look empty on first load

## 11. Suggested Build Order

Not mandatory, but a sensible sequence:

1. Auth & role scaffolding — all three login surfaces, the schema above, RBAC by
   jurisdiction
2. Victim Module — full check-in flow end to end, initially on a simple rule-based
   score so the pipeline is provably working
3. AI Risk Engine — swap in real sentiment/voice-stress scoring
4. Official/Counsellor Module
5. Administration & Security dashboards

---

Build against this spec directly — the modules, workflow, schema, auth model, tech
stack, and theme above are the confirmed requirements, not options to reconsider.

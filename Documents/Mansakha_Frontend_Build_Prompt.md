Role: Frontend Engineer with 30+ years of experience across React Native/Expo and React (web), specializing in responsive, accessible UI for government and public-sector applications.

Task: Implement every feature listed below, one at a time, across two existing frontends. This is not a redesign — extend the existing codebases so every feature in the Mansakha Feature Catalog has a real screen or control behind it. Do not skip, merge, or summarize features; each row is its own deliverable.
- `Mansakha/frontend/` — Expo/React Native, **Victim only** (mobile + `react-native-web`).
- `Mansakha/web-frontend/` — Create React App, **Counsellor / District / State / National Admin / Ministry / Data Intake Admin**.

Reuse the shared shell pattern already built this session — `StaffLayout.jsx`/`MinistryLayout.jsx`/`SidebarNav.js`, role-prefixed routes (`/counsellor/*`, `/districtadmin/*`, `/stateadmin/*`), the `useQuery`/mutation hook pattern in `services/hooks.js`, the Victim app's `useResponsive()`/`theme/layout.js` tier system. This document mirrors the backend prompt section-for-section — every row below names the exact screen/component to build and the exact endpoint (from the backend prompt) it calls. Read the backend prompt first; nothing here should be built against a route that doesn't exist yet.

---

## 1. VICTIM (`Mansakha/frontend/`)

### 1.1 Login — replaces `screens/victim/LoginScreen.js` entirely

| Feature | Spec |
|---|---|
| Docket ID + Full Name + State + District | Four fields on the rebuilt `LoginScreen.js`: `IconInput` for Docket ID and Full Name, `Dropdown` for State, a second `Dropdown` for District (disabled/empty until a State is chosen, then populated from `GET /api/lookups/jurisdictions?level=district&parentId=<stateId>`). Submit calls `POST /api/auth/victim/login` with all four fields; on 401 show a single generic inline error `"No matching record found — check your details and try again"` under the form, not per-field errors (the backend deliberately doesn't say which field was wrong). |
| Auto-detect State & District (GPS) | An "Auto-detect my location" `Pressable` above the dropdowns. On press: request permission via `expo-location`'s `requestForegroundPermissionsAsync()`; if denied, do nothing further (dropdowns stay manual, no error toast — this is optional convenience, not a blocker); if granted, call `getCurrentPositionAsync()`, then `POST /api/victim/gps-lookup` with `{lat, lng}`, and pre-fill both dropdowns from the response (`stateName` → set State dropdown, `jurisdictionId` → set District dropdown directly, skipping the manual district fetch). Show a small inline spinner on the button while the lookup is in flight. |
| State dropdown | Backed by `GET /api/lookups/jurisdictions?level=state`, fetched once on screen mount (existing `Dropdown` component, existing lookup-hook pattern — no new component needed). |
| District dropdown | Backed by `GET /api/lookups/jurisdictions?level=district&parentId=<stateId>`, refetched every time the State dropdown's selection changes; clear the District selection whenever State changes. |
| Change password | Only build if the backend prompt's §1.1 decision keeps a password concept for victims. If it does: add a "Change Password" row to `SettingsScreen.js` (see §1.8) that opens a small form (current password / new password / confirm) calling `POST /api/auth/victim/change-password`, styled exactly like `auth.staff.js`'s equivalent screen on the web-frontend side. If the decision drops passwords entirely, skip this row — do not build a change-password screen with nothing behind it. |

Also: delete `VictimSignupScreen.js` and `SignupSuccessScreen.js` (no more self-registration), remove their routes from `RootNavigator.js`'s unauthenticated stack, and delete the OTP-mode UI pieces (`AuthModeSelect`, 6-digit code inputs, Google Sign-In button) that lived on the old `LoginScreen.js`.

### 1.2 Dashboard — all five rows are existing fields on `HomeScreen.js`, already wired to `GET /api/victim/dashboard`; no new screen work, just confirm each is rendered:

| Feature | Spec |
|---|---|
| Case status | Existing — `caseStatus` card on `HomeScreen.js`. |
| Current distress level | Existing — the distress-level badge/indicator on `HomeScreen.js`. |
| Upcoming check-in date | Existing — `nextCheckIn` row. |
| Alerts & important notifications | Existing — `alerts[]` list section. |
| Available supports | Existing — `supportLinks[]` section. |

### 1.3 Check-in & Interaction — new screens under `screens/victim/`

| Feature | Spec |
|---|---|
| Mental health check-in (questionnaire) | **Existing**, `CheckinScreen.js` — unchanged. |
| AI Chat | **New** `ChatScreen.js`. A real message-thread UI: `FlatList` of message bubbles (left-aligned grey for AI, right-aligned brand-color for the victim), a bottom-pinned text input + send button, backed by `POST /api/victim/chat` (send) and loading prior history on mount if the backend returns it. Include a mic icon next to the send button for future voice input — visually present but `disabled` with a one-line code comment (`// voice input not yet wired — visual placeholder only`), not a silently dead button. Add to `VictimShell.js`'s tab/drawer config and `roleNavConfig.js`. |
| IVRS Call | A "Request a call" button (on `HomeScreen.js` or inside `SupportScreen.js`) that calls `POST /api/victim/ivrs/trigger` and shows a confirmation toast/state ("We'll call you shortly") — no in-app call UI, this only queues the dispatch. |
| SMS check-in | No dedicated screen — this is an opt-in toggle in `SettingsScreen.js` ("Receive SMS check-in prompts") that the backend uses to decide whether to queue `sms_checkin_prompt` dispatches; add the toggle, wired to whatever preference field the backend prompt's §1.3 settles on (confirm field name before wiring — likely a new `victims.sms_checkin_enabled` column with a matching `PATCH` route). |
| Multilingual interaction | The existing language `Dropdown` in `SettingsScreen.js` already lets a victim set `preferredLanguage`; extend `ChatScreen.js` and `CheckinScreen.js` to pass that language preference along on every request that hits Gemini (`POST /api/victim/chat`, `POST /api/victim/checkin`) so responses come back in the right language — confirm the backend already threads `preferredLanguage` through to the Gemini prompt; if not, this is a one-line addition on the request body, not a UI change. |

### 1.4 Counsellor Preference

| Feature | Spec |
|---|---|
| Opt-in for Manual Counsellor | A toggle row in `SettingsScreen.js`, labeled "Prefer a human counsellor", calling `PATCH /api/victim/counsellor-preference`. |
| In-app chat with assigned counsellor | **New** `CounsellorChatScreen.js` — same message-bubble UI shape as `ChatScreen.js` (§1.3), but backed by `GET/POST /api/victim/messages`. Reachable only from a "Message your counsellor" row in `SettingsScreen.js` that is **rendered conditionally**: call `GET /api/victim/assigned-counsellor` on `SettingsScreen.js` mount, and only show the row (and the "Call Counsellor" row below) when the response has an assigned counsellor AND `opted_for_manual_counsellor` is true. Show nothing — not a greyed-out row — when either condition is false. |
| Call Counsellor button | A row next to the chat entry point in `SettingsScreen.js`, same conditional-render rule; renders a `tel:<counsellor phone>` `Linking.openURL()` call using the phone number from `GET /api/victim/assigned-counsellor`'s response. |

### 1.5 Stress-Level Automated Response — no dedicated victim-facing screen; this section is entirely backend-triggered. Frontend responsibilities are receipt-only:

| Level | Frontend spec |
|---|---|
| Low | No UI change. |
| Moderate | The `wellness_push` dispatch arrives as a push notification (Expo push token already needed — confirm `expo-notifications` is registered and the token is sent to the backend on login if not already). Tapping it deep-links into the relevant `WellnessScreen.js` sub-section (§1.6). |
| High | The `ai_proactive_contact` push/SMS arrives the same way; tapping a push deep-links into `ChatScreen.js` so the victim lands directly in the AI-initiated conversation. |
| Critical (either branch) | No distinct victim-facing UI beyond what already exists — the victim isn't shown a "you've been flagged critical" state; this is purely a backend/counsellor-side event. |

### 1.6 Wellness & Self-Care — new `WellnessScreen.js` (or three sub-screens under a `screens/victim/wellness/` folder), reachable from `HomeScreen.js`'s existing "My Well-being" quick action and added to nav config:

| Feature | Spec |
|---|---|
| Exercise suggestions | A card list (image/icon + title + short body) fetched from `GET /api/victim/wellness-suggestions?category=exercise`. |
| Guided meditation & breathing | A real interactive timer component: a circle that visually expands/contracts on a breathing cadence (`Animated` API, a repeating scale animation timed to inhale/exhale durations from the content's `duration_seconds`/step data), with the current step's instruction text below it and a start/pause control. Content from `GET /api/victim/wellness-suggestions?category=meditation`. |
| Music suggestions | A simple list (title/artist + an external link `Pressable` that opens the URL via `Linking.openURL()`), from `GET /api/victim/wellness-suggestions?category=music`. No in-app audio player needed. |
| Journal writing | **New** `JournalScreen.js` — a multiline `TextInput` for a new entry (respecting the victim's `preferredLanguage`), a Save button calling `POST /api/victim/journal`, and a reverse-chronological list of past entries below it from `GET /api/victim/journal` (paginated — load-more on scroll-to-end, matching whatever list pattern `DistressHistoryScreen.js` already uses for its history list, if any). |

### 1.7 Distress History — **existing, unchanged.** `DistressHistoryScreen.js` already covers both rows (score visibility + trend chart).

### 1.8 Settings — additions to the existing `SettingsScreen.js`

| Feature | Spec |
|---|---|
| Preferred language | **Existing** — language `Dropdown`, unchanged. |
| Profile | **Existing** — extend the displayed fields to include `fullName`/`docketNumber` now that login is docket-based (pull from `GET /api/victim/dashboard`'s extended response). |
| Manual counsellor opt-in toggle | See §1.4. |
| Consent management | **Existing**, unchanged. |
| Change password | See §1.1. |

---

## 2. COUNSELLOR (`Mansakha/web-frontend/`)

### 2.1 Login — **existing, unchanged**, `pages/staff/Login.jsx` + `pages/staff/ChangePassword.jsx`.

### 2.2 Dashboard — `pages/staff/counsellor/CounsellorDashboard.jsx`

| Feature | Spec |
|---|---|
| Personalised login view | **Existing** — dashboard already scopes to the logged-in counsellor's own cases. |
| List of assigned victims with back-stories | Extend the case-list component (shared with `CaseQueue.jsx`) to show a short backstory excerpt per row once `GET /api/counsellor/cases` returns the new `caseBackground` field — a one-line truncated snippet under the victim's name, full text visible on `CaseDetail.jsx`. |
| Segregated by stress level (AI-ranked) | **Existing** — the priority-sorted list/grouping is already there. |
| Total case count | **Existing** — stat tile. |
| Scheduled counsellings | **New** section on `CounsellorDashboard.jsx` (or a new `ScheduledSessions.jsx` page linked from the sidebar): a simple upcoming-list (date/time, victim name, status), backed by `GET /api/counsellor/scheduled`; a "Schedule" button/modal on `CaseDetail.jsx` calling `POST /api/counsellor/cases/:victimId/schedule`. |
| Alert system — SOS trigger | On `AlertsFeed.jsx`, visually distinguish alerts where `source === 'sos'` (e.g. a red "SOS" badge instead of the normal risk-level badge) so a counsellor can immediately tell an SOS-triggered alert apart from a threshold-triggered one. |

### 2.3 Case Management — `pages/staff/counsellor/CaseDetail.jsx` and siblings

| Feature | Spec |
|---|---|
| Victim case detail view | **Existing.** |
| Personalised victim records | **Existing**, extended with the full `caseBackground` text (§2.2). |
| AI chart values shown to counsellor | **Existing** — the distress-trend chart component. |
| Explainable risk report | **Existing** — renders `distress_scores.explanation`. |
| Intervention recommended | **Existing** — renders `suggested_intervention_type_id`'s label. |
| Case notes — AI / Manual | **Existing** list/composer against `GET/POST /api/counsellor/cases/:victimId/notes`; add a small "AI-drafted" tag on notes where `authored_by === 'ai'` so a counsellor can tell drafted-vs-manual notes apart at a glance, and make sure the composer lets them edit an AI-drafted note before it's treated as final (load it into the same textarea as a manual edit, don't make it read-only). |
| Decision making panel | A row of labeled action buttons on `CaseDetail.jsx` (Need medical counselling / Need escort / Need legal aid / Need relocation, etc. — one per seeded `intervention_types` row) that, on click, opens `LogIntervention.jsx`'s existing form with the `interventionTypeId` field pre-filled rather than defaulting to the dropdown's first option. |
| Log intervention | **Existing**, `LogIntervention.jsx` → `POST /api/counsellor/cases/:victimId/intervention`. |
| Mark intervention complete | **Existing**, a "Mark complete" action on each logged intervention row. |
| In-app chat with victim | **New** — mirror the Victim app's chat bubble UI shape as a `CounsellorChat.jsx` panel/tab on `CaseDetail.jsx`, backed by `GET/POST /api/counsellor/cases/:victimId/messages`. Hide the tab entirely (not disabled) when the case's `opted_for_manual_counsellor` is false. |
| Ping to call victim (Critical alert) | No separate control — an urgent (`priority: 'urgent'`) alert already surfaces via `AlertsFeed.jsx`/`GET /api/counsellor/alerts`; render urgent-priority alerts with a distinct visual treatment (e.g. a red left-border + "Urgent" label) so they read as more actionable than a normal alert row. |
| AI follow-up tracking | **Existing** — render each intervention's completed/pending state (already returned or trivially added, per the backend prompt) as a status chip on the intervention list. |

### 2.4 Alerts — `pages/staff/counsellor/AlertsFeed.jsx`

| Feature | Spec |
|---|---|
| Real-time alert feed | Currently fetch-once. Subscribe to the existing Supabase Realtime publication on `alert_notifications` (the channel is already provisioned server-side per `security_and_realtime.sql`) using `@supabase/supabase-js`'s client-side subscription API, and prepend new rows to the feed as they arrive instead of requiring a manual refresh — this closes the "not actually real-time" gap the backend prompt flags. |
| SOS alert | Same `source === 'sos'` badge treatment as §2.2. |

---

## 3. DISTRICT ADMINISTRATION (`pages/staff/administration/`, `section="districtadmin"`)

### 3.1 Login / 3.2 Access Scope — **existing**, unchanged (role-prefixed routing already built this session).

### 3.3 Dashboard — rewrite `AdminDashboard.jsx` as a real case-level view (this is the single biggest gap per the PS Alignment report — today it's a "Coming soon" stub):

| Feature | Spec |
|---|---|
| Total cases in district | Stat tile at the top of `AdminDashboard.jsx`, from `GET /api/admin/dashboard/:jurisdictionId`. |
| Vulnerable victims | Stat tile, same response. |
| High-risk cases | Stat tile, same response. |
| Critical cases | Stat tile, same response, styled with the same "Critical" red treatment used on Counsellor's dashboard for visual consistency. |
| Alerts feed | A compact alerts list/panel on the dashboard (reuse `AlertsFeed.jsx`'s row component in read-only form), scoped to the district. |
| Distress trends | A trend chart (reuse the chart component from `DistressHistoryScreen`'s desktop layout or Counsellor's Case Detail chart) plotting district-wide average score over time. |

Below the stat tiles: a real case list/table (reuse `CaseQueue.jsx`'s visual pattern — table rows, risk-level badges, sort/filter controls), each row linking to a **read-only** Case Detail view: reuse `CaseDetail.jsx`'s layout but pass a `readOnly` prop that hides the intervention-logging controls, decision-making panel, and chat entry point — Administration never gets those actions, per the PS's explicit Counsellor/Administration split.

### 3.4 Case Access

| Feature | Spec |
|---|---|
| Case detail view (read-only) | Covered above. |
| Counsellor workload view | Rewrite `Workload.jsx` as a real table: counsellor name, case count, average response time, from `GET /api/admin/workload/:jurisdictionId`. |

### 3.5 Victim Credential Management — **new page**, `pages/staff/administration/VictimRegistration.jsx`, linked from the district-admin sidebar section:

| Feature | Spec |
|---|---|
| Create victim credentials | A form (Docket Number, Full Name, State — locked/pre-filled to the admin's own state, District — locked/pre-filled to the admin's own district, Case Type dropdown, Case Stage dropdown) calling `POST /api/admin/victims`. On success, show the created docket number clearly (this is what the victim will need to log in) with a copy-to-clipboard affordance. |
| Edit victim record | A search-by-docket-number field at the top of the same page that loads a victim's record into an editable form (case stage / contact details) calling `PATCH /api/admin/victims/:victimId` on save. |

### 3.6 Reporting

| Feature | Spec |
|---|---|
| Generate & share reports | A "Generate Report" button on `AdminDashboard.jsx` (or its own `Reports.jsx` page) calling `POST /api/admin/reports/generate`, showing a simple success state ("Report generated — visible to Ministry") — no report-viewer UI needed here, per the backend prompt's scoping. |

---

## 4. STATE/UT ADMINISTRATION (`section="stateadmin"`)

### 4.1/4.2 Login / Access Scope — **existing**, unchanged.

### 4.3 Dashboard — new `StateDashboard.jsx` (aggregate-first, distinct component from District's case-level `AdminDashboard.jsx`, not a shared component with a mode flag — the two views are structurally different):

| Feature | Spec |
|---|---|
| State/UT-level monitoring | Top-line stat tiles (total cases, high-risk, critical) aggregated across the whole state, from `GET /api/admin/dashboard/:jurisdictionId`'s state-tier response. |
| District-wise breakdown | A table/grid below the tiles: one row per district in the state (case counts, risk-level distribution). |
| Rising-trend districts | Each district row shows a trend indicator (up/flat/down arrow) from the response's `trendDirection` field (backend prompt §4.3); sort or highlight districts trending up so they're immediately visible, not buried. |
| Drill-down to district → victim | Each district row is a link into that district's own `AdminDashboard.jsx` case-level view (reusing §3.3's component directly) — this is the drill-down path, not the default landing view for a State Admin. |

### 4.4 Reporting — same "Generate Report" button pattern as §3.6, calling the same endpoint with the state admin's own jurisdiction.

---

## 5. NATIONAL ADMINISTRATION

Register the missing `/nationaladmin` route in `App.js` (doesn't exist today) and add a `nationaladmin` section to `StaffLayout.jsx`'s `NAV_ITEMS_BY_SECTION`.

### 5.1 Login — **existing** staff login, just needs the new route to land on.

### 5.2 Dashboard — new `NationalDashboard.jsx`, same aggregate-first pattern one level up from State:

| Feature | Spec |
|---|---|
| National-level monitoring | Top-line stat tiles aggregated nation-wide. |
| State-wise breakdown | A table/grid, one row per state, same shape as State Dashboard's district breakdown. |
| Drill-down: State → District → Victim | Each state row links into that state's `StateDashboard.jsx` (§4.3, reused directly), which itself drills into District, which drills into case-level — a three-level path, not a flattened jump straight to victims. |
| Policy-input trend lines | A longer-range time-series chart (national average distress over the last N months) from the backend's trend endpoint (backend prompt §5.2) — a real line chart, not a repeat of the current-snapshot stat tiles. |

---

## 6. SUPER ADMIN / MINISTRY (`pages/ministry/`, `MinistryLayout`)

### 6.1 Login — **existing**, unchanged.

### 6.2 Role & Account Management — rewrite `StaffManagement.jsx` into a real table:

| Feature | Spec |
|---|---|
| Create Counsellor accounts | "Create Account" modal/form with a role dropdown; when `Counsellor` is selected, show only the fields that role needs (name, email, district/jurisdiction), calling `POST /api/ministry/staff`. |
| Create District Admin accounts | Same modal, `Administration` role + jurisdiction level `district` + a jurisdiction picker. If the backend rejects a second District Admin for the same district (its new 1-per-district validation), surface that exact error message inline on the form, not a generic failure toast. |
| Create State Admin accounts | Same modal, jurisdiction level `state`, same duplicate-rejection handling. |
| Create National Admin accounts | Same modal, jurisdiction level `national`, no duplicate limit. |
| Revoke / deactivate accounts | A "Revoke" action per row in the staff table, calling `PATCH /api/ministry/staff/:id/revoke`, with a confirmation dialog before firing (this is a meaningful, not-easily-reversed action). |
| Role-Based Access Control (RBAC) | No dedicated screen — implicitly enforced by which fields/actions are even shown per role throughout this app; nothing further to build here. |
| PII Isolation enforcement | No dedicated screen — backend/architecture concern, not a UI feature. |

### 6.3 Dashboards & Oversight

| Feature | Spec |
|---|---|
| Role-scoped aggregate dashboards | Give Ministry its own landing dashboard route (missing from `App.js` today) that reuses `NationalDashboard.jsx` (§5.2) with an `unrestricted` prop so no jurisdiction filter is applied — Ministry sees everything National sees, unscoped. |
| Heatmaps by state / region | **New** `Heatmap.jsx` page/section: a colored grid of state cards (color intensity by average distress score or victim count — pick one primary metric, show the other as secondary text on each card) from `GET /api/ministry/heatmap`. A grid of cards is sufficient; don't add a mapping library dependency for this. |
| Connections with NHAA helpline IVRS | A simple log/list view (`IvrsLog.jsx` or a section on the Heatmap/Oversight page) against `GET /api/ministry/ivrs-log` — timestamp, victim (or docket), call status. Label the section clearly as reflecting queued/attempted calls, not a live call-monitoring dashboard. |
| Tele-MANAS integration | Out of scope per the backend prompt — if a static reference is wanted, a single "Escalation Contacts" info card (phone number/link) somewhere in the Ministry shell is enough; do not build a fake "connected" status indicator for an integration that doesn't exist. |
| Inter-department coordination | No dedicated screen — descriptive of the overall system, not a discrete page. |
| Receive Base-Level Reports | **New** `ReportsInbox.jsx`: a list of `GET /api/ministry/reports` rows (jurisdiction, submitted-by, date), each row expandable (accordion or a detail modal) to show the snapshot's stat contents. |
| Audit log viewer | Rewrite `AuditLog.jsx` into a real paginated table against `GET /api/ministry/audit-log`: timestamp, official, action, entity type/id, with page-forward/back controls. |

### 6.4 System Configuration — rewrite `SystemConfig.jsx` with four sections (tabs or stacked panels — plain internal-tooling styling, not a polished public page):

| Feature | Spec |
|---|---|
| Manage case types | A simple list + inline add/edit/delete form against `/api/ministry/case-types`, mirroring the Languages panel's existing interaction pattern exactly. |
| Manage intervention types | Same list/CRUD pattern against `/api/ministry/intervention-types`. |
| Manage channels | Same list/CRUD pattern against `/api/ministry/channels`. |
| Manage supported languages | **Existing** — the current Languages panel is the template the three rows above copy verbatim. |

---

## 7. DATA INTAKE & INTEGRATION ADMIN — entirely new role in the frontend

| Feature | Spec |
|---|---|
| Admin ID + Email + Password (login) | Add `Data Intake Admin` as a 4th option in `pages/staff/Login.jsx`'s role dropdown (reusing the existing staff-login form/logic unchanged); on success route to `/dataintake`. |
| Change password on first access | **Existing mechanism** (`must_change_password` flag) — the existing `ChangePassword.jsx` flow already handles this for any staff role; no new component, just confirm the redirect-on-first-login check includes this role. |
| Create victim credentials | New page `pages/dataintake/RegisterVictim.jsx` — same form as §3.5's `VictimRegistrationForm`, but extract that form into a shared component (`components/VictimRegistrationForm.jsx`) used by both District Admin and Data Intake Admin, since the fields are identical; Data Intake's instance is **not** jurisdiction-locked (State/District are open dropdowns, not pre-filled), matching the backend's non-jurisdiction-scoped route. |
| Fetch case details | New page `pages/dataintake/FetchCase.jsx` — a single Docket Number input + "Fetch" button calling `POST /api/data-intake/fetch-case`, displaying the result in a read-only card **with a visible "Simulated data" label/banner** on the result — this must never look like a live government API response, per the backend prompt's explicit scoping. |

Add a `dataintake` section to `StaffLayout.jsx`'s `NAV_ITEMS_BY_SECTION` following the exact pattern used for `counsellor`/`districtadmin`/`stateadmin` (two nav items: Register Victim, Fetch Case Details).

---

## 8. AI RISK ENGINE — no frontend surface by definition; every row in this catalog section is consumed indirectly through Counsellor's Case Detail (chart, explanation, suggested intervention — all already built) and the Stress-Level Automated Response's push/SMS receipt points covered in §1.5. Nothing further to build here.

---

## What NOT to touch

- Victim's Home/Check-in/History core logic, Counsellor's 5 existing pages' core logic, and the desktop-responsive shell/sidebar/top-bar work already built this session — none of that is being redesigned, only extended.
- Don't build IVRS/SMS delivery UI beyond a trigger button/toggle — actual call/SMS sending is a backend/provider concern.
- Don't build real-time voice/VoIP for "Call Counsellor" — a `tel:` link is the scoped implementation unless the user explicitly asks for more.

## Suggested build order

1. Victim Login rewrite (§1.1) — blocks the entire Victim app under the new login model.
2. District Admin Victim Registration (§3.5) — needed to have any victims to log in as.
3. District/State/National Admin dashboards (§3.3, §4.3, §5.2) — highest-impact, backend already there.
4. Ministry's stub pages (§6.2–§6.4) — second-highest impact, same reason.
5. Data Intake Admin (§7) — net-new, self-contained.
6. Victim's new screens — Chat, Wellness, Journal, counsellor chat/call (§1.3–§1.6) — independent, parallelizable.
7. Counsellor additions — backstories, scheduling, decision panel, chat, SOS badges, realtime alerts (§2.2–§2.4) — smallest, most incremental, do last.

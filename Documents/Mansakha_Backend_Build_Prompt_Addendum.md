Role: Backend Engineer with 30+ years of experience in Node.js, Express, and PostgreSQL/Supabase.

Task: This is an addendum to `Mansakha_Backend_Build_Prompt.md`, not a replacement — it captures every new endpoint and response-shape requirement that surfaced while implementing the frontend against that prompt. The original file went missing from this machine partway through the frontend build, so anything below that also belongs in the original should be merged in rather than treated as a separate, parallel spec.

---

## 1. A gap in the original prompt: SOS was never given a backend endpoint

The original prompt's Counsellor §2.2/§2.4 references "the new `sos_events`" table when describing the SOS alert badge, but Victim's §1.3 (Check-in & Interaction) never actually defined it. The frontend now has a real SOS button wired to this contract — it needs to exist:

- **New table**: `sos_events: sos_event_id, victim_id, triggered_at, resolved_at, resolved_by`.
- **New endpoint**: `POST /api/victim/sos` (authenticated, no body). Inserts a `sos_events` row, then immediately creates an `alert_notifications` row for the victim's assigned counsellor (or, if unassigned, the same fewest-open-cases routing as the Critical/unopted branch of the Stress-Level Automated Response), tagged `source: 'sos'`, `priority: 'urgent'`. Respond immediately with `{sosEventId}` — don't block the response on the alert-routing side effect.
- `alert_notifications` needs both a `source` column (`'distress_score' | 'sos'`) and a `priority` column (`'normal' | 'urgent'`) if they don't already exist — both are read by the Counsellor UI to badge alerts.

## 2. New endpoints assumed by the frontend, not yet specced

| Endpoint | Used by | Notes |
|---|---|---|
| `GET /api/victim/chat` | Victim `ChatScreen.js` | Loads prior conversation history on mount. The original prompt only specified `POST /api/victim/chat`. Response: `{messages: [{messageId, sender: 'victim'\|'ai', body, sentAt}]}`. |
| `PATCH /api/victim/sms-preference` | Victim `SettingsScreen.js` | Body `{enabled: boolean}`. Needs a `victims.sms_checkin_enabled` column (or wherever this preference should live) — the original prompt flagged this as needing a decision; the frontend now has a real toggle wired to this exact route, so the column/route need to exist under this name or the toggle needs to be repointed. |
| `GET /api/admin/victims?docketNumber=X` | District Admin `VictimRegistration.jsx`'s Edit flow | Looks up a victim by docket number so the Edit form can load a record without already knowing its internal id. Response: `{victim: {victimId, fullName, caseStage, ...}}` or `{victim: null}` when not found. |
| `GET /api/lookups/jurisdictions?level=national` | Ministry `MinistryDashboard.jsx` | Ministry has no jurisdiction of its own, so it fetches the root national jurisdiction this way and reuses the same dashboard endpoint National Admin uses. Confirm a single national-level jurisdiction row exists and is queryable through the existing `level` filter. |

## 3. Response fields the frontend now reads that need to be present

These aren't new endpoints, just fields the UI expects on existing/planned routes — flagging exact names so the frontend and backend agree without a round-trip:

- **`GET /api/victim/dashboard`**: add `optedForManualCounsellor` (bool) and `smsCheckinEnabled` (bool) alongside the already-planned `fullName`/`docketNumber`. The Settings screen's two toggles read these directly.
- **`GET /api/victim/assigned-counsellor`**: `{officialId, fullName, phone}` (or `null`/404 when unassigned) — the frontend treats "no assigned counsellor" and "not opted in" as two independent gates, both must be checked server-side too, not just hidden client-side.
- **`GET /api/counsellor/cases`** (list): each row needs `caseBackground` — a short string, truncated client-side for the queue view.
- **`GET /api/counsellor/cases/:victimId`** (detail): needs `caseBackground` (full text) and `optedForManualCounsellor` (bool) — the chat panel on Case Detail is hidden entirely when this is false, so the field must reflect the real value, not just be sent to victims.
- **`GET /api/counsellor/cases/:victimId/notes`**: each note needs `authoredBy: 'ai' | 'manual'` — the frontend renders an "AI-drafted" tag when this is `'ai'`.
- **`GET /api/admin/dashboard/:jurisdictionId`** — the frontend assumes these exact shapes per tier (adjust field names on either side if they don't match, but they need to match one way or the other):
  - District: `{totalCases, vulnerableVictims, highRiskCases, criticalCases, alerts: [{alertId, victimId, status, riskLevel}], trend: [{period, avgScore}], cases: [{victimId, caseStage, score, riskLevel}]}`
  - State: `{totalCases, highRiskCases, criticalCases, districts: [{jurisdictionId, name, totalCases, highRiskCases, criticalCases, trendDirection: 'up'|'down'|'flat'}]}`
  - National: `{totalCases, highRiskCases, criticalCases, states: [{jurisdictionId, name, totalCases, highRiskCases, criticalCases}], trend: [{period, avgScore}]}`
- **`GET /api/admin/workload/:jurisdictionId`**: `{counsellors: [{officialId, fullName, caseCount, avgResponseMinutes}]}`.
- **`GET /api/counsellor/scheduled`**: `{sessions: [{sessionId, victimId, scheduledAt, status}]}`.
- **`POST /api/counsellor/cases/:victimId/schedule`**: body `{scheduledAt}` (ISO timestamp).
- **`GET`/`POST /api/counsellor/cases/:victimId/messages`**: `{messages: [{messageId, senderType: 'victim'|'official', body, sentAt}]}`.
- **`GET /api/ministry/staff`**: `{staff: [{officialId, fullName, roleName, jurisdictionName, status: 'active'|'revoked'}]}`.
- **`GET /api/ministry/case-types` / `/intervention-types` / `/channels`**: same list shape as the existing Languages endpoint (`{caseTypes: [...]}`, `{interventionTypes: [...]}`, `{channels: [...]}`), each item needs a stable `id`-equivalent field — the frontend's generic CRUD panel expects one, whatever it's actually named (confirm against the Languages endpoint's own convention and match it).
- **`GET /api/ministry/heatmap`**: `{regions: [{jurisdictionId, name, avgScore, victimCount}]}`.
- **`GET /api/ministry/reports`**: `{reports: [{reportId, jurisdictionId, jurisdictionName, generatedByName, generatedAt, snapshot}]}`.
- **`GET /api/ministry/audit-log?page=N`**: `{entries: [{auditId, createdAt, officialName, action, entityType, entityId}], total}`.
- **`GET /api/ministry/ivrs-log`**: not yet consumed by a built page (deferred), but keep the shape in mind: a list of dispatch_queue entries of type `ivrs_call`.

## 4. Something the frontend deliberately did NOT build, so the backend doesn't need to support it yet

Real-time alerts use client-side polling (every 15s) instead of a Supabase Realtime subscription — wiring true push safely requires an RLS policy scoping the `alert_notifications` realtime channel to each counsellor's own cases, which isn't something to set up without confirming it first. If real-time push is wanted later, that RLS work is the prerequisite, not any additional frontend change.

## 5. Reminder: seed data, not code

The Victim Login screen's State/District dropdowns render whatever `GET /api/lookups/jurisdictions` returns, sorted alphabetically client-side. Getting all 28 states + 8 union territories (and their real districts) into the `jurisdictions` table is a seed-data task, not something either frontend touches.

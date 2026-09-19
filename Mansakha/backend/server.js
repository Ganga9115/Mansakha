require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ok } = require('./src/core/services/responseEnvelope');
const { startDispatchWorker } = require('./src/core/services/dispatchWorker');
const { startECourtSyncWorker } = require('./src/core/services/ecourtStageSync');

// Defense-in-depth, not a substitute for fixing individual routes: Express 4
// doesn't await async route handlers or catch their rejected promises, so an
// unguarded Supabase call (e.g. `.single()` on a query that errors) throws
// inside an async handler, becomes an unhandled rejection, and by default
// crashes the ENTIRE process - taking down every other in-flight request for
// every other user, not just the one that hit the bug. Confirmed live during
// this session (GET /api/user/assigned-counsellor took the whole server
// down from one transient query error). These handlers keep the process
// alive when that happens elsewhere too - the specific request that
// triggered it will hang until the client times out (its response was never
// sent), but every other request keeps being served normally instead of a
// total outage.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (process kept alive):', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (process kept alive):', err);
});

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());

app.get('/health', (req, res) => ok(res, { status: 'up' }));

// Role-agnostic, stay flat - public/self-info, nothing to duplicate per role.
app.use('/api/lookups', require('./src/routes/lookups'));
app.use('/api/me', require('./src/routes/me'));

// AI engine's HTTP seam - lives with its engine (ai/ai.js), not the generic
// role-agnostic routes above, since it's owned by the ai/ module, not a
// standalone concern the way lookups/me are.
app.use('/api/ai', require('./src/ai/routes/ai.routes'));

// The one deliberate shared-login exception (see core/services/staffLogin.js) -
// Administration (every tier) + Counsellor + Data Operator all log in through
// this one pre-role entry point.
app.use('/api/auth/staff', require('./src/core/routes/auth.staff.routes'));

// User
app.use('/api/auth/user', require('./src/user/routes/auth.user.routes'));
app.use('/api/user', require('./src/user/routes/user.routes'));

// Counsellor
app.use('/api/counsellor', require('./src/counsellor/routes/counsellor.routes'));

// Administration - triplicated per tier, each with its own real mount
// (previously a single shared file/path served all three tiers).
app.use('/api/admin/district', require('./src/district_admin/routes/districtAdmin.routes'));
app.use('/api/admin/state', require('./src/state_admin/routes/stateAdmin.routes'));
app.use('/api/admin/national', require('./src/national_admin/routes/nationalAdmin.routes'));

// Ministry
app.use('/api/auth/ministry', require('./src/ministry/routes/auth.ministry.routes'));
app.use('/api/ministry', require('./src/ministry/routes/ministry.routes'));

// Mansakha Mail - internal staff communication, spans every role above
// rather than belonging to one, so it mounts flat like lookups/me.
app.use('/api/mail', require('./src/mail/routes/mail.routes'));

// "Signin" - the second deliberate shared-login exception, for the 6 new
// coordination roles (see auth.signin.routes.js's own header comment for why
// this is its own file rather than widening auth.staff.routes.js).
app.use('/api/auth/signin', require('./src/core/routes/auth.signin.routes'));

// New coordination roles - each works its own agency_referrals queue
// (migration_028_agency_referrals.sql), entirely independent of the
// Intervention Requests flow above.
//
// Special Public Prosecutor stays retired (its trial-carrying function
// moved into DLSA's own routes) - its routes/frontend stay on disk, not
// deleted, but unmounted so no account can reach them.
//
// Investigating Officer is REINSTATED (migration_033) with real substance -
// station-scoped case queue, its own investigation_records - after briefly
// being retired under the earlier Legal Aid/Threat consolidation. Its
// accused-status authority moves back from Protection Officer to here.
app.use('/api/io', require('./src/io/routes/io.routes'));
app.use('/api/dwo', require('./src/dwo/routes/dwo.routes'));
app.use('/api/protectionofficer', require('./src/protection_officer/routes/protectionOfficer.routes'));
app.use('/api/dlsa', require('./src/dlsa/routes/dlsa.routes'));
// District Collector removed (explicit decision - its SLA-escalation-
// destination job is dropped, not redirected) - same "unmounted, not
// deleted" treatment as Special Public Prosecutor above: routes/frontend
// stay on disk, but no account can reach them any more.
app.use('/api/rehabilitationofficer', require('./src/rehabilitation_officer/routes/rehabilitationOfficer.routes'));
// Public Prosecutor (migration_040) - the DLSA-assigned advocate role for
// the dedicated Legal Aid pipeline (see dlsa.routes.js's own Legal Aid
// Requests section for the assignment side).
app.use('/api/legalrepresentative', require('./src/legal_representative/routes/legalRepresentative.routes'));

app.use((req, res) => {
  res.status(404).json({ success: false, data: null, message: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, data: null, message: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mansakha backend listening on port ${PORT}`);
  startDispatchWorker();
  // District Collector removed entirely - agencyEscalationChecker.js's real
  // escalate*() functions all target that role, and per explicit decision
  // escalation is dropped rather than redirected. The worker no longer
  // starts, so no new agency_tasks rows get created; the file stays on disk
  // (same "unmounted, not deleted" treatment as Special Public Prosecutor's
  // own routes) since districtAdmin/state/national admin's Coordination
  // Roster still reuses its STALE_REFERRAL_DAYS constant for a read-only
  // "already overdue" flag.
  startECourtSyncWorker();
});

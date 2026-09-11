const express = require('express');
const multer = require('multer');
const { supabase } = require('../core/db/supabaseClient');
const { pool } = require('../core/db/pgPool');
const { verifyToken } = require('../core/middleware/verifyToken');
const { ok, fail } = require('../core/services/responseEnvelope');
const { DESIGNATIONS_BY_ROLE } = require('../core/services/officialDesignations');

const router = express.Router();

// Memory storage - files are small profile photos, uploaded straight through
// to Supabase Storage without ever touching disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('File must be an image'));
    cb(null, true);
  },
});

// The Staff Login surface covers Administration + Counsellor + Ministry with one
// email+password check (see core/routes/auth.staff.routes.js, ministry/routes/auth.ministry.routes.js); the frontend
// needs to know WHICH role/jurisdiction actually came back before it can pick the
// right dashboard shell (Build Prompt Section 3/4.5) - this is that lookup.
router.get('/', verifyToken, async (req, res) => {
  if (req.auth.type === 'user') {
    return ok(res, { type: 'user', userId: req.auth.userId });
  }

  // Profile page needs real per-role fields (phone/WhatsApp only mean
  // anything for Counsellor, jurisdiction NAME for Administration - the
  // token's own `roles` only carries jurisdictionId/Level, not the name) to
  // show something genuinely different per role instead of one identical
  // page with decorative, non-functional toggles for everyone.
  //
  // One raw pg query (not two Supabase REST calls) - this endpoint fires on
  // every single page load across the whole app, so its latency is felt
  // everywhere; going straight to Postgres here has the same ~1-2s-per-call
  // win confirmed on the admin dashboard routes, but with much broader reach.
  const { rows } = await pool.query(
    `select o.full_name, o.email, o.profile_image_url, o.phone, o.staff_id, o.whatsapp_number,
            orr.jurisdiction_id, orr.designation, r.role_name, j.name as jurisdiction_name, ps.name as station_name
     from officials o
     left join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     left join roles r on r.role_id = orr.role_id
     left join jurisdictions j on j.jurisdiction_id = orr.jurisdiction_id
     left join police_stations ps on ps.station_id = orr.station_id
     where o.official_id = $1`,
    [req.auth.officialId]
  );
  const official = rows[0];
  const jurisdictionNameById = new Map(rows.filter((r) => r.jurisdiction_id).map((r) => [r.jurisdiction_id, r.jurisdiction_name]));
  // migration_035 - Protection Officer's real-world title, set by Ministry
  // at appointment (see ministry.routes.js's PROTECTION_OFFICER_DESIGNATIONS) -
  // null for every other role, which don't use this column. Both maps are
  // keyed by role name (not a stable per-grant id) since req.auth.roles
  // (from the JWT/verifyToken) doesn't carry one - fine here because an
  // official never holds the same role name twice.
  const designationByRoleName = new Map(rows.filter((r) => r.designation && r.role_name).map((r) => [r.role_name, r.designation]));
  // Generic (not Protection-Officer-specific) - in practice only ever
  // populated for Investigating Officer, since ministry.routes.js only ever
  // writes station_id for that role (a Protection Officer's real
  // designations are all sub-division/district-level posts, never a
  // single-station one - see that file's own comment).
  const stationNameByRoleName = new Map(rows.filter((r) => r.station_name && r.role_name).map((r) => [r.role_name, r.station_name]));

  return ok(res, {
    type: 'official',
    officialId: req.auth.officialId,
    fullName: official?.full_name || null,
    email: official?.email || null,
    profileImageUrl: official?.profile_image_url || null,
    phone: official?.phone || null,
    whatsappNumber: official?.whatsapp_number || null,
    staffId: official?.staff_id || null,
    mustChangePassword: req.auth.mustChangePassword,
    roles: req.auth.roles.map((r) => ({
      ...r,
      jurisdictionName: r.jurisdictionId ? jurisdictionNameById.get(r.jurisdictionId) || null : null,
      designation: designationByRoleName.get(r.roleName) || null,
      stationName: stationNameByRoleName.get(r.roleName) || null,
    })),
  });
});

// Real notification bell for every staff role (Ministry's was a plain
// decorative button; Counsellor's top bar had its own one-off open-alert
// count instead of this). alert_notifications (schema.sql) is written for
// whichever officials actually need to know about an alert or urgent-help
// request - the assigned Counsellor, every District Administration official
// in that user's jurisdiction, and (for urgent-help specifically) every
// State Administration official over that district's parent state - so
// National Admin, Ministry, and Data Operator legitimately just see an
// empty list today, not a bug, since nothing currently targets them.
// source = 'sos' in the DB is the urgent-help request kind (table/column
// names predate the rename to "Get Help Now" - not worth a migration for a
// label).
// User (victim) side: the bell in TopRightActions used to just navigate to
// the static Support page, showing nothing real - this is the actual
// notification data behind it, mirroring the staff branch below (unread
// counsellor messages + upcoming scheduled sessions, the two things a user
// actually needs a heads-up about).
async function getUserNotifications(userId) {
  const [{ rows: unreadMessages }, { rows: sessions }, { rows: legalAidRequests }, { rows: legalAidHearings }] = await Promise.all([
    pool.query(
      `select m.message_id, m.sent_at, o.full_name
       from messages m
       join officials o on o.official_id = m.official_id
       where m.user_id = $1 and m.sender_type = 'official' and m.read_at is null
       order by m.sent_at desc
       limit 20`,
      [userId]
    ),
    pool.query(
      `select cs.session_id, cs.scheduled_at, o.full_name
       from counselling_sessions cs
       join officials o on o.official_id = cs.counsellor_id
       where cs.user_id = $1 and cs.status = 'upcoming' and cs.scheduled_at > now()
       order by cs.scheduled_at asc
       limit 5`,
      [userId]
    ),
    // migration_040 - Legal Aid has no dedicated notification-event row (unlike
    // messages' sent_at/read_at), so this mirrors the two sources above exactly:
    // recent status changes on any case in the caller's OWN family (never just
    // the anchor - a request is filed against the literal docket, not always
    // the anchor), no server-side unread tracking.
    pool.query(
      `select lar.request_id, lar.status, lar.updated_at
       from legal_aid_requests lar
       join users u on u.user_id = lar.user_id
       where u.user_id = $1 or u.linked_to_user_id = $1
       order by lar.updated_at desc
       limit 5`,
      [userId]
    ),
    // migration_044 - hearings themselves are eCourt-only now (never a
    // notification-worthy app event); this row is the Public Prosecutor's
    // own note against one of those hearings, the one hearing-adjacent thing
    // this app still creates.
    pool.query(
      `select n.note_id, n.created_at
       from legal_aid_hearing_notes n
       join legal_aid_requests lar on lar.request_id = n.request_id
       join users u on u.user_id = lar.user_id
       where u.user_id = $1 or u.linked_to_user_id = $1
       order by n.created_at desc
       limit 5`,
      [userId]
    ),
  ]);

  const notifications = [
    ...unreadMessages.map((m) => ({
      notificationId: m.message_id,
      notifiedAt: m.sent_at,
      type: 'message',
      message: `New message from ${m.full_name || 'your counsellor'}`,
    })),
    ...sessions.map((s) => ({
      notificationId: s.session_id,
      notifiedAt: s.scheduled_at,
      type: 'session',
      message: `Upcoming session with ${s.full_name || 'your counsellor'} on ${new Date(s.scheduled_at).toLocaleString()}`,
    })),
    ...legalAidRequests.map((r) => ({
      notificationId: r.request_id,
      notifiedAt: r.updated_at,
      type: 'legal_aid_status',
      message: `Your Legal Aid request is now ${r.status}`,
    })),
    ...legalAidHearings.map((h) => ({
      notificationId: h.note_id,
      notifiedAt: h.created_at,
      type: 'legal_aid_hearing',
      message: 'Your Public Prosecutor added a note to a hearing on your Legal Aid case',
    })),
  ].sort((a, b) => new Date(b.notifiedAt).getTime() - new Date(a.notifiedAt).getTime());

  return notifications;
}

router.get('/notifications', verifyToken, async (req, res) => {
  if (req.auth.type === 'user') {
    try {
      const notifications = await getUserNotifications(req.auth.userId);
      return ok(res, { notifications });
    } catch (err) {
      return fail(res, `Could not load notifications: ${err.message}`, 500);
    }
  }
  if (req.auth.type !== 'official') return fail(res, 'Account required', 403);

  try {
    const { rows } = await pool.query(
      // coalesce(al.user_id, se.user_id, an.user_id) - the third arm was
      // missing (confirmed live: every 'disengagement' notification, and now
      // 'weekly_review' too, uses alert_notifications.user_id directly with
      // no alert_id/sos_event_id at all, so user_id/user_name/user_phone
      // all silently resolved to null and the message fell back to the
      // generic "New alert - a user" template for both sources).
      `select an.alert_notification_id, an.notified_at, an.source, an.priority, an.auto_assigned,
              an.alert_id, an.sos_event_id,
              coalesce(al.user_id, se.user_id, an.user_id) as user_id,
              coalesce(al.triggered_at, se.triggered_at, an.notified_at) as triggered_at,
              ast.name as alert_status, se.acknowledged_at, se.resolved_at,
              ui.full_name as user_name, ui.contact_number as user_phone,
              ds.score_value, rl.name as risk_level
       from alert_notifications an
       left join alerts al on al.alert_id = an.alert_id
       left join alert_statuses ast on ast.alert_status_id = al.alert_status_id
       left join sos_events se on se.sos_event_id = an.sos_event_id
       left join distress_scores ds on ds.score_id = al.distress_score_id
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       left join user_identity ui on ui.user_id = coalesce(al.user_id, se.user_id, an.user_id)
       where an.official_id = $1
       order by an.notified_at desc
       limit 20`,
      [req.auth.officialId]
    );

    // `message` stays for callers that only render a one-line summary
    // (unchanged) - everything else here is new, for a click-through detail
    // view (who, what kind of alert, when it actually happened vs. when
    // this official was notified, current status, and enough context -
    // phone, distress score - to act without a second round trip).
    const notifications = rows.map((n) => ({
      notificationId: n.alert_notification_id,
      notifiedAt: n.notified_at,
      triggeredAt: n.triggered_at,
      priority: n.priority,
      source: n.source,
      autoAssigned: n.auto_assigned,
      userId: n.user_id,
      userName: n.user_name || null,
      userPhone: n.user_phone || null,
      riskLevel: n.risk_level || null,
      scoreValue: n.score_value !== null ? Number(n.score_value) : null,
      // Was missing the "Acknowledged" state entirely (acknowledged_at
      // wasn't even selected above) - an SOS a counsellor had already
      // acknowledged still showed "Open" in this bell while correctly
      // showing "Acknowledged" in the Counsellor Alerts Feed
      // (counsellor.routes.js), the exact same event reading two different
      // statuses depending on which screen you looked at it from.
      status: n.source === 'sos'
        ? (n.resolved_at ? 'Resolved' : n.acknowledged_at ? 'Acknowledged' : 'Open')
        : (n.alert_status || 'Open'),
      message: n.source === 'sos'
        ? `Urgent help requested by ${n.user_name || 'a user'}`
        : n.source === 'disengagement'
        ? `${n.user_name || 'A user'} has gone quiet - no check-ins recently`
        : n.source === 'weekly_review'
        ? `${n.user_name || 'A user'} completed their weekly review`
        : `${n.risk_level || 'New'} alert - ${n.user_name || 'a user'}`,
    }));

    return ok(res, { notifications });
  } catch (err) {
    return fail(res, `Could not load notifications: ${err.message}`, 500);
  }
});

// The officer's own designation, set from their own Profile page. Safe to
// be self-service precisely because designation grants nothing: it's a
// descriptive record of the post they hold. What actually scopes a role -
// an Investigating Officer's police station, a Protection Officer's
// district - stays Ministry-only (ministry.routes.js's own scope routes)
// and read-only here, because those DO decide which cases reach a queue.
// Constrained to the same shared lists Ministry uses, never free text, and
// only for roles the caller actually holds.
router.patch('/designation', verifyToken, async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);

  const { roleName, designation } = req.body;
  if (!roleName) return fail(res, 'roleName is required', 400);

  const allowed = DESIGNATIONS_BY_ROLE[roleName];
  if (!allowed) return fail(res, `${roleName} does not carry a designation`, 400);
  if (designation && !allowed.includes(designation)) {
    return fail(res, `designation must be one of: ${allowed.join(', ')}`, 400);
  }
  // Only a role this account actually holds - never someone else's grant,
  // and never a role they were never given.
  if (!req.auth.roles.some((r) => r.roleName === roleName)) {
    return fail(res, `You do not hold the ${roleName} role`, 403);
  }

  const { rows } = await pool.query(
    `select orr.official_role_id
     from official_roles orr
     join roles r on r.role_id = orr.role_id
     where orr.official_id = $1 and r.role_name = $2 and orr.revoked_at is null
     limit 1`,
    [req.auth.officialId, roleName]
  );
  if (!rows[0]) return fail(res, `No active ${roleName} role found on this account`, 404);

  const { error } = await supabase
    .from('official_roles')
    .update({ designation: designation || null })
    .eq('official_role_id', rows[0].official_role_id);
  if (error) return fail(res, `Could not update designation: ${error.message}`, 500);

  return ok(res, { roleName, designation: designation || null }, 'Designation updated');
});

// The designation options this account may choose from, per role it holds -
// so a Profile page never has to hardcode a copy of the lists.
router.get('/designation-options', verifyToken, async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);
  const options = {};
  for (const r of req.auth.roles) {
    if (DESIGNATIONS_BY_ROLE[r.roleName]) options[r.roleName] = DESIGNATIONS_BY_ROLE[r.roleName];
  }
  return ok(res, { options });
});

// Uploads to Supabase Storage's `profile-photos` bucket (public read, see
// security_and_realtime.sql) at a fixed per-official path so re-uploading
// replaces the old photo instead of accumulating orphaned files.
router.post('/profile-photo', verifyToken, upload.single('photo'), async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);
  if (!req.file) return fail(res, 'photo file is required', 400);

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const path = `officials/${req.auth.officialId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadError) return fail(res, `Could not upload photo: ${uploadError.message}`, 500);

  const { data: publicUrlData } = supabase.storage.from('profile-photos').getPublicUrl(path);
  const profileImageUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`; // cache-bust on re-upload

  const { error: updateError } = await supabase
    .from('officials')
    .update({ profile_image_url: profileImageUrl })
    .eq('official_id', req.auth.officialId);
  if (updateError) return fail(res, `Could not save photo reference: ${updateError.message}`, 500);

  return ok(res, { profileImageUrl }, 'Profile photo updated');
});

// Frontend-pending (see core/services/dispatchWorker.js's header comment) - real
// device token registration needs expo-notifications wired on native
// platforms, not done this pass since web (this session's only reliably
// testable platform) isn't supported by that package at all. Endpoint is
// ready for whenever that lands.
router.patch('/push-token', verifyToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return fail(res, 'token is required', 400);

  const isUser = req.auth.type === 'user';
  const table = isUser ? 'users' : 'officials';
  const idColumn = isUser ? 'user_id' : 'official_id';
  const id = isUser ? req.auth.userId : req.auth.officialId;

  const { error } = await supabase.from(table).update({ expo_push_token: token }).eq(idColumn, id);
  if (error) return fail(res, `Could not register push token: ${error.message}`, 500);

  return ok(res, null, 'Push token registered');
});

module.exports = router;

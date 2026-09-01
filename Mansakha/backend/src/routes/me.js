const express = require('express');
const multer = require('multer');
const { supabase } = require('../core/db/supabaseClient');
const { pool } = require('../core/db/pgPool');
const { verifyToken } = require('../core/middleware/verifyToken');
const { ok, fail } = require('../core/services/responseEnvelope');

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
            orr.jurisdiction_id, j.name as jurisdiction_name
     from officials o
     left join official_roles orr on orr.official_id = o.official_id and orr.revoked_at is null
     left join jurisdictions j on j.jurisdiction_id = orr.jurisdiction_id
     where o.official_id = $1`,
    [req.auth.officialId]
  );
  const official = rows[0];
  const jurisdictionNameById = new Map(rows.filter((r) => r.jurisdiction_id).map((r) => [r.jurisdiction_id, r.jurisdiction_name]));

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
    roles: req.auth.roles.map((r) => ({ ...r, jurisdictionName: r.jurisdictionId ? jurisdictionNameById.get(r.jurisdictionId) || null : null })),
  });
});

// Real notification bell for every staff role (Ministry's was a plain
// decorative button; Counsellor's top bar had its own one-off open-alert
// count instead of this). alert_notifications (schema.sql) is written for
// whichever officials actually need to know about an alert/SOS - the
// assigned Counsellor and every District Administration official in that
// user's jurisdiction (see the table's own comment) - so State/National
// Admin, Ministry, and Data Operator legitimately just see an empty list
// today, not a bug, since nothing currently targets them.
router.get('/notifications', verifyToken, async (req, res) => {
  if (req.auth.type !== 'official') return fail(res, 'Staff account required', 403);

  try {
    const { rows } = await pool.query(
      `select an.alert_notification_id, an.notified_at, an.source, an.priority, an.auto_assigned,
              an.alert_id, an.sos_event_id, ui.full_name as user_name, rl.name as risk_level
       from alert_notifications an
       left join alerts al on al.alert_id = an.alert_id
       left join sos_events se on se.sos_event_id = an.sos_event_id
       left join distress_scores ds on ds.score_id = al.distress_score_id
       left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
       left join user_identity ui on ui.user_id = coalesce(al.user_id, se.user_id)
       where an.official_id = $1
       order by an.notified_at desc
       limit 20`,
      [req.auth.officialId]
    );

    const notifications = rows.map((n) => ({
      notificationId: n.alert_notification_id,
      notifiedAt: n.notified_at,
      priority: n.priority,
      message: n.source === 'sos'
        ? `SOS from ${n.user_name || 'a user'}`
        : `${n.risk_level || 'New'} alert - ${n.user_name || 'a user'}`,
    }));

    return ok(res, { notifications });
  } catch (err) {
    return fail(res, `Could not load notifications: ${err.message}`, 500);
  }
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

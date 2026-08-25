const express = require('express');
const multer = require('multer');
const { supabase } = require('../db/supabaseClient');
const { verifyToken } = require('../middleware/verifyToken');
const { ok, fail } = require('../services/responseEnvelope');

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
// email+password check (see routes/auth.staff.js, auth.ministry.js); the frontend
// needs to know WHICH role/jurisdiction actually came back before it can pick the
// right dashboard shell (Build Prompt Section 3/4.5) - this is that lookup.
router.get('/', verifyToken, async (req, res) => {
  if (req.auth.type === 'victim') {
    return ok(res, { type: 'victim', victimId: req.auth.victimId });
  }

  const { data: official } = await supabase
    .from('officials')
    .select('full_name, email, profile_image_url')
    .eq('official_id', req.auth.officialId)
    .maybeSingle();

  return ok(res, {
    type: 'official',
    officialId: req.auth.officialId,
    fullName: official?.full_name || null,
    email: official?.email || null,
    profileImageUrl: official?.profile_image_url || null,
    mustChangePassword: req.auth.mustChangePassword,
    roles: req.auth.roles,
  });
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

// Frontend-pending (see services/dispatchWorker.js's header comment) - real
// device token registration needs expo-notifications wired on native
// platforms, not done this pass since web (this session's only reliably
// testable platform) isn't supported by that package at all. Endpoint is
// ready for whenever that lands.
router.patch('/push-token', verifyToken, async (req, res) => {
  const { token } = req.body;
  if (!token) return fail(res, 'token is required', 400);

  const isVictim = req.auth.type === 'victim';
  const table = isVictim ? 'victims' : 'officials';
  const idColumn = isVictim ? 'victim_id' : 'official_id';
  const id = isVictim ? req.auth.victimId : req.auth.officialId;

  const { error } = await supabase.from(table).update({ expo_push_token: token }).eq(idColumn, id);
  if (error) return fail(res, `Could not register push token: ${error.message}`, 500);

  return ok(res, null, 'Push token registered');
});

module.exports = router;

// One consistent response shape everywhere, per Build Prompt Section 7, so client-side
// error handling never needs per-endpoint special cases.

function ok(res, data, message = null, status = 200) {
  return res.status(status).json({ success: true, data, message });
}

function fail(res, message, status = 400, data = null) {
  return res.status(status).json({ success: false, data, message });
}

module.exports = { ok, fail };

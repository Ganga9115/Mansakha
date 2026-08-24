require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ok } = require('./src/services/responseEnvelope');
const { startDispatchWorker } = require('./src/services/dispatchWorker');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());

app.get('/health', (req, res) => ok(res, { status: 'up' }));

app.use('/api/lookups', require('./src/routes/lookups'));
app.use('/api/auth/victim', require('./src/routes/auth.victim'));
app.use('/api/auth/staff', require('./src/routes/auth.staff'));
app.use('/api/auth/ministry', require('./src/routes/auth.ministry'));
app.use('/api/me', require('./src/routes/me'));
app.use('/api/victim', require('./src/routes/victim'));
app.use('/api/counsellor', require('./src/routes/counsellor'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/ministry', require('./src/routes/ministry'));
app.use('/api/ai', require('./src/routes/ai'));

app.use((req, res) => {
  res.status(404).json({ success: false, data: null, message: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, data: null, message: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mansakha backend listening on port ${PORT}`);
  // Scans for overdue check-ins + drains the alert/checkin dispatch queue -
  // see services/dispatchWorker.js for what's real vs. still frontend-pending.
  startDispatchWorker();
});

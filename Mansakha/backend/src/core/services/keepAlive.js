// Render's free tier spins the backend down after ~15 minutes of no
// incoming traffic. The repo's GitHub Actions cron (.github/workflows/
// keep-backend-warm.yml) is configured for every 10 minutes but GitHub's
// scheduler silently deprioritizes cron triggers on low-activity repos -
// confirmed live: actual runs were landing 3-5 hours apart instead of 10
// minutes, so the backend was going cold between them regardless.
//
// This self-ping doesn't depend on any external scheduler: as long as the
// process is already running, it makes a real outbound request to its own
// public URL every 9 minutes (under the 15-minute window), which counts as
// genuine incoming traffic to the Render service and resets its idle timer.
// RENDER_EXTERNAL_URL is a Render-provided env var set automatically on
// every Render service to that service's own public URL - its absence
// locally/in other environments makes this a no-op there, no separate
// NODE_ENV check needed. Keep the GitHub Actions cron too, as a second,
// independent way to wake it if it ever does go cold.
const SELF_PING_INTERVAL_MS = 9 * 60 * 1000;

function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) return null;

  const ping = async () => {
    try {
      await fetch(selfUrl);
    } catch (err) {
      console.error('Keep-alive self-ping failed:', err.message);
    }
  };
  return setInterval(ping, SELF_PING_INTERVAL_MS);
}

module.exports = { startKeepAlive, SELF_PING_INTERVAL_MS };

import { createClient } from '@supabase/supabase-js';

// Anon-key client for the frontend - used for Supabase Realtime subscriptions
// (live alerts/dashboards, Build Prompt Section 0b) and email OTP delivery is
// actually triggered via the backend (see routes/auth.victim.js), not here.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

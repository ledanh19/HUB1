import { createClient } from '@supabase/supabase-js';
import { env } from '../config';

/**
 * Service-role Supabase client – bypasses RLS.
 * Only used server-side. NEVER expose to frontend.
 */
export const serviceSupabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

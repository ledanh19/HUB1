/**
 * Centralized Supabase Exports
 * 
 * All modules should import from this file:
 *   import { supabase, safeQuery, safeMutation, safeRpc, safeFrom } from '@/integrations/supabase';
 * 
 * This provides the single supabase client instance + session-aware wrappers.
 * 
 * @author Session Reliability V1.1 → V1.2.1
 */

export { supabase } from './client';
export { safeQuery, safeRpc, safeMutation, isAuthError } from './safeQuery';
export { safeFrom } from './safeFrom';

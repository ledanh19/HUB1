-- Fix security linter: set SECURITY INVOKER on views
ALTER VIEW public.unified_bookings SET (security_invoker = true);
ALTER VIEW public.unified_payments SET (security_invoker = true);

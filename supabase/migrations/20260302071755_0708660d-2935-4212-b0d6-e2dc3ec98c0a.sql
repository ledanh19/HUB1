-- Enable realtime for email tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_messages;
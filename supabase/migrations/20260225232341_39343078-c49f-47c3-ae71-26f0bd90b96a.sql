
-- Store Supabase URL in vault for pg_net triggers
SELECT vault.create_secret(
  'https://htfpjqkhtjbalaodymwb.supabase.co',
  'supabase_url',
  'Supabase project URL for pg_net calls'
);

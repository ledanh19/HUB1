-- Fix linter: extension_in_public for pg_net
-- pg_net does not support ALTER EXTENSION ... SET SCHEMA, so we recreate it in a dedicated schema.

CREATE SCHEMA IF NOT EXISTS extensions;

DROP EXTENSION IF EXISTS pg_net;

CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Run this once in Supabase Dashboard -> SQL Editor
-- (in addition to the earlier profiles.sql / email_otps.sql)

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- No RLS change needed: is_admin is only ever read by the service role inside
-- Edge Functions (a later phase), never exposed as a client-writable field.

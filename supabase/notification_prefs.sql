-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run.

alter table public.profiles add column if not exists notification_prefs jsonb;

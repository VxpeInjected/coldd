-- admin-set-user-banned has always written { banned, ban_reason } to
-- profiles, and the admin panel's Status column has always read them back -
-- but the columns never existed, so every write silently failed and every
-- user showed "Active" regardless of reality. The actual sign-in block
-- (Supabase Auth's ban_duration, set in the same function call) was never
-- affected by this - a banned user really was locked out - only the
-- admin-facing status display and the profiles-side record of *why* were
-- broken.
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists ban_reason text;

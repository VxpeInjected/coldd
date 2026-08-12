-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run (idempotent).
--
-- Discord's public invite-lookup endpoint (used by admin-discord-stats) only
-- ever returns the CURRENT member count - there is no history endpoint
-- without a bot. To show "members gained in the selected period" on the
-- admin home dashboard, we need our own daily snapshots to diff against.
--
-- One row per UTC day. admin-discord-stats upserts today's row every time an
-- admin loads the dashboard, so history starts accumulating from the first
-- time this runs - there is no way to backfill days before that, since
-- Discord never exposed a past count to begin with.

create table if not exists public.discord_member_snapshots (
  snapshot_date date primary key,
  member_count integer not null,
  online_count integer,
  created_at timestamptz not null default now()
);

alter table public.discord_member_snapshots enable row level security;

do $$ begin
  create policy "discord_member_snapshots_select_admin" on public.discord_member_snapshots
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy - only admin-discord-stats (service role) writes.

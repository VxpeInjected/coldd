-- Run this once in Supabase Dashboard -> SQL Editor (or `supabase db query --linked
-- --file supabase/social_media_stats.sql`). Safe to re-run (idempotent).
--
-- Follower/subscriber trend history for the Marketing tab's social
-- channels (YouTube, X, TikTok). Discord already has its own dedicated
-- discord_member_snapshots table from before this existed - left as is,
-- not migrated here. One row per platform per UTC day; upserted by each
-- platform's admin-*-stats edge function whenever an admin loads the
-- dashboard, same pattern as Discord's snapshot table.

create table if not exists public.social_media_stats (
  platform text not null,
  snapshot_date date not null,
  followers integer,
  extra jsonb,
  created_at timestamptz not null default now(),
  primary key (platform, snapshot_date)
);

alter table public.social_media_stats enable row level security;

do $$ begin
  create policy "social_media_stats_select_admin" on public.social_media_stats
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

-- No client write policy - only the admin-*-stats service-role functions write.

-- Run this once in Supabase Dashboard -> SQL Editor (or `supabase db query --linked
-- --file supabase/notifications.sql`). Safe to re-run (idempotent).
--
-- In-app notifications shown from the bell icon in the nav. Rows are only
-- ever written by edge functions (service role) - there's no client insert
-- policy, so users can read and mark their own as read but can't post
-- notifications to themselves or anyone else.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

do $$ begin
  create policy "notifications_select_own" on public.notifications
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "notifications_update_own" on public.notifications
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- No insert/delete policy for clients - only service-role edge functions write.

-- security_hardening_2026-09-26.sql
--
-- Fixes items 3 and 4 from the external SECURITY-FIXES.md audit.
--
-- ---------------------------------------------------------------------
-- 1. client_errors: anyone could insert unlimited rows, and a client-sent
--    user_id was trusted as-is (flood risk + could tag rows as another
--    user's).
-- ---------------------------------------------------------------------

alter table public.client_errors
  add constraint client_errors_msg_len   check (char_length(message) <= 2000),
  add constraint client_errors_stack_len check (stack is null or char_length(stack) <= 8000),
  add constraint client_errors_ua_len    check (user_agent is null or char_length(user_agent) <= 500),
  add constraint client_errors_url_len   check (page_url is null or char_length(page_url) <= 1000);

drop policy if exists "client_errors_insert_anyone" on public.client_errors;
create policy "client_errors_insert_scoped" on public.client_errors
  for insert with check (
    user_id is null or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- 2. profiles: the 2026-09-09 column-scoped grant fix (see
--    security_hardening_2026-09-09.sql) had regressed back to a blanket
--    table-wide GRANT ALL to authenticated AND anon. RLS + the
--    protect_profile_privilege_columns() trigger still blocked an actual
--    privilege escalation, but the write returned 200 OK instead of
--    failing, so the browser briefly cached a fake admin flag. Re-scoping
--    to column-level privileges makes the write fail outright.
-- ---------------------------------------------------------------------

revoke all on public.profiles from anon;

revoke insert, update, delete on public.profiles from authenticated;

grant update (username, avatar_url, notification_prefs, updated_at)
  on public.profiles to authenticated;

grant insert (id, username, avatar_url, email, updated_at)
  on public.profiles to authenticated;

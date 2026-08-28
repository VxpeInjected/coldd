-- Admins need to see who has actually opted in (checkout box / popup /
-- signup form) vs who's only on the opt-out campaign list, for the
-- per-address consent popout in the Marketing panel. Mirrors the
-- email_campaigns admin-select policy. Writes stay service-role-only.
drop policy if exists marketing_optins_select_admin on public.marketing_optins;
create policy marketing_optins_select_admin on public.marketing_optins
  for select using (public.is_admin());

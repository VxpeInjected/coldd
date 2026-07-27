-- Run this in Supabase SQL Editor
create or replace function public.email_exists(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from auth.users where email = check_email);
$$;

grant execute on function public.email_exists(text) to anon, authenticated;

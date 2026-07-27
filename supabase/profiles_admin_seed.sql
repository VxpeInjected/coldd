-- Run this once in Supabase Dashboard -> SQL Editor (after profiles_admin.sql)
--
-- Grants is_admin to the same two Discord IDs already whitelisted
-- client-side in supabase-init.js's ADMIN_WHITELIST. Only takes effect for
-- accounts that have signed in at least once (a profiles row only exists
-- after first login) - if either admin hasn't logged in yet, re-run this
-- after they have.

update public.profiles
set is_admin = true
where discord_id in ('1327350011054526505', '1253736765986967622');

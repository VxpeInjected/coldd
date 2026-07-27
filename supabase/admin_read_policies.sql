-- Run this ONCE in the Supabase Dashboard -> SQL Editor, after
-- catchup_missing_schema.sql. Safe to re-run (guards duplicate policy
-- creation).
--
-- Lets signed-in admins (profiles.is_admin = true) read every product
-- (including hidden/inactive ones) and their product_legal rows, so the
-- admin panel can actually list and edit everything, not just what's
-- publicly visible. Writes still only ever happen through the
-- admin-upsert-product / admin-delete-product Edge Functions (service
-- role) - this only adds read access for the admin panel's own UI.

do $$ begin
  create policy "products_select_admin" on public.products
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "product_legal_select_admin" on public.product_legal
    for select using (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true)
    );
exception when duplicate_object then null;
end $$;

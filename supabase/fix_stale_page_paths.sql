-- Run this once in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- All 36 seeded products still have page='assets.html'/'minecraft.html'
-- from before the site moved to extension-less URLs (about/, assets/,
-- checkout/, etc. instead of about.html, assets.html, checkout.html).
-- app.js now builds breadcrumb/category/referral links directly from this
-- column (see app.js's `p.page || '/shop'` usages), so every existing
-- product's links were broken until this runs.

update public.products set page = '/shop' where page = 'assets.html';
update public.products set page = '/minecraft' where page = 'minecraft.html';

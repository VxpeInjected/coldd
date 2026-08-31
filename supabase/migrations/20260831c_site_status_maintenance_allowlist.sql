-- "Tester access": a small allowlist of non-staff accounts that site-gate.js
-- lets through the maintenance overlay (they see the site + a "tester access"
-- banner) and that _shared/maintenance.ts lets check out during maintenance.
-- Empty array = feature off. Edited from the admin Site Access panel, which
-- resolves usernames (site username or linked Roblox username) to ids.

alter table public.site_status
  add column if not exists maintenance_allow_user_ids uuid[] not null default '{}'::uuid[];

comment on column public.site_status.maintenance_allow_user_ids is 'Tester access: non-staff user ids allowed through maintenance (site-gate.js + _shared/maintenance.ts). Empty = off. Managed from the admin Site Access panel.';

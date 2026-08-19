-- Records the OAuth scope actually granted at link time. Without this,
-- a roblox_accounts row only proves "linked at some point", not "linked
-- with the inventory permission Robux checkout's ownership fallback
-- depends on" - an account linked before user.inventory-item:read was
-- requested (or where Roblox itself dropped a scope) looks identical to
-- a fully-permissioned one, and the resulting failure only ever surfaced
-- as a silently swallowed RobloxInsufficientScopeError deep in
-- verify-robux-order, never as anything a buyer or admin could see.
alter table public.roblox_accounts add column if not exists scope text not null default '';

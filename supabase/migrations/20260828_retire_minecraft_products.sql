-- coldd is Roblox-only now. Hide (don't delete) Minecraft products so the
-- storefront/catalog drop them while the existing orders that contain them
-- keep working - downloads and order history read the order row, not the
-- product's is_active flag.
update public.products set is_active = false, updated_at = now()
where platform = 'Minecraft' and is_active;

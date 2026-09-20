-- Removes the 17 inactive Minecraft-themed seed/placeholder products (never
-- real Roblox listings, already hidden via is_active=false) plus the
-- single-item test orders made against them during early dev/testing.
-- Every affected order is 100% made up of these placeholder products (no
-- mixed real-product orders touched) and none are actually paid revenue.
with placeholder_products as (
  select id from products where is_active = false
    and slug in (
      'fantasy-texture-pack','survival-world','skyblock-network-hub','fantasy-spawn',
      'minigames-lobby','adventure-map','custom-enchants','cosmetics-plugin',
      'skyblock-full-setup','prison-full-setup','ranger-skin-pack','custom-mob-models',
      'practice-pvp-lobby','medieval-castle','modern-city-pack','menu-gui-pack',
      'spawn-schematic-bundle'
    )
),
affected_orders as (
  select distinct order_id from order_items where product_id in (select id from placeholder_products)
),
deleted_items as (
  delete from order_items where product_id in (select id from placeholder_products)
  returning id
)
delete from orders where id in (select order_id from affected_orders);

delete from products where is_active = false
  and slug in (
    'fantasy-texture-pack','survival-world','skyblock-network-hub','fantasy-spawn',
    'minigames-lobby','adventure-map','custom-enchants','cosmetics-plugin',
    'skyblock-full-setup','prison-full-setup','ranger-skin-pack','custom-mob-models',
    'practice-pvp-lobby','medieval-castle','modern-city-pack','menu-gui-pack',
    'spawn-schematic-bundle'
  );

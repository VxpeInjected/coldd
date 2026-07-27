-- Run this ONCE in the Supabase Dashboard -> SQL Editor for the live coldd
-- project (ekinmytmudjwfaqaqswp). It brings the database up to date with
-- everything the app's code already expects but the live schema is
-- missing: only public.profiles and public.email_otps were ever actually
-- applied here - products, orders, order_items, product_legal, and
-- profiles.is_admin do not exist yet.
--
-- Safe to run even if partially applied already: every statement below is
-- idempotent (create table if not exists / add column if not exists /
-- insert ... on conflict do nothing), so re-running this causes no harm.
--
-- This is a straight concatenation of, in dependency order:
--   products.sql -> products_admin_fields.sql -> product_legal.sql
--   -> orders.sql -> profiles_admin.sql -> products_seed.sql
--   -> profiles_admin_seed.sql

-- ===== products.sql =====
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  price_usd numeric(10,2) not null,
  resell_available boolean not null default false,
  was_price numeric(10,2),
  image text,
  description text,
  cat text,
  subcat text,
  platform text not null check (platform in ('Roblox', 'Minecraft')),
  page text not null default '/assets',
  reviews_count int not null default 0,
  rating numeric(2,1) not null default 0,
  storage_path text not null default '_shared/placeholder.zip',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

do $$ begin
  create policy "products_select_active" on public.products
    for select using (is_active = true);
exception when duplicate_object then null;
end $$;

-- ===== products_admin_fields.sql =====
alter table public.products add column if not exists gallery jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists video text;
alter table public.products add column if not exists long_description text;
alter table public.products add column if not exists resell_price_usd numeric(10,2);
alter table public.products add column if not exists robux_price numeric(10,2);
alter table public.products add column if not exists tech jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists versions jsonb not null default '[]'::jsonb;

-- ===== product_legal.sql =====
create table if not exists public.product_legal (
  product_id uuid primary key references public.products(id) on delete cascade,
  tos text not null default '',
  proof_files jsonb not null default '[]'::jsonb,
  dev_proof_files jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  license_cost numeric(10,2) not null default 0,
  license_cost_currency text not null default 'usd' check (license_cost_currency in ('usd', 'robux')),
  license_purchased_at date,
  min_sale_usd numeric(10,2) not null default 0,
  min_sale_robux numeric(10,2) not null default 0,
  can_be_free boolean not null default false,
  disallow_sales boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.product_legal enable row level security;
-- Intentionally no policies: RLS enabled with zero policies denies every
-- client request by default. Only the service role bypasses RLS.

-- ===== orders.sql =====
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  currency text not null default 'usd',
  subtotal_usd numeric(10,2) not null,
  discount_usd numeric(10,2) not null default 0,
  total_usd numeric(10,2) not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

alter table public.orders enable row level security;

do $$ begin
  create policy "orders_select_own" on public.orders
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_slug text not null,
  title text not null,
  licence text not null default 'standard' check (licence in ('standard', 'resell')),
  unit_price_usd numeric(10,2) not null,
  qty int not null default 1,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

do $$ begin
  create policy "order_items_select_own" on public.order_items
    for select using (
      exists (
        select 1 from public.orders o
        where o.id = order_items.order_id and o.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_slug_idx on public.order_items(product_slug);

-- ===== profiles_admin.sql =====
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- ===== products_seed.sql =====
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('all-brawl-full-game', 'ALL BRAWL Full Game', 89.0, true, null, 'premade.jpg', 'Complete fighting game, fully scripted and ready to launch.', 'Finished Games & Templates', 'finished-games', 'Roblox', '/assets', 214, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('frostline-survival-kit', 'Frostline Survival Kit', 129.0, true, 189.0, 'new-release.jpg', 'Full survival game with crafting, biomes, and progression.', 'Finished Games & Templates', 'finished-games', 'Roblox', '/assets', 96, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('cyberpunk-district', 'Cyberpunk District', 45.0, true, 69.0, 'new-release.jpg', 'Neon-lit city map with detailed streets and interiors.', 'Maps', 'cities-towns', 'Roblox', '/assets', 142, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('containment-site', 'Containment Site', 38.0, true, null, 'builds.jpg', 'Secure facility map built for roleplay and SCP games.', 'Maps', 'scpf', 'Roblox', '/assets', 58, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('scp-courtroom', 'SCP Courtroom', 25.0, true, null, 'builds.jpg', 'Detailed courtroom interior, drop-in ready.', 'Buildings', 'scpf', 'Roblox', '/assets', 33, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('industrial-refinery', 'Industrial Refinery', 32.0, true, null, 'products.jpg', 'Gritty industrial complex with pipes, tanks, and catwalks.', 'Buildings', 'military', 'Roblox', '/assets', 21, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('ancient-temple', 'Ancient Temple', 28.0, false, null, 'cta-bg.jpg', 'Ruined stone temple with traps and hidden chambers.', 'Buildings', 'medieval', 'Roblox', '/assets', 47, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('tic-tac-toe-system', 'Tic Tac Toe System', 12.0, false, null, 'scripts.jpg', 'Plug-and-play Tic Tac Toe minigame with clean UI.', 'Scripts & UI', 'scripted-systems', 'Roblox', '/assets', 180, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('combat-hud-kit', 'Combat HUD Kit', 18.0, false, 27.0, 'banner.jpg', 'Health, ammo, and hitmarker HUD for combat games.', 'Scripts & UI', 'combat', 'Roblox', '/assets', 260, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('inventory-ui-pack', 'Inventory UI Pack', 16.0, false, null, 'scripts.jpg', 'Slot-based inventory system with drag and drop.', 'Scripts & UI', 'ui-packs', 'Roblox', '/assets', 77, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('vfx-starter-pack', 'VFX Starter Pack', 22.0, false, null, 'banner.jpg', '20 ready-to-use particle and explosion effects.', 'Animations & VFX', 'vfx', 'Roblox', '/assets', 128, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('emote-animation-set', 'Emote Animation Set', 19.0, false, null, 'team-bg.jpg', 'Smooth character emotes and idle animations.', 'Animations & VFX', 'animations', 'Roblox', '/assets', 64, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('tactical-uniforms', 'Tactical Uniforms', 15.0, false, null, 'team-bg.jpg', 'Military-grade uniform set with gear attachments.', 'Uniforms & Gear', '2d-uniforms', 'Roblox', '/assets', 39, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('naval-boat-pack', 'Naval Boat Pack', 35.0, false, null, 'products.jpg', 'Drivable boats with physics and detailed models.', 'Boats', 'military', 'Roblox', '/assets', 0, 0.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('weapon-pack-vol-1', 'Weapon Pack Vol.1', 24.0, false, null, 'builds.jpg', 'Modeled weapon set with viewmodels and sounds.', 'Weapons', 'firearms', 'Roblox', '/assets', 112, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('drift-vehicle-pack', 'Drift Vehicle Pack', 42.0, false, null, 'new-release.jpg', 'Tunable drift cars with working suspension.', 'Vehicles', 'civilian', 'Roblox', '/assets', 88, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('thumbnail-bundle', 'Thumbnail Bundle', 25.0, false, null, 'frostline.jpg', 'High-quality thumbnails and icons for your store.', 'Graphics', 'logos', 'Roblox', '/assets', 150, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('logo-icon-kit', 'Logo & Icon Kit', 20.0, false, null, 'banner.jpg', 'Clean logo and icon templates, fully editable.', 'Graphics', 'logos', 'Roblox', '/assets', 0, 0.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('asset-mega-bundle', 'Asset Mega Bundle', 150.0, true, 199.0, 'premade.jpg', 'Our biggest pack, hundreds of assets in one bundle.', 'Assets', 'asset-packs', 'Roblox', '/assets', 420, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('skyblock-network-hub', 'Skyblock Network Hub', 45.0, true, null, 'minecraft.jpg', 'Polished skyblock hub with portals and shops.', 'Hubs', null, 'Minecraft', '/minecraft', 134, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('fantasy-spawn', 'Fantasy Spawn', 38.0, true, null, 'new-release.jpg', 'Detailed fantasy spawn with custom terrain.', 'Hubs', null, 'Minecraft', '/minecraft', 52, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('minigames-lobby', 'Minigames Lobby', 30.0, false, null, 'builds.jpg', 'Bright minigames lobby with NPC selectors.', 'Lobbies', null, 'Minecraft', '/minecraft', 71, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('practice-pvp-lobby', 'Practice PvP Lobby', 28.0, false, null, 'products.jpg', 'Clean PvP practice lobby with arenas.', 'Lobbies', null, 'Minecraft', '/minecraft', 96, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('survival-world', 'Survival World', 42.0, false, null, 'frostline.jpg', 'Hand-built survival world with custom biomes.', 'Maps', null, 'Minecraft', '/minecraft', 40, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('adventure-map', 'Adventure Map', 36.0, false, null, 'premade.jpg', 'Story-driven adventure map with quests.', 'Maps', null, 'Minecraft', '/minecraft', 0, 0.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('medieval-castle', 'Medieval Castle', 25.0, true, null, 'builds.jpg', 'Fully detailed medieval castle build.', 'Builds', null, 'Minecraft', '/minecraft', 118, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('modern-city-pack', 'Modern City Pack', 60.0, true, 80.0, 'products.jpg', 'Modern city build with skyscrapers and roads.', 'Builds', null, 'Minecraft', '/minecraft', 63, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('custom-enchants', 'Custom Enchants', 20.0, false, null, 'scripts.jpg', 'Configurable custom enchantments plugin.', 'Plugins', null, 'Minecraft', '/minecraft', 205, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('cosmetics-plugin', 'Cosmetics Plugin', 18.0, false, null, 'banner.jpg', 'Particles, pets, and cosmetics for your server.', 'Plugins', null, 'Minecraft', '/minecraft', 58, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('skyblock-full-setup', 'Skyblock Full Setup', 120.0, true, null, 'premade.jpg', 'Complete skyblock server, configured and ready.', 'Full Setups', null, 'Minecraft', '/minecraft', 76, 5.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('prison-full-setup', 'Prison Full Setup', 99.0, false, null, 'cta-bg.jpg', 'Full prison server with ranks, cells, and an economy loop.', 'Full Setups', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('ranger-skin-pack', 'Ranger Skin Pack', 12.0, false, null, 'team-bg.jpg', '12 ranger-themed player skins with matching capes.', 'Skins', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('custom-mob-models', 'Custom Mob Models', 35.0, false, null, 'new-release.jpg', 'Custom-modeled mobs and bosses, rigged and ready to drop in.', 'Models', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('menu-gui-pack', 'Menu GUI Pack', 15.0, false, null, 'scripts.jpg', 'Clean inventory and shop menus for survival and factions servers.', 'Guis', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('spawn-schematic-bundle', 'Spawn Schematic Bundle', 22.0, false, null, 'frostline.jpg', 'Ready-to-paste spawn builds for survival, skyblock, and prison.', 'Schematics', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;
insert into public.products (slug, title, price_usd, resell_available, was_price, image, description, cat, subcat, platform, page, reviews_count, rating) values ('fantasy-texture-pack', 'Fantasy Texture Pack', 26.0, false, null, 'banner.jpg', '32x fantasy resource pack covering blocks, items, and UI.', 'Textures', null, 'Minecraft', '/minecraft', 25, 4.0) on conflict (slug) do nothing;

-- ===== profiles_admin_seed.sql =====
update public.profiles
set is_admin = true
where discord_id in ('1327350011054526505', '1253736765986967622');

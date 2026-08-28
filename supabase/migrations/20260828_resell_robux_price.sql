-- Robux price for the resell licence, working exactly like robux_price does
-- for the standard licence. Null/0 falls back to converting the resell USD
-- price at ROBUX_PER_USD (see _shared/roblox.ts priceRobuxItems).
alter table public.products add column if not exists resell_robux_price numeric;
comment on column public.products.resell_robux_price is
  'Admin-set Robux price for the resell licence, same role as robux_price for the standard licence. Null/0 = fall back to converting the resell USD price.';

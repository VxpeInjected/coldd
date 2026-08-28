-- Withdrawal timestamp - keeps the consent ledger honest (proof of
-- consent AND proof of withdrawal) instead of deleting the row. The
-- marketing send filters on unsubscribed_at is null.
alter table public.marketing_optins add column if not exists unsubscribed_at timestamptz;

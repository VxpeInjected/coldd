alter table public.page_views add column if not exists visitor_id text;
create index if not exists page_views_visitor_id_idx on public.page_views (visitor_id, created_at);
comment on column public.page_views.visitor_id is 'Random client-generated id persisted in localStorage; distinguishes a returning visitor from a new one across sessions. No PII, not tied to any account.';

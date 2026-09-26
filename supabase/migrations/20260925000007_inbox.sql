-- Replio — Inbox qidiruvi (xabar matni bo'yicha) uchun indeks va funksiya

create index if not exists messages_text_trgm_idx
  on public.messages using gin ((lower(content ->> 'text')) extensions.gin_trgm_ops);

-- Ism, username yoki xabar matni bo'yicha mos kontakt id'lari (RLS amal qiladi)
create or replace function public.inbox_search(p_account_id uuid, p_query text, p_limit integer default 200)
returns setof uuid
language sql stable security invoker set search_path = ''
as $$
  select c.id from public.contacts c
  where c.account_id = p_account_id and c.search like '%' || lower(p_query) || '%'
  union
  select distinct m.contact_id from public.messages m
  where m.account_id = p_account_id and lower(m.content ->> 'text') like '%' || lower(p_query) || '%'
  limit p_limit
$$;
grant execute on function public.inbox_search(uuid, text, integer) to authenticated;

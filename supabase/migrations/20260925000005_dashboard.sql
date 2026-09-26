-- Replio — dashboard statistikasi
-- daily_stats oldindan hisoblanadi (pg_cron har 5 daqiqada), dashboard runtime'da og'ir COUNT qilmaydi.

create or replace function public.refresh_daily_stats(p_days integer default 2)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_from date := (now() at time zone 'UTC')::date - greatest(p_days - 1, 0);
begin
  insert into public.daily_stats (account_id, date, new_contacts, unsubscribed, messages_in, messages_out, clicks)
  select a.id, d.date,
    coalesce(nc.n, 0), coalesce(un.n, 0), coalesce(mi.n, 0), coalesce(mo.n, 0), 0
  from public.accounts a
  cross join generate_series(v_from, (now() at time zone 'UTC')::date, interval '1 day') as d(date)
  left join lateral (
    select count(*)::int n from public.contacts c
    where c.account_id = a.id and c.subscribed_at >= d.date and c.subscribed_at < d.date + 1
  ) nc on true
  left join lateral (
    select count(*)::int n from public.contacts c
    where c.account_id = a.id and not c.is_subscribed
      and c.last_interaction_at >= d.date and c.last_interaction_at < d.date + 1
  ) un on true
  left join lateral (
    select count(*)::int n from public.messages m
    where m.account_id = a.id and m.direction = 'in' and m.created_at >= d.date and m.created_at < d.date + 1
  ) mi on true
  left join lateral (
    select count(*)::int n from public.messages m
    where m.account_id = a.id and m.direction in ('out_bot', 'out_agent')
      and m.created_at >= d.date and m.created_at < d.date + 1
  ) mo on true
  on conflict (account_id, date) do update set
    new_contacts = excluded.new_contacts,
    unsubscribed = excluded.unsubscribed,
    messages_in = excluded.messages_in,
    messages_out = excluded.messages_out;
end $$;
revoke execute on function public.refresh_daily_stats(integer) from public, anon, authenticated;

-- Dashboard uchun bitta so'rov (RLS amal qiladi — security invoker)
create or replace function public.dashboard_stats(p_account_id uuid, p_days integer default 30)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with days as (
    select generate_series((now() at time zone 'UTC')::date - (p_days - 1), (now() at time zone 'UTC')::date, interval '1 day')::date as date
  ),
  series as (
    select d.date, coalesce(s.new_contacts, 0) as new_contacts, coalesce(s.unsubscribed, 0) as unsubscribed,
           coalesce(s.messages_out, 0) as messages_out
    from days d
    left join public.daily_stats s on s.account_id = p_account_id and s.date = d.date
  ),
  last_bc as (
    select jsonb_build_object('id', b.id, 'name', b.name, 'sent_at', b.sent_at, 'stats', b.stats) j
    from public.broadcasts b
    where b.account_id = p_account_id and b.status = 'sent'
    order by b.sent_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'series', coalesce((select jsonb_agg(jsonb_build_object('date', date, 'new_contacts', new_contacts, 'unsubscribed', unsubscribed) order by date) from series), '[]'::jsonb),
    'totals', jsonb_build_object(
      'contacts', (select count(*) from public.contacts c where c.account_id = p_account_id and c.is_subscribed),
      'new_contacts', (select coalesce(sum(new_contacts), 0) from series),
      'messages_out', (select coalesce(sum(messages_out), 0) from series),
      'active_automations', (select count(*) from public.flows f where f.account_id = p_account_id and f.status = 'live' and f.deleted_at is null)
    ),
    'checklist', jsonb_build_object(
      'bot', exists (select 1 from public.bots b where b.account_id = p_account_id),
      'automation', exists (select 1 from public.flows f where f.account_id = p_account_id and not f.is_basic and f.deleted_at is null),
      'welcome', exists (select 1 from public.flows f where f.account_id = p_account_id and f.basic_kind = 'welcome' and f.status = 'live'),
      'broadcast', exists (select 1 from public.broadcasts b where b.account_id = p_account_id and b.status in ('sent', 'sending', 'scheduled'))
    ),
    'last_broadcast', (select j from last_bc)
  )
$$;
grant execute on function public.dashboard_stats(uuid, integer) to authenticated;

-- pg_cron (Supabase'da mavjud): har 5 daqiqada daily_stats yangilanadi
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('replio-daily-stats', '*/5 * * * *', 'select public.refresh_daily_stats(2)');
  end if;
end $$;

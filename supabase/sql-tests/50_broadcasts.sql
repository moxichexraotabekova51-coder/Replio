-- 5-faza: broadcast, operator xabari, growth tools, avtomatik yopish
\set QUIET on
\o /dev/null
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'bc@test.uz');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
set role authenticated;
select public.create_account('Broadcast') as acc \gset
select public.create_broadcast(:'acc', 'Aksiya') as bid \gset
select flow_id as bflow from public.broadcasts where id = :'bid' \gset
select pg_temp.assert((select basic_kind = 'broadcast' and is_basic from public.flows where id = :'bflow'), 'broadcast flow hidden');
-- kompilyatsiyasiz yuborib bo'lmaydi
do $$ begin
  perform public.start_broadcast((select id from public.broadcasts limit 1));
  raise exception 'should fail';
exception when others then
  if sqlerrm not in ('not_compiled') then raise; end if;
end $$;
select public.publish_flow(:'bflow', '{"nodes":[],"edges":[]}'::jsonb, '{"v":2,"start":"m1","steps":{}}'::jsonb);
reset role;

insert into public.bots (id, account_id, tg_bot_id, username, token_encrypted, webhook_secret)
values ('00000000-0000-0000-0000-0000000000f2', :'acc', 779, 'bc_bot', 'enc', 's');
insert into public.tags (account_id, name) values (:'acc', 'vip') returning id as vip \gset
-- 1000 obunachi, 10 tasi bloklagan, 5 tasi limitdan oshgan
insert into public.contacts (account_id, bot_id, tg_user_id, first_name, is_subscribed, over_limit)
select :'acc', '00000000-0000-0000-0000-0000000000f2', 700000 + g, 'U' || g, g > 10, g between 11 and 15
from generate_series(1, 1015) g;
insert into public.contact_tags (contact_id, tag_id) select id, :'vip' from public.contacts where account_id = :'acc' and tg_user_id < 700100;

set role authenticated;
select pg_temp.assert(public.broadcast_audience_count(:'acc', '{"type":"all"}') = 1000, 'audience all = 1000');
select pg_temp.assert(public.broadcast_audience_count(:'acc', jsonb_build_object('type', 'filter', 'filter', jsonb_build_object('op', 'and', 'rules', jsonb_build_array(jsonb_build_object('kind', 'tag', 'tag_id', :'vip'))))) = 84, 'audience filter');
-- rejalashtirish va bekor qilish
select public.start_broadcast(:'bid', now() + interval '1 hour');
select pg_temp.assert((select status = 'scheduled' from public.broadcasts where id = :'bid'), 'scheduled');
select public.cancel_broadcast(:'bid');
select pg_temp.assert((select status = 'draft' from public.broadcasts where id = :'bid'), 'cancelled → draft');
select pg_temp.assert(not exists (select 1 from public.scheduled_jobs where payload ->> 'broadcast_id' = :'bid'), 'job removed');
select public.start_broadcast(:'bid');
select pg_temp.assert((select status = 'sending' from public.broadcasts where id = :'bid'), 'sending');
reset role;

-- worker: job olinadi, partiyalar 25 tadan
select public.claim_work(10) as w \gset
select pg_temp.assert((:'w'::jsonb -> 'jobs' -> 0 ->> 'type') = 'broadcast', 'broadcast job claimed');
select public.broadcast_batch(:'bid', 25) as b1 \gset
select pg_temp.assert(jsonb_array_length(:'b1'::jsonb -> 'contacts') = 25, 'batch of 25');
select pg_temp.assert((select (stats ->> 'total')::int = 1000 from public.broadcasts where id = :'bid'), 'total 1000');
-- 24 yetkazildi, 1 bloklagan
select public.broadcast_report(:'bid',
  (select array_agg(x::uuid) from jsonb_array_elements_text(:'b1'::jsonb -> 'contacts') with ordinality t(x, n) where n > 1),
  jsonb_build_array(jsonb_build_object('contact_id', :'b1'::jsonb -> 'contacts' ->> 0, 'error', '403 blocked', 'blocked', true)));
select pg_temp.assert((select stats ->> 'delivered' = '24' and stats ->> 'failed' = '1' and stats ->> 'sent' = '25' from public.broadcasts where id = :'bid'), 'stats');
select pg_temp.assert((select not is_subscribed from public.contacts where id = (:'b1'::jsonb -> 'contacts' ->> 0)::uuid), 'blocked → unsubscribed');
-- qolganlari
do $$
declare b jsonb; id uuid := (select id from public.broadcasts where name = 'Aksiya');
begin
  loop
    b := public.broadcast_batch(id, 100);
    exit when (b ->> 'done')::boolean;
    perform public.broadcast_report(id, (select array_agg(x::uuid) from jsonb_array_elements_text(b -> 'contacts') x), '[]');
  end loop;
end $$;
select pg_temp.assert((select status = 'sent' and (stats ->> 'delivered')::int = 999 and (stats ->> 'sent')::int = 1000 from public.broadcasts where id = :'bid'), 'all sent');
select pg_temp.assert((select count(*) = 1000 from public.broadcast_recipients where broadcast_id = :'bid' and status in (2, 3)), 'recipients final');

-- Uzilib qolgan partiya → interrupted
select public.create_broadcast(:'acc', 'Ikkinchi') as bid2 \gset
update public.flows set compiled = '{"v":2,"start":"m1","steps":{}}', status = 'live' where id = (select flow_id from public.broadcasts where id = :'bid2');
update public.broadcasts set status = 'sending', audience = '{"type":"all"}' where id = :'bid2';
select public.broadcast_batch(:'bid2', 2000);
select pg_temp.assert((public.broadcast_batch(:'bid2', 10) ->> 'done')::boolean, 'done after lost batch');
select pg_temp.assert((select (stats ->> 'failed')::int = 999 from public.broadcasts where id = :'bid2'), 'lost counted as failed');

-- Broadcast o'chirilsa — flow ham
delete from public.broadcasts where id = :'bid2';
select pg_temp.assert((select count(*) from public.flows where basic_kind = 'broadcast' and account_id = :'acc') = 1, 'flow cleaned');

-- Operator xabari: tarix, holat, pauza (standart 30 daqiqa)
select id as cid from public.contacts where account_id = :'acc' and is_subscribed limit 1 \gset
select public.record_agent_message(:'cid', '00000000-0000-0000-0000-0000000000f1', 'out_agent', 'text', '{"text":"Salom!"}', 555);
select pg_temp.assert((select last_message_preview = 'Salom!' and live_chat_status = 'open' and automation_paused_until > now() + interval '29 minutes' from public.contacts where id = :'cid'), 'agent message state');
select public.record_agent_message(:'cid', '00000000-0000-0000-0000-0000000000f1', 'note', 'text', '{"text":"ichki"}', null);
select pg_temp.assert((select count(*) = 2 from public.messages where contact_id = :'cid'), 'note stored');
select pg_temp.assert((select last_message_preview = 'Salom!' from public.contacts where id = :'cid'), 'note does not change preview');

-- Avtomatik yopish
update public.accounts set settings = jsonb_set(settings, '{inbox}', '{"auto_close_minutes":60}') where id = :'acc';
update public.contacts set last_message_at = now() - interval '2 hours' where id = :'cid';
select pg_temp.assert(public.auto_close_chats() >= 1, 'auto closed');
select pg_temp.assert((select live_chat_status = 'closed' from public.contacts where id = :'cid'), 'closed');

-- Growth tools
insert into public.growth_tools (account_id, type, name, ref_code, flow_id) values (:'acc', 'ref_url', 'Instagram bio', 'insta', :'bflow') returning id as gid \gset
select pg_temp.assert(public.growth_start('00000000-0000-0000-0000-0000000000f2', :'cid', 'insta', true) ->> 'flow_id' = :'bflow', 'growth flow');
select public.growth_start('00000000-0000-0000-0000-0000000000f2', :'cid', 'insta', false);
select pg_temp.assert((select stats ->> 'clicks' = '2' and stats ->> 'subscribers' = '1' from public.growth_tools where id = :'gid'), 'growth stats');
select pg_temp.assert((select source = 'insta' from public.contacts where id = :'cid'), 'contact source');
select pg_temp.assert(public.growth_start('00000000-0000-0000-0000-0000000000f2', :'cid', 'yoq', true) is null, 'unknown code');
insert into public.growth_tools (account_id, type, name, ref_code) values (:'acc', 'widget', 'Sayt', 'site') returning id as wid \gset
select pg_temp.assert(public.growth_view(:'wid') ->> 'bot' = 'bc_bot', 'widget view returns bot');
select pg_temp.assert((select stats ->> 'views' = '1' from public.growth_tools where id = :'wid'), 'widget views');

\o
\echo '  Broadcast/Live Chat testlari o''tdi'

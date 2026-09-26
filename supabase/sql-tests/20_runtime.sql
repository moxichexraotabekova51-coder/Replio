-- handle_update / log_update / publish_flow testlari
\set QUIET on
\o /dev/null
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'rt@test.uz');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
select public.create_account('Runtime') as acc \gset
select public.create_flow(:'acc', (select id from public.templates where name = 'Kalit so''zga javob')) as flow \gset
select public.publish_flow(:'flow', '{"nodes":[],"edges":[]}'::jsonb, '{"v":1,"start":"m1","steps":{}}'::jsonb) as ver \gset
select pg_temp.assert(:ver = 1, 'publish version 1');
select pg_temp.assert((select status from public.flows where id = :'flow') = 'live', 'flow is live');
reset role;

insert into public.bots (id, account_id, tg_bot_id, username, token_encrypted, webhook_secret)
values ('00000000-0000-0000-0000-0000000000b1', :'acc', 777, 'test_bot', 'enc', 'sekret');

-- noto'g'ri secret
select pg_temp.assert((public.handle_update('00000000-0000-0000-0000-0000000000b1', 'xato', '{"id":1}'::jsonb) ->> 'ok')::boolean = false, 'bad secret rejected');
select pg_temp.assert((select count(*) from public.contacts where account_id = :'acc') = 0, 'no contact on bad secret');

-- birinchi xabar: yangi kontakt, triggerlar qaytadi
select public.handle_update('00000000-0000-0000-0000-0000000000b1', 'sekret', '{"id":5001,"first_name":"Ali","username":"ali"}'::jsonb, -1) as r1 \gset
select pg_temp.assert((:'r1'::jsonb -> 'contact' ->> 'is_new')::boolean, 'new contact');
select pg_temp.assert(jsonb_array_length(:'r1'::jsonb -> 'triggers') = 1, 'one live trigger');
select pg_temp.assert(:'r1'::jsonb -> 'flows' ? :'flow', 'compiled flow returned');
select (:'r1'::jsonb ->> 'version')::int as v \gset

-- ikkinchi xabar: eski kontakt, kesh versiyasi mos — triggerlar qaytmaydi
select public.handle_update('00000000-0000-0000-0000-0000000000b1', 'sekret', '{"id":5001,"first_name":"Ali"}'::jsonb, :v) as r2 \gset
select pg_temp.assert(not (:'r2'::jsonb -> 'contact' ->> 'is_new')::boolean, 'existing contact');
select pg_temp.assert(not (:'r2'::jsonb ? 'triggers'), 'cache hit: no triggers');

-- trigger o'zgarsa versiya oshadi
update public.triggers set is_active = false where flow_id = :'flow';
select pg_temp.assert((select flows_version from public.accounts where id = :'acc') > :v, 'version bumped');

-- log_update
select public.log_update(jsonb_build_object(
  'account_id', :'acc', 'contact_id', :'r1'::jsonb -> 'contact' ->> 'id', 'bot_id', '00000000-0000-0000-0000-0000000000b1',
  'messages', jsonb_build_array(jsonb_build_object('direction','in','content',jsonb_build_object('text','narx')),
                                jsonb_build_object('direction','out_bot','content',jsonb_build_object('text','javob'),'flow_id',:'flow','step_id','m1')),
  'preview', 'narx', 'inbound', true, 'flow_id', :'flow', 'steps', jsonb_build_array('m1'),
  'received_at', now() - interval '300 ms', 'sent_at', now()));
select pg_temp.assert((select count(*) from public.messages where account_id = :'acc') = 2, 'messages logged');
select pg_temp.assert((select is_unread and live_chat_status = 'open' from public.contacts where tg_user_id = 5001), 'contact unread/open');
select pg_temp.assert((select runs from public.flows where id = :'flow') = 1, 'flow runs');
select pg_temp.assert((select ms between 250 and 400 from public.latency_logs limit 1), 'latency ms');
-- contact_apply: teg, field, holat, notify, schedule
insert into public.tags (account_id, name) values (:'acc', 'lead') returning id as lead \gset
insert into public.custom_fields (account_id, name, type) values (:'acc', 'tel', 'text') returning id as tel \gset
select id as cid from public.contacts where tg_user_id = 5001 \gset
select public.contact_apply(:'cid', jsonb_build_array(
  jsonb_build_object('a','add_tag','tag_id',:'lead'),
  jsonb_build_object('a','set_field','field_id',:'tel','value','+998901234567'),
  jsonb_build_object('a','schedule','run_at', now() + interval '1 hour', 'payload', jsonb_build_object('flow_id', :'flow', 'step', 'm2')),
  jsonb_build_object('a','open_chat')), '{"input":{"step":"m1"}}'::jsonb) as ap \gset
select pg_temp.assert(:'ap'::jsonb -> 'tags' ? :'lead', 'tag applied');
select pg_temp.assert(:'ap'::jsonb -> 'fields' ->> 'tel' = '+998901234567', 'field set');
select pg_temp.assert(:'ap'::jsonb -> 'state' -> 'input' ->> 'step' = 'm1', 'state set');
select pg_temp.assert((select count(*) from public.scheduled_jobs where account_id = :'acc') = 1, 'job scheduled');
-- Pro tekshiruvi: Start tarifida Data Collection publish qilinmaydi
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
set role authenticated;
do $$ begin
  perform public.publish_flow((select id from public.flows where name = 'Kalit so''zga javob' limit 1), '{}'::jsonb,
    '{"v":2,"start":"m1","steps":{"m1":{"t":"message","next":null,"blocks":[{"t":"input","kind":"text","text":"?"}]}}}'::jsonb);
  raise exception 'should not reach';
exception when others then
  if sqlerrm not like 'upgrade_required%' then raise; end if;
end $$;
reset role;
\echo '  Runtime testlari o''tdi'

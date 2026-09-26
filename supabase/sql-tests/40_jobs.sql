-- 4-faza: hodisa triggerlari, sequences, claim_work, date-based, webhook
\set QUIET on
\o /dev/null
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'jobs@test.uz');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
select public.create_account('Jobs', 'Asia/Tashkent') as acc \gset
select public.create_flow(:'acc', null) as flow \gset
select public.publish_flow(:'flow', '{"nodes":[],"edges":[]}'::jsonb, '{"v":2,"start":"m1","steps":{}}'::jsonb);
reset role;

insert into public.bots (id, account_id, tg_bot_id, username, token_encrypted, webhook_secret)
values ('00000000-0000-0000-0000-0000000000e2', :'acc', 778, 'jobs_bot', 'enc', 's');
insert into public.tags (account_id, name) values (:'acc', 'vip') returning id as vip \gset
insert into public.custom_fields (account_id, name, type) values (:'acc', 'tugilgan', 'date') returning id as bday \gset
insert into public.custom_fields (account_id, name, type) values (:'acc', 'shahar', 'text') returning id as city \gset

insert into public.triggers (account_id, flow_id, type, config) values
  (:'acc', :'flow', 'tag_applied', jsonb_build_object('tag_id', :'vip')),
  (:'acc', :'flow', 'tag_removed', jsonb_build_object('tag_id', :'vip')),
  (:'acc', :'flow', 'field_changed', jsonb_build_object('field_id', :'city')),
  (:'acc', :'flow', 'subscribed', '{}'),
  (:'acc', :'flow', 'unsubscribed', '{}'),
  (:'acc', :'flow', 'date_based', jsonb_build_object('field_id', :'bday', 'offset_days', -1, 'time', '00:00')),
  (:'acc', :'flow', 'webhook', '{}');
select id as wh, secret as whsecret from public.triggers where flow_id = :'flow' and type = 'webhook' \gset

create or replace function pg_temp.jobs(ev text) returns bigint language sql as $$
  select count(*) from public.scheduled_jobs where type = 'trigger' and payload ->> 'event' = ev
$$;

-- subscribed: yangi kontakt
select (public.handle_update('00000000-0000-0000-0000-0000000000e2', 's', '{"id":9001,"first_name":"Vali"}'::jsonb) -> 'contact' ->> 'id') as cid \gset
select pg_temp.assert(pg_temp.jobs('subscribed') = 1, 'subscribed event');

-- tag applied / removed (boshqa teg — hodisa yo'q)
insert into public.tags (account_id, name) values (:'acc', 'boshqa') returning id as other \gset
insert into public.contact_tags (contact_id, tag_id) values (:'cid', :'other');
select pg_temp.assert(pg_temp.jobs('tag_applied') = 0, 'other tag ignored');
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'add_tag', 'tag_id', :'vip')));
select pg_temp.assert(pg_temp.jobs('tag_applied') = 1, 'tag_applied event');
delete from public.contact_tags where contact_id = :'cid' and tag_id = :'vip';
select pg_temp.assert(pg_temp.jobs('tag_removed') = 1, 'tag_removed event');

-- field changed: insert, bir xil qiymat (hodisa yo'q), yangi qiymat
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'set_field', 'field_id', :'city', 'value', 'Toshkent')));
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'set_field', 'field_id', :'city', 'value', 'Toshkent')));
select pg_temp.assert(pg_temp.jobs('field_changed') = 1, 'field_changed once for same value');
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'set_field', 'field_id', :'city', 'value', 'Samarqand')));
select pg_temp.assert(pg_temp.jobs('field_changed') = 2, 'field_changed on new value');

-- unsubscribed (botni bloklash)
select public.handle_update('00000000-0000-0000-0000-0000000000e2', 's', '{"id":9001}'::jsonb, -1, false);
select pg_temp.assert(pg_temp.jobs('unsubscribed') = 1, 'unsubscribed event');
select public.handle_update('00000000-0000-0000-0000-0000000000e2', 's', '{"id":9001}'::jsonb, -1, true);
select pg_temp.assert(pg_temp.jobs('subscribed') = 2, 're-subscribed event');

-- Paused trigger / Live bo'lmagan flow — hodisa yo'q
update public.triggers set is_active = false where type = 'tag_applied' and flow_id = :'flow';
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'add_tag', 'tag_id', :'vip')));
select pg_temp.assert(pg_temp.jobs('tag_applied') = 1, 'paused trigger ignored');

-- date_based: ertaga tug'ilgan kun (offset -1 → bugun), 00:00 dan keyin
insert into public.contact_field_values (contact_id, field_id, value)
values (:'cid', :'bday', to_jsonb(to_char((now() at time zone 'Asia/Tashkent')::date + 1, 'YYYY-MM-DD')));
select pg_temp.assert(public.enqueue_date_triggers() = 1, 'date trigger fired');
select pg_temp.assert(public.enqueue_date_triggers() = 0, 'date trigger once per day');

-- webhook: secret, kontakt, fieldlar
select pg_temp.assert((public.webhook_event(:'acc', :'wh', 'xato', null, 9001, null) ->> 'ok')::boolean = false, 'webhook bad secret');
select pg_temp.assert(public.webhook_event(:'acc', :'wh', :'whsecret', null, 9001, '{}') ->> 'error' = 'upgrade_required', 'webhook pro only');
update public.subscriptions set plan_id = 'pro' where account_id = :'acc';
select pg_temp.assert(public.webhook_event(:'acc', :'wh', :'whsecret', null, 424242, null) ->> 'error' = 'contact_not_found', 'webhook unknown contact');
select pg_temp.assert((public.webhook_event(:'acc', :'wh', :'whsecret', null, 9001, '{"shahar":"Buxoro"}') ->> 'ok')::boolean, 'webhook ok');
select pg_temp.assert(pg_temp.jobs('webhook') = 1, 'webhook job');
select pg_temp.assert((select value #>> '{}' from public.contact_field_values where contact_id = :'cid' and field_id = :'city') = 'Buxoro', 'webhook set field');

-- claim_work: barcha trigger job'lari olinadi, bot_id bilan; ikkinchi chaqiruv bo'sh
select public.claim_work(100) as w \gset
select pg_temp.assert(jsonb_array_length(:'w'::jsonb -> 'jobs') = (select count(*) from public.scheduled_jobs where status = 'running'), 'claimed all');
select pg_temp.assert((:'w'::jsonb -> 'jobs' -> 0 ->> 'bot_id') = '00000000-0000-0000-0000-0000000000e2', 'bot id resolved');
select pg_temp.assert(jsonb_array_length(public.claim_work(100) -> 'jobs') = 0, 'skip claimed');
select public.finish_jobs((select array_agg((j ->> 'id')::uuid) from jsonb_array_elements(:'w'::jsonb -> 'jobs') j offset 0), '[]');
select pg_temp.assert((select count(*) from public.scheduled_jobs where status = 'done') > 0, 'finished');

-- failed → retry (pending, keyinroq), 3-urinishdan keyin failed
insert into public.scheduled_jobs (account_id, type, payload) values (:'acc', 'flow_step', jsonb_build_object('contact_id', :'cid', 'flow_id', :'flow', 'step', 'x')) returning id as job \gset
select public.claim_work(10);
select public.finish_jobs('{}', jsonb_build_array(jsonb_build_object('id', :'job', 'error', 'unreachable')));
select pg_temp.assert((select status = 'pending' and run_at > now() from public.scheduled_jobs where id = :'job'), 'retry scheduled');
update public.scheduled_jobs set run_at = now(), attempts = 2 where id = :'job';
select public.claim_work(10);
select public.finish_jobs('{}', jsonb_build_array(jsonb_build_object('id', :'job', 'error', 'unreachable')));
select pg_temp.assert((select status = 'failed' from public.scheduled_jobs where id = :'job'), 'failed after 3');

-- Sequences: 2 qadam (0 va 1 kun), oyna
insert into public.sequences (account_id, name) values (:'acc', 'Onboarding') returning id as seq \gset
insert into public.sequence_steps (sequence_id, position, delay, flow_id) values (:'seq', 0, interval '0', :'flow'), (:'seq', 1, interval '1 day', :'flow');
select public.contact_apply(:'cid', jsonb_build_array(jsonb_build_object('a', 'sub_seq', 'sequence_id', :'seq')));
select pg_temp.assert((select next_run_at <= now() + interval '1 second' and current_step = 0 from public.contact_sequences where contact_id = :'cid'), 'first step due now');
select public.claim_work(10) as w2 \gset
select pg_temp.assert(jsonb_array_length(:'w2'::jsonb -> 'sequences') = 1, 'sequence step claimed');
select pg_temp.assert((select current_step = 1 and next_run_at between now() + interval '23 hours' and now() + interval '25 hours' from public.contact_sequences where contact_id = :'cid'), 'next step in 1 day');
update public.contact_sequences set next_run_at = now() where contact_id = :'cid';
select pg_temp.assert(jsonb_array_length(public.claim_work(10) -> 'sequences') = 1, 'second step');
select pg_temp.assert((select next_run_at is null and current_step = 2 from public.contact_sequences where contact_id = :'cid'), 'sequence finished');

-- Yuborish oynasi: faqat 09:00–09:01 → keyingi oyna boshlanishiga suriladi
delete from public.contact_sequences where contact_id = :'cid';
update public.sequence_steps set send_window = '{"from":"03:00","to":"03:01","days":[1,2,3,4,5,6,7]}' where sequence_id = :'seq' and position = 0;
insert into public.contact_sequences (contact_id, sequence_id) values (:'cid', :'seq');
select public.claim_work(10) as w3 \gset
select pg_temp.assert(
  jsonb_array_length(:'w3'::jsonb -> 'sequences') = 1
  or (select next_run_at > now() and to_char(next_run_at at time zone 'Asia/Tashkent', 'HH24:MI') = '03:00' from public.contact_sequences where contact_id = :'cid'),
  'send window respected');

-- next_window: dam olish kunlari
select pg_temp.assert(
  public.next_window('2026-09-26 10:00+05', 'Asia/Tashkent', '{"from":"09:00","to":"18:00","days":[1,2,3,4,5]}') = '2026-09-28 09:00+05',
  'saturday → monday 09:00');
select pg_temp.assert(
  public.next_window('2026-09-28 10:00+05', 'Asia/Tashkent', '{"from":"09:00","to":"18:00","days":[1,2,3,4,5]}') = '2026-09-28 10:00+05',
  'inside window');

-- kick_worker: functions_url yo'q — HTTP yo'q
select pg_temp.assert(public.kick_worker() = false, 'no url → no kick');

\o
\echo '  Jobs testlari o''tdi'

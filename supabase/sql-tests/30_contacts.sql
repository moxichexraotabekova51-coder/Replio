-- Contacts: filtr, sahifalash, ommaviy amallar; 50 000 kontaktda tezlik
\set QUIET on
\o /dev/null
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1', 'ct@test.uz');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
set role authenticated;
select public.create_account('Contacts') as acc \gset
insert into public.tags (account_id, name) values (:'acc', 'vip') returning id as vip \gset
insert into public.custom_fields (account_id, name, type) values (:'acc', 'yosh', 'number') returning id as yosh \gset
reset role;

insert into public.contacts (account_id, tg_user_id, first_name, username, subscribed_at, is_subscribed)
select :'acc', g, 'User' || g, 'user' || g, now() - (g || ' minutes')::interval, g % 10 <> 0
from generate_series(1, 50000) g;
insert into public.contact_tags (contact_id, tag_id) select id, :'vip' from public.contacts where account_id = :'acc' and tg_user_id % 7 = 0;
insert into public.contact_field_values (contact_id, field_id, value) select id, :'yosh', to_jsonb(tg_user_id % 60) from public.contacts where account_id = :'acc' and tg_user_id <= 1000;
analyze public.contacts; analyze public.contact_tags;

set role authenticated;
select pg_temp.assert(public.contacts_count(:'acc') = 50000, 'count all');
select pg_temp.assert(public.contacts_count(:'acc', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','tag','tag_id',:'vip')))) = 7142, 'tag filter');
select pg_temp.assert(public.contacts_count(:'acc', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','tag','tag_id',:'vip','neg',true)))) = 42858, 'not tag');
select pg_temp.assert(public.contacts_count(:'acc', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','field','field_id',:'yosh','cmp','gt','value',50)))) = 144, 'field gt');
select pg_temp.assert(public.contacts_count(:'acc', jsonb_build_object('op','or','rules', jsonb_build_array(
  jsonb_build_object('kind','system','field','is_subscribed','cmp','eq','value','false'),
  jsonb_build_object('kind','tag','tag_id',:'vip')))) = 5000 + 7142 - 714, 'OR filter');
select pg_temp.assert(public.contacts_count(:'acc', '{}'::jsonb, 'user4999') = 11, 'search');
-- SQL injection urinishi xavfsiz
select pg_temp.assert(public.contacts_count(:'acc', jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','system','field','first_name','cmp','eq','value','x''); drop table public.contacts; --')))) = 0, 'injection safe');

-- Sahifalash (keyset)
select array_agg(id) as p1 from public.contacts_page(:'acc', '{}'::jsonb, null, null, null, 50) \gset
select pg_temp.assert(array_length(:'p1'::uuid[], 1) = 50, 'page size');
select subscribed_at as last_at, id as last_id from public.contacts_page(:'acc', '{}'::jsonb, null, null, null, 50) offset 49 limit 1 \gset
select pg_temp.assert(not exists (select 1 from public.contacts_page(:'acc', '{}'::jsonb, null, :'last_at', :'last_id', 50) p where p.id = any(:'p1'::uuid[])), 'no overlap');

-- Tezlik: filtr + qidiruv < 500 ms
do $$
declare t0 timestamptz; ms numeric; acc uuid := (select id from public.accounts where name = 'Contacts');
  vip uuid := (select id from public.tags where name = 'vip' and account_id = (select id from public.accounts where name = 'Contacts'));
begin
  t0 := clock_timestamp();
  perform * from public.contacts_page(acc, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','tag','tag_id',vip))), 'user1', null, null, 50);
  perform public.contacts_count(acc, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','tag','tag_id',vip))), 'user1');
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice 'contacts filter+search+count on 50k: % ms', round(ms);
  if ms > 500 then raise exception 'too slow: % ms', ms; end if;
end $$;

-- Ommaviy amallar
select pg_temp.assert(public.contacts_bulk(:'acc', null, jsonb_build_object('rules', jsonb_build_array(jsonb_build_object('kind','tag','tag_id',:'vip'))), null, 'set_field', jsonb_build_object('field_id', :'yosh', 'value', 99)) = 7142, 'bulk set by filter');
select pg_temp.assert((select count(*) from public.contact_field_values where field_id = :'yosh' and value = '99'::jsonb) = 7142, 'values set');
select pg_temp.assert(public.contacts_bulk(:'acc', :'p1'::uuid[], null, null, 'delete', '{}'::jsonb) = 50, 'bulk delete');
select pg_temp.assert(public.contacts_count(:'acc') = 49950, 'deleted');
reset role;
\o
\echo '  Contacts testlari o''tdi'

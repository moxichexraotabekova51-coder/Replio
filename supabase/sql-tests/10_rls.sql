-- RLS testlari: A foydalanuvchi B akkauntini ko'rmasligi, rollar cheklovlari.
\set QUIET on
\o /dev/null
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.uz', '{"full_name":"Ali"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.uz', '{}');

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

-- Profil trigger orqali yaratildi
select pg_temp.assert((select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Ali', 'profile created');

-- A akkaunt yaratadi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_account('Ali do''koni') as acc_a \gset
select pg_temp.assert((select count(*) from public.accounts) = 1, 'A sees own account');
select pg_temp.assert((select status from public.subscriptions where account_id = :'acc_a') = 'trialing', 'trial subscription');
select pg_temp.assert((select count(*) from public.inbox_labels where account_id = :'acc_a') = 1, 'Favorites label');
select public.create_flow(:'acc_a') as flow_a \gset
select pg_temp.assert((select count(*) from public.flows) = 1, 'A sees own flow');
select id as tpl from public.templates order by sort_order limit 1 \gset
select public.create_flow(:'acc_a', :'tpl') as flow_t \gset
select pg_temp.assert((select count(*) from public.triggers where flow_id = :'flow_t') = 1, 'template triggers copied');
select public.duplicate_flow(:'flow_t') as flow_d \gset
select pg_temp.assert((select count(*) from public.triggers where flow_id = :'flow_d') = 1, 'duplicate copies triggers');
insert into public.folders (account_id, name) values (:'acc_a', 'Papka');
reset role;

-- B hech narsa ko'rmaydi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.accounts) = 0, 'B cannot see A account');
select pg_temp.assert((select count(*) from public.flows) = 0, 'B cannot see A flows');
select pg_temp.assert((select count(*) from public.folders) = 0, 'B cannot see A folders');
select pg_temp.assert((select count(*) from public.plans) = 2, 'plans public');
do $$ begin
  insert into public.flows (account_id, name) values ((select id from public.accounts limit 1), 'hack');
  raise exception 'should not reach';
exception when others then
  if sqlerrm = 'should not reach' then raise; end if;
end $$;
reset role;

-- A B'ni agent sifatida qo'shadi
insert into public.account_members (account_id, user_id, role) values (:'acc_a', '00000000-0000-0000-0000-00000000000b', 'agent');
insert into public.contacts (account_id, tg_user_id, first_name) values (:'acc_a', 111, 'Vali');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.assert((select count(*) from public.accounts) = 1, 'agent sees account');
select pg_temp.assert((select count(*) from public.contacts) = 1, 'agent sees contacts');
select pg_temp.assert((select count(*) from public.folders) = 0, 'agent does not see folders');
select pg_temp.assert((select count(*) from public.flows) = 0, 'agent sees no draft flows');
update public.contacts set live_chat_status = 'open';
select pg_temp.assert((select live_chat_status from public.contacts limit 1) = 'open', 'agent updates contact');
-- agent akkaunt nomini o'zgartira olmaydi
update public.accounts set name = 'x';
select pg_temp.assert((select name from public.accounts limit 1) <> 'x', 'agent cannot rename account');
-- bot tokeni ko'rinmaydi
do $$ begin
  perform token_encrypted from public.bots;
  raise exception 'should not reach';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Owner'ni o'chirib bo'lmaydi
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.account_members where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.assert((select count(*) from public.account_members where user_id = '00000000-0000-0000-0000-00000000000a') = 1, 'owner not removable');
reset role;

\echo '  RLS testlari o''tdi'

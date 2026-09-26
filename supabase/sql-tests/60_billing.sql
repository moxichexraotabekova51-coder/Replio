-- 6-faza: limitlar, obuna holatlari, eslatmalar, to'lov faollashtirish
\set QUIET on
\o /dev/null
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERT FAILED: %', msg; end if;
end $$;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a9', 'billing@test.uz');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a9', false);
set role authenticated;
select public.create_account('Billing') as acc \gset
reset role;

-- Start tarifi: 250 kontakt limiti; 260 kontakt → 10 tasi over_limit
insert into public.contacts (account_id, tg_user_id, first_name, subscribed_at)
select :'acc', 810000 + g, 'C' || g, now() - make_interval(mins => 1000 - g) from generate_series(1, 260) g;
select pg_temp.assert(public.recompute_contact_limit(:'acc') = 10, 'recompute marks 10');
select pg_temp.assert((select count(*) from public.contacts where account_id = :'acc' and over_limit) = 10, '10 over limit');
select pg_temp.assert((select bool_and(over_limit) from public.contacts where account_id = :'acc' and tg_user_id > 810250), 'newest are over limit');

-- 5 ta eski kontakt o'chirildi → 5 tasi limitga qaytadi
delete from public.contacts where account_id = :'acc' and tg_user_id <= 810005;
select pg_temp.assert((select count(*) from public.contacts where account_id = :'acc' and over_limit) = 5, 'delete frees slots');

-- Pro to'lov → limit 2500, hammasi faol
insert into public.payments (account_id, plan_id, billing_period, amount, status) values (:'acc', 'pro', 'monthly', 179000, 'pending') returning id as pay \gset
select pg_temp.assert(public.activate_payment(:'pay'), 'activated');
select pg_temp.assert(not public.activate_payment(:'pay'), 'idempotent');
select pg_temp.assert((select count(*) from public.contacts where account_id = :'acc' and over_limit) = 0, 'pro frees all');
select pg_temp.assert((select plan_id = 'pro' and status = 'active' and current_period_end > now() + interval '27 days' from public.subscriptions where account_id = :'acc'), 'pro active');

-- Eslatmalar: 3 kun va 1 kun oldin, bir marta
update public.subscriptions set current_period_end = now() + interval '2 days 12 hours' where account_id = :'acc';
select pg_temp.assert(jsonb_array_length(public.billing_reminders_due()) = 1, 'reminder 3d due');
select pg_temp.assert((public.billing_reminders_due() -> 0 ->> 'days_before')::int = 3, 'days_before 3');
select pg_temp.assert(public.billing_reminders_due() -> 0 -> 'emails' ? 'billing@test.uz', 'admin email');
insert into public.billing_reminders (account_id, period_end, days_before)
select :'acc', current_period_end, 3 from public.subscriptions where account_id = :'acc';
select pg_temp.assert(jsonb_array_length(public.billing_reminders_due()) = 0, 'reminder once');
update public.subscriptions set current_period_end = now() + interval '20 hours' where account_id = :'acc';
select pg_temp.assert((public.billing_reminders_due() -> 0 ->> 'days_before')::int = 1, 'reminder 1d due');

-- Holatlar: tugadi → past_due (grace), 3 kundan keyin → expired
update public.subscriptions set current_period_end = now() - interval '1 day', status = 'active' where account_id = :'acc';
select public.update_subscription_statuses();
select pg_temp.assert((select status = 'past_due' from public.subscriptions where account_id = :'acc'), 'past_due in grace');
update public.subscriptions set current_period_end = now() - interval '4 days' where account_id = :'acc';
select public.update_subscription_statuses();
select pg_temp.assert((select status = 'expired' from public.subscriptions where account_id = :'acc'), 'expired after grace');

-- Eski pending to'lovlar
insert into public.payments (account_id, plan_id, billing_period, amount, status, created_at) values (:'acc', 'start', 'monthly', 89000, 'pending', now() - interval '4 days');
select pg_temp.assert(public.expire_stale_payments() = 1, 'stale payment failed');

-- kick_billing: site_url yo'q — HTTP yo'q
select pg_temp.assert(public.kick_billing() = false, 'no site url → no kick');

\o
\echo '  Billing testlari o''tdi'

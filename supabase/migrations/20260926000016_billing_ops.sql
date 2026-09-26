-- Replio — 6-faza: to'lovlarni tekshirish (reconcile), obuna eslatmalari, limitlar, obuna holatlari
--  * pg_cron har 5 daqiqada: 30 daqiqadan eski "pending" to'lovlar yoki eslatma kerak bo'lsa —
--    pg_net orqali Next.js /api/cron/billing (checkout.uz kaliti faqat serverda)
--  * obuna tugashidan 3 va 1 kun oldin — Telegram + email eslatma (billing_reminders — bir marta)
--  * limit: tarif o'zgarsa yoki kontaktlar o'chirilsa — over_limit qayta hisoblanadi
--  * holatlar: active → past_due (muddat tugadi, 3 kun grace) → expired (botlar pauza)

insert into private.settings (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.cron_auth(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.settings where key = 'cron_secret' and value = p_secret and p_secret <> '')
$$;
revoke execute on function public.cron_auth(text) from public, anon, authenticated;
grant execute on function public.cron_auth(text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Kontakt limiti: eng eski N ta kontakt faol, qolganlari over_limit
-- ─────────────────────────────────────────────────────────────
create index if not exists contacts_over_limit_idx on public.contacts (account_id) where over_limit;

create or replace function public.recompute_contact_limit(p_account_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer;
  v_n integer;
begin
  select coalesce(p.contact_limit, 250) into v_limit
  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.account_id = p_account_id;
  v_limit := coalesce(v_limit, 250);
  with ranked as (
    select id, row_number() over (order by subscribed_at, id) as rn
    from public.contacts where account_id = p_account_id
  )
  update public.contacts c set over_limit = (r.rn > v_limit)
  from ranked r
  where c.id = r.id and c.over_limit is distinct from (r.rn > v_limit);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.recompute_contact_limit(uuid) from public, anon, authenticated;

-- Kontaktlar o'chirilganda bo'shagan o'rinlar limitdan oshganlarga beriladi
create or replace function public.on_contacts_deleted()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare a uuid;
begin
  for a in select distinct o.account_id from old_rows o
           where exists (select 1 from public.contacts c where c.account_id = o.account_id and c.over_limit)
  loop
    perform public.recompute_contact_limit(a);
  end loop;
  return null;
end $$;
drop trigger if exists contacts_deleted_limit on public.contacts;
create trigger contacts_deleted_limit after delete on public.contacts
  referencing old table as old_rows for each statement execute function public.on_contacts_deleted();

-- To'lov faollashganda (tarif oshsa) — limit qayta hisoblanadi
create or replace function public.activate_payment(p_payment_id uuid, p_raw jsonb default null)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_pay public.payments;
  v_sub public.subscriptions;
  v_base timestamptz;
  v_step interval;
begin
  update public.payments
     set status = 'paid', paid_at = now(), raw = coalesce(p_raw, raw)
   where id = p_payment_id and status <> 'paid'
  returning * into v_pay;

  if not found then
    return false;
  end if;

  v_step := case v_pay.billing_period when 'yearly' then interval '1 year' else interval '1 month' end;

  select * into v_sub from public.subscriptions where account_id = v_pay.account_id for update;

  if found and v_sub.status in ('active', 'past_due') and v_sub.plan_id = v_pay.plan_id and v_sub.current_period_end > now() then
    v_base := v_sub.current_period_end;
  else
    v_base := now();
  end if;

  insert into public.subscriptions (account_id, plan_id, billing_period, status, current_period_end, updated_at)
  values (v_pay.account_id, v_pay.plan_id, v_pay.billing_period, 'active', v_base + v_step, now())
  on conflict (account_id) do update set
    plan_id = excluded.plan_id,
    billing_period = excluded.billing_period,
    status = 'active',
    current_period_end = excluded.current_period_end,
    updated_at = now();

  update public.accounts set plan_id = v_pay.plan_id where id = v_pay.account_id;
  perform public.recompute_contact_limit(v_pay.account_id);

  return true;
end $$;
revoke execute on function public.activate_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.activate_payment(uuid, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Obuna holatlari (har 5 daqiqada)
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_subscription_statuses()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer; v_m integer;
begin
  update public.subscriptions set status = 'past_due', updated_at = now()
   where status in ('active', 'trialing') and current_period_end <= now() and current_period_end + interval '3 days' > now();
  get diagnostics v_n = row_count;
  update public.subscriptions set status = 'expired', updated_at = now()
   where status in ('active', 'trialing', 'past_due') and current_period_end + interval '3 days' <= now();
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;
revoke execute on function public.update_subscription_statuses() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Eslatmalar: obuna tugashidan 3 va 1 kun oldin (bir marta)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.billing_reminders (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  period_end  timestamptz not null,
  days_before smallint not null,
  channels    jsonb not null default '{}'::jsonb,
  sent_at     timestamptz not null default now(),
  primary key (account_id, period_end, days_before)
);
alter table public.billing_reminders enable row level security;
create policy billing_reminders_select on public.billing_reminders for select to authenticated
  using (account_id in (select public.my_accounts('{admin}'::public.member_role[])));

-- Eslatma kerak bo'lgan akkauntlar: adminlar emaili va (preview orqali ulangan) Telegram chat id'lari
create or replace function public.billing_reminders_due()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select s.account_id, a.name as account_name, s.plan_id, p.name as plan_name, s.billing_period, s.status,
           s.current_period_end as period_end, d.days as days_before,
           (select coalesce(jsonb_agg(u.email), '[]'::jsonb)
              from public.account_members m join auth.users u on u.id = m.user_id
             where m.account_id = s.account_id and m.role = 'admin') as emails,
           (select coalesce(jsonb_agg(c.tg_user_id), '[]'::jsonb)
              from public.account_members m join public.contacts c on c.id = m.tg_contact_id
             where m.account_id = s.account_id and m.role = 'admin') as tg_chat_ids,
           (select b.id from public.bots b where b.account_id = s.account_id and b.status = 'connected' order by b.created_at limit 1) as bot_id
    from public.subscriptions s
    join public.accounts a on a.id = s.account_id
    join public.plans p on p.id = s.plan_id
    cross join (values (3), (1)) d(days)
    where s.status in ('active', 'trialing')
      and s.current_period_end > now()
      and s.current_period_end <= now() + make_interval(days => d.days)
      and s.current_period_end > now() + make_interval(days => d.days - 1)
      and not exists (select 1 from public.billing_reminders r
                      where r.account_id = s.account_id and r.period_end = s.current_period_end and r.days_before = d.days)
    limit 200
  ) x
$$;
revoke execute on function public.billing_reminders_due() from public, anon, authenticated;
grant execute on function public.billing_reminders_due() to service_role;

-- ─────────────────────────────────────────────────────────────
-- Cron: Next.js /api/cron/billing ni faqat ish bo'lsa chaqirish
-- ─────────────────────────────────────────────────────────────
create or replace function public.kick_billing()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  perform public.update_subscription_statuses();
  if not exists (select 1 from public.payments where status = 'pending' and created_at < now() - interval '30 minutes' and created_at > now() - interval '3 days')
     and jsonb_array_length(public.billing_reminders_due()) = 0 then
    return false;
  end if;
  select value into v_url from private.settings where key = 'site_url';
  select value into v_secret from private.settings where key = 'cron_secret';
  if v_url is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return false;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    using v_url || '/api/cron/billing',
          jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
          '{}'::jsonb;
  return true;
end $$;
revoke execute on function public.kick_billing() from public, anon, authenticated;

-- 3 kundan eski javobsiz to'lovlar — muvaffaqiyatsiz
create or replace function public.expire_stale_payments()
returns integer
language sql security definer set search_path = ''
as $$
  with x as (
    update public.payments set status = 'failed', raw = coalesce(raw, '{}'::jsonb) || '{"expired": true}'::jsonb
    where status = 'pending' and created_at < now() - interval '3 days'
    returning 1
  ) select count(*)::int from x
$$;
revoke execute on function public.expire_stale_payments() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('replio-billing', 'replio-stale-payments');
    perform cron.schedule('replio-billing', '*/5 * * * *', 'select public.kick_billing()');
    perform cron.schedule('replio-stale-payments', '41 * * * *', 'select public.expire_stale_payments()');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Tezlik monitoringi: Web Vitals / sahifa o'tishlari / API (perf_logs) — Logs uchun xulosa
-- ─────────────────────────────────────────────────────────────
create index if not exists perf_logs_name_idx on public.perf_logs (account_id, kind, name, created_at desc);

create or replace function public.perf_summary(p_account_id uuid, p_hours integer default 24)
returns table (kind text, name text, n bigint, p50 integer, p95 integer, p99 integer, over_2s bigint)
language sql stable security definer set search_path = ''
as $$
  select l.kind, l.name, count(*),
         percentile_disc(0.5) within group (order by l.ms)::int,
         percentile_disc(0.95) within group (order by l.ms)::int,
         percentile_disc(0.99) within group (order by l.ms)::int,
         count(*) filter (where l.ms > 2000)
  from public.perf_logs l
  where l.account_id = p_account_id and public.is_member(p_account_id)
    and l.created_at > now() - make_interval(hours => p_hours) and l.ms is not null
  group by l.kind, l.name
  order by l.kind, l.name
$$;
revoke execute on function public.perf_summary(uuid, integer) from public, anon;
grant execute on function public.perf_summary(uuid, integer) to authenticated;

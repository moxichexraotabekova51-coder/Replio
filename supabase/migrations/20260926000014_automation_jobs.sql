-- Replio — 4-faza: fon ishlari (Smart Delay, Data Collection timeout, Sequences, hodisa triggerlari)
--  * scheduled_jobs + contact_sequences → claim_work() (FOR UPDATE SKIP LOCKED) → Edge Function /_worker
--  * pg_cron har soniyada: ish bo'lsa — pg_net orqali worker'ni uyg'otadi (bo'sh paytda HTTP yo'q)
--  * tag_applied/removed, field_changed, subscribed/unsubscribed — DB triggerlari hodisa job'larini yozadi
--  * date_based — har daqiqada tekshiriladi; webhook — /api/hooks/{account}/{trigger}

-- ─────────────────────────────────────────────────────────────
-- Maxfiy sozlamalar (faqat postgres / security definer funksiyalar o'qiydi)
-- ─────────────────────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon, authenticated';
  end if;
end $$;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);
insert into private.settings (key, value)
values ('worker_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create table if not exists private.date_trigger_runs (
  trigger_id uuid not null,
  day        date not null,
  primary key (trigger_id, day)
);

create or replace function public.worker_auth(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.settings where key = 'worker_secret' and value = p_secret and p_secret <> '')
$$;
revoke execute on function public.worker_auth(text) from public, anon, authenticated;
grant execute on function public.worker_auth(text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Trigger shartlari (ixtiyoriy): {"op":"and","rules":[...]}
-- ─────────────────────────────────────────────────────────────
alter table public.triggers alter column conditions set default '{}'::jsonb;
update public.triggers set conditions = '{}'::jsonb where jsonb_typeof(conditions) = 'array' and conditions = '[]'::jsonb;

-- Webhook trigger uchun maxfiy token (URL'da)
alter table public.triggers add column if not exists secret text not null default encode(extensions.gen_random_bytes(16), 'hex');

-- ─────────────────────────────────────────────────────────────
-- Sequences: yuborish oynasi va keyingi vaqt
-- ─────────────────────────────────────────────────────────────
-- p_w: {"from":"09:00","to":"21:00","days":[1..7]} (ISO hafta kuni, 1 = dushanba). Oyna ichida bo'lsa p_ts, aks holda keyingi boshlanish.
create or replace function public.next_window(p_ts timestamptz, p_tz text, p_w jsonb)
returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  v_local timestamp := p_ts at time zone p_tz;
  v_from time := coalesce(nullif(p_w ->> 'from', ''), '00:00')::time;
  v_to time := coalesce(nullif(p_w ->> 'to', ''), '23:59:59')::time;
  v_days int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(p_w -> 'days') x), '{1,2,3,4,5,6,7}');
  d date;
  i int;
begin
  if p_w is null or jsonb_typeof(p_w) <> 'object' then
    return p_ts;
  end if;
  for i in 0..7 loop
    d := v_local::date + i;
    if extract(isodow from d)::int = any(v_days) then
      if i = 0 and v_local::time >= v_from and v_local::time < v_to then
        return p_ts;
      end if;
      if i > 0 or v_local::time < v_from then
        return (d + v_from) at time zone p_tz;
      end if;
    end if;
  end loop;
  return p_ts;
end $$;

-- Obuna bo'lganda birinchi qadam vaqti (1-qadamning kechikishi obunadan hisoblanadi)
create or replace function public.contact_sequences_init()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_delay interval;
begin
  select delay into v_delay from public.sequence_steps
   where sequence_id = new.sequence_id and is_active order by position, id limit 1;
  new.current_step := 0;
  new.next_run_at := case when v_delay is null then null else now() + v_delay end;
  return new;
end $$;
drop trigger if exists contact_sequences_init on public.contact_sequences;
create trigger contact_sequences_init before insert on public.contact_sequences
  for each row execute function public.contact_sequences_init();

-- Sequence'ga qadam qo'shilganda — kutayotgan (hali birinchi qadamgacha yetmagan) obunachilar uchun vaqtni hisoblash
create or replace function public.sequence_steps_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.contact_sequences cs
     set next_run_at = cs.created_at + (select delay from public.sequence_steps s
                                         where s.sequence_id = cs.sequence_id and s.is_active order by position, id limit 1)
   where cs.sequence_id = coalesce(new.sequence_id, old.sequence_id)
     and cs.current_step = 0;
  return null;
end $$;
drop trigger if exists sequence_steps_changed on public.sequence_steps;
create trigger sequence_steps_changed after insert or update or delete on public.sequence_steps
  for each row execute function public.sequence_steps_changed();

-- ─────────────────────────────────────────────────────────────
-- Hodisa triggerlari → scheduled_jobs (type = 'trigger')
-- ─────────────────────────────────────────────────────────────
create index if not exists triggers_event_idx on public.triggers (account_id, type) where is_active;

-- p_events: [{contact_id, account_id, key}] — key: tag_id / field_id (subscribe'da null)
create or replace function public.enqueue_trigger_events(p_type text, p_events jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  insert into public.scheduled_jobs (account_id, type, payload, run_at)
  select t.account_id, 'trigger',
         jsonb_build_object('contact_id', e ->> 'contact_id', 'trigger_id', t.id, 'flow_id', t.flow_id, 'event', p_type),
         now()
  from jsonb_array_elements(p_events) e
  join public.triggers t on t.account_id = (e ->> 'account_id')::uuid and t.type = p_type and t.is_active
  join public.flows f on f.id = t.flow_id and f.status = 'live' and f.deleted_at is null and f.compiled is not null
  where p_type in ('subscribed', 'unsubscribed')
     or (p_type in ('tag_applied', 'tag_removed') and t.config ->> 'tag_id' = e ->> 'key')
     or (p_type = 'field_changed' and t.config ->> 'field_id' = e ->> 'key');
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.enqueue_trigger_events(text, jsonb) from public, anon, authenticated;

create or replace function public.on_contact_tags_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_trigger_events('tag_applied', coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', n.contact_id, 'account_id', c.account_id, 'key', n.tag_id))
    from new_rows n join public.contacts c on c.id = n.contact_id
    where exists (select 1 from public.triggers t where t.account_id = c.account_id and t.type = 'tag_applied' and t.is_active)
  ), '[]'::jsonb));
  return null;
end $$;

create or replace function public.on_contact_tags_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_trigger_events('tag_removed', coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', o.contact_id, 'account_id', c.account_id, 'key', o.tag_id))
    from old_rows o join public.contacts c on c.id = o.contact_id
    where exists (select 1 from public.triggers t where t.account_id = c.account_id and t.type = 'tag_removed' and t.is_active)
  ), '[]'::jsonb));
  return null;
end $$;

drop trigger if exists contact_tags_events_ins on public.contact_tags;
create trigger contact_tags_events_ins after insert on public.contact_tags
  referencing new table as new_rows for each statement execute function public.on_contact_tags_insert();
drop trigger if exists contact_tags_events_del on public.contact_tags;
create trigger contact_tags_events_del after delete on public.contact_tags
  referencing old table as old_rows for each statement execute function public.on_contact_tags_delete();

create or replace function public.on_field_values_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_trigger_events('field_changed', coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', n.contact_id, 'account_id', c.account_id, 'key', n.field_id))
    from new_rows n join public.contacts c on c.id = n.contact_id
    where exists (select 1 from public.triggers t where t.account_id = c.account_id and t.type = 'field_changed' and t.is_active)
  ), '[]'::jsonb));
  return null;
end $$;

create or replace function public.on_field_values_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.enqueue_trigger_events('field_changed', coalesce((
    select jsonb_agg(jsonb_build_object('contact_id', n.contact_id, 'account_id', c.account_id, 'key', n.field_id))
    from new_rows n
    join old_rows o on o.contact_id = n.contact_id and o.field_id = n.field_id
    join public.contacts c on c.id = n.contact_id
    where o.value is distinct from n.value
      and exists (select 1 from public.triggers t where t.account_id = c.account_id and t.type = 'field_changed' and t.is_active)
  ), '[]'::jsonb));
  return null;
end $$;

drop trigger if exists field_values_events_ins on public.contact_field_values;
create trigger field_values_events_ins after insert on public.contact_field_values
  referencing new table as new_rows for each statement execute function public.on_field_values_insert();
drop trigger if exists field_values_events_upd on public.contact_field_values;
create trigger field_values_events_upd after update on public.contact_field_values
  referencing old table as old_rows new table as new_rows for each statement execute function public.on_field_values_update();

create or replace function public.on_contacts_subscription()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_subscribed then
      perform public.enqueue_trigger_events('subscribed', jsonb_build_array(jsonb_build_object('contact_id', new.id, 'account_id', new.account_id)));
    end if;
  elsif new.is_subscribed is distinct from old.is_subscribed then
    perform public.enqueue_trigger_events(case when new.is_subscribed then 'subscribed' else 'unsubscribed' end,
      jsonb_build_array(jsonb_build_object('contact_id', new.id, 'account_id', new.account_id)));
  end if;
  return null;
end $$;

drop trigger if exists contacts_subscription_events on public.contacts;
create trigger contacts_subscription_events after insert or update of is_subscribed on public.contacts
  for each row execute function public.on_contacts_subscription();

-- Date/time based: "sanadan N kun oldin/keyin HH:MM da" (akkaunt vaqt zonasida). Har daqiqada.
-- config: {"field_id": uuid, "offset_days": int (manfiy = oldin), "time": "10:00"}
create or replace function public.enqueue_date_triggers()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  t record;
  v_local timestamp;
  v_day date;
  v_total integer := 0;
  v_n integer;
begin
  for t in
    select tr.id, tr.account_id, tr.flow_id, tr.config, a.timezone
    from public.triggers tr
    join public.flows f on f.id = tr.flow_id and f.status = 'live' and f.deleted_at is null and f.compiled is not null
    join public.accounts a on a.id = tr.account_id
    where tr.type = 'date_based' and tr.is_active
  loop
    v_local := now() at time zone t.timezone;
    v_day := v_local::date;
    continue when v_local::time < coalesce(nullif(t.config ->> 'time', ''), '10:00')::time;
    continue when exists (select 1 from private.date_trigger_runs r where r.trigger_id = t.id and r.day = v_day);
    insert into private.date_trigger_runs (trigger_id, day) values (t.id, v_day);

    insert into public.scheduled_jobs (account_id, type, payload, run_at)
    select t.account_id, 'trigger',
           jsonb_build_object('contact_id', v.contact_id, 'trigger_id', t.id, 'flow_id', t.flow_id, 'event', 'date_based'),
           now()
    from public.contact_field_values v
    join public.contacts c on c.id = v.contact_id and c.account_id = t.account_id and c.is_subscribed
    where v.field_id = (t.config ->> 'field_id')::uuid
      and jsonb_typeof(v.value) = 'string'
      and (v.value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}'
      and left(v.value #>> '{}', 10)::date = v_day - coalesce((t.config ->> 'offset_days')::int, 0);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  delete from private.date_trigger_runs where day < current_date - 3;
  return v_total;
end $$;
revoke execute on function public.enqueue_date_triggers() from public, anon, authenticated;

-- Webhook trigger (Pro): tashqi tizim → kontakt bo'yicha avtomatlashtirish
create or replace function public.webhook_event(p_account_id uuid, p_trigger_id uuid, p_secret text, p_contact_id uuid, p_tg_user_id bigint, p_fields jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_t record;
  v_contact uuid;
  v_features jsonb;
begin
  select t.id, t.flow_id, t.account_id, t.secret into v_t
  from public.triggers t join public.flows f on f.id = t.flow_id and f.status = 'live' and f.deleted_at is null
  where t.id = p_trigger_id and t.account_id = p_account_id and t.type = 'webhook' and t.is_active;
  if not found or v_t.secret is distinct from p_secret then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select p.features into v_features from public.subscriptions s join public.plans p on p.id = s.plan_id where s.account_id = p_account_id;
  if not coalesce((v_features ->> 'webhook_trigger')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'upgrade_required');
  end if;
  select id into v_contact from public.contacts
   where account_id = p_account_id and (id = p_contact_id or (p_contact_id is null and tg_user_id = p_tg_user_id));
  if v_contact is null then
    return jsonb_build_object('ok', false, 'error', 'contact_not_found');
  end if;
  if p_fields is not null and jsonb_typeof(p_fields) = 'object' then
    insert into public.contact_field_values (contact_id, field_id, value, updated_at)
    select v_contact, f.id, e.value, now()
    from jsonb_each(p_fields) e join public.custom_fields f on f.account_id = p_account_id and f.name = e.key and not f.is_bot_field
    on conflict (contact_id, field_id) do update set value = excluded.value, updated_at = now();
  end if;
  insert into public.scheduled_jobs (account_id, type, payload, run_at)
  values (p_account_id, 'trigger', jsonb_build_object('contact_id', v_contact, 'trigger_id', v_t.id, 'flow_id', v_t.flow_id, 'event', 'webhook'), now());
  return jsonb_build_object('ok', true, 'contact_id', v_contact);
end $$;
revoke execute on function public.webhook_event(uuid, uuid, text, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.webhook_event(uuid, uuid, text, uuid, bigint, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Worker: navbatdan olish va yakunlash
-- ─────────────────────────────────────────────────────────────
create index if not exists scheduled_jobs_running_idx on public.scheduled_jobs (created_at) where status = 'running';

create or replace function public.claim_work(p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_jobs jsonb;
  v_seq jsonb := '[]'::jsonb;
  r record;
  v_step record;
  v_next interval;
  v_at timestamptz;
begin
  -- Osilib qolgan (worker o'lgan) job'larni qaytarish
  update public.scheduled_jobs set status = 'pending'
   where status = 'running' and run_at < now() - interval '5 minutes' and attempts < 3;

  with due as (
    select id from public.scheduled_jobs
    where status = 'pending' and run_at <= now() and type in ('flow_step', 'input_timeout', 'trigger')
    order by run_at
    limit p_limit
    for update skip locked
  ), upd as (
    update public.scheduled_jobs j set status = 'running', attempts = j.attempts + 1, run_at = now()
    from due where j.id = due.id
    returning j.id, j.type, j.payload, j.attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'type', u.type, 'payload', u.payload, 'attempts', u.attempts,
           'bot_id', c.bot_id,
           'conditions', t.conditions
         )), '[]'::jsonb)
    into v_jobs
  from upd u
  left join public.contacts c on c.id = (u.payload ->> 'contact_id')::uuid
  left join public.triggers t on t.id = (u.payload ->> 'trigger_id')::uuid;

  -- Sequences
  for r in
    select cs.contact_id, cs.sequence_id, cs.current_step, c.bot_id, a.timezone
    from public.contact_sequences cs
    join public.sequences s on s.id = cs.sequence_id and s.is_active
    join public.contacts c on c.id = cs.contact_id
    join public.accounts a on a.id = s.account_id
    where cs.next_run_at <= now()
    order by cs.next_run_at
    limit p_limit
    for update of cs skip locked
  loop
    select st.id, st.flow_id, st.send_window into v_step
    from public.sequence_steps st
    where st.sequence_id = r.sequence_id and st.is_active
    order by st.position, st.id offset r.current_step limit 1;

    if not found then
      update public.contact_sequences set next_run_at = null where contact_id = r.contact_id and sequence_id = r.sequence_id;
      continue;
    end if;

    v_at := public.next_window(now(), r.timezone, v_step.send_window);
    if v_at > now() then
      update public.contact_sequences set next_run_at = v_at where contact_id = r.contact_id and sequence_id = r.sequence_id;
      continue;
    end if;

    select st.delay into v_next
    from public.sequence_steps st
    where st.sequence_id = r.sequence_id and st.is_active
    order by st.position, st.id offset r.current_step + 1 limit 1;

    update public.contact_sequences
       set current_step = r.current_step + 1,
           next_run_at = case when v_next is null then null else now() + v_next end
     where contact_id = r.contact_id and sequence_id = r.sequence_id;

    if v_step.flow_id is not null and r.bot_id is not null then
      v_seq := v_seq || jsonb_build_object('contact_id', r.contact_id, 'bot_id', r.bot_id, 'flow_id', v_step.flow_id,
                                           'sequence_id', r.sequence_id, 'step_id', v_step.id);
    end if;
  end loop;

  return jsonb_build_object('jobs', v_jobs, 'sequences', v_seq);
end $$;
revoke execute on function public.claim_work(integer) from public, anon, authenticated;
grant execute on function public.claim_work(integer) to service_role;

-- p_done: bajarilgan job id'lar; p_failed: [{id, error}] — 3 urinishgacha qayta (30s, 60s, ...)
create or replace function public.finish_jobs(p_done uuid[], p_failed jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.scheduled_jobs set status = 'done', last_error = null where id = any(p_done);
  update public.scheduled_jobs j set
    status = case when j.attempts >= 3 then 'failed'::public.job_status else 'pending'::public.job_status end,
    run_at = now() + (j.attempts * interval '30 seconds'),
    last_error = left(f ->> 'error', 500)
  from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) f
  where j.id = (f ->> 'id')::uuid;
end $$;
revoke execute on function public.finish_jobs(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.finish_jobs(uuid[], jsonb) to service_role;

-- Ish bormi? (cron har soniyada chaqiradi; bo'sh bo'lsa HTTP so'rov yuborilmaydi)
create or replace function public.kick_worker()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.scheduled_jobs where status = 'pending' and run_at <= now() and type in ('flow_step', 'input_timeout', 'trigger'))
     and not exists (select 1 from public.contact_sequences where next_run_at <= now()) then
    return false;
  end if;
  select value into v_url from private.settings where key = 'functions_url';
  select value into v_secret from private.settings where key = 'worker_secret';
  if v_url is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return false;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    using v_url || '/tg-webhook/_worker',
          jsonb_build_object('content-type', 'application/json', 'x-worker-secret', v_secret),
          '{}'::jsonb;
  return true;
end $$;
revoke execute on function public.kick_worker() from public, anon, authenticated;

-- Eski job'larni tozalash (har kuni)
create or replace function public.purge_jobs()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.scheduled_jobs where status in ('done', 'failed') and created_at < now() - interval '7 days';
$$;
revoke execute on function public.purge_jobs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('replio-worker', 'replio-date-triggers', 'replio-purge-jobs');
    perform cron.schedule('replio-worker', '1 seconds', 'select public.kick_worker()');
    perform cron.schedule('replio-date-triggers', '* * * * *', 'select public.enqueue_date_triggers()');
    perform cron.schedule('replio-purge-jobs', '23 3 * * *', 'select public.purge_jobs()');
  end if;
end $$;

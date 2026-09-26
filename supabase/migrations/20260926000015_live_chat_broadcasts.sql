-- Replio — 5-faza: Live Chat (Realtime), Broadcasting, Growth Tools
--  * messages / contacts — Supabase Realtime (RLS bilan)
--  * broadcasts: har biri o'z (yashirin) flow'iga ega; qabul qiluvchilar yuborish paytida aniqlanadi;
--    worker 25 xabar/soniya tezlikda yuboradi (Telegram limiti), holat va statistika shu yerda
--  * growth_tools: /start <kod> — bosishlar va yangi obunachilar statistikasi, widget ko'rishlar
--  * Inbox: avtomatik yopish (cron), eslatmalar (notified_at)

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'contacts') then
      execute 'alter publication supabase_realtime add table public.contacts';
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Eslatmalar: brauzer bildirishnomasi bir marta
-- ─────────────────────────────────────────────────────────────
alter table public.reminders add column if not exists notified_at timestamptz;
create index if not exists reminders_user_due_idx on public.reminders (user_id, remind_at) where not done;

-- ─────────────────────────────────────────────────────────────
-- Inbox: avtomatik yopish (accounts.settings.inbox.auto_close_minutes)
-- ─────────────────────────────────────────────────────────────
create or replace function public.auto_close_chats()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_n integer;
begin
  update public.contacts c set live_chat_status = 'closed'
  from public.accounts a
  where a.id = c.account_id
    and c.live_chat_status = 'open'
    and coalesce((a.settings -> 'inbox' ->> 'auto_close_minutes')::int, 0) > 0
    and c.last_message_at < now() - make_interval(mins => (a.settings -> 'inbox' ->> 'auto_close_minutes')::int);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.auto_close_chats() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Operator xabari (Next.js API route — service role): tarix + suhbat holati + avtomatlashtirish pauzasi
-- ─────────────────────────────────────────────────────────────
create or replace function public.record_agent_message(
  p_contact_id uuid, p_author uuid, p_direction public.message_direction, p_type text, p_content jsonb, p_tg_message_id bigint
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_acc uuid;
  v_pause int;
  v_msg public.messages;
  v_preview text := left(coalesce(p_content ->> 'text', p_content ->> 'caption', '[' || p_type || ']'), 200);
begin
  select c.account_id, coalesce((a.settings -> 'inbox' ->> 'pause_minutes')::int, 30)
    into v_acc, v_pause
  from public.contacts c join public.accounts a on a.id = c.account_id where c.id = p_contact_id;
  if v_acc is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.messages (account_id, contact_id, direction, type, content, tg_message_id, author_id)
  values (v_acc, p_contact_id, p_direction, p_type, p_content, p_tg_message_id, p_author)
  returning * into v_msg;
  if p_direction = 'out_agent' then
    update public.contacts set
      last_message_preview = v_preview,
      last_message_at = v_msg.created_at,
      is_unread = false,
      live_chat_status = 'open',
      automation_paused_until = case when v_pause > 0 then greatest(coalesce(automation_paused_until, now()), now() + make_interval(mins => v_pause)) else automation_paused_until end
    where id = p_contact_id;
  end if;
  return to_jsonb(v_msg);
end $$;
revoke execute on function public.record_agent_message(uuid, uuid, public.message_direction, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.record_agent_message(uuid, uuid, public.message_direction, text, jsonb, bigint) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Broadcasting
-- ─────────────────────────────────────────────────────────────
create table if not exists public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  contact_id   uuid not null references public.contacts (id) on delete cascade,
  status       smallint not null default 0,  -- 0 kutmoqda, 1 yuborilmoqda, 2 yetkazildi, 3 xato
  error        text,
  sent_at      timestamptz,
  primary key (broadcast_id, contact_id)
);
create index if not exists broadcast_recipients_pending_idx on public.broadcast_recipients (broadcast_id) where status = 0;
alter table public.broadcast_recipients enable row level security;
create policy broadcast_recipients_select on public.broadcast_recipients for select to authenticated
  using (broadcast_id in (select b.id from public.broadcasts b where b.account_id in (select public.my_accounts('{admin,editor,viewer}'::public.member_role[]))));

-- Welcome / Default Reply — bittadan; broadcast flow'lari ko'p bo'lishi mumkin
drop index if exists public.flows_basic_kind_uniq;
create unique index flows_basic_kind_uniq on public.flows (account_id, basic_kind) where basic_kind is not null and basic_kind <> 'broadcast';

-- Yangi broadcast: o'z flow'i bilan (flow My Automations'da ko'rinmaydi: is_basic, basic_kind = 'broadcast')
create or replace function public.create_broadcast(p_account_id uuid, p_name text default 'Untitled')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_flow uuid;
  v_id uuid;
begin
  if not public.can_edit(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.flows (account_id, name, is_basic, basic_kind, draft)
  values (p_account_id, left(coalesce(nullif(p_name, ''), 'Untitled'), 200), true, 'broadcast',
          '{"nodes":[{"id":"trigger","type":"trigger","position":{"x":0,"y":0},"data":{}},{"id":"m1","type":"message","position":{"x":700,"y":0},"data":{"name":"Send Message","blocks":[]}}],"edges":[{"id":"e1","source":"trigger","sourceHandle":"then","target":"m1"}]}'::jsonb)
  returning id into v_flow;
  insert into public.broadcasts (account_id, name, flow_id) values (p_account_id, left(coalesce(nullif(p_name, ''), 'Untitled'), 200), v_flow)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.create_broadcast(uuid, text) from public, anon;
grant execute on function public.create_broadcast(uuid, text) to authenticated;

create or replace function public.broadcasts_cleanup()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.flows where id = old.flow_id and basic_kind = 'broadcast';
  return old;
end $$;
drop trigger if exists broadcasts_cleanup on public.broadcasts;
create trigger broadcasts_cleanup after delete on public.broadcasts for each row execute function public.broadcasts_cleanup();

-- Auditoriya: {"type":"all"} yoki {"type":"filter","filter":{op, rules}} — faqat obuna bo'lgan, limitdan oshmagan kontaktlar
create or replace function public.broadcast_audience_sql(p_account_id uuid, p_audience jsonb)
returns text
language plpgsql stable set search_path = ''
as $$
begin
  return format(
    'select c.id from public.contacts c where c.account_id = %L::uuid and c.is_subscribed and not c.over_limit and c.bot_id is not null and (%s)',
    p_account_id,
    case when p_audience ->> 'type' = 'filter' then public.contact_filter_sql(coalesce(p_audience -> 'filter', '{}'::jsonb), null) else 'true' end
  );
end $$;

create or replace function public.broadcast_audience_count(p_account_id uuid, p_audience jsonb)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare v bigint;
begin
  if not public.is_member(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  execute 'select count(*) from (' || public.broadcast_audience_sql(p_account_id, p_audience) || ') x' into v;
  return v;
end $$;
revoke execute on function public.broadcast_audience_count(uuid, jsonb) from public, anon;
grant execute on function public.broadcast_audience_count(uuid, jsonb) to authenticated;

-- Yuborish / rejalashtirish. Flow avval publish_flow bilan kompilyatsiya qilingan bo'lishi kerak.
create or replace function public.start_broadcast(p_id uuid, p_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.broadcasts;
  v_at timestamptz := coalesce(p_at, now());
begin
  select * into v_b from public.broadcasts where id = p_id for update;
  if not found or not public.can_edit(v_b.account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_b.status not in ('draft', 'scheduled') then
    raise exception 'already_sent' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.flows f where f.id = v_b.flow_id and f.compiled is not null) then
    raise exception 'not_compiled' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.bots where account_id = v_b.account_id and status = 'connected') then
    raise exception 'no_bot' using errcode = 'P0001';
  end if;

  delete from public.scheduled_jobs where type = 'broadcast' and status = 'pending' and payload ->> 'broadcast_id' = p_id::text;
  update public.broadcasts set
    status = case when v_at > now() + interval '5 seconds' then 'scheduled'::public.broadcast_status else 'sending'::public.broadcast_status end,
    scheduled_at = v_at
  where id = p_id;
  insert into public.scheduled_jobs (account_id, type, payload, run_at)
  values (v_b.account_id, 'broadcast', jsonb_build_object('broadcast_id', p_id), v_at);
  return jsonb_build_object('status', case when v_at > now() + interval '5 seconds' then 'scheduled' else 'sending' end);
end $$;
revoke execute on function public.start_broadcast(uuid, timestamptz) from public, anon;
grant execute on function public.start_broadcast(uuid, timestamptz) to authenticated;

-- Rejalashtirishni bekor qilish → Draft
create or replace function public.cancel_broadcast(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_b public.broadcasts;
begin
  select * into v_b from public.broadcasts where id = p_id for update;
  if not found or not public.can_edit(v_b.account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_b.status <> 'scheduled' then
    raise exception 'not_scheduled' using errcode = 'P0001';
  end if;
  delete from public.scheduled_jobs where type = 'broadcast' and status = 'pending' and payload ->> 'broadcast_id' = p_id::text;
  update public.broadcasts set status = 'draft', scheduled_at = null where id = p_id;
end $$;
revoke execute on function public.cancel_broadcast(uuid) from public, anon;
grant execute on function public.cancel_broadcast(uuid) to authenticated;

-- Worker: navbatdagi qabul qiluvchilar (birinchi chaqiruvda auditoriya aniqlanadi)
create or replace function public.broadcast_batch(p_id uuid, p_limit integer default 25)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_b public.broadcasts;
  v_bot uuid;
  v_ids jsonb;
  v_total bigint;
begin
  select * into v_b from public.broadcasts where id = p_id;
  if not found or v_b.status in ('sent', 'failed', 'draft') then
    return jsonb_build_object('done', true);
  end if;
  select id into v_bot from public.bots where account_id = v_b.account_id and status = 'connected' order by created_at limit 1;
  if v_bot is null then
    update public.broadcasts set status = 'failed' where id = p_id;
    return jsonb_build_object('done', true);
  end if;

  if v_b.status = 'scheduled' or not exists (select 1 from public.broadcast_recipients where broadcast_id = p_id) then
    execute format('insert into public.broadcast_recipients (broadcast_id, contact_id) select %L::uuid, x.id from (%s) x on conflict do nothing',
                   p_id, public.broadcast_audience_sql(v_b.account_id, v_b.audience));
    select count(*) into v_total from public.broadcast_recipients where broadcast_id = p_id;
    update public.broadcasts set status = 'sending', sent_at = coalesce(sent_at, now()),
      stats = jsonb_build_object('total', v_total, 'sent', 0, 'delivered', 0, 'clicked', 0, 'failed', 0)
    where id = p_id;
  end if;

  with pick as (
    select contact_id from public.broadcast_recipients
    where broadcast_id = p_id and status = 0
    limit p_limit
    for update skip locked
  ), upd as (
    update public.broadcast_recipients r set status = 1
    from pick where r.broadcast_id = p_id and r.contact_id = pick.contact_id
    returning r.contact_id
  )
  select coalesce(jsonb_agg(contact_id), '[]'::jsonb) into v_ids from upd;

  if jsonb_array_length(v_ids) = 0 then
    -- Job bir vaqtda faqat bitta worker'da: status 1 qolgan bo'lsa — oldingi worker uzilib qolgan
    with lost as (
      update public.broadcast_recipients set status = 3, error = 'interrupted', sent_at = now()
      where broadcast_id = p_id and status = 1
      returning 1
    )
    update public.broadcasts set stats = stats || jsonb_build_object('failed', coalesce((stats ->> 'failed')::int, 0) + (select count(*) from lost))
    where id = p_id and exists (select 1 from lost);
    update public.broadcasts set status = 'sent' where id = p_id and status = 'sending';
    return jsonb_build_object('done', true);
  end if;
  return jsonb_build_object('done', false, 'bot_id', v_bot, 'flow_id', v_b.flow_id, 'contacts', v_ids);
end $$;
revoke execute on function public.broadcast_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.broadcast_batch(uuid, integer) to service_role;

-- Natijalar: p_ok — yetkazildi; p_failed — [{contact_id, error, blocked}]
create or replace function public.broadcast_report(p_id uuid, p_ok uuid[], p_failed jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_fail_ids uuid[];
  v_blocked uuid[];
  v_ok int := coalesce(array_length(p_ok, 1), 0);
  v_bad int;
begin
  select coalesce(array_agg((f ->> 'contact_id')::uuid), '{}'),
         coalesce(array_agg((f ->> 'contact_id')::uuid) filter (where (f ->> 'blocked')::boolean), '{}')
    into v_fail_ids, v_blocked
  from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) f;
  v_bad := coalesce(array_length(v_fail_ids, 1), 0);

  update public.broadcast_recipients set status = 2, sent_at = now() where broadcast_id = p_id and contact_id = any(p_ok);
  update public.broadcast_recipients r set status = 3, sent_at = now(), error = left(f ->> 'error', 300)
  from jsonb_array_elements(coalesce(p_failed, '[]'::jsonb)) f
  where r.broadcast_id = p_id and r.contact_id = (f ->> 'contact_id')::uuid;
  if array_length(v_blocked, 1) > 0 then
    update public.contacts set is_subscribed = false where id = any(v_blocked);
  end if;

  update public.broadcasts set stats = stats
    || jsonb_build_object('sent', coalesce((stats ->> 'sent')::int, 0) + v_ok + v_bad)
    || jsonb_build_object('delivered', coalesce((stats ->> 'delivered')::int, 0) + v_ok)
    || jsonb_build_object('failed', coalesce((stats ->> 'failed')::int, 0) + v_bad)
  where id = p_id;
end $$;
revoke execute on function public.broadcast_report(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.broadcast_report(uuid, uuid[], jsonb) to service_role;

-- Bosishlar (CTR): broadcast flow'idagi step tugmalari (step_stats.clicked)
create or replace function public.broadcast_clicks(p_account_id uuid)
returns table (broadcast_id uuid, clicked bigint)
language sql stable security definer set search_path = ''
as $$
  select b.id, coalesce(sum(s.clicked), 0)::bigint
  from public.broadcasts b left join public.step_stats s on s.flow_id = b.flow_id
  where b.account_id = p_account_id and public.is_member(p_account_id)
  group by b.id
$$;
revoke execute on function public.broadcast_clicks(uuid) from public, anon;
grant execute on function public.broadcast_clicks(uuid) to authenticated;

-- Worker navbati: broadcast job'lari ham
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
  update public.scheduled_jobs set status = 'pending'
   where status = 'running' and run_at < now() - interval '5 minutes' and attempts < 3;
  -- Broadcast job'i uzoq ishlaydi: 2 daqiqadan ortiq "running" bo'lsa worker o'lgan
  update public.scheduled_jobs set status = 'pending'
   where status = 'running' and type = 'broadcast' and run_at < now() - interval '2 minutes';

  with due as (
    select id from public.scheduled_jobs
    where status = 'pending' and run_at <= now() and type in ('flow_step', 'input_timeout', 'trigger', 'broadcast')
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

-- Broadcast job'ini keyingi worker chaqiruviga qaytarish (vaqt byudjeti tugaganda)
create or replace function public.requeue_job(p_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.scheduled_jobs set status = 'pending', run_at = now(), attempts = 0 where id = p_id;
$$;
revoke execute on function public.requeue_job(uuid) from public, anon, authenticated;
grant execute on function public.requeue_job(uuid) to service_role;

create or replace function public.kick_worker()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.scheduled_jobs where status = 'pending' and run_at <= now() and type in ('flow_step', 'input_timeout', 'trigger', 'broadcast'))
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

-- ─────────────────────────────────────────────────────────────
-- Growth Tools: /start <ref_code> statistikasi
-- ─────────────────────────────────────────────────────────────
alter table public.growth_tools alter column stats set default '{"views":0,"clicks":0,"subscribers":0}'::jsonb;
alter table public.contacts add column if not exists source text;  -- growth_tools.ref_code (birinchi obuna manbai)

-- Bot: /start <kod> — bosish (+ yangi kontakt bo'lsa obunachi). Qaytaradi: growth tool'ning flow_id (yoki null)
create or replace function public.growth_start(p_bot_id uuid, p_contact_id uuid, p_code text, p_is_new boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_g record;
begin
  select g.id, g.flow_id into v_g
  from public.growth_tools g join public.bots b on b.account_id = g.account_id and b.id = p_bot_id
  where g.ref_code = p_code;
  if not found then
    return null;
  end if;
  update public.growth_tools set stats = stats
    || jsonb_build_object('clicks', coalesce((stats ->> 'clicks')::int, 0) + 1)
    || jsonb_build_object('subscribers', coalesce((stats ->> 'subscribers')::int, 0) + case when p_is_new then 1 else 0 end)
  where id = v_g.id;
  if p_is_new then
    update public.contacts set source = p_code where id = p_contact_id and source is null;
  end if;
  return jsonb_build_object('id', v_g.id, 'flow_id', v_g.flow_id);
end $$;
revoke execute on function public.growth_start(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.growth_start(uuid, uuid, text, boolean) to service_role;

-- Widget ko'rishlari (anonim sayt tashrifi → Next API route, service role)
create or replace function public.growth_view(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v jsonb;
begin
  update public.growth_tools set stats = stats || jsonb_build_object('views', coalesce((stats ->> 'views')::int, 0) + 1)
  where id = p_id and type = 'widget'
  returning jsonb_build_object('ref_code', ref_code, 'config', config,
    'bot', (select b.username from public.bots b where b.account_id = growth_tools.account_id and b.status = 'connected' order by b.created_at limit 1))
  into v;
  return v;
end $$;
revoke execute on function public.growth_view(uuid) from public, anon, authenticated;
grant execute on function public.growth_view(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Cron
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'replio-auto-close';
    perform cron.schedule('replio-auto-close', '*/5 * * * *', 'select public.auto_close_chats()');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Shablonlar: v2 formatga moslash va yangilari
-- ─────────────────────────────────────────────────────────────
update public.templates set flow_json = jsonb_set(flow_json, '{draft,nodes,1,data,blocks}', '[
  {"id":"b1","type":"request","kind":"contact","text":"Buyurtma berish uchun telefon raqamingizni yuboring 👇","button":"📱 Raqamni yuborish","field_id":null},
  {"id":"b2","type":"text","text":"Rahmat! Operatorimiz tez orada bog''lanadi.","buttons":[]}
]'::jsonb)
where name = 'Telefon raqamini yig''ish';

insert into public.templates (name, description, category, icon, sort_order, flow_json)
select 'Savol-javob (FAQ)', 'Tugmalar orqali ko''p so''raladigan savollarga javob', 'faq', 'help-circle', 6, '{
  "triggers": [{"type": "keyword", "config": {"match": "contains", "keywords": ["savol", "faq", "yordam"]}}],
  "draft": {
    "nodes": [
      {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
      {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {"name": "Savollar", "blocks": [
        {"id": "b1", "type": "text", "text": "Qaysi savol bo''yicha yordam kerak?", "buttons": [
          {"id": "q1", "title": "🚚 Yetkazib berish", "kind": "step"},
          {"id": "q2", "title": "💳 To''lov usullari", "kind": "step"}
        ]}
      ]}},
      {"id": "m2", "type": "message", "position": {"x": 1400, "y": -200}, "data": {"name": "Yetkazib berish", "blocks": [
        {"id": "b2", "type": "text", "text": "Toshkent bo''ylab 1 kunda, viloyatlarga 2–3 kunda yetkazamiz.", "buttons": []}
      ]}},
      {"id": "m3", "type": "message", "position": {"x": 1400, "y": 200}, "data": {"name": "To''lov", "blocks": [
        {"id": "b3", "type": "text", "text": "Naqd, Click, Payme yoki karta orqali to''lashingiz mumkin.", "buttons": []}
      ]}}
    ],
    "edges": [
      {"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"},
      {"id": "e2", "source": "m1", "sourceHandle": "q1", "target": "m2"},
      {"id": "e3", "source": "m1", "sourceHandle": "q2", "target": "m3"}
    ]
  }
}'::jsonb
where not exists (select 1 from public.templates where name = 'Savol-javob (FAQ)');

insert into public.templates (name, description, category, icon, sort_order, flow_json)
select 'Fikr-mulohaza so''rovnomasi', 'Mijozdan 1–5 baho va izoh yig''ish (Data Collection — Pro)', 'feedback', 'star', 7, '{
  "triggers": [{"type": "keyword", "config": {"match": "contains", "keywords": ["fikr", "baho"]}}],
  "draft": {
    "nodes": [
      {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
      {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {"name": "So''rovnoma", "blocks": [
        {"id": "b1", "type": "input", "text": "Xizmatimizni 1 dan 5 gacha baholang:", "kind": "choice", "choices": ["1", "2", "3", "4", "5"], "field_id": null, "error": "", "skip": null, "timeout_min": null},
        {"id": "b2", "type": "input", "text": "Nimani yaxshilashimiz mumkin?", "kind": "text", "choices": [], "field_id": null, "error": "", "skip": "O''tkazib yuborish", "timeout_min": null},
        {"id": "b3", "type": "text", "text": "Rahmat, {{first_name}}! Fikringiz biz uchun muhim 🙏", "buttons": []}
      ]}}
    ],
    "edges": [{"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"}]
  }
}'::jsonb
where not exists (select 1 from public.templates where name = 'Fikr-mulohaza so''rovnomasi');

-- /menu: tugmalar javob step'lariga ulangan (aks holda Set Live "uzilgan tugma" xatosini beradi)
update public.templates set flow_json = jsonb_set(flow_json, '{draft}', '{
  "nodes": [
    {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {}},
    {"id": "m1", "type": "message", "position": {"x": 700, "y": 0}, "data": {"name": "Asosiy menyu", "blocks": [
      {"id": "b1", "type": "text", "text": "Asosiy menyu:", "buttons": [
        {"id": "btn1", "title": "Mahsulotlar", "kind": "step"},
        {"id": "btn2", "title": "Bog''lanish", "kind": "step"}
      ]}
    ]}},
    {"id": "m2", "type": "message", "position": {"x": 1400, "y": -200}, "data": {"name": "Mahsulotlar", "blocks": [
      {"id": "b2", "type": "text", "text": "Mahsulotlarimiz katalogi tez orada shu yerda bo''ladi.", "buttons": []}
    ]}},
    {"id": "m3", "type": "message", "position": {"x": 1400, "y": 200}, "data": {"name": "Bog''lanish", "blocks": [
      {"id": "b3", "type": "text", "text": "Savolingizni yozib qoldiring — operatorimiz javob beradi.", "buttons": []}
    ]}}
  ],
  "edges": [
    {"id": "e1", "source": "trigger", "sourceHandle": "then", "target": "m1"},
    {"id": "e2", "source": "m1", "sourceHandle": "btn1", "target": "m2"},
    {"id": "e3", "source": "m1", "sourceHandle": "btn2", "target": "m3"}
  ]
}'::jsonb)
where name = '/menu buyrug''i';

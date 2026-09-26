-- Replio — 2-faza: Telegram bot runtime
-- Webhook uchun BITTA RPC (handle_update), javobdan keyin loglash (log_update), publish (publish_flow).

-- ─────────────────────────────────────────────────────────────
-- Trigger/flow kesh versiyasi: Edge Function keshini invalidatsiya qilish uchun
-- ─────────────────────────────────────────────────────────────
alter table public.accounts add column if not exists flows_version integer not null default 0;

create or replace function public.bump_flows_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.accounts set flows_version = flows_version + 1
   where id = coalesce(new.account_id, old.account_id);
  return null;
end $$;

create trigger triggers_bump_version
  after insert or update or delete on public.triggers
  for each row execute function public.bump_flows_version();

create trigger flows_bump_version
  after update of status, compiled, published_version, deleted_at or delete on public.flows
  for each row execute function public.bump_flows_version();

create trigger bot_fields_bump_version
  after insert or update or delete on public.custom_fields
  for each row execute function public.bump_flows_version();

revoke execute on function public.bump_flows_version() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Kiruvchi update uchun hamma narsa bitta so'rovda
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_update(
  p_bot_id uuid,
  p_secret text,
  p_from jsonb,                 -- Telegram "from" obyekti
  p_cached_version integer default -1,
  p_subscribed boolean default true
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_bot      record;
  v_acc      record;
  v_sub      record;
  v_plan     record;
  v_contact  record;
  v_is_new   boolean;
  v_count    integer;
  v_paused   boolean;
  v_result   jsonb;
begin
  select b.id, b.account_id, b.token_encrypted, b.webhook_secret, b.username, b.status
    into v_bot from public.bots b where b.id = p_bot_id;
  if not found or v_bot.webhook_secret is distinct from p_secret then
    return jsonb_build_object('ok', false);
  end if;

  select a.id, a.flows_version, a.timezone into v_acc from public.accounts a where a.id = v_bot.account_id;
  select s.status, s.current_period_end, s.plan_id into v_sub from public.subscriptions s where s.account_id = v_acc.id;
  select p.contact_limit into v_plan from public.plans p where p.id = coalesce(v_sub.plan_id, 'start');
  v_paused := v_sub is null
    or v_sub.status in ('expired', 'canceled')
    or v_sub.current_period_end + interval '3 days' < now();

  insert into public.contacts as c (account_id, bot_id, tg_user_id, first_name, last_name, username, language_code,
                                    last_interaction_at, is_subscribed)
  values (
    v_acc.id, v_bot.id, (p_from ->> 'id')::bigint,
    p_from ->> 'first_name', p_from ->> 'last_name', p_from ->> 'username', p_from ->> 'language_code',
    now(), p_subscribed
  )
  on conflict (account_id, tg_user_id) do update set
    first_name = coalesce(excluded.first_name, c.first_name),
    last_name = coalesce(excluded.last_name, c.last_name),
    username = coalesce(excluded.username, c.username),
    language_code = coalesce(excluded.language_code, c.language_code),
    bot_id = excluded.bot_id,
    last_interaction_at = now(),
    is_subscribed = excluded.is_subscribed
  returning c.id, c.first_name, c.last_name, c.username, c.is_subscribed, c.over_limit,
            c.automation_paused_until, c.live_chat_status, c.subscribed_at, (xmax = 0) as inserted
  into v_contact;

  v_is_new := v_contact.inserted;

  -- Tarif limiti: limitdan oshgan yangi kontakt saqlanadi, lekin flowlar ishlamaydi
  if v_is_new then
    select count(*) into v_count from public.contacts where account_id = v_acc.id and not over_limit;
    if v_count > coalesce(v_plan.contact_limit, 250) then
      update public.contacts set over_limit = true where id = v_contact.id;
      v_contact.over_limit := true;
    end if;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'account_id', v_acc.id,
    'timezone', v_acc.timezone,
    'token_enc', v_bot.token_encrypted,
    'bot_username', v_bot.username,
    'version', v_acc.flows_version,
    'paused', v_paused,
    'contact', jsonb_build_object(
      'id', v_contact.id,
      'is_new', v_is_new,
      'first_name', v_contact.first_name,
      'last_name', v_contact.last_name,
      'username', v_contact.username,
      'over_limit', v_contact.over_limit,
      'automation_paused_until', v_contact.automation_paused_until,
      'live_chat_status', v_contact.live_chat_status,
      'fields', coalesce((
        select jsonb_object_agg(f.name, v.value)
        from public.contact_field_values v join public.custom_fields f on f.id = v.field_id
        where v.contact_id = v_contact.id
      ), '{}'::jsonb)
    )
  );

  -- Kesh eskirgan bo'lsa — faol triggerlar, LIVE flowlar va bot field'lar
  if p_cached_version is distinct from v_acc.flows_version then
    v_result := v_result || jsonb_build_object(
      'triggers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id, 'type', t.type, 'config', t.config, 'conditions', t.conditions,
          'priority', t.priority, 'flow_id', t.flow_id, 'updated_at', greatest(t.updated_at, f.updated_at)
        ))
        from public.triggers t join public.flows f on f.id = t.flow_id
        where t.account_id = v_acc.id and t.is_active and f.status = 'live' and f.deleted_at is null
          and f.compiled is not null
      ), '[]'::jsonb),
      'flows', coalesce((
        select jsonb_object_agg(f.id, f.compiled)
        from public.flows f
        where f.account_id = v_acc.id and f.status = 'live' and f.deleted_at is null and f.compiled is not null
      ), '{}'::jsonb),
      'bot_fields', coalesce((
        select jsonb_object_agg(cf.name, cf.bot_value)
        from public.custom_fields cf where cf.account_id = v_acc.id and cf.is_bot_field
      ), '{}'::jsonb)
    );
  end if;

  return v_result;
end $$;

revoke execute on function public.handle_update(uuid, text, jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.handle_update(uuid, text, jsonb, integer, boolean) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Javobdan keyin (EdgeRuntime.waitUntil): xabarlar, statistika, latency — bitta chaqiruv
-- p: { account_id, contact_id, bot_id, messages:[{direction,type,content,tg_message_id,flow_id,step_id}],
--      preview, inbound, trigger_id, flow_id, steps:[step_id], received_at, sent_at }
-- ─────────────────────────────────────────────────────────────
create or replace function public.log_update(p jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid := (p ->> 'account_id')::uuid;
  v_contact uuid := (p ->> 'contact_id')::uuid;
begin
  insert into public.messages (account_id, contact_id, direction, type, content, tg_message_id, flow_id, step_id, created_at)
  select v_account, v_contact, (m ->> 'direction')::public.message_direction, coalesce(m ->> 'type', 'text'),
         coalesce(m -> 'content', '{}'::jsonb), (m ->> 'tg_message_id')::bigint,
         (m ->> 'flow_id')::uuid, m ->> 'step_id',
         coalesce((m ->> 'at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p -> 'messages', '[]'::jsonb)) m;

  if p ? 'preview' then
    update public.contacts set
      last_message_preview = left(p ->> 'preview', 200),
      last_message_at = now(),
      is_unread = case when coalesce((p ->> 'inbound')::boolean, false) then true else is_unread end,
      live_chat_status = case when coalesce((p ->> 'inbound')::boolean, false) then 'open' else live_chat_status end
    where id = v_contact;
  end if;

  if p ->> 'trigger_id' is not null then
    update public.triggers set run_count = run_count + 1 where id = (p ->> 'trigger_id')::uuid;
  end if;
  if p ->> 'flow_id' is not null then
    update public.flows set runs = runs + 1 where id = (p ->> 'flow_id')::uuid;
    insert into public.step_stats (flow_id, step_id, sent, delivered)
    select (p ->> 'flow_id')::uuid, s, 1, 1 from jsonb_array_elements_text(coalesce(p -> 'steps', '[]'::jsonb)) s
    on conflict (flow_id, step_id) do update set sent = public.step_stats.sent + 1, delivered = public.step_stats.delivered + 1;
  end if;

  if p ->> 'received_at' is not null and p ->> 'sent_at' is not null then
    insert into public.latency_logs (bot_id, account_id, kind, received_at, sent_at, ms)
    values (
      (p ->> 'bot_id')::uuid, v_account, coalesce(p ->> 'kind', 'message'),
      (p ->> 'received_at')::timestamptz, (p ->> 'sent_at')::timestamptz,
      greatest(0, round(extract(epoch from ((p ->> 'sent_at')::timestamptz - (p ->> 'received_at')::timestamptz)) * 1000))::int
    );
  end if;
end $$;

revoke execute on function public.log_update(jsonb) from public, anon, authenticated;
grant execute on function public.log_update(jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Publish: draft → compiled (kompilyatsiya TS'da, validatsiyadan keyin), versiya tarixi
-- ─────────────────────────────────────────────────────────────
create or replace function public.publish_flow(p_flow_id uuid, p_draft jsonb, p_compiled jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_flow public.flows;
  v_version integer;
begin
  select * into v_flow from public.flows where id = p_flow_id for update;
  if not found or not public.can_edit(v_flow.account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_version := v_flow.published_version + 1;
  update public.flows set
    draft = p_draft,
    compiled = p_compiled,
    status = 'live',
    published_version = v_version,
    has_unpublished = false
  where id = p_flow_id;

  insert into public.flow_versions (flow_id, version, draft, compiled, created_by)
  values (p_flow_id, v_version, p_draft, p_compiled, auth.uid());

  return v_version;
end $$;

revoke execute on function public.publish_flow(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.publish_flow(uuid, jsonb, jsonb) to authenticated;

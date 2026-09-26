-- Replio — 3-faza: flow runtime v2
--  * contacts.bot_state — kutilayotgan javob (Data Collection), pastki menyu (Telegram Menu)
--  * account_members.preview_code / tg_contact_id — Preview va "Notify Admins" uchun jamoa a'zosining Telegram'i
--  * contact_apply — Actions (teg, field, sequence, notify, assign, schedule, ...) bitta chaqiruvda
--  * publish_flow — Pro funksiyalar (Data Collection, External Request, Assign) tarif bo'yicha tekshiriladi
--  * media bucket (rasm/video/fayl bloklari)

alter table public.contacts add column if not exists bot_state jsonb not null default '{}'::jsonb;

alter table public.account_members
  add column if not exists preview_code text unique default encode(extensions.gen_random_bytes(9), 'hex'),
  add column if not exists tg_contact_id uuid references public.contacts (id) on delete set null;

-- ─────────────────────────────────────────────────────────────
-- handle_update v2: kontakt holati, teglar, field'lar (id bo'yicha) ham qaytadi
-- ─────────────────────────────────────────────────────────────
create or replace function public.contact_snapshot(p_contact_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'username', c.username,
    'language_code', c.language_code,
    'over_limit', c.over_limit,
    'automation_paused_until', c.automation_paused_until,
    'live_chat_status', c.live_chat_status,
    'is_subscribed', c.is_subscribed,
    'subscribed_at', c.subscribed_at,
    'state', c.bot_state,
    'tags', coalesce((select jsonb_agg(ct.tag_id) from public.contact_tags ct where ct.contact_id = c.id), '[]'::jsonb),
    'fields', coalesce((
      select jsonb_object_agg(f.name, v.value)
      from public.contact_field_values v join public.custom_fields f on f.id = v.field_id where v.contact_id = c.id
    ), '{}'::jsonb),
    'field_ids', coalesce((select jsonb_object_agg(v.field_id, v.value) from public.contact_field_values v where v.contact_id = c.id), '{}'::jsonb)
  )
  from public.contacts c where c.id = p_contact_id
$$;
revoke execute on function public.contact_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.contact_snapshot(uuid) to service_role;

create or replace function public.handle_update(
  p_bot_id uuid,
  p_secret text,
  p_from jsonb,
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
  v_count    integer;
  v_paused   boolean;
  v_result   jsonb;
begin
  select b.id, b.account_id, b.token_encrypted, b.webhook_secret, b.username
    into v_bot from public.bots b where b.id = p_bot_id;
  if not found or v_bot.webhook_secret is distinct from p_secret then
    return jsonb_build_object('ok', false);
  end if;

  select a.id, a.flows_version, a.timezone into v_acc from public.accounts a where a.id = v_bot.account_id;
  select s.status, s.current_period_end, s.plan_id into v_sub from public.subscriptions s where s.account_id = v_acc.id;
  select p.contact_limit, p.features into v_plan from public.plans p where p.id = coalesce(v_sub.plan_id, 'start');
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
  returning c.id, (xmax = 0) as inserted, c.is_subscribed as was_subscribed
  into v_contact;

  if v_contact.inserted then
    select count(*) into v_count from public.contacts where account_id = v_acc.id and not over_limit;
    if v_count > coalesce(v_plan.contact_limit, 250) then
      update public.contacts set over_limit = true where id = v_contact.id;
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
    'features', coalesce(v_plan.features, '{}'::jsonb),
    'contact', public.contact_snapshot(v_contact.id) || jsonb_build_object('is_new', v_contact.inserted)
  );

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
-- Actions + holat — bitta chaqiruv. Qaytaradi: yangilangan snapshot + notify uchun admin chat id'lari
-- ─────────────────────────────────────────────────────────────
create or replace function public.contact_apply(p_contact_id uuid, p_actions jsonb, p_state jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a jsonb;
  v_acc uuid;
  v_notify jsonb := '[]'::jsonb;
  v_deleted boolean := false;
begin
  select account_id into v_acc from public.contacts where id = p_contact_id;
  if v_acc is null then
    return jsonb_build_object('deleted', true);
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_actions, '[]'::jsonb)) loop
    case a ->> 'a'
      when 'add_tag' then
        insert into public.contact_tags (contact_id, tag_id)
        select p_contact_id, t.id from public.tags t where t.id = (a ->> 'tag_id')::uuid and t.account_id = v_acc
        on conflict do nothing;
      when 'remove_tag' then
        delete from public.contact_tags where contact_id = p_contact_id and tag_id = (a ->> 'tag_id')::uuid;
      when 'set_field' then
        insert into public.contact_field_values (contact_id, field_id, value, updated_at)
        select p_contact_id, f.id, a -> 'value', now() from public.custom_fields f
        where f.id = (a ->> 'field_id')::uuid and f.account_id = v_acc and not f.is_bot_field
        on conflict (contact_id, field_id) do update set value = excluded.value, updated_at = now();
      when 'clear_field' then
        delete from public.contact_field_values where contact_id = p_contact_id and field_id = (a ->> 'field_id')::uuid;
      when 'sub_seq' then
        insert into public.contact_sequences (contact_id, sequence_id, current_step, next_run_at)
        select p_contact_id, s.id, 0, now() from public.sequences s where s.id = (a ->> 'sequence_id')::uuid and s.account_id = v_acc
        on conflict do nothing;
      when 'unsub_seq' then
        delete from public.contact_sequences where contact_id = p_contact_id and sequence_id = (a ->> 'sequence_id')::uuid;
      when 'open_chat' then
        update public.contacts set live_chat_status = 'open', is_unread = true, last_message_at = coalesce(last_message_at, now())
        where id = p_contact_id;
      when 'assign' then
        update public.contacts set assigned_to = nullif(a ->> 'user_id', '')::uuid, live_chat_status = 'open'
        where id = p_contact_id
          and (a ->> 'user_id' is null or exists (select 1 from public.account_members m where m.account_id = v_acc and m.user_id = (a ->> 'user_id')::uuid));
      when 'notify' then
        select coalesce(jsonb_agg(c.tg_user_id), '[]'::jsonb) into v_notify
        from public.account_members m join public.contacts c on c.id = m.tg_contact_id
        where m.account_id = v_acc and m.role in ('admin', 'editor', 'agent');
      when 'schedule' then
        insert into public.scheduled_jobs (account_id, type, payload, run_at)
        values (v_acc, coalesce(a ->> 'type', 'flow_step'), coalesce(a -> 'payload', '{}'::jsonb) || jsonb_build_object('contact_id', p_contact_id),
                coalesce((a ->> 'run_at')::timestamptz, now()));
      when 'delete_contact' then
        delete from public.contacts where id = p_contact_id;
        v_deleted := true;
        exit;
      else null;
    end case;
  end loop;

  if v_deleted then
    return jsonb_build_object('deleted', true);
  end if;
  if p_state is not null then
    update public.contacts set bot_state = p_state where id = p_contact_id;
  end if;
  return public.contact_snapshot(p_contact_id) || jsonb_build_object('notify', v_notify);
end $$;
revoke execute on function public.contact_apply(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.contact_apply(uuid, jsonb, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Preview: jamoa a'zosining Telegram'ini bog'lash (/start preview_<kod>)
-- ─────────────────────────────────────────────────────────────
create or replace function public.link_preview(p_bot_id uuid, p_code text, p_contact_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_acc uuid;
begin
  select account_id into v_acc from public.bots where id = p_bot_id;
  update public.account_members set tg_contact_id = p_contact_id
   where account_id = v_acc and preview_code = p_code;
  return found;
end $$;
revoke execute on function public.link_preview(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.link_preview(uuid, text, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Publish: Pro funksiyalar tarif bo'yicha tekshiriladi
-- ─────────────────────────────────────────────────────────────
create or replace function public.publish_flow(p_flow_id uuid, p_draft jsonb, p_compiled jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_flow public.flows;
  v_version integer;
  v_features jsonb;
begin
  select * into v_flow from public.flows where id = p_flow_id for update;
  if not found or not public.can_edit(v_flow.account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(p.features, '{}'::jsonb) into v_features
  from public.subscriptions s join public.plans p on p.id = s.plan_id where s.account_id = v_flow.account_id;
  if not coalesce((v_features ->> 'data_collection')::boolean, false)
     and jsonb_path_exists(p_compiled, '$.steps.*.blocks[*] ? (@.t == "input")') then
    raise exception 'upgrade_required:data_collection' using errcode = 'P0001';
  end if;
  if not coalesce((v_features ->> 'external_request')::boolean, false)
     and jsonb_path_exists(p_compiled, '$.steps.*.actions[*] ? (@.a == "http")') then
    raise exception 'upgrade_required:external_request' using errcode = 'P0001';
  end if;
  if not coalesce((v_features ->> 'live_chat_assign')::boolean, false)
     and jsonb_path_exists(p_compiled, '$.steps.*.actions[*] ? (@.a == "assign")') then
    raise exception 'upgrade_required:live_chat_assign' using errcode = 'P0001';
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

-- ─────────────────────────────────────────────────────────────
-- Media bucket (public o'qish; yozish — akkaunt admin/editor, papka = account_id)
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('media', 'media', true, 52428800)
    on conflict (id) do nothing;

    execute $p$
      create policy media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and ((storage.foldername(name))[1])::uuid in (select public.my_accounts('{admin,editor}'::public.member_role[])))
    $p$;
    execute $p$
      create policy media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'media' and ((storage.foldername(name))[1])::uuid in (select public.my_accounts('{admin,editor}'::public.member_role[])))
    $p$;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Ichki ishga tushirish (/run): Preview, Smart Delay, Sequence, Broadcast uchun kontekst
-- ─────────────────────────────────────────────────────────────
create or replace function public.run_context(p_bot_id uuid, p_contact_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_bot record;
  v_sub record;
  v_features jsonb;
  v_tg bigint;
begin
  select b.id, b.account_id, b.token_encrypted, b.username into v_bot from public.bots b where b.id = p_bot_id;
  if not found then return jsonb_build_object('ok', false); end if;
  select tg_user_id into v_tg from public.contacts where id = p_contact_id and account_id = v_bot.account_id;
  if v_tg is null then return jsonb_build_object('ok', false); end if;
  select s.status, s.current_period_end, s.plan_id into v_sub from public.subscriptions s where s.account_id = v_bot.account_id;
  select p.features into v_features from public.plans p where p.id = coalesce(v_sub.plan_id, 'start');
  return jsonb_build_object(
    'ok', true,
    'account_id', v_bot.account_id,
    'token_enc', v_bot.token_encrypted,
    'bot_username', v_bot.username,
    'chat_id', v_tg,
    'timezone', (select timezone from public.accounts where id = v_bot.account_id),
    'paused', v_sub is null or v_sub.status in ('expired', 'canceled') or v_sub.current_period_end + interval '3 days' < now(),
    'features', coalesce(v_features, '{}'::jsonb),
    'contact', public.contact_snapshot(p_contact_id),
    'flows', coalesce((
      select jsonb_object_agg(f.id, f.compiled) from public.flows f
      where f.account_id = v_bot.account_id and f.status = 'live' and f.deleted_at is null and f.compiled is not null
    ), '{}'::jsonb),
    'bot_fields', coalesce((
      select jsonb_object_agg(cf.name, cf.bot_value) from public.custom_fields cf where cf.account_id = v_bot.account_id and cf.is_bot_field
    ), '{}'::jsonb)
  );
end $$;
revoke execute on function public.run_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.run_context(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Preview: Live bo'lmagan draft kompilyatsiyasi (faqat preview'ga ulangan admin kontakti o'qiy oladi)
-- ─────────────────────────────────────────────────────────────
alter table public.flows add column if not exists preview_compiled jsonb;

create or replace function public.preview_flow(p_bot_id uuid, p_flow_id uuid, p_contact_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select f.preview_compiled
  from public.flows f
  join public.bots b on b.account_id = f.account_id and b.id = p_bot_id
  where f.id = p_flow_id and f.deleted_at is null
    and exists (select 1 from public.account_members m where m.account_id = f.account_id and m.tg_contact_id = p_contact_id)
$$;
revoke execute on function public.preview_flow(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.preview_flow(uuid, uuid, uuid) to service_role;

-- Preview ma'lumotlari (joriy foydalanuvchi uchun)
create or replace function public.my_preview(p_account_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'code', m.preview_code,
    'contact_id', m.tg_contact_id,
    'bot_id', b.id,
    'bot_username', b.username
  )
  from public.account_members m
  left join public.bots b on b.account_id = m.account_id and b.status = 'connected'
  where m.account_id = p_account_id and m.user_id = (select auth.uid())
  limit 1
$$;
revoke execute on function public.my_preview(uuid) from public, anon;
grant execute on function public.my_preview(uuid) to authenticated;

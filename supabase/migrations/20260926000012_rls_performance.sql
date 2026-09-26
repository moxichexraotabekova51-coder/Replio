-- Replio — RLS tezligi (8-bo'lim: 50 000 kontaktda ≤ 500 ms)
-- Eski siyosatlar har bir qator uchun is_member()/can_chat() funksiyasini chaqirardi.
-- Yangi ko'rinish: account_id IN (SELECT public.my_accounts(...)) — subquery so'rovda BIR MARTA hisoblanadi (initplan).

create or replace function public.my_accounts(p_roles public.member_role[] default null)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.account_id from public.account_members m
  where m.user_id = auth.uid() and (p_roles is null or m.role = any(p_roles))
$$;
revoke execute on function public.my_accounts(public.member_role[]) from public, anon;
grant execute on function public.my_accounts(public.member_role[]) to authenticated;

do $$
declare
  p record;
  q text;
  w text;
  fn text;
  roles text;
  map constant text[][] := array[
    array['is_member', 'NULL'],
    array['can_edit', '''{admin,editor}''::public.member_role[]'],
    array['can_chat', '''{admin,editor,agent}''::public.member_role[]'],
    array['can_view_automation', '''{admin,editor,viewer}''::public.member_role[]'],
    array['is_admin', '''{admin}''::public.member_role[]']
  ];
  i int;
begin
  for p in
    select * from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(is_member|can_edit|can_chat|can_view_automation|is_admin|account_role)\('
        or coalesce(with_check, '') ~ '(is_member|can_edit|can_chat|can_view_automation|is_admin|account_role)\(')
  loop
    q := p.qual;
    w := p.with_check;
    for i in 1 .. array_length(map, 1) loop
      fn := map[i][1];
      roles := map[i][2];
      -- Bola jadvallar: contact_account / flow_account / sequence_account
      q := regexp_replace(q, fn || '\(contact_account\(contact_id\)\)',
        'contact_id IN (SELECT c.id FROM public.contacts c WHERE c.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      w := regexp_replace(w, fn || '\(contact_account\(contact_id\)\)',
        'contact_id IN (SELECT c.id FROM public.contacts c WHERE c.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      q := regexp_replace(q, fn || '\(flow_account\(flow_id\)\)',
        'flow_id IN (SELECT f.id FROM public.flows f WHERE f.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      w := regexp_replace(w, fn || '\(flow_account\(flow_id\)\)',
        'flow_id IN (SELECT f.id FROM public.flows f WHERE f.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      q := regexp_replace(q, fn || '\(sequence_account\(sequence_id\)\)',
        'sequence_id IN (SELECT s.id FROM public.sequences s WHERE s.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      w := regexp_replace(w, fn || '\(sequence_account\(sequence_id\)\)',
        'sequence_id IN (SELECT s.id FROM public.sequences s WHERE s.account_id IN (SELECT public.my_accounts(' || roles || ')))', 'g');
      -- Oddiy: fn(ustun)
      q := regexp_replace(q, '\m' || fn || '\((\w+)\)', '\1 IN (SELECT public.my_accounts(' || roles || '))', 'g');
      w := regexp_replace(w, '\m' || fn || '\((\w+)\)', '\1 IN (SELECT public.my_accounts(' || roles || '))', 'g');
    end loop;
    q := regexp_replace(q, 'account_role\(account_id\) = ''agent''::member_role',
      'account_id IN (SELECT public.my_accounts(''{agent}''::public.member_role[]))', 'g');

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s %s %s',
      p.policyname, p.tablename, p.permissive, p.cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r),
      case when q is not null then 'using (' || q || ')' else '' end,
      case when w is not null then 'with check (' || w || ')' else '' end);
  end loop;
end $$;

-- Contacts RPC'lari: a'zolikni boshida bir marta tekshiramiz (qator-darajali RLS'siz — tez)
alter function public.contacts_page(uuid, jsonb, text, timestamptz, uuid, integer) security definer;
alter function public.contacts_count(uuid, jsonb, text) security definer;
alter function public.contacts_export(uuid, jsonb, text) security definer;

create or replace function public.contacts_page(
  p_account_id uuid, p_filter jsonb default '{}'::jsonb, p_search text default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 50
)
returns table (
  id uuid, first_name text, last_name text, username text, avatar_url text, subscribed_at timestamptz,
  last_interaction_at timestamptz, is_subscribed boolean, tags jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query execute format(
    'select c.id, c.first_name, c.last_name, c.username, c.avatar_url, c.subscribed_at, c.last_interaction_at, c.is_subscribed,
            coalesce((select jsonb_agg(jsonb_build_object(''id'', t.id, ''name'', t.name) order by t.name)
                      from public.contact_tags ct join public.tags t on t.id = ct.tag_id where ct.contact_id = c.id), ''[]''::jsonb)
       from public.contacts c
      where c.account_id = %L::uuid and (%s)
        and (%L::timestamptz is null or (c.subscribed_at, c.id) < (%L::timestamptz, %L::uuid))
      order by c.subscribed_at desc, c.id desc
      limit %s',
    p_account_id, public.contact_filter_sql(p_filter, p_search), p_before, p_before,
    coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), least(greatest(p_limit, 1), 500));
end $$;

create or replace function public.contacts_count(p_account_id uuid, p_filter jsonb default '{}'::jsonb, p_search text default null)
returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare v bigint;
begin
  if not public.is_member(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  execute format('select count(*) from public.contacts c where c.account_id = %L::uuid and (%s)',
    p_account_id, public.contact_filter_sql(p_filter, p_search)) into v;
  return v;
end $$;

create or replace function public.contacts_export(p_account_id uuid, p_filter jsonb default '{}'::jsonb, p_search text default null)
returns table (
  id uuid, tg_user_id bigint, first_name text, last_name text, username text, language_code text,
  subscribed_at timestamptz, last_interaction_at timestamptz, is_subscribed boolean, tags text, fields jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_member(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query execute format(
    'select c.id, c.tg_user_id, c.first_name, c.last_name, c.username, c.language_code, c.subscribed_at, c.last_interaction_at, c.is_subscribed,
            (select string_agg(t.name, '', '' order by t.name) from public.contact_tags ct join public.tags t on t.id = ct.tag_id where ct.contact_id = c.id),
            coalesce((select jsonb_object_agg(f.name, v.value) from public.contact_field_values v join public.custom_fields f on f.id = v.field_id where v.contact_id = c.id), ''{}''::jsonb)
       from public.contacts c where c.account_id = %L::uuid and (%s)
      order by c.subscribed_at desc limit 100000',
    p_account_id, public.contact_filter_sql(p_filter, p_search));
end $$;

-- Ommaviy amallar: huquq amal turiga qarab (o'chirish/sequence — editor, teg/maydon — agent ham)
create or replace function public.contacts_bulk(
  p_account_id uuid, p_ids uuid[], p_filter jsonb, p_search text, p_action text, p_arg jsonb default '{}'::jsonb
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if p_action in ('delete', 'subscribe_sequence', 'unsubscribe_sequence') then
    if not public.can_edit(p_account_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif not public.can_chat(p_account_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_ids is null then
    execute format('select coalesce(array_agg(c.id), ''{}'') from public.contacts c where c.account_id = %L::uuid and (%s)',
      p_account_id, public.contact_filter_sql(p_filter, p_search)) into v_ids;
  else
    select coalesce(array_agg(c.id), '{}') into v_ids from public.contacts c where c.account_id = p_account_id and c.id = any(p_ids);
  end if;

  -- Teg/maydon/sequence shu akkauntga tegishli bo'lishi shart
  if p_arg ? 'tag_id' and not exists (select 1 from public.tags where id = (p_arg ->> 'tag_id')::uuid and account_id = p_account_id) then
    raise exception 'tag_not_found' using errcode = 'P0002';
  end if;
  if p_arg ? 'field_id' and not exists (select 1 from public.custom_fields where id = (p_arg ->> 'field_id')::uuid and account_id = p_account_id) then
    raise exception 'field_not_found' using errcode = 'P0002';
  end if;
  if p_arg ? 'sequence_id' and not exists (select 1 from public.sequences where id = (p_arg ->> 'sequence_id')::uuid and account_id = p_account_id) then
    raise exception 'sequence_not_found' using errcode = 'P0002';
  end if;

  case p_action
    when 'add_tag' then
      insert into public.contact_tags (contact_id, tag_id)
      select unnest(v_ids), (p_arg ->> 'tag_id')::uuid on conflict do nothing;
    when 'remove_tag' then
      delete from public.contact_tags where contact_id = any(v_ids) and tag_id = (p_arg ->> 'tag_id')::uuid;
    when 'set_field' then
      insert into public.contact_field_values (contact_id, field_id, value, updated_at)
      select unnest(v_ids), (p_arg ->> 'field_id')::uuid, p_arg -> 'value', now()
      on conflict (contact_id, field_id) do update set value = excluded.value, updated_at = now();
    when 'clear_field' then
      delete from public.contact_field_values where contact_id = any(v_ids) and field_id = (p_arg ->> 'field_id')::uuid;
    when 'subscribe_sequence' then
      insert into public.contact_sequences (contact_id, sequence_id, current_step, next_run_at)
      select unnest(v_ids), (p_arg ->> 'sequence_id')::uuid, 0, now() on conflict do nothing;
    when 'unsubscribe_sequence' then
      delete from public.contact_sequences where contact_id = any(v_ids) and sequence_id = (p_arg ->> 'sequence_id')::uuid;
    when 'delete' then
      delete from public.contacts where id = any(v_ids);
    else
      raise exception 'unknown_action' using errcode = '22023';
  end case;
  return coalesce(array_length(v_ids, 1), 0);
end $$;

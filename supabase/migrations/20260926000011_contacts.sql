-- Replio — Contacts: filtr (AND/OR), sahifalash, ommaviy amallar, eksport
-- Filtr formati:
-- { "op": "and" | "or", "rules": [
--   { "kind": "tag", "tag_id": uuid, "neg": bool },
--   { "kind": "field", "field_id": uuid, "cmp": "eq|neq|gt|lt|contains|empty|not_empty", "value": any },
--   { "kind": "system", "field": "first_name|last_name|username|language_code|is_subscribed|live_chat_status",
--     "cmp": "eq|neq|contains|empty|not_empty", "value": any },
--   { "kind": "sequence", "sequence_id": uuid, "neg": bool },
--   { "kind": "subscribed", "cmp": "before|after", "value": "2026-01-01" } ] }

create index if not exists contact_field_values_field_idx on public.contact_field_values (field_id);
create index if not exists contacts_account_sub_id_idx on public.contacts (account_id, subscribed_at desc, id desc);

-- Filtrdan xavfsiz WHERE ifodasi (barcha qiymatlar %L bilan escape qilinadi)
create or replace function public.contact_filter_sql(p_filter jsonb, p_search text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  r jsonb;
  parts text[] := '{}';
  op text := case when p_filter ->> 'op' = 'or' then ' or ' else ' and ' end;
  cmp text;
  expr text;
  col text;
  num numeric;
begin
  for r in select * from jsonb_array_elements(coalesce(p_filter -> 'rules', '[]'::jsonb)) loop
    cmp := coalesce(r ->> 'cmp', 'eq');
    expr := null;
    case r ->> 'kind'
      when 'tag' then
        expr := format('exists (select 1 from public.contact_tags ct where ct.contact_id = c.id and ct.tag_id = %L::uuid)', r ->> 'tag_id');
        if coalesce((r ->> 'neg')::boolean, false) then expr := 'not ' || expr; end if;
      when 'sequence' then
        expr := format('exists (select 1 from public.contact_sequences cs where cs.contact_id = c.id and cs.sequence_id = %L::uuid)', r ->> 'sequence_id');
        if coalesce((r ->> 'neg')::boolean, false) then expr := 'not ' || expr; end if;
      when 'subscribed' then
        expr := format('c.subscribed_at %s %L::date', case when cmp = 'before' then '<' else '>=' end, r ->> 'value');
      when 'system' then
        col := case r ->> 'field'
          when 'first_name' then 'c.first_name' when 'last_name' then 'c.last_name' when 'username' then 'c.username'
          when 'language_code' then 'c.language_code' when 'is_subscribed' then 'c.is_subscribed::text'
          when 'live_chat_status' then 'c.live_chat_status::text' else null end;
        if col is not null then
          expr := case cmp
            when 'empty' then format('coalesce(%s, '''') = ''''', col)
            when 'not_empty' then format('coalesce(%s, '''') <> ''''', col)
            when 'neq' then format('coalesce(lower(%s), '''') <> lower(%L)', col, r ->> 'value')
            when 'contains' then format('lower(%s) like ''%%'' || lower(%L) || ''%%''', col, r ->> 'value')
            else format('lower(%s) = lower(%L)', col, r ->> 'value') end;
        end if;
      when 'field' then
        expr := case cmp
          when 'empty' then format('not exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and v.value is not null and v.value <> ''null''::jsonb and v.value <> ''""''::jsonb)', r ->> 'field_id')
          when 'not_empty' then format('exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and v.value is not null and v.value <> ''null''::jsonb and v.value <> ''""''::jsonb)', r ->> 'field_id')
          when 'gt' then format('exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and jsonb_typeof(v.value) = ''number'' and (v.value)::numeric > %L::numeric)', r ->> 'field_id', r ->> 'value')
          when 'lt' then format('exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and jsonb_typeof(v.value) = ''number'' and (v.value)::numeric < %L::numeric)', r ->> 'field_id', r ->> 'value')
          when 'contains' then format('exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and lower(v.value #>> ''{}'') like ''%%'' || lower(%L) || ''%%'')', r ->> 'field_id', r ->> 'value')
          when 'neq' then format('not exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and lower(v.value #>> ''{}'') = lower(%L))', r ->> 'field_id', r ->> 'value')
          else format('exists (select 1 from public.contact_field_values v where v.contact_id = c.id and v.field_id = %L::uuid and lower(v.value #>> ''{}'') = lower(%L))', r ->> 'field_id', r ->> 'value') end;
      else null;
    end case;
    if expr is not null then parts := parts || ('(' || expr || ')'); end if;
  end loop;

  expr := case when array_length(parts, 1) is null then 'true' else array_to_string(parts, op) end;
  if coalesce(trim(p_search), '') <> '' then
    expr := format('(%s) and c.search like ''%%'' || lower(%L) || ''%%''', expr, trim(p_search));
  end if;
  return expr;
end $$;

-- Sahifa (keyset: subscribed_at desc, id desc) — RLS amal qiladi
create or replace function public.contacts_page(
  p_account_id uuid, p_filter jsonb default '{}'::jsonb, p_search text default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 50
)
returns table (
  id uuid, first_name text, last_name text, username text, avatar_url text, subscribed_at timestamptz,
  last_interaction_at timestamptz, is_subscribed boolean, tags jsonb
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
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
language plpgsql stable security invoker set search_path = ''
as $$
declare v bigint;
begin
  execute format('select count(*) from public.contacts c where c.account_id = %L::uuid and (%s)',
    p_account_id, public.contact_filter_sql(p_filter, p_search)) into v;
  return v;
end $$;

-- Ommaviy amallar: p_ids berilsa — o'shalar, aks holda filtr bo'yicha hammasi
create or replace function public.contacts_bulk(
  p_account_id uuid, p_ids uuid[], p_filter jsonb, p_search text, p_action text, p_arg jsonb default '{}'::jsonb
)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_ids uuid[];
  v_n integer;
begin
  if p_ids is null then
    execute format('select coalesce(array_agg(c.id), ''{}'') from public.contacts c where c.account_id = %L::uuid and (%s)',
      p_account_id, public.contact_filter_sql(p_filter, p_search)) into v_ids;
  else
    select coalesce(array_agg(c.id), '{}') into v_ids from public.contacts c where c.account_id = p_account_id and c.id = any(p_ids);
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
  get diagnostics v_n = row_count;
  return coalesce(array_length(v_ids, 1), 0);
end $$;

-- CSV eksport uchun (RLS amal qiladi)
create or replace function public.contacts_export(p_account_id uuid, p_filter jsonb default '{}'::jsonb, p_search text default null)
returns table (
  id uuid, tg_user_id bigint, first_name text, last_name text, username text, language_code text,
  subscribed_at timestamptz, last_interaction_at timestamptz, is_subscribed boolean, tags text, fields jsonb
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  return query execute format(
    'select c.id, c.tg_user_id, c.first_name, c.last_name, c.username, c.language_code, c.subscribed_at, c.last_interaction_at, c.is_subscribed,
            (select string_agg(t.name, '', '' order by t.name) from public.contact_tags ct join public.tags t on t.id = ct.tag_id where ct.contact_id = c.id),
            coalesce((select jsonb_object_agg(f.name, v.value) from public.contact_field_values v join public.custom_fields f on f.id = v.field_id where v.contact_id = c.id), ''{}''::jsonb)
       from public.contacts c where c.account_id = %L::uuid and (%s)
      order by c.subscribed_at desc limit 100000',
    p_account_id, public.contact_filter_sql(p_filter, p_search));
end $$;

revoke execute on function public.contact_filter_sql(jsonb, text) from public, anon;
grant execute on function public.contacts_page(uuid, jsonb, text, timestamptz, uuid, integer),
  public.contacts_count(uuid, jsonb, text), public.contacts_bulk(uuid, uuid[], jsonb, text, text, jsonb),
  public.contacts_export(uuid, jsonb, text), public.contact_filter_sql(jsonb, text) to authenticated;
revoke execute on function public.contacts_page(uuid, jsonb, text, timestamptz, uuid, integer),
  public.contacts_count(uuid, jsonb, text), public.contacts_bulk(uuid, uuid[], jsonb, text, text, jsonb),
  public.contacts_export(uuid, jsonb, text) from public, anon;

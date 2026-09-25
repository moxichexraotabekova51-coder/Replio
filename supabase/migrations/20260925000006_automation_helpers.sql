-- Replio — Basic avtomatlashtirishlar va Trash tozalash

-- Welcome Message / Default Reply flow'ini qaytaradi (bo'lmasa yaratadi)
create or replace function public.ensure_basic_flow(p_account_id uuid, p_kind text)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_trigger text;
begin
  if p_kind not in ('welcome', 'default_reply') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  select id into v_id from public.flows where account_id = p_account_id and basic_kind = p_kind;
  if found then
    update public.flows set deleted_at = null where id = v_id and deleted_at is not null;
    return v_id;
  end if;

  v_name := case p_kind when 'welcome' then 'Welcome Message' else 'Default Reply' end;
  v_trigger := p_kind;

  insert into public.flows (account_id, name, is_basic, basic_kind, draft)
  values (
    p_account_id, v_name, true, p_kind,
    '{"nodes":[{"id":"trigger","type":"trigger","position":{"x":0,"y":0},"data":{}},{"id":"m1","type":"message","position":{"x":700,"y":0},"data":{"name":"Send Message","blocks":[]}}],"edges":[{"id":"e1","source":"trigger","sourceHandle":"then","target":"m1"}]}'::jsonb
  )
  returning id into v_id;

  insert into public.triggers (account_id, flow_id, type, config) values (p_account_id, v_id, v_trigger, '{}'::jsonb);
  return v_id;
end $$;
grant execute on function public.ensure_basic_flow(uuid, text) to authenticated;

-- Trash'dagi 30 kundan eski avtomatlashtirishlarni butunlay o'chirish (kunlik)
create or replace function public.purge_trash()
returns void
language sql security definer set search_path = ''
as $$
  delete from public.flows where deleted_at is not null and deleted_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('replio-purge-trash', '17 3 * * *', 'select public.purge_trash()');
  end if;
end $$;

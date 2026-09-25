-- Replio — Settings bo'limi uchun funksiyalar

-- Jamoa a'zolari email'lari (faqat shu akkaunt a'zolariga)
create or replace function public.account_member_emails(p_account_id uuid)
returns table (user_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email::text
  from public.account_members m
  join auth.users u on u.id = m.user_id
  where m.account_id = p_account_id and public.is_member(p_account_id)
$$;
grant execute on function public.account_member_emails(uuid) to authenticated;

-- Email bo'yicha foydalanuvchi id (faqat server/service_role)
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;
revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- Teglar va har bir tegdagi kontaktlar soni
create or replace function public.tags_with_counts(p_account_id uuid)
returns table (id uuid, name text, folder text, created_at timestamptz, contacts bigint)
language sql stable security invoker set search_path = ''
as $$
  select t.id, t.name, t.folder, t.created_at, (select count(*) from public.contact_tags ct where ct.tag_id = t.id)
  from public.tags t where t.account_id = p_account_id
  order by t.folder nulls first, t.name
$$;
grant execute on function public.tags_with_counts(uuid) to authenticated;

-- Tezlik statistikasi (Settings → Logs): p50/p95/p99, sekin javoblar
create or replace function public.latency_summary(p_account_id uuid, p_hours integer default 24)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with bot as (
    select ms, kind, received_at from public.latency_logs
    where account_id = p_account_id and received_at > now() - make_interval(hours => p_hours)
  ),
  web as (
    select ms, kind, name, created_at from public.perf_logs
    where account_id = p_account_id and created_at > now() - make_interval(hours => p_hours) and ms is not null
  )
  select jsonb_build_object(
    'bot', jsonb_build_object(
      'count', (select count(*) from bot),
      'p50', (select percentile_disc(0.5) within group (order by ms) from bot),
      'p95', (select percentile_disc(0.95) within group (order by ms) from bot),
      'p99', (select percentile_disc(0.99) within group (order by ms) from bot),
      'slow', (select count(*) from bot where ms > 2000)
    ),
    'web', coalesce((
      select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object(
          'name', name, 'count', count(*),
          'p50', percentile_disc(0.5) within group (order by ms),
          'p95', percentile_disc(0.95) within group (order by ms),
          'p99', percentile_disc(0.99) within group (order by ms),
          'slow', count(*) filter (where ms > 2000)
        ) x
        from web group by name
      ) s
    ), '[]'::jsonb),
    'slow_bot', coalesce((
      select jsonb_agg(jsonb_build_object('at', received_at, 'ms', ms, 'kind', kind) order by received_at desc)
      from (select * from bot where ms > 2000 order by received_at desc limit 20) s
    ), '[]'::jsonb),
    'errors', coalesce((
      select jsonb_agg(jsonb_build_object('at', created_at, 'name', name, 'meta', meta) order by created_at desc)
      from (
        select created_at, name, meta from public.perf_logs
        where account_id = p_account_id and kind = 'error' and created_at > now() - make_interval(hours => p_hours)
        order by created_at desc limit 50
      ) e
    ), '[]'::jsonb)
  )
$$;
grant execute on function public.latency_summary(uuid, integer) to authenticated;

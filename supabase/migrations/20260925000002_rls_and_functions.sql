-- Replio — RLS siyosatlari va yordamchi funksiyalar
-- Qoida: foydalanuvchi faqat o'zi a'zo bo'lgan account_id ma'lumotlarini ko'radi.
--        'agent' roli faqat Live Chat va Contacts ma'lumotlarini ko'radi.
--        'viewer' faqat o'qiydi.

-- ─────────────────────────────────────────────────────────────
-- Rol tekshiruvchi funksiyalar (security definer — RLS rekursiyasiz)
-- ─────────────────────────────────────────────────────────────
create or replace function public.account_role(aid uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.account_members m
  where m.account_id = aid and m.user_id = auth.uid()
$$;

create or replace function public.is_member(aid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = aid and m.user_id = auth.uid()
  )
$$;

-- admin/editor/viewer (agent emas)
create or replace function public.can_view_automation(aid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.account_role(aid) in ('admin', 'editor', 'viewer'), false)
$$;

-- admin/editor
create or replace function public.can_edit(aid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.account_role(aid) in ('admin', 'editor'), false)
$$;

-- admin/editor/agent (Live Chat, kontaktlar)
create or replace function public.can_chat(aid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.account_role(aid) in ('admin', 'editor', 'agent'), false)
$$;

create or replace function public.is_admin(aid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.account_role(aid) = 'admin', false)
$$;

grant execute on function public.account_role(uuid), public.is_member(uuid),
  public.can_view_automation(uuid), public.can_edit(uuid), public.can_chat(uuid),
  public.is_admin(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger flows_touch before update on public.flows
  for each row execute function public.touch_updated_at();
create trigger triggers_touch before update on public.triggers
  for each row execute function public.touch_updated_at();
create trigger broadcasts_touch before update on public.broadcasts
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Yangi foydalanuvchi → profil
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  -- Kutilayotgan takliflarni avtomatik qabul qilish
  insert into public.account_members (account_id, user_id, role)
  select i.account_id, new.id, i.role
  from public.account_invites i
  where lower(i.email) = lower(new.email) and i.accepted_at is null
  on conflict do nothing;

  update public.account_invites
     set accepted_at = now()
   where lower(email) = lower(new.email) and accepted_at is null;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Akkaunt yaratish (7 kunlik sinov muddati — Start tarifi)
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_account(p_name text, p_timezone text default 'Asia/Tashkent')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  insert into public.accounts (owner_id, name, timezone)
  values (v_uid, trim(p_name), coalesce(p_timezone, 'Asia/Tashkent'))
  returning id into v_id;

  insert into public.account_members (account_id, user_id, role) values (v_id, v_uid, 'admin');

  insert into public.subscriptions (account_id, plan_id, status, current_period_end)
  values (v_id, 'start', 'trialing', now() + interval '7 days');

  insert into public.inbox_labels (account_id, name, icon, is_default)
  values (v_id, 'Favorites', 'heart', true);

  return v_id;
end $$;
grant execute on function public.create_account(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Avtomatlashtirishni nusxalash (triggerlari bilan)
-- ─────────────────────────────────────────────────────────────
create or replace function public.duplicate_flow(p_flow_id uuid)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_src public.flows;
  v_id  uuid;
begin
  select * into v_src from public.flows where id = p_flow_id;
  if not found then
    raise exception 'flow_not_found' using errcode = 'P0002';
  end if;

  insert into public.flows (account_id, folder_id, name, draft, status)
  values (v_src.account_id, v_src.folder_id, left(v_src.name || ' (nusxa)', 200), v_src.draft, 'draft')
  returning id into v_id;

  insert into public.triggers (account_id, flow_id, type, config, conditions, actions, priority, is_active)
  select account_id, v_id, type, config, conditions, actions, priority, is_active
  from public.triggers where flow_id = p_flow_id;

  return v_id;
end $$;
grant execute on function public.duplicate_flow(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Yangi avtomatlashtirish (noldan yoki shablondan) — bitta tranzaksiyada
-- ─────────────────────────────────────────────────────────────
create or replace function public.create_flow(
  p_account_id uuid, p_template_id uuid default null, p_folder_id uuid default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_tpl public.templates;
  v_id  uuid;
  v_draft jsonb := '{"nodes":[{"id":"trigger","type":"trigger","position":{"x":0,"y":0},"data":{}},{"id":"m1","type":"message","position":{"x":700,"y":0},"data":{"name":"Send Message","blocks":[]}}],"edges":[{"id":"e1","source":"trigger","sourceHandle":"then","target":"m1"}]}'::jsonb;
  v_name text := 'Untitled';
begin
  if p_template_id is not null then
    select * into v_tpl from public.templates where id = p_template_id;
    if not found then
      raise exception 'template_not_found' using errcode = 'P0002';
    end if;
    v_draft := v_tpl.flow_json -> 'draft';
    v_name := v_tpl.name;
  end if;

  insert into public.flows (account_id, folder_id, name, draft)
  values (p_account_id, p_folder_id, v_name, v_draft)
  returning id into v_id;

  if p_template_id is not null then
    insert into public.triggers (account_id, flow_id, type, config)
    select p_account_id, v_id, t ->> 'type', coalesce(t -> 'config', '{}'::jsonb)
    from jsonb_array_elements(coalesce(v_tpl.flow_json -> 'triggers', '[]'::jsonb)) t;
  end if;

  return v_id;
end $$;
grant execute on function public.create_flow(uuid, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Kontakt jadvali ↔ account_id orqali tekshiruv
-- ─────────────────────────────────────────────────────────────
create or replace function public.contact_account(cid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select account_id from public.contacts where id = cid $$;

create or replace function public.flow_account(fid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select account_id from public.flows where id = fid $$;

create or replace function public.sequence_account(sid uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select account_id from public.sequences where id = sid $$;

grant execute on function public.contact_account(uuid), public.flow_account(uuid),
  public.sequence_account(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- RLS yoqish
-- ─────────────────────────────────────────────────────────────
alter table public.plans                enable row level security;
alter table public.profiles             enable row level security;
alter table public.accounts             enable row level security;
alter table public.account_members      enable row level security;
alter table public.account_invites      enable row level security;
alter table public.bots                 enable row level security;
alter table public.contacts             enable row level security;
alter table public.tags                 enable row level security;
alter table public.contact_tags         enable row level security;
alter table public.custom_fields        enable row level security;
alter table public.contact_field_values enable row level security;
alter table public.folders              enable row level security;
alter table public.flows                enable row level security;
alter table public.flow_versions        enable row level security;
alter table public.triggers             enable row level security;
alter table public.sequences            enable row level security;
alter table public.sequence_steps       enable row level security;
alter table public.contact_sequences    enable row level security;
alter table public.broadcasts           enable row level security;
alter table public.growth_tools         enable row level security;
alter table public.messages             enable row level security;
alter table public.inbox_labels         enable row level security;
alter table public.contact_labels       enable row level security;
alter table public.reminders            enable row level security;
alter table public.step_stats           enable row level security;
alter table public.scheduled_jobs       enable row level security;
alter table public.latency_logs         enable row level security;
alter table public.perf_logs            enable row level security;
alter table public.daily_stats          enable row level security;
alter table public.subscriptions        enable row level security;
alter table public.payments             enable row level security;
alter table public.templates            enable row level security;
alter table public.api_keys             enable row level security;

-- Ommaviy ma'lumotlar
create policy plans_read on public.plans for select to anon, authenticated using (true);
create policy templates_read on public.templates for select to authenticated using (true);

-- Profil: o'zi va jamoadoshlari ko'radi, faqat o'zi o'zgartiradi
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.account_members a
    join public.account_members b on b.account_id = a.account_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Akkauntlar (yaratish faqat create_account() orqali)
create policy accounts_select on public.accounts for select to authenticated using (public.is_member(id));
create policy accounts_update on public.accounts for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
create policy accounts_delete on public.accounts for delete to authenticated using (owner_id = auth.uid());

-- A'zolar
create policy members_select on public.account_members for select to authenticated using (public.is_member(account_id));
create policy members_insert on public.account_members for insert to authenticated with check (public.is_admin(account_id));
create policy members_update on public.account_members for update to authenticated
  using (public.is_admin(account_id))
  with check (
    public.is_admin(account_id)
    and (role = 'admin' or user_id <> (select owner_id from public.accounts where id = account_id))
  );
create policy members_delete on public.account_members for delete to authenticated using (
  (public.is_admin(account_id) or user_id = auth.uid())
  and user_id <> (select owner_id from public.accounts where id = account_id)
);

create policy invites_all on public.account_invites for all to authenticated
  using (public.is_admin(account_id)) with check (public.is_admin(account_id));

-- Botlar: token va webhook_secret ustunlari frontendga berilmaydi
create policy bots_select on public.bots for select to authenticated using (public.is_member(account_id));
create policy bots_delete on public.bots for delete to authenticated using (public.is_admin(account_id));
revoke select, insert, update on public.bots from anon, authenticated;
grant select (id, account_id, tg_bot_id, username, first_name, webhook_ok, status, last_error, created_at)
  on public.bots to authenticated;

-- Kontaktlar va Live Chat ma'lumotlari (agent ham)
create policy contacts_select on public.contacts for select to authenticated using (public.is_member(account_id));
create policy contacts_update on public.contacts for update to authenticated
  using (public.can_chat(account_id)) with check (public.can_chat(account_id));
create policy contacts_delete on public.contacts for delete to authenticated using (public.can_edit(account_id));

create policy tags_select on public.tags for select to authenticated using (public.is_member(account_id));
create policy tags_write on public.tags for all to authenticated
  using (public.can_chat(account_id)) with check (public.can_chat(account_id));

create policy contact_tags_select on public.contact_tags for select to authenticated
  using (public.is_member(public.contact_account(contact_id)));
create policy contact_tags_write on public.contact_tags for all to authenticated
  using (public.can_chat(public.contact_account(contact_id)))
  with check (public.can_chat(public.contact_account(contact_id)));

create policy fields_select on public.custom_fields for select to authenticated using (public.is_member(account_id));
create policy fields_write on public.custom_fields for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy field_values_select on public.contact_field_values for select to authenticated
  using (public.is_member(public.contact_account(contact_id)));
create policy field_values_write on public.contact_field_values for all to authenticated
  using (public.can_chat(public.contact_account(contact_id)))
  with check (public.can_chat(public.contact_account(contact_id)));

create policy messages_select on public.messages for select to authenticated using (public.is_member(account_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.can_chat(account_id) and direction = 'note' and author_id = auth.uid());

create policy labels_select on public.inbox_labels for select to authenticated using (public.is_member(account_id));
create policy labels_write on public.inbox_labels for all to authenticated
  using (public.can_chat(account_id)) with check (public.can_chat(account_id));

create policy contact_labels_select on public.contact_labels for select to authenticated
  using (public.is_member(public.contact_account(contact_id)));
create policy contact_labels_write on public.contact_labels for all to authenticated
  using (public.can_chat(public.contact_account(contact_id)))
  with check (public.can_chat(public.contact_account(contact_id)));

create policy reminders_all on public.reminders for all to authenticated
  using (public.is_member(account_id) and user_id = auth.uid())
  with check (public.can_chat(account_id) and user_id = auth.uid());

-- Avtomatlashtirish (agent ko'rmaydi)
create policy folders_select on public.folders for select to authenticated using (public.can_view_automation(account_id));
create policy folders_write on public.folders for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

-- Agent Inbox'dan "⚡ avtomatlashtirish yuborish" uchun faqat LIVE flowlar ro'yxatini ko'radi
create policy flows_select on public.flows for select to authenticated using (
  public.can_view_automation(account_id)
  or (public.account_role(account_id) = 'agent' and status = 'live' and deleted_at is null)
);
create policy flows_write on public.flows for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy flow_versions_select on public.flow_versions for select to authenticated
  using (public.can_view_automation(public.flow_account(flow_id)));

create policy triggers_select on public.triggers for select to authenticated using (public.can_view_automation(account_id));
create policy triggers_write on public.triggers for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy sequences_select on public.sequences for select to authenticated using (public.can_view_automation(account_id));
create policy sequences_write on public.sequences for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy sequence_steps_select on public.sequence_steps for select to authenticated
  using (public.can_view_automation(public.sequence_account(sequence_id)));
create policy sequence_steps_write on public.sequence_steps for all to authenticated
  using (public.can_edit(public.sequence_account(sequence_id)))
  with check (public.can_edit(public.sequence_account(sequence_id)));

create policy contact_sequences_select on public.contact_sequences for select to authenticated
  using (public.is_member(public.contact_account(contact_id)));
create policy contact_sequences_write on public.contact_sequences for all to authenticated
  using (public.can_edit(public.contact_account(contact_id)))
  with check (public.can_edit(public.contact_account(contact_id)));

create policy broadcasts_select on public.broadcasts for select to authenticated using (public.can_view_automation(account_id));
create policy broadcasts_write on public.broadcasts for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy growth_select on public.growth_tools for select to authenticated using (public.can_view_automation(account_id));
create policy growth_write on public.growth_tools for all to authenticated
  using (public.can_edit(account_id)) with check (public.can_edit(account_id));

create policy step_stats_select on public.step_stats for select to authenticated
  using (public.can_view_automation(public.flow_account(flow_id)));

-- Statistika va loglar
create policy daily_stats_select on public.daily_stats for select to authenticated using (public.can_view_automation(account_id));
create policy latency_select on public.latency_logs for select to authenticated using (public.can_view_automation(account_id));
create policy perf_select on public.perf_logs for select to authenticated using (public.can_view_automation(account_id));
create policy perf_insert on public.perf_logs for insert to authenticated
  with check (account_id is null or public.is_member(account_id));
create policy jobs_select on public.scheduled_jobs for select to authenticated using (public.can_view_automation(account_id));

-- Obuna va to'lovlar (yozish faqat server/service_role)
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_member(account_id));
create policy payments_select on public.payments for select to authenticated using (public.is_admin(account_id));
create policy api_keys_select on public.api_keys for select to authenticated using (public.is_admin(account_id));

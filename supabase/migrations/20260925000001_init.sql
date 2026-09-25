-- Replio — asosiy sxema (9-bo'lim)
-- Hamma jadvallar RLS bilan. Biznes logika Postgres funksiyalarida.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Enum turlari
-- ─────────────────────────────────────────────────────────────
create type public.member_role as enum ('admin', 'editor', 'agent', 'viewer');
create type public.flow_status as enum ('draft', 'live', 'stopped');
create type public.bot_status as enum ('connected', 'disconnected', 'error');
create type public.field_type as enum ('text', 'number', 'date', 'datetime', 'boolean');
create type public.live_chat_status as enum ('open', 'closed');
create type public.message_direction as enum ('in', 'out_bot', 'out_agent', 'note');
create type public.broadcast_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'expired', 'canceled');
create type public.billing_period as enum ('monthly', 'yearly');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'canceled');
create type public.job_status as enum ('pending', 'running', 'done', 'failed');

-- ─────────────────────────────────────────────────────────────
-- Tariflar (narxlar koddan emas, shu jadvaldan olinadi)
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id             text primary key,               -- 'start' | 'pro'
  name           text not null,
  price_monthly  integer not null check (price_monthly >= 1000),   -- so'm
  price_yearly   integer not null check (price_yearly >= 1000),    -- so'm
  contact_limit  integer not null,
  bot_limit      integer not null,
  seat_limit     integer not null,
  features       jsonb not null default '{}'::jsonb,
  sort_order     integer not null default 0
);

-- ─────────────────────────────────────────────────────────────
-- Foydalanuvchilar va akkauntlar
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  locale      text not null default 'uz',
  created_at  timestamptz not null default now()
);

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  timezone    text not null default 'Asia/Tashkent',
  locale      text not null default 'uz',
  plan_id     text not null default 'start' references public.plans (id),
  avatar_url  text,
  settings    jsonb not null default '{}'::jsonb,   -- inbox sozlamalari va h.k.
  created_at  timestamptz not null default now()
);
create index accounts_owner_idx on public.accounts (owner_id);

create table public.account_members (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'editor',
  created_at  timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index account_members_user_idx on public.account_members (user_id);

create table public.account_invites (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  email       text not null,
  role        public.member_role not null default 'editor',
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by  uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (account_id, email)
);

-- ─────────────────────────────────────────────────────────────
-- Telegram botlar
-- ─────────────────────────────────────────────────────────────
create table public.bots (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references public.accounts (id) on delete cascade,
  tg_bot_id        bigint not null,
  username         text not null,
  first_name       text,
  token_encrypted  text not null,           -- AES-GCM (BOT_TOKEN_KEY) bilan shifrlangan
  webhook_secret   text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  webhook_ok       boolean not null default false,
  status           public.bot_status not null default 'connected',
  last_error       text,
  created_at       timestamptz not null default now(),
  unique (tg_bot_id)
);
create index bots_account_idx on public.bots (account_id);

-- ─────────────────────────────────────────────────────────────
-- Kontaktlar, teglar, maydonlar
-- ─────────────────────────────────────────────────────────────
create table public.contacts (
  id                       uuid primary key default gen_random_uuid(),
  account_id               uuid not null references public.accounts (id) on delete cascade,
  bot_id                   uuid references public.bots (id) on delete set null,
  tg_user_id               bigint not null,
  first_name               text,
  last_name                text,
  username                 text,
  language_code            text,
  avatar_url               text,
  subscribed_at            timestamptz not null default now(),
  last_interaction_at      timestamptz,
  is_subscribed            boolean not null default true,
  live_chat_status         public.live_chat_status not null default 'closed',
  assigned_to              uuid references auth.users (id) on delete set null,
  automation_paused_until  timestamptz,
  is_unread                boolean not null default false,
  last_message_preview     text,
  last_message_at          timestamptz,
  over_limit               boolean not null default false,  -- tarif limitidan oshgan
  search                   text generated always as (
    lower(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(username, ''))
  ) stored,
  unique (account_id, tg_user_id)
);
create index contacts_account_subscribed_idx on public.contacts (account_id, subscribed_at desc);
create index contacts_account_last_msg_idx on public.contacts (account_id, last_message_at desc nulls last);
create index contacts_search_trgm_idx on public.contacts using gin (search extensions.gin_trgm_ops);

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 64),
  folder      text,
  created_at  timestamptz not null default now(),
  unique (account_id, name)
);

create table public.contact_tags (
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (contact_id, tag_id)
);
create index contact_tags_tag_idx on public.contact_tags (tag_id);

create table public.custom_fields (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 64),
  type          public.field_type not null default 'text',
  description   text,
  is_bot_field  boolean not null default false,
  bot_value     jsonb,
  created_at    timestamptz not null default now(),
  unique (account_id, name, is_bot_field)
);

create table public.contact_field_values (
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  field_id    uuid not null references public.custom_fields (id) on delete cascade,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (contact_id, field_id)
);

-- ─────────────────────────────────────────────────────────────
-- Avtomatlashtirishlar
-- ─────────────────────────────────────────────────────────────
create table public.folders (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  parent_id   uuid references public.folders (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index folders_account_idx on public.folders (account_id);

create table public.flows (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.accounts (id) on delete cascade,
  folder_id          uuid references public.folders (id) on delete set null,
  name               text not null default 'Untitled' check (char_length(name) between 1 and 200),
  draft              jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  compiled           jsonb,
  published_version  integer not null default 0,
  has_unpublished    boolean not null default false,
  status             public.flow_status not null default 'draft',
  is_basic           boolean not null default false,   -- Welcome / Default Reply va h.k.
  basic_kind         text,                             -- 'welcome' | 'default_reply'
  runs               integer not null default 0,
  clicks             integer not null default 0,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index flows_account_idx on public.flows (account_id, deleted_at, updated_at desc);
create index flows_name_trgm_idx on public.flows using gin (lower(name) extensions.gin_trgm_ops);
create unique index flows_basic_kind_uniq on public.flows (account_id, basic_kind) where basic_kind is not null;

create table public.flow_versions (
  id          uuid primary key default gen_random_uuid(),
  flow_id     uuid not null references public.flows (id) on delete cascade,
  version     integer not null,
  draft       jsonb not null,
  compiled    jsonb not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (flow_id, version)
);

create table public.triggers (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  flow_id     uuid not null references public.flows (id) on delete cascade,
  type        text not null check (type in (
                'keyword', 'welcome', 'ref_url', 'command', 'default_reply', 'message_type',
                'tag_applied', 'tag_removed', 'field_changed', 'date_based',
                'subscribed', 'unsubscribed', 'webhook')),
  config      jsonb not null default '{}'::jsonb,
  conditions  jsonb not null default '[]'::jsonb,
  actions     jsonb not null default '[]'::jsonb,
  priority    integer not null default 0,
  is_active   boolean not null default true,
  run_count   integer not null default 0,
  click_count integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index triggers_lookup_idx on public.triggers (account_id, type, is_active);
create index triggers_flow_idx on public.triggers (flow_id);

create table public.sequences (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.sequence_steps (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references public.sequences (id) on delete cascade,
  position     integer not null default 0,
  delay        interval not null default interval '1 day',
  flow_id      uuid references public.flows (id) on delete set null,
  send_window  jsonb,           -- {"from":"09:00","to":"21:00","days":[1,2,3,4,5]}
  is_active    boolean not null default true
);
create index sequence_steps_seq_idx on public.sequence_steps (sequence_id, position);

create table public.contact_sequences (
  contact_id    uuid not null references public.contacts (id) on delete cascade,
  sequence_id   uuid not null references public.sequences (id) on delete cascade,
  current_step  integer not null default 0,
  next_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  primary key (contact_id, sequence_id)
);
create index contact_sequences_next_idx on public.contact_sequences (next_run_at) where next_run_at is not null;

create table public.broadcasts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts (id) on delete cascade,
  name          text not null default 'Untitled',
  audience      jsonb not null default '{"type":"all"}'::jsonb,
  flow_id       uuid references public.flows (id) on delete set null,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  status        public.broadcast_status not null default 'draft',
  stats         jsonb not null default '{"total":0,"sent":0,"delivered":0,"clicked":0,"failed":0}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index broadcasts_account_idx on public.broadcasts (account_id, created_at desc);

create table public.growth_tools (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  type        text not null check (type in ('ref_url', 'qr', 'widget')),
  name        text not null default 'Untitled',
  ref_code    text not null,
  flow_id     uuid references public.flows (id) on delete set null,
  config      jsonb not null default '{}'::jsonb,
  stats       jsonb not null default '{"clicks":0,"subscribers":0}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (account_id, ref_code)
);

-- ─────────────────────────────────────────────────────────────
-- Xabarlar va Live Chat
-- ─────────────────────────────────────────────────────────────
create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.accounts (id) on delete cascade,
  contact_id     uuid not null references public.contacts (id) on delete cascade,
  direction      public.message_direction not null,
  type           text not null default 'text',
  content        jsonb not null default '{}'::jsonb,
  tg_message_id  bigint,
  flow_id        uuid references public.flows (id) on delete set null,
  step_id        text,
  author_id      uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index messages_contact_idx on public.messages (contact_id, created_at desc);
create index messages_account_idx on public.messages (account_id, created_at desc);

create table public.inbox_labels (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  icon        text not null default 'tag',
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (account_id, name)
);

create table public.contact_labels (
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  label_id    uuid not null references public.inbox_labels (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (contact_id, label_id)
);

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  remind_at   timestamptz not null,
  note        text,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index reminders_account_idx on public.reminders (account_id, remind_at) where not done;

-- ─────────────────────────────────────────────────────────────
-- Statistika, navbat, loglar
-- ─────────────────────────────────────────────────────────────
create table public.step_stats (
  flow_id    uuid not null references public.flows (id) on delete cascade,
  step_id    text not null,
  sent       integer not null default 0,
  delivered  integer not null default 0,
  clicked    integer not null default 0,
  primary key (flow_id, step_id)
);

create table public.scheduled_jobs (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references public.accounts (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  run_at      timestamptz not null default now(),
  status      public.job_status not null default 'pending',
  attempts    integer not null default 0,
  last_error  text,
  created_at  timestamptz not null default now()
);
create index scheduled_jobs_due_idx on public.scheduled_jobs (run_at) where status = 'pending';

create table public.latency_logs (
  id           bigint generated always as identity primary key,
  bot_id       uuid references public.bots (id) on delete cascade,
  account_id   uuid references public.accounts (id) on delete cascade,
  kind         text not null default 'message',
  received_at  timestamptz not null,
  sent_at      timestamptz not null,
  ms           integer not null
);
create index latency_logs_account_idx on public.latency_logs (account_id, received_at desc);

create table public.perf_logs (
  id          bigint generated always as identity primary key,
  account_id  uuid references public.accounts (id) on delete cascade,
  kind        text not null,        -- 'web_vital' | 'api' | 'error'
  name        text not null,
  ms          integer,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index perf_logs_account_idx on public.perf_logs (account_id, created_at desc);

create table public.daily_stats (
  account_id    uuid not null references public.accounts (id) on delete cascade,
  date          date not null,
  new_contacts  integer not null default 0,
  unsubscribed  integer not null default 0,
  messages_in   integer not null default 0,
  messages_out  integer not null default 0,
  clicks        integer not null default 0,
  primary key (account_id, date)
);

-- ─────────────────────────────────────────────────────────────
-- Obuna va to'lovlar
-- ─────────────────────────────────────────────────────────────
create table public.subscriptions (
  account_id          uuid primary key references public.accounts (id) on delete cascade,
  plan_id             text not null references public.plans (id),
  billing_period      public.billing_period not null default 'monthly',
  status              public.subscription_status not null default 'trialing',
  current_period_end  timestamptz not null,
  updated_at          timestamptz not null default now()
);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts (id) on delete cascade,
  plan_id         text not null references public.plans (id),
  billing_period  public.billing_period not null default 'monthly',
  amount          integer not null check (amount >= 1000),
  checkout_id     text,
  checkout_uuid   text unique,
  checkout_url    text,
  status          public.payment_status not null default 'pending',
  raw             jsonb,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  paid_at         timestamptz
);
create index payments_account_idx on public.payments (account_id, created_at desc);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

create table public.templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  category     text not null default 'general',
  icon         text not null default 'zap',
  flow_json    jsonb not null,
  sort_order   integer not null default 0
);

create table public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  key_hash    text not null unique,
  prefix      text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

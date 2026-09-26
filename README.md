# Replio

**Replio** — Telegram botlar uchun avtomatlashtirish platformasi: vizual flow builder, triggerlar,
broadcast, Live Chat va obunachilar bazasi. Interfeys — oq-qora (monoxrom), til — o'zbek (lotin).

| Qatlam | Texnologiya |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript (strict), Tailwind CSS 4, Radix UI, lucide-react |
| State | TanStack Query (server ma'lumotlari), Zustand (UI / flow editor) |
| Backend | Supabase — Postgres + RLS, Auth, Realtime, Edge Functions, pg_cron |
| To'lov | checkout.uz |
| Deploy | Vercel (`fra1`) + Supabase (`eu-central-1`) |

## Holat (fazalar)

- [x] **1-faza** — loyiha, dizayn tizimi, auth (Google + email), rail karkasi, akkaunt almashtirish,
  barcha sahifalar skeleti va bo'sh holatlari, DB migratsiyalari va RLS, tariflar modali va checkout.uz to'lov oqimi.
- [x] **2-faza** — Telegram bot ulash (shifrlangan token, secret_token'li webhook), `tg-webhook` Edge Function
  (bitta RPC, 60 s kesh, javob webhook'ning o'zida), Welcome / Default Reply / Keywords / Command, Basic builder,
  Contacts (AND/OR filtr, ommaviy amallar, CSV, profil paneli).
- [x] **3-faza** — Flow builder (React Flow canvas, sidebar editorlar, Preview), runtime v2 (tugmalar, Data Collection,
  Actions, External Request, Condition, Randomizer, Smart Delay, Start Automation).
- [x] **4-faza** — 11 turdagi trigger + shartlar, Sequences, fon ishlari (pg_cron → Edge Function worker).
- [x] **5-faza** — Live Chat (Realtime), Broadcasting (25 xabar/s), Growth Tools (ref URL, QR, widget), shablonlar, Team.
- [x] **6-faza** — limitlar va grace, landing + pricing (SSG/ISR), to'lovlarni tekshirish cron'i, obuna eslatmalari,
  Web Vitals / API monitoringi, yuklama testi va 8-bo'lim o'lchovi — natijalar: [`docs/perf-report.md`](docs/perf-report.md).

## O'rnatish (lokal)

Talablar: Node.js 20+, Docker (lokal Supabase uchun), [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # lokal Postgres + Auth + REST (migratsiyalar avtomatik qo'llanadi)
cp .env.example .env.local     # `supabase status` dagi URL va kalitlarni qo'ying
npm run dev                    # http://localhost:3000
```

Migratsiyalar: `supabase/migrations/*.sql`. Sxema o'zgarganda TypeScript turlarini yangilang:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:types
```

## Supabase sozlash (production)

1. [supabase.com](https://supabase.com) da loyiha yarating — region **Central EU (Frankfurt) `eu-central-1`**.
2. Migratsiyalarni qo'llang: `supabase link --project-ref <ref> && supabase db push`.
3. **Auth → Providers**: Email (yoqilgan) va **Google** (Google Cloud Console'dagi OAuth client ID/secret).
4. **Auth → URL Configuration**: Site URL = `https://<domen>`, Redirect URLs = `https://<domen>/auth/callback`.
5. **Database → Extensions**: `pg_cron` va `pg_trgm` yoqilganini tekshiring (migratsiya cron vazifalarini o'zi yaratadi).

## Edge Function (bot webhook) deploy

```bash
supabase link --project-ref <ref>
supabase db push                                   # migratsiyalar
supabase secrets set BOT_TOKEN_KEY=<Vercel'dagi bilan BIR XIL 64 hex>
supabase functions deploy tg-webhook --no-verify-jwt   # Telegram JWT yubormaydi; himoya — secret_token
```

Fon ishlari (Smart Delay, Sequences, hodisa triggerlari) uchun worker manzilini bir marta yozing (SQL editor):

```sql
insert into private.settings (key, value)
values ('functions_url', 'https://<project-ref>.supabase.co/functions/v1')
on conflict (key) do update set value = excluded.value;
```

pg_cron har soniyada navbatni tekshiradi va ish bo'lsagina `POST /functions/v1/tg-webhook/_worker` chaqiradi (`x-worker-secret` — `private.settings.worker_secret`).

`BOT_TOKEN_KEY` Vercel va Supabase secrets'da **bir xil** bo'lishi shart (token Next.js'da shifrlanadi, Edge Function'da ochiladi).

## Telegram botni ulash

1. Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot` → tokenni nusxalang.
2. Replio → **Settings → Telegram** → tokenni qo'ying. Webhook avtomatik o'rnatiladi:
   `https://<project>.supabase.co/functions/v1/tg-webhook/<bot_id>` (`secret_token`, `max_connections: 100`).

## checkout.uz kaliti

1. checkout.uz kabinetidan API kalitini oling.
2. Vercel → Project → Settings → Environment Variables: `CHECKOUT_API_KEY`.
3. To'lov oqimi: `POST /api/checkout/create` → checkout.uz `create_payment` → foydalanuvchi to'lov sahifasiga →
   webhook `POST /api/checkout/webhook` → **har doim** `status_payment` bilan qayta tekshiriladi, summa solishtiriladi →
   `activate_payment()` (idempotent) → obuna faollashadi. `return_url` sahifasi ham statusni o'zi tekshiradi.

To'lovlarni tekshirish (reconcile) va obuna eslatmalari uchun pg_cron Next.js'ni chaqiradi — sayt manzilini bir marta yozing:

```sql
insert into private.settings (key, value) values ('site_url', 'https://replio.uz')
on conflict (key) do update set value = excluded.value;
```

pg_cron har 5 daqiqada: obuna holatlarini yangilaydi (active → past_due → 3 kundan keyin expired), 30 daqiqadan eski
`pending` to'lovlar yoki eslatma kerak bo'lsa `POST /api/cron/billing` (`x-cron-secret` — `private.settings.cron_secret`).
Eslatmalar: Telegram (admin o'z Telegram'ini Preview orqali ulagan bo'lsa) va email (`RESEND_API_KEY`, `EMAIL_FROM`).

## Deploy (Vercel)

1. Repozitoriyni Vercel'ga ulang, **Function Region: `fra1` (Frankfurt)**.
2. `.env.example` dagi barcha o'zgaruvchilarni kiriting (`NEXT_PUBLIC_SITE_URL` — production domen).
3. Deploy.

## Testlar

```bash
npm run lint && npm run typecheck && npm run build
npm run db:test                # migratsiyalar + RLS testlari toza Postgres'da (PG* env bilan)
npm run e2e:mock-checkout &    # checkout.uz soxta serveri (:4010)
node e2e/mock-telegram.mjs &   # Telegram Bot API soxta serveri (:4020)
supabase functions serve --env-file supabase/functions/.env.local &   # BOT_TOKEN_KEY, TELEGRAM_API_URL=http://host.docker.internal:4020
psql "$DB_URL" -c "insert into private.settings values ('functions_url','http://supabase_kong_replio:8000/functions/v1') on conflict (key) do update set value = excluded.value"
deno test supabase/functions/_shared/   # runtime unit testlari
npm run dev &
CHROME_PATH=/path/to/chromium npm run e2e   # 13-bo'lim bo'yicha tugmalarni bosib tekshiradi
```

### Tezlik (8-bo'lim) va yuklama testi

```bash
# Production build (dev server bilan parallel)
NEXT_DIST_DIR=.next-prod npx next build && NEXT_DIST_DIR=.next-prod npx next start -p 3100 &
E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/perf.spec.ts   # → test-results/perf-report.md

# 100 parallel foydalanuvchi (haqiqiy yoki lokal Edge Function'ga)
node scripts/load-test.mjs --url https://<ref>.supabase.co/functions/v1/tg-webhook/<bot_id> --secret <webhook_secret> --users 100 --rounds 3 --text narx
```

E2E uchun `.env.local` da `CHECKOUT_API_KEY=test_checkout_key`, `CHECKOUT_API_URL=http://127.0.0.1:4010/api/v1`
va `TELEGRAM_API_URL=http://127.0.0.1:4020` bo'lishi kerak.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Json } from "../src/lib/supabase/database.types";
import { admin, signupAndOnboard } from "./helpers";

// 8-bo'lim: jadvaldagi HAR BIR amal o'lchanadi, p99 ≤ 2 000 ms. Production build'da ishga tushiring:
//   NEXT_DIST_DIR=.next-prod npx next build && NEXT_DIST_DIR=.next-prod npx next start -p 3100
//   E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/perf.spec.ts
// Natija: test-results/perf-report.md
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";
const CO = "http://127.0.0.1:4010";
const TOKEN = `${7700000000 + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyzPF`;

type Row = { name: string; goal: number; samples: number[] };
const rows: Row[] = [];
function record(name: string, goal: number, samples: number[]) {
  rows.push({ name, goal, samples: [...samples].sort((a, b) => a - b) });
}
const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(xs.length * p) - 1))];
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function time(fn: () => Promise<unknown>) {
  const t0 = Date.now();
  await fn();
  return Date.now() - t0;
}

function psql(sql: string) {
  return execSync(`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
}

let accountId = "";
let email = "";

test.afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  const lines = [
    "# Replio — tezlik o'lchovi (8-bo'lim)",
    "",
    `Sana: ${new Date().toISOString()} · muhit: ${process.env.E2E_BASE_URL ?? "http://localhost:3000"} (lokal Supabase + mock Telegram/checkout)`,
    "",
    "| Amal | n | o'rtacha | p50 | p95 | p99 | Maqsad (o'rtacha) | p99 ≤ 2 000 ms |",
    "|---|---:|---:|---:|---:|---:|---:|:---:|",
    ...rows.map((r) => {
      const p99 = pct(r.samples, 0.99);
      return `| ${r.name} | ${r.samples.length} | ${avg(r.samples).toFixed(0)} | ${Math.round(pct(r.samples, 0.5))} | ${Math.round(pct(r.samples, 0.95))} | ${Math.round(p99)} | ≤ ${r.goal} | ${p99 <= 2000 ? "✓" : "✗"} |`;
    }),
    "",
  ];
  writeFileSync("test-results/perf-report.md", lines.join("\n"));
  console.log(lines.join("\n"));
});

test("setup: akkaunt, bot, FAQ (tugmali) avtomatlashtirish, Welcome", async ({ page }) => {
  test.setTimeout(180_000);
  const r = await signupAndOnboard(page, "Perf Admin", "Perf akkaunt");
  accountId = r.accountId;
  email = r.email;
  await page.fill("#bot-token", TOKEN);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId);

  await page.goto("/app/automation");
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Savol-javob \(FAQ\)/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
});

test("Bot: 100 parallel foydalanuvchi — xabarga javob va inline tugma", async ({ page }) => {
  test.setTimeout(180_000);
  const base = 880000000 + Math.floor(Math.random() * 1e6) * 100;
  const send = async (update: Record<string, unknown>) => {
    const res = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update }, timeout: 30_000 });
    return (await res.json()) as { status: number; body: { reply_markup?: { inline_keyboard: { callback_data?: string }[][] } } | string; ms: number };
  };
  const msg = (id: number, text: string) => ({
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, from: { id, is_bot: false, first_name: `P${id}` }, chat: { id, type: "private" } },
  });
  // isitish (Edge Function kesh)
  const warm = await send(msg(base - 1, "savol"));
  const cbData = (warm.body as { reply_markup: { inline_keyboard: { callback_data: string }[][] } }).reply_markup.inline_keyboard[0][0].callback_data;

  const msgMs: number[] = [];
  const cbMs: number[] = [];
  for (let round = 0; round < 3; round++) {
    const res = await Promise.all(Array.from({ length: 100 }, (_, k) => send(msg(base + k, round === 0 ? "/start" : "savol"))));
    for (const r of res) {
      expect(r.status).toBe(200);
      msgMs.push(r.ms);
    }
  }
  for (let round = 0; round < 2; round++) {
    const res = await Promise.all(
      Array.from({ length: 100 }, (_, k) =>
        send({
          update_id: Math.floor(Math.random() * 1e9),
          callback_query: { id: `cb${k}${round}`, from: { id: base + k, is_bot: false, first_name: "P" }, data: cbData, message: { message_id: 1, date: 0, chat: { id: base + k, type: "private" } } },
        }),
      ),
    );
    for (const r of res) {
      expect(r.status).toBe(200);
      cbMs.push(r.ms);
    }
  }
  record("Bot: xabarga javob (100 parallel foydalanuvchi)", 500, msgMs);
  record("Bot: inline tugmaga javob (100 parallel)", 400, cbMs);
});

test("Sayt: landing LCP (birinchi ochilish)", async ({ browser }) => {
  const xs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/", { waitUntil: "load" });
    const lcp = await p.evaluate(
      () =>
        new Promise<number>((resolve) => {
          new PerformanceObserver((l) => {
            const e = l.getEntries();
            resolve(e[e.length - 1].startTime);
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => resolve(-1), 3000);
        }),
    );
    expect(lcp).toBeGreaterThan(0);
    xs.push(Math.round(lcp));
    await ctx.close();
  }
  record("Sayt: landing birinchi ochilish (LCP)", 1200, xs);
});

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  const ms = await time(async () => {
    await page.click("button[type=submit]");
    await page.waitForURL(/\/app(\?|$)/);
    await expect(page.getByRole("navigation", { name: "Asosiy navigatsiya" })).toBeVisible();
  });
  return ms;
}

test("Login, sahifalar o'tishi, dashboard, contacts 50k, teg yaratish", async ({ browser }) => {
  test.setTimeout(300_000);
  // Login (email)
  const loginMs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext();
    loginMs.push(await login(await ctx.newPage()));
    await ctx.close();
  }
  record("Login (email) → ilova", 800, loginMs);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  const nav = page.getByRole("navigation", { name: "Asosiy navigatsiya" });

  // Dashboard grafiklari
  const dash: number[] = [];
  for (let i = 0; i < 5; i++) {
    dash.push(
      await time(async () => {
        await page.goto("/app");
        await expect(page.getByRole("heading", { name: "Obunachilar" })).toBeVisible();
        await expect(page.locator("[aria-label*=': ']").first()).toBeVisible();
      }),
    );
  }
  record("Dashboard grafiklari yuklanishi", 700, dash);

  // Ilova ichida sahifadan sahifaga
  const targets: [string, () => Promise<void>][] = [
    ["Contacts", () => expect(page.getByText(/ta kontakt$/)).toBeVisible()],
    ["Automation", () => expect(page.getByRole("button", { name: "New Automation" }).first()).toBeVisible()],
    ["Live Chat", () => expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible()],
    ["Broadcasting", () => expect(page.getByRole("tab", { name: "Draft" })).toBeVisible()],
    ["Settings", () => expect(page.getByRole("link", { name: "Growth Tools" })).toBeVisible()],
    ["Home", () => expect(page.getByRole("heading", { name: "Obunachilar" })).toBeVisible()],
  ];
  const navMs: number[] = [];
  for (let round = 0; round < 4; round++) {
    for (const [name, ready] of targets) {
      navMs.push(await time(async () => {
        await nav.getByRole("link", { name, exact: true }).click();
        await ready();
      }));
    }
  }
  record("Ilova ichida sahifadan sahifaga o'tish", 300, navMs);

  // Teg yaratish (optimistic UI)
  await page.goto("/app/settings/tags");
  const tagMs: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.getByRole("button", { name: "Yangi teg" }).click();
    await page.fill("#tag-name", `perf-${i}-${Date.now()}`);
    tagMs.push(await time(async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
      await expect(page.getByText(`perf-${i}-`, { exact: false }).first()).toBeVisible();
    }));
  }
  record("Trigger / teg / field yaratish", 300, tagMs);

  // Contacts: 50 000 kontakt — qidiruv va filtr
  psql(`insert into public.contacts (account_id, tg_user_id, first_name, username, subscribed_at)
        select '${accountId}', 900000000 + g, (array['Aziz','Malika','Jasur','Dilnoza','Olim'])[1 + g % 5] || g, 'user' || g, now() - make_interval(mins => g)
        from generate_series(1, 50000) g on conflict do nothing`);
  psql(`select public.recompute_contact_limit('${accountId}')`);
  await admin.from("tags").insert({ account_id: accountId, name: "perf-vip" });
  await page.goto("/app/contacts");
  await expect(page.getByText(/50 \d{3} ta kontakt/)).toBeVisible({ timeout: 20_000 });
  const search = page.getByPlaceholder("Ism yoki username bo'yicha qidirish");
  const cMs: number[] = [];
  // username'lar noyob: user12345 → aniq 1 ta natija (50 000 dan)
  const terms = ["user12345", "user23456", "user34567", "user45678", "user11111", "user22222", "user33333", "user44444"];
  for (const term of terms) {
    cMs.push(await time(async () => {
      await search.fill(term);
      await expect(page.getByText(/^1 ta kontakt$/)).toBeVisible();
    }));
    await search.fill("");
    await expect(page.getByText(/50 \d{3} ta kontakt/)).toBeVisible();
  }
  // Filtr: Tag qo'shish (0 natija) va tozalash
  await search.fill("");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Filter" }).click();
    await page.getByRole("combobox", { name: "Tag" }).selectOption({ label: "perf-vip" });
    cMs.push(await time(async () => {
      await page.getByRole("button", { name: "Filtr qo'shish" }).click();
      await expect(page.getByText("Hech narsa topilmadi")).toBeVisible();
    }));
    cMs.push(await time(async () => {
      await page.getByRole("button", { name: "Filtrlarni tozalash" }).click();
      await expect(page.getByText(/50 \d{3} ta kontakt/)).toBeVisible();
    }));
  }
  record("Contacts: 50 000 kontaktda qidiruv / filtr", 500, cMs);
  await ctx.close();
});

test("Flow builder: 200 stepli flowni ochish, saqlash / Publish", async ({ browser }) => {
  test.setTimeout(240_000);
  // 200 ta Send Message step (zanjir)
  const nodes: Record<string, unknown>[] = [{ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: {} }];
  const edges: Record<string, unknown>[] = [];
  for (let i = 1; i <= 200; i++) {
    nodes.push({ id: `m${i}`, type: "message", position: { x: 700 * (i % 20), y: 450 * Math.floor(i / 20) }, data: { name: `Step ${i}`, blocks: [{ id: `b${i}`, type: "text", text: `Xabar ${i}`, buttons: [] }] } });
    edges.push({ id: `e${i}`, source: i === 1 ? "trigger" : `m${i - 1}`, sourceHandle: i === 1 ? "then" : "next", target: `m${i}` });
  }
  const { data: flow } = await admin.from("flows").insert({ account_id: accountId, name: "200 step", draft: { nodes, edges } as unknown as Json }).select("id").single();
  await admin.from("triggers").insert({ account_id: accountId, flow_id: flow!.id, type: "keyword", config: { match: "is", keywords: ["perf200"] } });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  const open: number[] = [];
  for (let i = 0; i < 6; i++) {
    open.push(await time(async () => {
      await page.goto(`/app/automation/${flow!.id}`);
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Set Live|Publish/ })).toBeVisible();
    }));
  }
  record("Flow builder: 200 stepli flow (to'g'ridan-to'g'ri URL, to'liq yuklash)", 800, open);

  // Odatiy yo'l: My Automations ro'yxatidan ochish (JS kesh, prefetch)
  const soft: number[] = [];
  for (let i = 0; i < 6; i++) {
    await page.goto("/app/automation");
    const link = page.getByText("200 step", { exact: true }).first();
    await expect(link).toBeVisible();
    soft.push(await time(async () => {
      await link.click();
      await expect(page.locator(".react-flow__node").first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Set Live|Publish/ })).toBeVisible();
    }));
  }
  record("Flow builder: 200 stepli flowni ochish (ro'yxatdan)", 800, soft);

  const save: number[] = [];
  await page.locator('.react-flow__node[data-id="trigger"]').click();
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole("button", { name: /^(Set Live|Publish)$/ });
    save.push(await time(async () => {
      await btn.click();
      await expect(page.locator("[data-sonner-toast]").filter({ hasText: "LIVE" }).last()).toBeVisible();
    }));
    await page.waitForTimeout(300);
  }
  record("Flow: saqlash / Publish (200 step)", 500, save);
  await ctx.close();
});

test("Live Chat, broadcast, to'lov", async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);

  // Live Chat: foydalanuvchi → inbox, operator → Telegram
  const u = 770000000 + Math.floor(Math.random() * 1e6);
  const msg = (text: string) => ({
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), text, from: { id: u, is_bot: false, first_name: "Chatchi" }, chat: { id: u, type: "private" } },
  });
  await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: msg("salom") } });
  const { data: c } = await admin.from("contacts").select("id").eq("account_id", accountId).eq("tg_user_id", u).single();
  await page.goto(`/app/inbox?c=${c!.id}`);
  const pane = page.getByTestId("chat-pane");
  await expect(pane.getByText("salom")).toBeVisible();
  await page.waitForTimeout(1500);
  const inMs: number[] = [];
  const outMs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = `kiruvchi ${i} ${Date.now()}`;
    inMs.push(await time(async () => {
      await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: msg(t) } });
      await expect(pane.getByText(t)).toBeVisible({ timeout: 5000 });
    }));
    const o = `javob ${i} ${Date.now()}`;
    const box = pane.getByRole("textbox", { name: /Xabar yozing/ });
    await box.fill(o);
    outMs.push(await time(async () => {
      await box.press("Enter");
      await expect
        .poll(async () => ((await (await page.request.get(`${TG}/__sent?chat_id=${u}`)).json()) as { text?: string }[]).some((m) => m.text === o), { timeout: 5000, intervals: [25] })
        .toBe(true);
    }));
  }
  record("Live Chat: foydalanuvchi xabari → inbox'da", 500, inMs);
  record("Live Chat: operator xabari → foydalanuvchiga", 500, outMs);

  // Broadcast: "Send" → birinchi xabar (auditoriya: 20 kontakt, filtr)
  const { data: bot } = await admin.from("bots").select("id").eq("account_id", accountId).single();
  const { data: tag } = await admin.from("tags").insert({ account_id: accountId, name: `bc-${Date.now()}` }).select("id, name").single();
  const bBase = 660000000 + Math.floor(Math.random() * 1e6) * 100;
  const { data: bcContacts } = await admin
    .from("contacts")
    .insert(Array.from({ length: 20 }, (_, i) => ({ account_id: accountId, bot_id: bot!.id, tg_user_id: bBase + i, first_name: `B${i}` })))
    .select("id");
  await admin.from("contact_tags").insert(bcContacts!.map((x) => ({ contact_id: x.id, tag_id: tag!.id })));
  const bcMs: number[] = [];
  for (let i = 0; i < 4; i++) {
    await page.goto("/app/broadcasting");
    await page.getByRole("button", { name: "New Broadcast" }).click();
    await page.waitForURL(/\/app\/broadcasting\/[0-9a-f-]{36}$/);
    await page.getByText("Filtr bo'yicha").click();
    await page.getByRole("button", { name: "Filter" }).click();
    await page.getByRole("combobox", { name: "Tag" }).selectOption({ label: tag!.name });
    await page.getByRole("button", { name: "Filtr qo'shish" }).click();
    await expect(page.getByTestId("bc-count")).toHaveText("20 ta qabul qiluvchi");
    await page.getByRole("button", { name: /^Text/ }).click();
    await page.getByPlaceholder("Matn kiriting…").fill(`Aksiya ${i}`);
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: "Hozir yuborish" }).click();
    const since = Date.now();
    await page.getByRole("dialog").getByRole("button", { name: "Yuborish" }).click();
    await expect
      .poll(async () => ((await (await page.request.get(`${TG}/__count?since=${since}&from=${bBase}&to=${bBase + 19}`)).json()) as { count: number }).count, { timeout: 10_000, intervals: [25] })
      .toBeGreaterThan(0);
    const first = ((await (await page.request.get(`${TG}/__count?since=${since}&from=${bBase}&to=${bBase + 19}`)).json()) as { first: number }).first;
    bcMs.push(first - since);
    await expect(page.getByTestId("bc-results")).toBeVisible();
  }
  record("Broadcast: Send → birinchi xabar", 1000, bcMs);

  // To'lov: Upgrade → checkout; webhook → faollashish
  const upMs: number[] = [];
  const whMs: number[] = [];
  for (let i = 0; i < 5; i++) {
    await admin.from("payments").update({ status: "failed" }).eq("account_id", accountId).eq("status", "pending"); // qayta ishlatilmasin
    await page.goto("/app/settings/billing");
    await page.getByRole("button", { name: "Upgrade" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Tarifni tanlang" });
    await expect(dialog).toBeVisible();
    upMs.push(await time(async () => {
      await dialog.getByRole("button", { name: "Tanlash" }).nth(1).click();
      await page.waitForURL(/127\.0\.0\.1:4010\/pay\//);
    }));
    const uuid = page.url().split("/pay/")[1];
    const { data: pay } = await admin.from("payments").select("id").eq("checkout_uuid", uuid).single();
    whMs.push(await time(async () => {
      await page.request.get(`${CO}/__pay/${uuid}`);
      await expect.poll(async () => (await admin.from("payments").select("status").eq("id", pay!.id).single()).data?.status, { timeout: 5000, intervals: [20] }).toBe("paid");
    }));
  }
  record("To'lov: Upgrade → checkout sahifasi", 1000, upMs);
  record("To'lov: webhook → tarif faollashishi", 500, whMs);
  await ctx.close();
});

test("Yakun: har bir qator p99 ≤ 2 000 ms", () => {
  expect(rows.length).toBe(16);
  for (const r of rows) expect(pct(r.samples, 0.99), r.name).toBeLessThanOrEqual(2000);
});

import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { admin, SHOTS, signupAndOnboard } from "./helpers";

// 6-faza: to'lov (return, webhook, reconcile cron), eslatmalar, limitlar, grace, landing/pricing, perf log
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";
const CO = "http://127.0.0.1:4010";

function psql(sql: string) {
  return execSync(`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
}
function newToken(prefix: number) {
  return `${prefix + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyz90`;
}
async function connectBot(page: Page, token: string) {
  await page.goto("/app/settings/telegram");
  await page.fill("#bot-token", token);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();
}
const text = (id: number, t: string) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: { message_id: 1, date: Math.floor(Date.now() / 1000), text: t, from: { id, is_bot: false, first_name: "Olim" }, chat: { id, type: "private" } },
});
async function sentTexts(page: Page, chatId: number) {
  const all = (await (await page.request.get(`${TG}/__sent?chat_id=${chatId}`)).json()) as { method: string; text?: string }[];
  return all.filter((m) => m.method === "sendMessage").map((m) => m.text ?? "");
}

test("To'lov: Upgrade → checkout (≤ 2 s), return, webhook (≤ 2 s), reconcile cron", async ({ page }) => {
  test.setTimeout(180_000);
  const { accountId } = await signupAndOnboard(page, "Billing Test", "To'lov akkaunt");

  // 1) Upgrade → checkout.uz sahifasi
  await page.goto("/app/settings/billing");
  await page.request.post("/api/checkout/create", { data: {} }); // dev: marshrutni kompilyatsiya qilish
  await page.getByRole("button", { name: "Upgrade" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Tarifni tanlang" });
  await expect(dialog).toBeVisible();
  const t0 = Date.now();
  await dialog.getByRole("button", { name: "Tanlash" }).nth(1).click();
  await page.waitForURL(/127\.0\.0\.1:4010\/pay\//);
  const toCheckout = Date.now() - t0;
  console.log(`upgrade → checkout: ${toCheckout} ms`);
  expect(toCheckout).toBeLessThan(2000);

  // 2) Webhook → tarif faollashadi ≤ 2 s
  const uuid1 = page.url().split("/pay/")[1];
  const t1 = Date.now();
  await page.request.get(`${CO}/__pay/${uuid1}`);
  await expect
    .poll(async () => (await admin.from("subscriptions").select("plan_id, status").eq("account_id", accountId).single()).data, { timeout: 5000, intervals: [50] })
    .toMatchObject({ plan_id: "pro", status: "active" });
  const activation = Date.now() - t1;
  console.log(`webhook → activation: ${activation} ms`);
  expect(activation).toBeLessThan(2000);
  await page.locator("#return").click();
  await expect(page.getByText("To'lov qabul qilindi! Tarif faollashtirildi.")).toBeVisible();

  // 3) Webhook kelmadi, foydalanuvchi qaytmadi → pg_cron reconcile (30 daqiqadan eski pending)
  const res = await page.request.post("/api/checkout/create", { data: { plan_id: "pro", period: "monthly" } });
  const { payment_id, url } = (await res.json()) as { payment_id: string; url: string };
  await page.request.get(`${CO}/__pay_silent/${url.split("/pay/")[1]}`);
  await admin.from("payments").update({ created_at: new Date(Date.now() - 40 * 60_000).toISOString() }).eq("id", payment_id);
  const endBefore = (await admin.from("subscriptions").select("current_period_end").eq("account_id", accountId).single()).data!.current_period_end;
  expect(psql("select public.kick_billing()")).toBe("t");
  await expect.poll(async () => (await admin.from("payments").select("status").eq("id", payment_id).single()).data?.status, { timeout: 15_000 }).toBe("paid");
  const endAfter = (await admin.from("subscriptions").select("current_period_end").eq("account_id", accountId).single()).data!.current_period_end;
  expect(new Date(endAfter).getTime()).toBeGreaterThan(new Date(endBefore).getTime() + 27 * 86_400_000); // bir oy uzaytirildi

  // Idempotent: webhook qayta kelsa ham ikkinchi marta uzaytirilmaydi
  await page.request.post("/api/checkout/webhook", { data: { event: "payment_confirmed", data: { _uuid: uuid1, status: "paid" } } });
  const endAgain = (await admin.from("subscriptions").select("current_period_end").eq("account_id", accountId).single()).data!.current_period_end;
  expect(endAgain).toBe(endAfter);
  await page.goto("/app/settings/billing");
  await expect(page.getByText("To'langan").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p6-01-billing.png` });
});

test("Obuna eslatmasi (Telegram), limitdan oshgan kontaktlar, grace va pauza", async ({ page }) => {
  test.setTimeout(180_000);
  const TOKEN = newToken(7600000000);
  const { accountId, userId } = await signupAndOnboard(page, "Limit Test", "Limit akkaunt");
  await connectBot(page, TOKEN);
  await admin.from("subscriptions").update({ plan_id: "start", status: "active", current_period_end: new Date(Date.now() + 30 * 86_400_000).toISOString() }).eq("account_id", accountId);

  // Welcome (Live) — kontakt javob olishi uchun
  await page.goto("/app/automation/basic");
  await page.getByRole("button", { name: /Welcome Message/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").fill("Xush kelibsiz!");
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // Admin o'z Telegram'ini botga ulagan (preview kodi)
  const me = 700000000 + Math.floor(Math.random() * 1e6);
  const { data: m } = await admin.from("account_members").select("preview_code").eq("account_id", accountId).eq("user_id", userId).single();
  await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: text(me, `/start preview_${m!.preview_code}`) } });
  await expect.poll(async () => (await admin.from("account_members").select("tg_contact_id").eq("account_id", accountId).single()).data?.tg_contact_id).not.toBeNull();

  // 3 kun oldin eslatma → Telegram; ikkinchi marta yuborilmaydi
  await admin.from("subscriptions").update({ current_period_end: new Date(Date.now() + 2.5 * 86_400_000).toISOString() }).eq("account_id", accountId);
  expect(psql("select public.kick_billing()")).toBe("t");
  await expect.poll(async () => (await sentTexts(page, me)).find((x) => x.includes("3 kundan keyin")), { timeout: 15_000 }).toBeTruthy();
  await expect.poll(async () => (await admin.from("billing_reminders").select("days_before").eq("account_id", accountId)).data?.length).toBe(1);
  // Ikkinchi cron — shu akkauntga qayta yuborilmaydi
  psql("select public.kick_billing()");
  await page.waitForTimeout(2000);
  expect((await sentTexts(page, me)).filter((x) => x.includes("3 kundan keyin"))).toHaveLength(1);
  expect((await admin.from("billing_reminders").select("days_before").eq("account_id", accountId)).data?.length).toBe(1);

  // Limit: Start = 250; 255 kontakt → 5 tasi limitdan oshgan, banner
  const { data: bot } = await admin.from("bots").select("id").eq("account_id", accountId).single();
  const base = 610000000 + Math.floor(Math.random() * 1e6) * 10;
  const old = new Date(Date.now() - 86_400_000).toISOString();
  await admin.from("contacts").insert(Array.from({ length: 254 }, (_, i) => ({ account_id: accountId, bot_id: bot!.id, tg_user_id: base + i, first_name: `L${i}`, subscribed_at: old })));
  psql(`select public.recompute_contact_limit('${accountId}')`);
  await page.goto("/app");
  await expect(page.getByRole("status").filter({ hasText: "tarif limitidan (250) oshdi" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p6-02-limit-banner.png` });

  // Limitdan oshgan yangi kontakt → bot javob bermaydi (kontakt saqlanadi)
  const extra = base + 9000;
  await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: text(extra, "/start") } });
  await expect.poll(async () => (await admin.from("contacts").select("over_limit").eq("tg_user_id", extra).eq("account_id", accountId).single()).data?.over_limit).toBe(true);
  await page.waitForTimeout(800);
  expect(await sentTexts(page, extra)).toHaveLength(0);

  // Pro'ga o'tish (to'lov) → limit 2 500, hammasi faol, banner yo'qoladi
  const res = await page.request.post("/api/checkout/create", { data: { plan_id: "pro", period: "monthly" } });
  const { url } = (await res.json()) as { url: string };
  await page.request.get(`${CO}/__pay/${url.split("/pay/")[1]}`);
  await expect.poll(async () => (await admin.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("over_limit", true)).count).toBe(0);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "limitidan" })).toHaveCount(0);

  // Grace: muddat 1 kun oldin tugagan → banner, bot hali ishlaydi
  await admin.from("subscriptions").update({ current_period_end: new Date(Date.now() - 86_400_000).toISOString() }).eq("account_id", accountId);
  psql("select public.update_subscription_statuses()");
  expect((await admin.from("subscriptions").select("status").eq("account_id", accountId).single()).data?.status).toBe("past_due");
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "kundan so'ng bot to'xtatiladi" })).toBeVisible();
  const u1 = base + 9100;
  const r1 = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: text(u1, "/start") } });
  expect(((await r1.json()) as { body: { text?: string } }).body.text).toBe("Xush kelibsiz!");

  // Grace tugadi → expired, bot pauzada
  await admin.from("subscriptions").update({ current_period_end: new Date(Date.now() - 4 * 86_400_000).toISOString() }).eq("account_id", accountId);
  psql("select public.update_subscription_statuses()");
  expect((await admin.from("subscriptions").select("status").eq("account_id", accountId).single()).data?.status).toBe("expired");
  const u2 = base + 9200;
  const r2 = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update: text(u2, "/start") } });
  expect(((await r2.json()) as { body: unknown }).body).toBe("ok");
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "avtomatlashtirishlar to'xtatildi" })).toBeVisible();
});

test("Landing va Pricing (statik), Settings → Logs'da tezlik jadvali", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Telegram botingizni avtomatlashtiring" })).toBeVisible();
  await page.getByRole("navigation", { name: "Sayt menyusi" }).getByRole("link", { name: "Narxlar" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByTestId("plan-start")).toContainText("89 000");
  await expect(page.getByTestId("plan-pro")).toContainText("179 000");
  await page.getByRole("button", { name: /Yillik/ }).click();
  await expect(page.getByTestId("plan-pro")).toContainText("1 718 000");
  await expect(page.getByTestId("plan-start")).toContainText("854 000");
  await page.getByText("Qanday to'lash mumkin?").click();
  await expect(page.getByText(/Payme, Click, Uzcard yoki Humo/)).toBeVisible();
  await page.getByTestId("plan-pro").getByRole("link", { name: "7 kun bepul boshlash" }).click();
  await expect(page).toHaveURL(/\/signup\?plan=pro&period=yearly/);

  // Ilova ichida sahifalar → perf_logs (nav, api) → Logs
  await signupAndOnboard(page, "Perf Test", "Perf akkaunt");
  const nav = page.getByRole("navigation", { name: "Asosiy navigatsiya" });
  for (const name of ["Contacts", "Automation", "Live Chat", "Broadcasting", "Home"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/app/settings/logs");
  await expect(page.getByTestId("perf-table")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("perf-table").getByText("Sahifa o'tishi").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p6-03-logs.png` });
});

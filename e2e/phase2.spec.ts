import { expect, test, type Page } from "@playwright/test";
import { admin, SHOTS, signupAndOnboard } from "./helpers";

// 2-faza: bot ulash, Welcome / Default Reply / Keyword, bot javobi ≤ 2 s
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";
const TOKEN = `${7000000000 + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyz12`;
let userSeq = 900000;

async function sendUpdate(page: Page, update: Record<string, unknown>) {
  const res = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update } });
  return (await res.json()) as { status: number; body: unknown; ms: number };
}

function textUpdate(userId: number, text: string, first = "Dilnoza") {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: Math.floor(Math.random() * 1e6), date: Math.floor(Date.now() / 1000), text, from: { id: userId, is_bot: false, first_name: first, username: `u${userId}` }, chat: { id: userId, type: "private" } },
  };
}

async function sentTo(page: Page, chatId: number) {
  const res = await page.request.get(`${TG}/__sent?chat_id=${chatId}`);
  return (await res.json()) as { method: string; text?: string; reply_markup?: { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] } }[];
}

test("bot ulash, Welcome, kalit so'z, Default Reply — javob ≤ 2 s", async ({ page }) => {
  const { accountId } = await signupAndOnboard(page, "Bot Test", "Bot akkaunt");
  // Onboarding'dan keyin Settings → Telegram ochiladi
  await expect(page).toHaveURL(/\/app\/settings\/telegram$/);

  // Noto'g'ri token
  await page.fill("#bot-token", "123:short");
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Token formati noto'g'ri")).toBeVisible();

  // To'g'ri token
  await page.fill("#bot-token", TOKEN);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();
  const username = `test${TOKEN.split(":")[0]}_bot`;
  await expect(page.getByText(`@${username}`)).toBeVisible();
  const { data: bot } = await admin.from("bots").select("token_encrypted, webhook_ok").eq("account_id", accountId).single();
  expect(bot!.token_encrypted.startsWith("v1:")).toBe(true);
  expect(bot!.token_encrypted).not.toContain(TOKEN.split(":")[1]);
  await page.screenshot({ path: `${SHOTS}/p2-01-telegram.png` });

  // Ulanishni tekshirish
  await page.getByRole("button", { name: "Ulanishni tekshirish" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Ulanish ishlayapti" })).toBeVisible();

  // Welcome Message → builder
  await page.goto("/app/automation/basic");
  await page.getByRole("button", { name: /Welcome Message/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Welcome / /start")).toBeVisible();

  // Bo'sh holatda Set Live → validatsiya xatosi
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Step bo'sh" })).toBeVisible();

  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").fill("Salom, {{first_name}}! Botimizga xush kelibsiz 👋");
  await page.getByRole("button", { name: /^Delay/ }).click();
  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").nth(1).fill("Narxlarni bilish uchun \"narx\" deb yozing.");
  await page.getByRole("button", { name: "Add Button" }).nth(1).click();
  await page.getByLabel("Tugma matni").fill("Saytimiz");
  await page.getByLabel("URL manzil").fill("https://replio.uz");
  await page.getByRole("button", { name: "Qo'shish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p2-02-builder.png` });
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "LIVE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // Kalit so'z avtomatlashtirishi (shablondan) → Set Live
  await page.goto("/app/automation");
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Kalit so'zga javob/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // Default Reply
  await page.goto("/app/automation/basic");
  await page.getByRole("button", { name: /Default Reply/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").fill("Kechirasiz, tushunmadim. /start bosing.");
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // ── Bot: /start (yangi kontakt) → Welcome
  const u1 = ++userSeq;
  const r1 = await sendUpdate(page, textUpdate(u1, "/start"));
  expect(r1.status).toBe(200);
  expect(r1.ms).toBeLessThan(2000);
  await expect.poll(async () => (await sentTo(page, u1)).filter((m) => m.method === "sendMessage").length, { timeout: 10_000 }).toBe(2);
  const msgs = (await sentTo(page, u1)).filter((m) => m.method === "sendMessage");
  expect(msgs[0].text).toBe("Salom, Dilnoza! Botimizga xush kelibsiz 👋");
  expect(msgs[1].reply_markup?.inline_keyboard[0][0]).toEqual({ text: "Saytimiz", url: "https://replio.uz" });
  expect((await sentTo(page, u1)).some((m) => m.method === "sendChatAction")).toBe(true);

  // ── Kalit so'z (kirillcha ham) → yagona xabar webhook javobida
  const r2 = await sendUpdate(page, textUpdate(u1, "Нарх қанча?"));
  expect(r2.ms).toBeLessThan(2000);
  expect((r2.body as { method?: string }).method).toBe("sendMessage");
  expect((r2.body as { text?: string }).text).toBe("Narxlarimiz bilan tanishing 👇");

  // ── Mos kelmagan xabar → Default Reply
  const r3 = await sendUpdate(page, textUpdate(u1, "salom qalaysiz"));
  expect((r3.body as { text?: string }).text).toBe("Kechirasiz, tushunmadim. /start bosing.");

  // ── Noto'g'ri secret → 401, kontakt yaratilmaydi
  const bad = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, secret: "xato", update: textUpdate(++userSeq, "narx") } });
  expect(((await bad.json()) as { status: number }).status).toBe(401);

  // ── Tezlik: 20 ta ketma-ket xabar, p99 ≤ 2000 ms
  const times: number[] = [];
  for (let i = 0; i < 20; i++) times.push((await sendUpdate(page, textUpdate(900500 + i, i % 2 ? "narx" : "/start", `User${i}`))).ms);
  times.sort((a, b) => a - b);
  const p99 = times[Math.ceil(times.length * 0.99) - 1];
  console.log(`bot latency p50=${times[Math.floor(times.length / 2)].toFixed(0)}ms p99=${p99.toFixed(0)}ms`);
  expect(p99).toBeLessThan(2000);

  // Kontakt va xabarlar saqlandi (waitUntil orqali)
  await expect
    .poll(async () => (await admin.from("contacts").select("id", { count: "exact", head: true }).eq("account_id", accountId)).count, { timeout: 10_000 })
    .toBe(21);
  const { data: c1 } = await admin.from("contacts").select("id, first_name, is_unread, live_chat_status, last_message_preview").eq("tg_user_id", u1).single();
  expect(c1!.first_name).toBe("Dilnoza");
  await expect.poll(async () => (await admin.from("messages").select("id", { count: "exact", head: true }).eq("contact_id", c1!.id)).count).toBeGreaterThanOrEqual(6);
  await expect.poll(async () => (await admin.from("latency_logs").select("id", { count: "exact", head: true }).eq("account_id", accountId)).count).toBeGreaterThan(10);

  // Settings → Logs'da p50/p95/p99 ko'rinadi
  await page.goto("/app/settings/logs");
  await expect(page.getByText(/\d+ ms/).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p2-03-logs.png` });

  // Botni uzish
  await page.goto("/app/settings/telegram");
  await page.getByRole("button", { name: "Uzish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Uzish" }).click();
  await expect(page.getByText("Telegram bot ulanmagan")).toBeVisible();
});

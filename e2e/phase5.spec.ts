import { expect, test, type Page } from "@playwright/test";
import { admin, SHOTS, signupAndOnboard } from "./helpers";

// 5-faza: Live Chat (Realtime), Broadcasting (1 000 kontakt), Growth Tools, Team
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";

function newToken(prefix: number) {
  return `${prefix + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyz78`;
}

async function connectBot(page: Page, token: string) {
  await page.goto("/app/settings/telegram");
  await page.fill("#bot-token", token);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();
}

async function sendUpdate(page: Page, token: string, update: Record<string, unknown>) {
  const res = await page.request.post(`${TG}/__update`, { data: { token, update } });
  return (await res.json()) as { status: number; body: unknown; ms: number };
}
const text = (id: number, t: string, first = "Madina") => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: Math.floor(Math.random() * 1e6),
    date: Math.floor(Date.now() / 1000),
    text: t,
    from: { id, is_bot: false, first_name: first, username: `u${id}` },
    chat: { id, type: "private" },
  },
});
async function sentTexts(page: Page, chatId: number) {
  const all = (await (await page.request.get(`${TG}/__sent?chat_id=${chatId}`)).json()) as { method: string; text?: string }[];
  return all.filter((m) => m.method === "sendMessage").map((m) => m.text);
}

test("Live Chat: realtime, javob, eslatma, emoji, avtomatlashtirish, assign, reminder, pauza", async ({ page }) => {
  test.setTimeout(300_000);
  const TOKEN = newToken(7300000000);
  const { accountId, userId } = await signupAndOnboard(page, "Operator Aziz", "Chat akkaunt");
  await connectBot(page, TOKEN);
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId);

  // Avtomatlashtirish (⚡ uchun): shablon → Set Live
  await page.goto("/app/automation");
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Kalit so'zga javob/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();

  // Inbox ochiq — yangi xabar realtime ko'rinadi
  await page.goto("/app/inbox");
  await expect(page.getByText("Bu yerda ulangan kanallardagi")).toBeVisible();
  await page.waitForTimeout(1500); // realtime obuna ulanishi
  const u = 800000000 + Math.floor(Math.random() * 1e6);
  const t0 = Date.now();
  await sendUpdate(page, TOKEN, text(u, "Salom, narxlar qanday?"));
  const row = page.getByRole("button", { name: /Madina/ }).first();
  await expect(row).toBeVisible({ timeout: 5000 });
  const inboxMs = Date.now() - t0;
  console.log(`user → inbox: ${inboxMs} ms`);
  expect(inboxMs).toBeLessThan(2000);
  await row.click();
  const pane = page.getByTestId("chat-pane");
  await expect(pane.getByText("Salom, narxlar qanday?")).toBeVisible();

  // Operator javobi (Enter) → Telegram'ga ≤ 2 s (dev rejimda marshrut birinchi so'rovda kompilyatsiya bo'ladi — oldindan isitamiz)
  await page.request.post("/api/inbox/send", { data: {} });
  const box = pane.getByRole("textbox", { name: /Xabar yozing/ });
  await box.fill("Assalomu alaykum! Hozir yuboraman");
  const t1 = Date.now();
  await box.press("Enter");
  await expect.poll(() => sentTexts(page, u), { timeout: 5000, intervals: [50] }).toContain("Assalomu alaykum! Hozir yuboraman");
  const agentMs = Date.now() - t1;
  console.log(`operator → telegram: ${agentMs} ms`);
  expect(agentMs).toBeLessThan(2000);
  await expect(pane.locator('[data-direction="out_agent"]').filter({ hasText: "Hozir yuboraman" })).toBeVisible();
  await expect(pane.getByText("Yuborilmoqda…")).toHaveCount(0);

  // Emoji
  await pane.getByRole("button", { name: "Emoji" }).click();
  await page.getByRole("button", { name: "👍" }).click();
  await expect(box).toHaveValue("👍");
  await box.press("Enter");
  await expect.poll(() => sentTexts(page, u)).toContain("👍");

  // Ichki eslatma — Telegram'ga ketmaydi
  await pane.getByRole("button", { name: "Ichki eslatma" }).first().click();
  const noteBox = pane.getByRole("textbox", { name: /faqat jamoa/ });
  await noteBox.fill("VIP mijoz, chegirma bering");
  await noteBox.press("Enter");
  await expect(pane.locator('[data-direction="note"]').filter({ hasText: "VIP mijoz" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await sentTexts(page, u)).not.toContain("VIP mijoz, chegirma bering");
  await pane.getByRole("button", { name: "Javob" }).click();

  // ⚡ Avtomatlashtirish yuborish
  await pane.getByRole("button", { name: "Avtomatlashtirish yuborish" }).click();
  await page.getByRole("menuitem", { name: /Kalit so'zga javob/ }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Avtomatlashtirish yuborildi" })).toBeVisible();
  await expect.poll(() => sentTexts(page, u)).toContain("Narxlarimiz bilan tanishing 👇");

  // Foydalanuvchining yangi xabari — ochiq chatda realtime
  await sendUpdate(page, TOKEN, text(u, "Rahmat!"));
  await expect(pane.locator('[data-direction="in"]').filter({ hasText: "Rahmat!" })).toBeVisible({ timeout: 3000 });
  // Ochiq chat — o'qilgan deb belgilanadi
  await expect.poll(async () => (await admin.from("contacts").select("is_unread").eq("account_id", accountId).eq("tg_user_id", u).single()).data?.is_unread).toBe(false);

  // Assign (Pro) → o'zimga
  await pane.getByRole("button", { name: "Operatorga biriktirish" }).click();
  await page.getByRole("menuitem", { name: /Operator Aziz/ }).click();
  await expect(pane.getByRole("button", { name: "Operatorga biriktirish" })).toContainText("Men");
  const { data: c } = await admin.from("contacts").select("id, assigned_to, automation_paused_until").eq("account_id", accountId).eq("tg_user_id", u).single();
  await expect.poll(async () => (await admin.from("contacts").select("assigned_to").eq("id", c!.id).single()).data?.assigned_to).toBe(userId);
  // Operator yozgani uchun avtomatlashtirish pauzada (standart 30 daqiqa)
  expect(c!.automation_paused_until).not.toBeNull();

  // Kontakt paneli: pauza → davom ettirish → 1 soat
  // 1440px ekranda kontakt profili drawer'da ochiladi (2xl'da — yon panel)
  await pane.getByRole("button", { name: "Kontakt profili" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(/Pauzada/)).toBeVisible();
  await panel.getByRole("button", { name: "Davom ettirish" }).click();
  await expect(panel.getByText("▶ Faol")).toBeVisible();
  await panel.getByLabel("Pauza qilish").selectOption({ label: "1 soat" });
  await expect(panel.getByText(/Pauzada/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Reminder: 1 soatdan keyin → DB; vaqti o'tgani → toast
  await pane.getByRole("button", { name: "Reminder" }).click();
  await page.getByRole("menuitem", { name: "1 soatdan keyin" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Eslatma qo'yildi" })).toBeVisible();
  await expect.poll(async () => (await admin.from("reminders").select("id").eq("contact_id", c!.id).eq("done", false)).data?.length).toBe(1);
  await admin.from("reminders").update({ remind_at: new Date(Date.now() - 60_000).toISOString() }).eq("contact_id", c!.id);
  await page.reload();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "⏰ Eslatma: Madina" })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SHOTS}/p5-01-live-chat.png` });

  // Reminders bo'limida ko'rinadi
  await page.goto("/app/inbox?view=reminders");
  await expect(page.getByRole("button", { name: /Madina/ }).first()).toBeVisible();

  // Rail'dagi o'qilmagan nuqta — boshqa sahifada turganda realtime
  await page.goto("/app/contacts");
  await page.waitForTimeout(1500);
  await admin.from("contacts").update({ is_unread: false }).eq("account_id", accountId);
  await sendUpdate(page, TOKEN, text(u, "Yana savol bor"));
  await expect(page.getByLabel("O'qilmagan xabarlar").first()).toBeVisible({ timeout: 5000 });

  // Yopish
  await page.goto(`/app/inbox?c=${c!.id}`);
  await page.getByTestId("chat-pane").getByRole("button", { name: "Close" }).click();
  await expect.poll(async () => (await admin.from("contacts").select("live_chat_status").eq("id", c!.id).single()).data?.live_chat_status).toBe("closed");
});

test("Broadcasting: 1 000 kontaktga xatosiz, 25/s, statistika, rejalashtirish", async ({ page }) => {
  test.setTimeout(240_000);
  const TOKEN = newToken(7400000000);
  const { accountId } = await signupAndOnboard(page, "Broadcast Test", "Broadcast akkaunt");
  await connectBot(page, TOKEN);
  const { data: bot } = await admin.from("bots").select("id").eq("account_id", accountId).single();
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId); // 2 500 kontakt limiti
  const base = 900000000 + Math.floor(Math.random() * 1e6) * 10;
  for (let i = 0; i < 1000; i += 250) {
    const rows = Array.from({ length: 250 }, (_, k) => ({ account_id: accountId, bot_id: bot!.id, tg_user_id: base + i + k, first_name: `K${i + k}` }));
    const { error } = await admin.from("contacts").insert(rows);
    expect(error).toBeNull();
  }

  await page.goto("/app/broadcasting");
  await page.getByRole("button", { name: "New Broadcast" }).click();
  await page.waitForURL(/\/app\/broadcasting\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Nomini o'zgartirish" }).click();
  await page.getByRole("textbox", { name: "Nomini o'zgartirish" }).fill("Kuzgi aksiya");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("bc-count")).toHaveText("1 000 ta qabul qiluvchi");

  // Xabar: matn + URL tugma
  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").fill("Kuzgi aksiya: -20%, {{first_name}}!");
  await page.getByRole("button", { name: "Add Button" }).click();
  await page.getByLabel("Tugma matni").fill("Katalog");
  await page.getByLabel("URL manzil").fill("https://replio.uz");
  await page.getByRole("button", { name: "Qo'shish", exact: true }).click();
  await page.waitForTimeout(1000); // avtomatik saqlash
  await page.screenshot({ path: `${SHOTS}/p5-02-broadcast-editor.png` });

  // Hozir yuborish → birinchi xabar ≤ 2 s (dev: marshrutni oldindan kompilyatsiya qilamiz)
  await page.request.post(`/api/broadcasts/${crypto.randomUUID()}/send`, { data: {} });
  await page.getByRole("button", { name: "Hozir yuborish" }).click();
  const since = Date.now();
  await page.getByRole("dialog").getByRole("button", { name: "Yuborish" }).click();
  await expect
    .poll(async () => ((await (await page.request.get(`${TG}/__count?since=${since}&from=${base}&to=${base + 999}`)).json()) as { count: number }).count, { timeout: 10_000, intervals: [50] })
    .toBeGreaterThan(0);
  const first = ((await (await page.request.get(`${TG}/__count?since=${since}&from=${base}&to=${base + 999}`)).json()) as { first: number }).first;
  console.log(`broadcast send → first message: ${first - since} ms`);
  expect(first - since).toBeLessThan(2000);
  await expect(page.getByTestId("bc-results")).toBeVisible();

  // Hammasi yetkaziladi (≈ 40 s, 25/s)
  await expect
    .poll(async () => (await admin.from("broadcasts").select("status, stats").eq("account_id", accountId).single()).data, { timeout: 150_000, intervals: [2000] })
    .toMatchObject({ status: "sent", stats: { total: 1000, sent: 1000, delivered: 1000, failed: 0 } });
  const cnt = (await (await page.request.get(`${TG}/__count?since=${since}&from=${base}&to=${base + 999}`)).json()) as { count: number; chats: number };
  expect(cnt.count).toBe(1000);
  expect(cnt.chats).toBe(1000);
  // Tezlik chegarasi: 1 000 xabar ≥ ~38 s (25/s)
  const { data: last } = await admin.from("broadcast_recipients").select("sent_at").order("sent_at", { ascending: false }).limit(1).single();
  expect(new Date(last!.sent_at!).getTime() - since).toBeGreaterThan(35_000);
  await page.reload();
  await expect(page.getByTestId("bc-results").getByText("1 000").first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p5-03-broadcast-results.png` });

  // Ro'yxat: Sent tabida
  await page.goto("/app/broadcasting");
  await page.getByRole("tab", { name: "Sent" }).click();
  await expect(page.getByRole("row", { name: /Kuzgi aksiya/ })).toBeVisible();

  // Bloklagan kontaktlar → xato sifatida; rejalashtirish → bekor qilish
  await page.getByRole("button", { name: "New Broadcast" }).click();
  await page.waitForURL(/\/app\/broadcasting\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: /^Text/ }).click();
  await page.getByPlaceholder("Matn kiriting…").fill("Rejalashtirilgan xabar");
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Rejalashtirish" }).click();
  const future = new Date(Date.now() + 2 * 86_400_000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.fill("#bc-when", local);
  await page.getByRole("button", { name: "Rejalashtirish", exact: true }).last().click();
  await expect(page.getByText(/Rejalashtirilgan:/)).toBeVisible();
  await page.getByRole("button", { name: "Rejalashtirishni bekor qilish" }).click();
  await expect(page.getByRole("button", { name: "Hozir yuborish" })).toBeVisible();
});

test("Growth Tools (ref URL, QR, widget) va Team (agent taklifi)", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const TOKEN = newToken(7500000000);
  const { accountId } = await signupAndOnboard(page, "Growth Test", "Growth akkaunt");
  await connectBot(page, TOKEN);
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId);
  const username = `test${TOKEN.split(":")[0]}_bot`;

  await page.goto("/app/settings/growth");
  await page.getByRole("button", { name: "New Growth Tool" }).click();
  await page.fill("#gt-name", "Instagram bio");
  await page.fill("#gt-code", "insta");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  const card = page.getByTestId("growth-tool").filter({ hasText: "Instagram bio" });
  await expect(card.getByRole("textbox", { name: "Havola" })).toHaveValue(`https://t.me/${username}?start=insta`);
  await expect(card.getByRole("img", { name: "QR" })).toBeVisible();
  const svg = page.waitForEvent("download");
  await card.getByRole("button", { name: "SVG" }).click();
  expect((await svg).suggestedFilename()).toBe("insta.svg");
  const png = page.waitForEvent("download");
  await card.getByRole("button", { name: "PNG" }).click();
  expect((await png).suggestedFilename()).toBe("insta.png");

  // Takroriy kod
  await page.getByRole("button", { name: "New Growth Tool" }).click();
  await page.fill("#gt-code", "insta");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Bu kod band")).toBeVisible();
  await page.keyboard.press("Escape");

  // Bot: /start insta — yangi obunachi
  const u = 950000000 + Math.floor(Math.random() * 1e6);
  await sendUpdate(page, TOKEN, text(u, "/start insta"));
  await expect.poll(async () => (await admin.from("growth_tools").select("stats").eq("ref_code", "insta").eq("account_id", accountId).single()).data?.stats).toMatchObject({ clicks: 1, subscribers: 1 });
  await page.reload();
  await expect(card.getByText("Yangi obunachilar")).toBeVisible();

  // Widget
  await page.getByRole("button", { name: "New Growth Tool" }).click();
  await page.getByText("Sayt widgeti", { exact: true }).click();
  await page.fill("#gt-name", "Sayt");
  await page.fill("#gt-btn", "Bizga yozing");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  const w = page.getByTestId("growth-tool").filter({ hasText: "Sayt" });
  const code = await w.getByRole("textbox", { name: "Widget kodi" }).inputValue();
  const src = /src="([^"]+)"/.exec(code)![1];
  const js = await (await page.request.get(src)).text();
  expect(js).toContain(`https://t.me/${username}?start=`);
  expect(js).toContain("Bizga yozing");
  await expect.poll(async () => (await admin.from("growth_tools").select("stats").eq("account_id", accountId).eq("type", "widget").single()).data?.stats).toMatchObject({ views: 1 });
  await page.screenshot({ path: `${SHOTS}/p5-04-growth.png` });

  // Team: Live Chat agent taklifi → ro'yxatdan o'tgach faqat Inbox/Contacts
  const agentEmail = `agent${Date.now()}@test.uz`;
  await page.goto("/app/settings/team");
  await page.fill("#inv-email", agentEmail);
  await page.locator("#inv-role").selectOption("agent");
  await page.getByRole("button", { name: "Taklif qilish" }).click();
  await expect(page.getByText(agentEmail)).toBeVisible();

  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto("/signup");
  await p2.fill("#fullName", "Agent Sardor");
  await p2.fill("#email", agentEmail);
  await p2.fill("#password", "password123");
  await p2.click("button[type=submit]");
  await p2.waitForURL(/\/app(\/inbox)?$/);
  const nav = p2.getByRole("navigation", { name: "Asosiy navigatsiya" });
  await expect(nav.getByRole("link", { name: "Live Chat" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Contacts" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Broadcasting" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Automation" })).toHaveCount(0);
  await ctx2.close();
});

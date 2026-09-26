import { expect, test } from "@playwright/test";
import { admin, clickSubmenuItem, expectToast, railClick, SHOTS, signupAndOnboard } from "./helpers";

// 1-faza: 13-bo'limdagi rail, banner, My Automations va Inbox tugmalari
test.describe.configure({ mode: "serial" });

test("rail: navigatsiya, logo, kengaytirish, menyular, PRO", async ({ page }) => {
  await signupAndOnboard(page);
  await page.goto("/app");
  await page.screenshot({ path: `${SHOTS}/01-home.png` });

  // Home / Contacts / Automation / Inbox / Broadcasting / Settings
  const routes: [string, RegExp, string][] = [
    ["Contacts", /\/app\/contacts$/, "Contacts"],
    ["Automation", /\/app\/automation$/, "Automation"],
    ["Live Chat", /\/app\/inbox/, "Inbox"],
    ["Broadcasting", /\/app\/broadcasting$/, "Broadcasting"],
    ["Settings", /\/app\/settings\/general$/, "Settings"],
    ["Home", /\/app$/, "Home"],
  ];
  for (const [label, url, heading] of routes) {
    await railClick(page, label);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Asosiy navigatsiya" }).getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }

  // Logo → Home
  await railClick(page, "Contacts");
  await page.getByRole("link", { name: "Replio" }).first().click();
  await expect(page).toHaveURL(/\/app$/);

  // →| kengaytirish, holat eslab qolinadi
  await page.getByRole("button", { name: "Panelni kengaytirish" }).click();
  await expect(page.getByRole("navigation", { name: "Asosiy navigatsiya" }).getByText("Broadcasting")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Panelni yig'ish" })).toBeVisible();
  await page.getByRole("button", { name: "Panelni yig'ish" }).click();
  await expect(page.getByRole("button", { name: "Panelni kengaytirish" })).toBeVisible();

  // Akkaunt menyusi
  await page.getByRole("button", { name: "Akkauntlar" }).click();
  await expect(page.getByRole("menuitem", { name: /Ali do'koni/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Yangi bot ulash" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Akkaunt sozlamalari" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/general$/);
  await page.getByRole("button", { name: "Akkauntlar" }).click();
  await page.getByRole("menuitem", { name: "Yangi bot ulash" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  // Ikkinchi akkaunt → almashtirish
  await page.fill("#acc-name", "Ikkinchi bot");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app\/settings\/telegram$/);
  await expect(page.getByRole("button", { name: "Akkauntlar" })).toContainText("IB");
  await page.getByRole("button", { name: "Akkauntlar" }).click();
  await page.getByRole("menuitem", { name: /Ali do'koni/ }).click();
  await expect(page.getByRole("button", { name: "Akkauntlar" })).toContainText("AD");

  // Foydalanuvchi menyusi: Profil
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByRole("menuitem", { name: "Profil" }).click();
  await page.fill("#pf-name", "Ali Karimov");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expectToast(page, "Saqlandi");
  await expect(page.getByText("Xush kelibsiz, Ali!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Profil" })).toContainText("AK");

  // Til submenu
  await page.getByRole("button", { name: "Profil" }).click();
  await page.getByRole("menuitem", { name: /Til/ }).hover();
  await expect(page.getByRole("menuitemradio", { name: "O'zbekcha" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // ? yordam menyusi
  await page.getByRole("button", { name: "Yordam" }).click();
  await expect(page.getByRole("menuitem", { name: "Yordam markazi" })).toHaveAttribute("href", "/help");
  await expect(page.getByRole("menuitem", { name: "Telegram orqali qo'llab-quvvatlash" })).toHaveAttribute("href", /t\.me\//);
  await page.getByRole("menuitem", { name: "Klaviatura yorliqlari" }).click();
  await expect(page.getByRole("dialog", { name: "Klaviatura yorliqlari" })).toBeVisible();
  await page.keyboard.press("Escape");

  // PRO → tariflar modali, oylik/yillik, Tanlash → checkout.uz
  await page.getByRole("button", { name: "PRO", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Tarifni tanlang" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("89 000")).toBeVisible();
  await expect(dialog.getByText("179 000")).toBeVisible();
  await dialog.getByRole("radio", { name: /Yillik/ }).click();
  await expect(dialog.getByText("1 718 000")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-pricing.png` });
  await dialog.getByRole("button", { name: "Tanlash" }).nth(1).click();
  await page.waitForURL(/127\.0\.0\.1:4010\/pay\//);
  await expect(page.locator("#amount")).toHaveText("1718000");
  await expect(page.locator("#desc")).toContainText("Replio Pro — 1 yil");

  // To'lov: webhook → status_payment tekshiruvi → tarif faollashadi
  const uuid = page.url().split("/pay/")[1];
  await page.request.get(`http://127.0.0.1:4010/__pay/${uuid}`);
  await page.locator("#return").click();
  await expect(page).toHaveURL(/\/app\/settings\/billing\?payment=/);
  await expect(page.getByText("To'lov qabul qilindi! Tarif faollashtirildi.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await expect(page.getByText("To'langan")).toBeVisible();
  // Pro tarifida PRO tugmasi ko'rinmaydi
  await expect(page.getByRole("button", { name: "PRO", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/03-billing.png` });
});

test("banner: obuna tugaganda, ✕ yopadi, Obunani yangilash", async ({ page }) => {
  const { accountId } = await signupAndOnboard(page, "Banner Test", "Banner akkaunt");
  await page.goto("/app");
  await admin
    .from("subscriptions")
    .update({ status: "active", current_period_end: new Date(Date.now() - 86_400_000).toISOString() })
    .eq("account_id", accountId);
  await page.reload();
  const banner = page.getByRole("status").filter({ hasText: "Obunangiz muddati tugadi" });
  await expect(banner).toBeVisible();
  await expect(page.getByRole("button", { name: "Akkauntlar" }).getByText("TUGAGAN")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-banner.png` });
  await banner.getByRole("button", { name: "Yopish" }).click();
  await expect(banner).toBeHidden();
  await page.reload();
  await expect(page.getByText("Obunangiz muddati tugadi")).toBeHidden();
  // Yangi sessiya (sessionStorage tozalanadi) → banner qaytadi, "Obunani yangilash" → checkout
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Obunani yangilash" }).click();
  await page.waitForURL(/127\.0\.0\.1:4010\/pay\//);
  await expect(page.locator("#amount")).toHaveText("89000");
});

test("My Automations: yaratish, papka, filtr, saralash, grid, ommaviy amallar, Trash", async ({ page }) => {
  await signupAndOnboard(page, "Flow Test", "Flow akkaunt");
  await railClick(page, "Automation");
  await expect(page.getByRole("heading", { name: "Hali avtomatlashtirishlar yo'q" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-automation-empty.png` });

  // + New Automation → Noldan boshlash → builder
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Noldan boshlash/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await expect(page.getByText("DRAFT")).toBeVisible();
  // Nom ✎ → inline tahrirlash, Enter
  await page.getByRole("button", { name: "Nomini o'zgartirish" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Salomlashish");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Salomlashish")).toBeVisible();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  // Breadcrumb → ro'yxat
  await page.getByRole("link", { name: "Automations" }).click();
  await expect(page).toHaveURL(/\/app\/automation$/);

  // Shablondan
  await page.getByRole("button", { name: "New Automation" }).click();
  await page.getByRole("button", { name: /Kalit so'zga javob/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Automations" }).click();
  await expect(page.getByText("Message contains")).toBeVisible();
  await expect(page.locator("code", { hasText: "narx" })).toBeVisible();

  // Qidiruv (debounce)
  await page.getByPlaceholder("Barcha avtomatlashtirishlarni qidirish").fill("salom");
  await expect(page.getByText("Kalit so'zga javob")).toBeHidden();
  await expect(page.getByText("Salomlashish")).toBeVisible();
  await page.getByPlaceholder("Barcha avtomatlashtirishlarni qidirish").fill("");
  await expect(page.getByText("Kalit so'zga javob")).toBeVisible();

  // Any Trigger filtri
  await page.getByRole("button", { name: "Any Trigger", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Welcome / /start" }).click();
  await expect(page.getByText("Qidiruvga mos avtomatlashtirish topilmadi")).toBeVisible();
  await page.getByRole("button", { name: "Any Trigger", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Message contains" }).click();
  await expect(page.getByText("Kalit so'zga javob")).toBeVisible();
  await expect(page.getByText("Salomlashish")).toBeHidden();
  await page.getByRole("button", { name: "Any Trigger", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Any Trigger" }).click();

  // Any Trigger states
  await page.getByRole("button", { name: "Any Trigger states" }).click();
  await page.getByRole("menuitemradio", { name: "Paused" }).click();
  await expect(page.getByText("Qidiruvga mos avtomatlashtirish topilmadi")).toBeVisible();
  await page.getByRole("button", { name: "Any Trigger states" }).click();
  await page.getByRole("menuitemradio", { name: "Active" }).click();
  await expect(page.getByText("Kalit so'zga javob")).toBeVisible();
  await page.getByRole("button", { name: "Any Trigger states" }).click();
  await page.getByRole("menuitemradio", { name: "Any Trigger states" }).click();

  // Saralash: Name ⇅
  await page.getByRole("button", { name: "Name" }).click();
  const names = page.locator("[role=link] .text-\\[20px\\]");
  await expect(names.first()).toHaveText("Kalit so'zga javob");
  await page.getByRole("button", { name: "Name" }).click();
  await expect(names.first()).toHaveText("Salomlashish");

  // + New Folder (inline)
  await page.getByRole("button", { name: "New Folder" }).click();
  await page.keyboard.type("Marketing");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Marketing")).toBeVisible();

  // Qator ⋮ → Papkaga ko'chirish
  const row = page.locator("[role=link]", { hasText: "Salomlashish" });
  await row.hover();
  await row.getByRole("button", { name: "Amallar" }).click();
  await page.getByRole("menuitem", { name: "Papkaga ko'chirish" }).click();
  await expect(page.getByRole("menuitem", { name: "Marketing" })).toBeVisible();
  await clickSubmenuItem(page, "Marketing");
  await expect(page.locator("[role=link]", { hasText: "Salomlashish" })).toBeHidden();
  await expect(page.getByText("1 ta avtomatlashtirish")).toBeVisible();

  // Papkani ochish → breadcrumb
  await page.locator("[role=link]", { hasText: "Marketing" }).click();
  await expect(page).toHaveURL(/folder=/);
  await expect(page.getByText("Salomlashish")).toBeVisible();
  await page.getByRole("link", { name: "Barcha avtomatlashtirishlar" }).click();
  await expect(page).toHaveURL(/\/app\/automation$/);

  // ⋮ → Nomini o'zgartirish, Nusxalash
  const kw = page.locator("[role=link]", { hasText: "Kalit so'zga javob" });
  await kw.hover();
  await kw.getByRole("button", { name: "Amallar" }).click();
  await page.getByRole("menuitem", { name: "Nomini o'zgartirish" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Narx javobi");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Narx javobi")).toBeVisible();
  const nj = page.locator("[role=link]", { hasText: "Narx javobi" });
  await nj.hover();
  await nj.getByRole("button", { name: "Amallar" }).click();
  await page.getByRole("menuitem", { name: "Nusxalash" }).click();
  await expect(page.getByText("Narx javobi (nusxa)")).toBeVisible();

  // View as grid ↔ list (eslab qolinadi)
  await page.getByRole("button", { name: "View as grid" }).click();
  await expect(page.getByRole("button", { name: "View as list" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "View as list" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-automation-grid.png` });
  await page.getByRole("button", { name: "View as list" }).click();

  // ☐ sarlavhada → ommaviy panel
  await page.getByRole("checkbox", { name: "Hammasini tanlash" }).click();
  await expect(page.getByText("2 ta tanlandi")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-automation-bulk.png` });
  await page.getByRole("toolbar", { name: "Ommaviy amallar" }).getByRole("button", { name: "O'chirish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "O'chirish", exact: true }).click();
  await expect(page.getByText("Narx javobi")).toBeHidden();

  // Trash → Tiklash, Butunlay o'chirish
  await page.getByRole("link", { name: "Trash" }).click();
  await expect(page).toHaveURL(/\/app\/automation\/trash$/);
  await expect(page.getByText("Narx javobi (nusxa)")).toBeVisible();
  await page.locator("div.rounded-\\[12px\\]", { has: page.getByText("Narx javobi", { exact: true }) }).getByRole("button", { name: "Tiklash" }).click();
  await expect(page.getByText("Narx javobi", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Butunlay o'chirish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Butunlay o'chirish" }).click();
  await expect(page.getByText("Trash bo'sh")).toBeVisible();
  await page.getByRole("link", { name: "My Automations" }).first().click();
  await expect(page.getByText("Narx javobi")).toBeVisible();

  // Basic / Sequences ichki menyu
  await page.getByRole("link", { name: "Basic" }).click();
  await expect(page).toHaveURL(/\/app\/automation\/basic$/);
  await page.getByRole("button", { name: /Welcome Message/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Welcome / /start")).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "Sequences" }).click();
  await expect(page).toHaveURL(/\/app\/automation\/sequences$/);
  await page.getByRole("button", { name: "New Sequence" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Onboarding seriyasi");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Onboarding seriyasi")).toBeVisible();
  await page.getByRole("switch").click();
  await expect(page.getByText("To'xtatilgan")).toBeVisible();
});

test("Inbox: ro'yxat, filtrlar, chat, label, Favorites, Close/Reopen", async ({ page }) => {
  const { accountId } = await signupAndOnboard(page, "Inbox Test", "Inbox akkaunt");
  // Kontakt va xabarlarni seed qilamiz (bot 2-fazada ulanadi)
  const now = Date.now();
  const { data: contacts } = await admin
    .from("contacts")
    .insert([
      { account_id: accountId, tg_user_id: 1001, first_name: "Dilnoza", username: "dilnoza", is_unread: true, live_chat_status: "open", last_message_preview: "Narxi qancha?", last_message_at: new Date(now - 27 * 60_000).toISOString(), last_interaction_at: new Date(now - 27 * 60_000).toISOString() },
      { account_id: accountId, tg_user_id: 1002, first_name: "Jasur", last_name: "Toshmatov", is_unread: false, live_chat_status: "open", last_message_preview: "Rahmat!", last_message_at: new Date(now - 5 * 3_600_000).toISOString(), last_interaction_at: new Date(now - 5 * 3_600_000).toISOString() },
      { account_id: accountId, tg_user_id: 1003, first_name: "Kamola", is_unread: false, live_chat_status: "closed", last_message_preview: "Xayr", last_message_at: new Date(now - 2 * 86_400_000).toISOString(), last_interaction_at: new Date(now - 2 * 86_400_000).toISOString() },
    ])
    .select("id, first_name");
  const dil = contacts!.find((c) => c.first_name === "Dilnoza")!;
  await admin.from("messages").insert([
    { account_id: accountId, contact_id: dil.id, direction: "in", content: { text: "Salom" }, created_at: new Date(now - 30 * 60_000).toISOString() },
    { account_id: accountId, contact_id: dil.id, direction: "out_bot", content: { text: "Assalomu alaykum! Qanday yordam bera olamiz?" }, created_at: new Date(now - 29 * 60_000).toISOString() },
    { account_id: accountId, contact_id: dil.id, direction: "in", content: { text: "Narxi qancha?" }, created_at: new Date(now - 27 * 60_000).toISOString() },
  ]);

  await railClick(page, "Live Chat");
  await expect(page.getByRole("heading", { name: "Bu yerda ulangan kanallardagi kontaktlaringiz bilan yozishasiz" })).toBeVisible();
  await expect(page.getByText("Dilnoza")).toBeVisible();
  await expect(page.getByText("Jasur Toshmatov")).toBeVisible();
  await expect(page.getByText("Kamola")).toBeHidden(); // yopiq
  await expect(page.getByText("27m")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-inbox.png` });

  // Open Chats ⌄ → Closed
  await page.getByRole("button", { name: /Open Chats/ }).click();
  await page.getByRole("menuitemradio", { name: "Closed Chats" }).click();
  await expect(page.getByText("Kamola")).toBeVisible();
  await expect(page.getByText("Dilnoza")).toBeHidden();
  await page.getByRole("button", { name: /Closed Chats/ }).click();
  await page.getByRole("menuitemradio", { name: "Open Chats" }).click();

  // Unread toggle
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.getByText("Jasur Toshmatov")).toBeHidden();
  await expect(page.getByRole("button", { name: "Unread", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unread", exact: true }).click();

  // Sort: Oldest
  await page.getByRole("button", { name: /Sort: Newest/ }).click();
  await page.getByRole("menuitemradio", { name: "Oldest" }).click();
  await expect(page.locator("li").first()).toContainText("Jasur");
  await page.getByRole("button", { name: /Sort: Oldest/ }).click();
  await page.getByRole("menuitemradio", { name: "Newest" }).click();

  // All Channels ⌄
  await page.getByRole("button", { name: /All Channels/ }).click();
  await page.getByRole("menuitemradio", { name: "Telegram" }).click();
  await expect(page.getByText("Dilnoza")).toBeVisible();

  // Qidiruv (xabar matni bo'yicha)
  await page.getByPlaceholder("Inbox suhbatlari bo'yicha qidirish").fill("assalomu");
  await expect(page.getByText("Jasur Toshmatov")).toBeHidden();
  await expect(page.getByText("Dilnoza")).toBeVisible();
  await page.getByPlaceholder("Inbox suhbatlari bo'yicha qidirish").fill("");

  // + Filter → oxirgi faollik
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByLabel("Oxirgi faollik").selectOption("1d");
  await expect(page.getByText("Jasur Toshmatov")).toBeVisible();
  await page.getByRole("button", { name: "Filtrlarni tozalash" }).click();
  await page.keyboard.press("Escape");

  // Suhbat qatori → chat ochiladi, o'qilgan bo'ladi
  await page.getByText("Dilnoza").click();
  await expect(page).toHaveURL(/c=/);
  await expect(page.getByText("Assalomu alaykum! Qanday yordam bera olamiz?")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/09-inbox-chat.png` });
  await expect.poll(async () => (await admin.from("contacts").select("is_unread").eq("id", dil.id).single()).data?.is_unread).toBe(false);

  // ♡ Favorites
  await page.getByRole("button", { name: "Favorites'ga qo'shish" }).click();
  await expect(page.getByRole("button", { name: "Favorites'ga qo'shish" })).toHaveAttribute("aria-pressed", "true");
  // Labels → Favorites filtri
  await page.getByRole("complementary").getByRole("button", { name: "Favorites" }).click();
  await expect(page).toHaveURL(/view=label/);
  await expect(page.getByText("Jasur Toshmatov")).toBeHidden();
  await page.getByRole("button", { name: /All chats/ }).click();

  // Labels + → yangi label
  await page.getByRole("button", { name: "Yangi label" }).click();
  await page.fill("#label-name", "VIP");
  await page.getByRole("radio").nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yaratish" }).click();
  await expect(page.getByRole("complementary").getByRole("button", { name: "VIP" })).toBeVisible();

  // Labels ⌃ yig'ish
  await page.getByRole("button", { name: "Labels" }).click();
  await expect(page.getByRole("complementary").getByRole("button", { name: "VIP" })).toBeHidden();
  await page.getByRole("button", { name: "Labels" }).click();

  // Close / Reopen
  await page.getByText("Dilnoza").first().click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("button", { name: "Close" })).toBeVisible();
  // Reopen'dan keyin ro'yxat qayta yuklanadi — ikkala suhbat qaytguncha kutamiz
  await expect(page.getByRole("checkbox", { name: /Dilnoza/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Jasur/ })).toBeVisible();

  // ☐ → ommaviy: O'qilgan qilish
  await page.getByRole("checkbox", { name: "Hammasini tanlash" }).click();
  await expect(page.getByText("2 ta tanlandi")).toBeVisible();
  await page.getByRole("button", { name: "O'qilgan qilish" }).click();
  await expect(page.getByText("2 ta tanlandi")).toBeHidden();

  // « menyuni yig'ish
  await page.getByRole("button", { name: "Menyuni yig'ish" }).click();
  await expect(page.getByRole("button", { name: "Menyuni ochish" })).toBeVisible();
  await page.getByRole("button", { name: "Menyuni ochish" }).click();

  // ⚙ → Settings → Inbox
  await page.getByRole("link", { name: "Inbox sozlamalari" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/inbox$/);
});

test("Settings: General, Team, Tags, Fields, Bot Fields, Inbox, API, Logs", async ({ page }) => {
  await signupAndOnboard(page, "Sozlama Test", "Sozlama akkaunt");
  await page.goto("/app/settings/general");
  await page.fill("#gs-name", "Yangi nom");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expectToast(page, "Saqlandi");
  await expect(page.getByRole("button", { name: "Akkauntlar" })).toBeVisible();

  await page.getByRole("link", { name: "Tags" }).click();
  await expect(page).toHaveURL(/settings\/tags$/);
  await page.getByRole("button", { name: "Yangi teg" }).click();
  await page.fill("#tag-name", "mijoz");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("mijoz")).toBeVisible();

  await page.getByRole("link", { name: "Custom Fields" }).click();
  await expect(page).toHaveURL(/settings\/fields$/);
  await page.getByRole("button", { name: "Yangi maydon" }).click();
  await page.fill("#f-name", "telefon");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("{{telefon}}")).toBeVisible();

  await page.getByRole("link", { name: "Bot Fields" }).click();
  await expect(page).toHaveURL(/settings\/bot-fields$/);
  await page.getByRole("button", { name: "Yangi maydon" }).click();
  await page.fill("#f-name", "promo");
  await page.fill("#f-value", "REPLIO10");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("REPLIO10")).toBeVisible();

  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page).toHaveURL(/settings\/inbox$/);
  await page.getByLabel("Suhbatni avtomatik yopish").selectOption("1440");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expectToast(page, "Saqlandi");

  await page.getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/settings\/team$/);
  await page.fill("#inv-email", "hamkasb@test.uz");
  await page.getByRole("button", { name: "Taklif qilish" }).click();
  await expectToast(page, "Taklif yuborildi");

  await page.getByRole("link", { name: "API" }).click();
  await expect(page).toHaveURL(/settings\/api$/);
  await expect(page.getByText("API faqat Pro tarifida mavjud")).toBeVisible();
  await page.getByRole("button", { name: "Upgrade" }).click();
  await expect(page.getByRole("dialog", { name: "Tarifni tanlang" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page).toHaveURL(/settings\/logs$/);
  await expect(page.getByText("Bot javob tezligi")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10-settings-logs.png` });
});

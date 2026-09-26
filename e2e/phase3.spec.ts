import { expect, test, type Page } from "@playwright/test";
import { admin, SHOTS, signupAndOnboard } from "./helpers";

// 3-faza: Flow Builder (canvas), step tugmalari, Data Collection, Actions, Preview
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";
const TOKEN = `${7100000000 + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyz34`;
let userSeq = 500000000 + Math.floor(Math.random() * 1_000_000) * 100;

async function sendUpdate(page: Page, update: Record<string, unknown>) {
  const res = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update } });
  return (await res.json()) as { status: number; body: unknown; ms: number };
}
const from = (id: number) => ({ id, is_bot: false, first_name: "Aziza", username: `u${id}` });
const textUpdate = (id: number, text: string) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: { message_id: Math.floor(Math.random() * 1e6), date: Math.floor(Date.now() / 1000), text, from: from(id), chat: { id, type: "private" } },
});
const callbackUpdate = (id: number, data: string) => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: { id: `cb${Math.random()}`, from: from(id), data, message: { message_id: 1, date: 0, chat: { id, type: "private" } } },
});

type Sent = { method: string; text?: string; reply_markup?: { inline_keyboard?: { text: string; callback_data?: string }[][] } };
async function sentTo(page: Page, chatId: number) {
  return ((await (await page.request.get(`${TG}/__sent?chat_id=${chatId}`)).json()) as Sent[]).filter((m) => m.method === "sendMessage");
}

/** Node chiqish nuqtasidan bo'sh joyga tortish → step menyusi */
async function dragToEmpty(page: Page, nodeId: string, handleId: string, dy = 0) {
  // Sidebar yopiq, node ekranga sig'adi
  const collapse = page.getByRole("button", { name: "Sidebar'ni yig'ish" });
  if (await collapse.isVisible()) await collapse.click();
  await page.locator("body").press("Control+0");
  await page.waitForTimeout(400);
  // o'ng tomonda bo'sh joy bo'lishi uchun kichraytiramiz
  await page.getByRole("button", { name: "Kichraytirish" }).click();
  await page.getByRole("button", { name: "Kichraytirish" }).click();
  await page.waitForTimeout(300);
  const h = page.locator(`.react-flow__node[data-id="${nodeId}"] .react-flow__handle[data-handleid="${handleId}"]`);
  const box = (await h.boundingBox())!;
  const canvas = (await page.getByTestId("flow-canvas").boundingBox())!;
  const tx = Math.min(box.x + 200, canvas.x + canvas.width - 140);
  const ty = Math.min(Math.max(box.y + dy, canvas.y + 60), canvas.y + canvas.height - 300);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move((box.x + tx) / 2, (box.y + ty) / 2, { steps: 6 });
  await page.mouse.move(tx, ty, { steps: 6 });
  await page.mouse.up();
}

async function pickStep(page: Page, name: string) {
  await page.getByRole("menu", { name: "Step qo'shish" }).getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
}

async function selectedId(page: Page) {
  return page.getByTestId("step-sidebar").getAttribute("data-node-id");
}

test("Flow Builder: canvas, step tugmasi, Data Collection, Action, Preview", async ({ page }) => {
  const { accountId } = await signupAndOnboard(page, "Flow Test", "Flow akkaunt");
  await page.fill("#bot-token", TOKEN);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();

  // Pro tarif (Data Collection) + field va teg
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId);
  await admin.from("custom_fields").insert({ account_id: accountId, name: "ism", type: "text" });
  await admin.from("tags").insert({ account_id: accountId, name: "lead" });

  // Noldan yangi avtomatlashtirish → canvas
  await page.goto("/app/automation");
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Noldan boshlash/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("flow-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go To Basic Builder" })).toBeVisible();

  // When → sidebar → keyword trigger
  await page.locator('.react-flow__node[data-id="trigger"]').click();
  const sidebar = page.getByTestId("step-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(page.getByText("👈 Edit step in sidebar")).toBeVisible();
  await sidebar.getByRole("button", { name: "New Trigger" }).click();
  await page.getByRole("button", { name: /^Message contains/ }).click();
  await page.fill("#kw-input", "menyu");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(sidebar.getByText("menyu")).toBeVisible();

  // Standart "Send Message" (trigger'ga ulangan) → matn + step tugmasi
  await page.locator('.react-flow__node[data-id="m1"]').click();
  const m1 = (await selectedId(page))!;
  expect(m1).toBe("m1");
  await sidebar.getByRole("button", { name: /^Text/ }).click();
  await sidebar.getByPlaceholder("Matn kiriting…").fill("Ro'yxatdan o'tasizmi?");
  await sidebar.getByRole("button", { name: "Add Button" }).click();
  await page.locator("#btn-kind").selectOption("step");
  await page.getByLabel("Tugma matni").fill("Ha");
  await page.getByRole("button", { name: "Qo'shish", exact: true }).click();
  await expect(page.locator(`.react-flow__node[data-id="${m1}"]`).getByText("Ha")).toBeVisible();
  // Tugma step'ga ulangan bo'lishi shart (validatsiya)
  const btnHandle = await page.locator(`.react-flow__node[data-id="${m1}"] .react-flow__handle.source`).first().getAttribute("data-handleid");

  // "Ha" → Send Message (Data Collection + matn)
  await dragToEmpty(page, m1, btnHandle!, 60);
  await pickStep(page, "Send Message");
  const m2 = (await selectedId(page))!;
  await sidebar.getByRole("button", { name: /^Data Collection/ }).click();
  await sidebar.getByLabel("Savol matni").fill("Ismingiz nima?");
  await sidebar.getByLabel("Javobni saqlash (custom field)").selectOption({ label: "ism" });
  await sidebar.getByRole("button", { name: /^Text/ }).click();
  await sidebar.getByPlaceholder("Matn kiriting…").fill("Rahmat, {{ism}}!");

  // Next Step → Actions: teg qo'shish
  await dragToEmpty(page, m2, "next");
  await pickStep(page, "Actions");
  await sidebar.getByRole("button", { name: "Action qo'shish" }).click();
  await page.getByRole("menuitem", { name: /Teg qo'shish/ }).click();
  await sidebar.getByLabel("Tag", { exact: true }).selectOption({ label: "lead" });

  // Avto-tartiblash + Set Live
  await page.getByRole("button", { name: "Avto-tartiblash" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p3-01-canvas.png` });
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Go To Basic Builder" })).toHaveCount(0); // tarmoqlangan → faqat Flow Builder

  // ── Bot: keyword → tugmali xabar
  const u = ++userSeq;
  const r1 = await sendUpdate(page, textUpdate(u, "menyu"));
  expect(r1.ms).toBeLessThan(2000);
  const first = r1.body as Sent;
  expect(first.text).toBe("Ro'yxatdan o'tasizmi?");
  const cb = first.reply_markup!.inline_keyboard![0][0];
  expect(cb.text).toBe("Ha");

  // Tugma → savol
  const r2 = await sendUpdate(page, callbackUpdate(u, cb.callback_data!));
  expect(r2.ms).toBeLessThan(2000);
  await expect.poll(async () => (await sentTo(page, u)).map((m) => m.text)).toContain("Ismingiz nima?");

  // Javob → field saqlanadi, keyingi matn, teg qo'shiladi
  const r3 = await sendUpdate(page, textUpdate(u, "Aziza"));
  expect(r3.ms).toBeLessThan(2000);
  await expect.poll(async () => (await sentTo(page, u)).map((m) => m.text)).toContain("Rahmat, Aziza!");
  const { data: c } = await admin.from("contacts").select("id").eq("account_id", accountId).eq("tg_user_id", u).single();
  await expect
    .poll(async () => (await admin.from("contact_tags").select("tag_id, tags(name)").eq("contact_id", c!.id)).data?.map((x) => (x.tags as { name: string } | null)?.name))
    .toContain("lead");
  const { data: fv } = await admin.from("contact_field_values").select("value, custom_fields(name)").eq("contact_id", c!.id);
  expect(fv?.find((x) => (x.custom_fields as { name: string } | null)?.name === "ism")?.value).toBe("Aziza");

  // Step statistikasi canvas'da
  await page.reload();
  await expect(page.locator(`.react-flow__node[data-id="${m1}"]`).getByText(/1 yuborildi/)).toBeVisible();

  // ── Preview: avval o'z Telegram'ini ulash
  await page.getByTestId("preview").click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText("Telegram'da sinab ko'rish")).toBeVisible();
  await expect(dlg.getByRole("img", { name: "QR" })).toBeVisible();
  const link = await dlg.getByRole("link", { name: /Botni ochish/ }).getAttribute("href");
  const code = /start=(preview_[0-9a-f]+)/.exec(link!)![1];
  const me = ++userSeq;
  await sendUpdate(page, textUpdate(me, `/start ${code}`));
  await dlg.getByRole("button", { name: "Uladim, yuborish" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Telegram'ingizga yuborildi" })).toBeVisible();
  await expect.poll(async () => (await sentTo(page, me)).map((m) => m.text)).toContain("Ro'yxatdan o'tasizmi?");
  await page.screenshot({ path: `${SHOTS}/p3-02-preview.png` });
});

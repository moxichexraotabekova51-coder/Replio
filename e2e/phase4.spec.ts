import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { admin, SHOTS, signupAndOnboard } from "./helpers";

// 4-faza: barcha trigger turlari, shartlar, fon ishlari (pg_cron → worker), Sequences
test.describe.configure({ mode: "serial" });

const TG = "http://127.0.0.1:4020";
const TOKEN = `${7200000000 + Math.floor(Math.random() * 99999999)}:AAHtestTOKENabcdefghijklmnopqrstuvwxyz56`;
let userSeq = 600000000 + Math.floor(Math.random() * 1_000_000) * 100;

function psql(sql: string) {
  return execSync(`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "${sql.replace(/"/g, '\\"')}"`).toString().trim();
}

async function sendUpdate(page: Page, update: Record<string, unknown>) {
  const res = await page.request.post(`${TG}/__update`, { data: { token: TOKEN, update } });
  return (await res.json()) as { status: number; body: unknown; ms: number };
}
const from = (id: number) => ({ id, is_bot: false, first_name: "Kamola", username: `u${id}` });
const message = (id: number, extra: Record<string, unknown>) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: { message_id: Math.floor(Math.random() * 1e6), date: Math.floor(Date.now() / 1000), from: from(id), chat: { id, type: "private" }, ...extra },
});
const text = (id: number, t: string) => message(id, { text: t });

async function texts(page: Page, chatId: number) {
  const all = (await (await page.request.get(`${TG}/__sent?chat_id=${chatId}`)).json()) as { method: string; text?: string }[];
  return all.filter((m) => m.method === "sendMessage").map((m) => m.text);
}

/** Flow: noldan, m1 = matn, Set Live. Flow id qaytadi. */
async function makeFlow(page: Page, name: string, reply: string) {
  await page.goto("/app/automation");
  await page.getByRole("button", { name: "New Automation" }).first().click();
  await page.getByRole("button", { name: /Noldan boshlash/ }).click();
  await page.waitForURL(/\/app\/automation\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "Nomini o'zgartirish" }).first().click();
  await page.getByRole("textbox", { name: "Nomini o'zgartirish" }).fill(name);
  await page.keyboard.press("Enter");
  await page.locator('.react-flow__node[data-id="m1"]').click();
  const sb = page.getByTestId("step-sidebar");
  await sb.getByRole("button", { name: /^Text/ }).click();
  await sb.getByPlaceholder("Matn kiriting…").fill(reply);
  await page.locator('.react-flow__node[data-id="trigger"]').click();
  return id;
}

async function addTrigger(page: Page, type: RegExp, fill?: () => Promise<void>) {
  const sb = page.getByTestId("step-sidebar");
  await sb.getByRole("button", { name: "New Trigger" }).click();
  await page.getByRole("dialog").getByRole("button", { name: type }).click();
  if (fill) await fill();
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function setLive(page: Page) {
  await page.getByRole("button", { name: "Set Live" }).click();
  await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
}

test("11 trigger turi, shartlar, worker, Sequences", async ({ page }) => {
  test.setTimeout(240_000);
  const { accountId } = await signupAndOnboard(page, "Trigger Test", "Trigger akkaunt");
  await page.fill("#bot-token", TOKEN);
  await page.getByRole("button", { name: "Botni ulash" }).click();
  await expect(page.getByText("Webhook ishlayapti")).toBeVisible();
  await admin.from("subscriptions").update({ plan_id: "pro" }).eq("account_id", accountId);
  const { data: vip } = await admin.from("tags").insert({ account_id: accountId, name: "vip" }).select("id").single();
  const { data: city } = await admin.from("custom_fields").insert({ account_id: accountId, name: "shahar", type: "text" }).select("id").single();
  const { data: bday } = await admin.from("custom_fields").insert({ account_id: accountId, name: "tugilgan", type: "date" }).select("id").single();

  // ── Flow A: ref URL, message type, command + shart (vip)
  const flowA = await makeFlow(page, "Xabar triggerlari", "A-javob");
  await addTrigger(page, /^Telegram Ref URL/, async () => {
    await page.fill("#ref", "aksiya2026");
    await expect(page.getByRole("img", { name: "QR" })).toBeVisible();
    await expect(page.getByRole("link", { name: "QR yuklab olish" })).toBeVisible();
  });
  await addTrigger(page, /^Any message type/, async () => {
    await page.getByRole("checkbox", { name: "Rasm" }).check();
  });
  await addTrigger(page, /^Command/, async () => {
    await page.fill("#cmd", "vip");
    await page.getByRole("button", { name: "+ Condition" }).click();
    await page.getByTestId("rule").getByLabel("Tag", { exact: true }).selectOption({ label: "vip" });
  });
  await expect(page.getByTestId("trigger-card")).toHaveCount(3);
  await expect(page.getByTestId("trigger-card").filter({ hasText: "Shartlar" })).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/p4-01-triggers.png` });
  await setLive(page);

  // ── Flow B: kontakt hodisalari (tag, field, date, subscribed, webhook)
  const flowB = await makeFlow(page, "Hodisa triggerlari", "B-javob {{first_name}}");
  await addTrigger(page, /^Tag applied/, async () => {
    await page.locator("#tr-tag").selectOption({ label: "vip" });
  });
  await addTrigger(page, /^Custom field changed/, async () => {
    await page.locator("#tr-field").selectOption({ label: "shahar" });
  });
  await addTrigger(page, /^Date\/time based/, async () => {
    await page.locator("#tr-date").selectOption({ label: "tugilgan" });
    await page.fill("#tr-off", "1");
    await page.fill("#tr-time", "00:00");
  });
  await addTrigger(page, /^Contact subscribed/);
  await addTrigger(page, /^External webhook/);
  await expect(page.getByTestId("trigger-card")).toHaveCount(5);
  // Webhook URL tahrirlash oynasida
  await page.getByTestId("trigger-card").filter({ hasText: "External webhook" }).getByRole("button").first().click();
  const hookUrl = await page.getByRole("dialog").getByRole("textbox", { name: "Havola" }).inputValue();
  expect(hookUrl).toMatch(new RegExp(`/api/hooks/${accountId}/[0-9a-f-]{36}\\?key=[0-9a-f]{32}$`));
  await page.keyboard.press("Escape");
  await setLive(page);
  await page.screenshot({ path: `${SHOTS}/p4-02-event-triggers.png` });

  // subscribed: yangi kontakt → B (worker orqali)
  const u = ++userSeq;
  await sendUpdate(page, text(u, "salom"));
  await expect.poll(() => texts(page, u), { timeout: 15_000 }).toContain("B-javob Kamola");
  const { data: c } = await admin.from("contacts").select("id").eq("account_id", accountId).eq("tg_user_id", u).single();
  const cid = c!.id;

  // ref URL → A
  const r1 = await sendUpdate(page, text(u, "/start aksiya2026"));
  expect((r1.body as { text?: string }).text).toBe("A-javob");

  // message type: rasm → A; stiker → hech narsa
  const before = (await texts(page, u)).length;
  const r2 = await sendUpdate(page, message(u, { photo: [{ file_id: "x", width: 1, height: 1 }] }));
  expect((r2.body as { text?: string }).text).toBe("A-javob");
  await sendUpdate(page, message(u, { sticker: { file_id: "s" } }));
  await page.waitForTimeout(500);
  expect((await texts(page, u)).length).toBe(before + 1);

  // /vip — shart (vip teg) bajarilmaguncha ishlamaydi
  const r3 = await sendUpdate(page, text(u, "/vip"));
  expect((r3.body as { text?: string } | null)?.text).toBeUndefined();

  // tag_applied → B; so'ng /vip ishlaydi
  const n0 = (await texts(page, u)).filter((x) => x?.startsWith("B-javob")).length;
  await admin.from("contact_tags").insert({ contact_id: cid, tag_id: vip!.id });
  await expect.poll(async () => (await texts(page, u)).filter((x) => x?.startsWith("B-javob")).length, { timeout: 15_000 }).toBe(n0 + 1);
  await page.waitForTimeout(1100); // handle_update kesh versiyasi yangilanishi uchun emas — shart kontakt holatidan olinadi
  const r4 = await sendUpdate(page, text(u, "/vip"));
  expect((r4.body as { text?: string }).text).toBe("A-javob");

  // field_changed → B
  await admin.from("contact_field_values").insert({ contact_id: cid, field_id: city!.id, value: "Toshkent" });
  await expect.poll(async () => (await texts(page, u)).filter((x) => x?.startsWith("B-javob")).length, { timeout: 15_000 }).toBe(n0 + 2);

  // date_based: ertaga tug'ilgan kun, 1 kun oldin 00:00 → bugun
  const tomorrow = new Date(Date.now() + 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);
  await admin.from("contact_field_values").insert({ contact_id: cid, field_id: bday!.id, value: tomorrow });
  // (field_changed trigger faqat "shahar" uchun — tug'ilgan kun o'zgarishi hodisa bermaydi)
  expect(Number(psql("select public.enqueue_date_triggers()"))).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await texts(page, u)).filter((x) => x?.startsWith("B-javob")).length, { timeout: 15_000 }).toBe(n0 + 3);

  // webhook → B, field yoziladi
  const hook = await page.request.post(hookUrl, { data: { telegram_id: u, fields: { shahar: "Xiva" } } });
  expect(hook.status()).toBe(202);
  // webhook + field_changed (Xiva) — ikkala hodisa
  await expect.poll(async () => (await texts(page, u)).filter((x) => x?.startsWith("B-javob")).length, { timeout: 15_000 }).toBe(n0 + 5);
  const bad = await page.request.post(hookUrl.replace(/key=\w+/, "key=xato"), { data: { telegram_id: u } });
  expect(bad.status()).toBe(404);

  // Smart Delay davomi (flow_step job) worker orqali
  const n1 = (await texts(page, u)).filter((x) => x === "A-javob").length;
  await admin.from("scheduled_jobs").insert({ account_id: accountId, type: "flow_step", payload: { contact_id: cid, flow_id: flowA, step: "m1" } });
  await expect.poll(async () => (await texts(page, u)).filter((x) => x === "A-javob").length, { timeout: 15_000 }).toBe(n1 + 1);

  // Run'lar hisoblanadi
  await expect.poll(async () => (await admin.from("triggers").select("run_count").eq("flow_id", flowB).eq("type", "tag_applied").single()).data?.run_count).toBe(1);

  // ── Sequences: UI'da yaratish, darhol yuboriladigan qadam
  await page.goto("/app/automation/sequences");
  await page.getByRole("button", { name: "New Sequence" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Onboarding");
  await page.getByRole("dialog").getByRole("button", { name: /Saqlash|Yaratish/ }).click();
  await page.waitForURL(/\/app\/automation\/sequences\/[0-9a-f-]{36}$/);
  const seqId = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "Xabar qo'shish" }).click();
  await page.getByRole("button", { name: "Xabar qo'shish" }).click();
  await expect(page.getByTestId("seq-step")).toHaveCount(2);
  const s1 = page.getByTestId("seq-step").first();
  await s1.getByLabel("Avtomatlashtirish").selectOption({ label: "Xabar triggerlari" });
  await expect(s1.getByRole("spinbutton", { name: "Yuborish" })).toHaveValue("0");
  const s2 = page.getByTestId("seq-step").nth(1);
  await expect(s2.getByRole("spinbutton", { name: "Yuborish" })).toHaveValue("1");
  await s2.getByRole("switch", { name: "Faqat belgilangan vaqtda yuborish" }).click();
  await expect(s2.getByRole("button", { name: "Du" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/p4-03-sequence.png` });
  await expect.poll(async () => (await admin.from("sequence_steps").select("flow_id").eq("sequence_id", seqId).order("position")).data?.[0]?.flow_id).toBe(flowA);

  const n2 = (await texts(page, u)).filter((x) => x === "A-javob").length;
  await admin.from("contact_sequences").insert({ contact_id: cid, sequence_id: seqId });
  await expect.poll(async () => (await texts(page, u)).filter((x) => x === "A-javob").length, { timeout: 15_000 }).toBe(n2 + 1);
  const { data: cs } = await admin.from("contact_sequences").select("current_step, next_run_at").eq("contact_id", cid).single();
  expect(cs!.current_step).toBe(1);
  expect(new Date(cs!.next_run_at!).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);

  // Sequence ro'yxatida 1 obunachi
  await page.goto("/app/automation/sequences");
  await expect(page.getByText("1 ta obunachi")).toBeVisible();
});

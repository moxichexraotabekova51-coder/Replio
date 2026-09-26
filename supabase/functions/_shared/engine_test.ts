import { assert, assertEquals } from "jsr:@std/assert@1";
import { execute, handleInput, menuTarget, parseCallback, type Runtime } from "./engine.ts";
import type { BotState, CompiledFlow, Contact, Trigger } from "./flow.ts";
import { checkInput, evalConditions, jsonPath, nextBusinessTime, pickVariant, triggerConditionsOk } from "./logic.ts";
import { matchTrigger, normalize } from "./match.ts";
import { renderVars } from "./render.ts";

const t = (id: string, type: string, config: Record<string, unknown>, updated_at = "2026-01-01"): Trigger => ({
  id, type, config, priority: 0, flow_id: `flow-${id}`, updated_at,
});

Deno.test("normalize: lotin↔kirill, apostrof, tinish belgilari", () => {
  assertEquals(normalize("Нарх?", true), "narx");
  assertEquals(normalize("Oʻzbek  tili!!", false), "o'zbek tili");
  assertEquals(normalize("ЎЗБЕК", true), "o'zbek");
});

Deno.test("ustuvorlik: is > begins_with > contains > default", () => {
  const trs = [
    t("c", "keyword", { match: "contains", keywords: ["narx"] }, "2026-03-01"),
    t("b", "keyword", { match: "begins_with", keywords: ["narx"] }),
    t("i", "keyword", { match: "is", keywords: ["narx"] }),
    t("d", "default_reply", {}),
  ];
  assertEquals(matchTrigger(trs, { text: "Narx", isNew: false, messageType: "text" })?.trigger.id, "i");
  assertEquals(matchTrigger(trs, { text: "narx qancha", isNew: false, messageType: "text" })?.trigger.id, "b");
  assertEquals(matchTrigger(trs, { text: "bu narx qancha", isNew: false, messageType: "text" })?.trigger.id, "c");
  assertEquals(matchTrigger(trs, { text: "salom", isNew: false, messageType: "text" })?.trigger.id, "d");
});

Deno.test("/start → welcome, /start ref_x → ref_url, /menu → command", () => {
  const trs = [t("w", "welcome", {}), t("r", "ref_url", { ref: "ref_promo" }), t("m", "command", { command: "menu" }), t("d", "default_reply", {})];
  assertEquals(matchTrigger(trs, { text: "/start", isNew: true, messageType: "text" })?.trigger.id, "w");
  assertEquals(matchTrigger(trs, { text: "/start ref_promo", isNew: true, messageType: "text" })?.trigger.id, "r");
  assertEquals(matchTrigger(trs, { text: "/menu@my_bot", isNew: false, messageType: "text" })?.trigger.id, "m");
});

Deno.test("o'zgaruvchilar HTML-escape qilinadi", () => {
  assertEquals(renderVars("Salom, <b>{{first_name}}</b>!", { first_name: "<Ali>" }), "Salom, <b>&lt;Ali&gt;</b>!");
});

// ── Soxta runtime ──
function contact(over: Partial<Contact> = {}): Contact {
  return { id: "c1", first_name: "Ali", last_name: null, username: "ali", state: {}, tags: [], fields: {}, field_ids: {}, subscribed_at: "2026-05-01T00:00:00Z", ...over };
}

function fakeRuntime(flows: Record<string, CompiledFlow>, c: Contact, features: Record<string, unknown> = { data_collection: true, external_request: true }) {
  const sent: { method: string; payload: Record<string, unknown> }[] = [];
  const applied: unknown[][] = [];
  const states: (BotState | null | undefined)[] = [];
  let cur = c;
  const rt: Runtime = {
    send: async (method, payload) => {
      sent.push({ method, payload });
      return { ok: true, message_id: sent.length };
    },
    wait: async () => {},
    apply: async (actions, state) => {
      applied.push(actions);
      states.push(state);
      const tags = [...cur.tags];
      const field_ids = { ...cur.field_ids };
      const fields = { ...cur.fields };
      for (const a of actions as Record<string, string>[]) {
        if (a.a === "add_tag" && !tags.includes(a.tag_id)) tags.push(a.tag_id);
        if (a.a === "remove_tag") tags.splice(tags.indexOf(a.tag_id), 1);
        if (a.a === "set_field") {
          field_ids[a.field_id] = a.value;
          fields[a.field_id.replace(/^f/, "").toLowerCase()] = a.value; // real snapshot: nom bo'yicha ham
        }
        if (a.a === "delete_contact") return { contact: null, notify: [] };
      }
      cur = { ...cur, tags, field_ids, fields, state: state ?? cur.state };
      return { contact: cur, notify: (actions as Record<string, string>[]).some((a) => a.a === "notify") ? [777] : [] };
    },
    http: async () => ({ ok: true, status: 200, json: { data: { city: "Toshkent" } } }),
    getFlow: (id) => flows[id],
    random: () => 0.7,
    now: () => new Date("2026-09-26T10:00:00Z"),
    timezone: "Asia/Tashkent",
    features,
  };
  return { rt, sent, applied, states, get contact() { return cur; } };
}

const F = "00000000-0000-0000-0000-00000000000f";

Deno.test("execute: xabar → action → condition (ha/yo'q) → random", async () => {
  const flow: CompiledFlow = {
    v: 2,
    start: "m1",
    steps: {
      m1: { t: "message", blocks: [{ t: "text", text: "Salom {{first_name}}", buttons: [] }, { t: "delay", s: 2 }], next: "a1" },
      a1: { t: "action", actions: [{ a: "add_tag", tag_id: "vip" }, { a: "notify", text: "Yangi lid" }], next: "c1" },
      c1: { t: "condition", op: "and", rules: [{ kind: "tag", tag_id: "vip" }], yes: "r1", no: "mNo" },
      r1: { t: "random", variants: [{ pct: 50, step: "mA" }, { pct: 50, step: "mB" }] },
      mA: { t: "message", blocks: [{ t: "text", text: "A", buttons: [] }], next: null },
      mB: { t: "message", blocks: [{ t: "text", text: "B", buttons: [] }], next: null },
      mNo: { t: "message", blocks: [{ t: "text", text: "NO", buttons: [] }], next: null },
    },
  };
  const f = fakeRuntime({ [F]: flow }, contact());
  const ctx = { chatId: 42, contact: f.contact, botFields: {}, steps: [] as string[] };
  await execute(f.rt, ctx, F, flow, "m1");
  assertEquals(ctx.steps, ["m1", "a1", "c1", "r1", "mB"]);
  const texts = f.sent.filter((s) => s.method === "sendMessage").map((s) => [s.payload.chat_id, s.payload.text]);
  assertEquals(texts, [[42, "Salom Ali"], [777, "Yangi lid\n\n👤 Ali"], [42, "B"]]);
});

Deno.test("Data Collection: savol → noto'g'ri javob → to'g'ri javob → field + davom", async () => {
  const flow: CompiledFlow = {
    v: 2,
    start: "m1",
    steps: {
      m1: { t: "message", blocks: [{ t: "input", text: "Emailingiz?", kind: "email", field_id: "fEmail", error: "Email noto'g'ri" }, { t: "text", text: "Rahmat, {{email}}!", buttons: [] }], next: null },
    },
  };
  const f = fakeRuntime({ [F]: flow }, contact());
  const ctx = { chatId: 42, contact: f.contact, botFields: {}, steps: [] as string[] };
  await execute(f.rt, ctx, F, flow, "m1");
  assertEquals(f.sent.at(-1)!.payload.text, "Emailingiz?");
  assertEquals(ctx.contact.state.input?.kind, "email");
  // noto'g'ri
  assert(await handleInput(f.rt, ctx, { text: "xato" }));
  assertEquals(f.sent.at(-1)!.payload.text, "Email noto'g'ri");
  // to'g'ri — field saqlanadi, keyingi blok yuboriladi
  assert(await handleInput(f.rt, ctx, { text: "Ali@X.uz" }));
  assertEquals(f.contact.field_ids.fEmail, "ali@x.uz");
  assertEquals(f.contact.state.input, undefined);
  assertEquals(f.sent.at(-1)!.payload.text, "Rahmat, ali@x.uz!");
});

Deno.test("Data Collection Start tarifida o'tkazib yuboriladi", async () => {
  const flow: CompiledFlow = { v: 2, start: "m1", steps: { m1: { t: "message", blocks: [{ t: "input", text: "?", kind: "text" }, { t: "text", text: "keyin", buttons: [] }], next: null } } };
  const f = fakeRuntime({ [F]: flow }, contact(), { data_collection: false });
  await execute(f.rt, { chatId: 1, contact: f.contact, botFields: {}, steps: [] }, F, flow, "m1");
  assertEquals(f.sent.map((s) => s.payload.text), ["keyin"]);
});

Deno.test("Smart Delay → scheduled job; External Request → field", async () => {
  const flow: CompiledFlow = {
    v: 2,
    start: "a1",
    steps: {
      a1: { t: "action", actions: [{ a: "http", method: "GET", url: "https://api.x.uz/{{username}}", map: [{ path: "data.city", field_id: "fCity" }] }], next: "d1" },
      d1: { t: "smart_delay", amount: 2, unit: "hours", next: "m2" },
      m2: { t: "message", blocks: [{ t: "text", text: "keyin", buttons: [] }], next: null },
    },
  };
  const f = fakeRuntime({ [F]: flow }, contact());
  const ctx = { chatId: 1, contact: f.contact, botFields: {}, steps: [] as string[] };
  await execute(f.rt, ctx, F, flow, "a1");
  assertEquals(f.contact.field_ids.fCity, "Toshkent");
  const sched = f.applied.flat().find((a) => (a as { a: string }).a === "schedule") as { run_at: string; payload: { step: string } };
  assertEquals(sched.payload.step, "m2");
  assertEquals(sched.run_at, "2026-09-26T12:00:00.000Z");
  assertEquals(f.sent.length, 0);
});

Deno.test("tugmalar callback, menyu, start_flow", async () => {
  const other: CompiledFlow = { v: 2, start: "x", steps: { x: { t: "message", blocks: [{ t: "text", text: "boshqa", buttons: [] }], next: null } } };
  const O = "00000000-0000-0000-0000-0000000000aa";
  const flow: CompiledFlow = {
    v: 2,
    start: "m1",
    steps: {
      m1: { t: "message", blocks: [{ t: "text", text: "Tanlang", buttons: [{ title: "Keyingi", step: "m2" }, { title: "Boshqa", flow: O }] }], next: "m2", menu: [{ title: "Narxlar", step: "m2" }] },
      m2: { t: "start_flow", flow_id: O },
    },
  };
  const f = fakeRuntime({ [F]: flow, [O]: other }, contact());
  const ctx = { chatId: 1, contact: f.contact, botFields: {}, steps: [] as string[] };
  await execute(f.rt, ctx, F, flow, "m1");
  assertEquals(ctx.steps, ["m1"]); // tugma kutiladi
  const kb = (f.sent[0].payload.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard;
  assertEquals(parseCallback(kb[0][0].callback_data), { kind: "step", flowId: F, stepId: "m2" });
  assertEquals(parseCallback(kb[1][0].callback_data), { kind: "flow", flowId: O });
  assertEquals(menuTarget(f.contact.state, "narxlar"), { flowId: F, step: "m2" });
  await execute(f.rt, ctx, F, flow, "m2");
  assertEquals(f.sent.at(-1)!.payload.text, "boshqa");
});

Deno.test("logic: shartlar, javob tekshiruvi, ish vaqti, json yo'li, random", () => {
  const c = contact({ tags: ["t1"], field_ids: { age: 25 } });
  assert(evalConditions(c, "and", [{ kind: "tag", tag_id: "t1" }, { kind: "field", field_id: "age", cmp: "gt", value: "18" }]));
  assert(!evalConditions(c, "and", [{ kind: "tag", tag_id: "t2" }]));
  assert(evalConditions(c, "or", [{ kind: "tag", tag_id: "t2" }, { kind: "system", field: "first_name", cmp: "eq", value: "ali" }]));
  assertEquals(checkInput("phone", { text: "+998 90 123-45-67" }), { ok: true, value: "+998901234567" });
  assertEquals(checkInput("date", { text: "05.03.2026" }), { ok: true, value: "2026-03-05" });
  assertEquals(checkInput("number", { text: "12,5" }), { ok: true, value: 12.5 });
  assertEquals(checkInput("email", { text: "x@" }).ok, false);
  // Shanba 20:00 Toshkent → Dushanba 09:00 Toshkent (04:00 UTC)
  assertEquals(nextBusinessTime(new Date("2026-09-26T15:00:00Z"), "Asia/Tashkent").toISOString(), "2026-09-28T04:00:00.000Z");
  assertEquals(jsonPath({ a: { b: [{ c: 5 }] } }, "a.b.0.c"), 5);
  assertEquals(pickVariant([{ pct: 30, s: "a" }, { pct: 70, s: "b" }], 0.1)?.s, "a");
  assertEquals(pickVariant([{ pct: 30, s: "a" }, { pct: 70, s: "b" }], 0.5)?.s, "b");
});

Deno.test("trigger shartlari: vaqt oralig'i, eski format, tunni kesib o'tish", () => {
  const c = contact({ tags: ["vip"] });
  // 10:30 Toshkent = 05:30 UTC
  const env = { now: new Date("2026-09-28T05:30:00Z"), tz: "Asia/Tashkent" };
  assert(triggerConditionsOk(c, [], env));
  assert(triggerConditionsOk(c, {}, env));
  assert(triggerConditionsOk(c, { op: "and", rules: [{ kind: "time", from: "09:00", to: "18:00" }, { kind: "tag", tag_id: "vip" }] }, env));
  assert(!triggerConditionsOk(c, { op: "and", rules: [{ kind: "time", from: "12:00", to: "18:00" }] }, env));
  assert(triggerConditionsOk(c, { op: "or", rules: [{ kind: "time", from: "12:00", to: "18:00" }, { kind: "tag", tag_id: "vip" }] }, env));
  // 22:00–06:00 oralig'i, soat 02:00 Toshkent
  assert(triggerConditionsOk(c, { rules: [{ kind: "time", from: "22:00", to: "06:00" }] }, { now: new Date("2026-09-27T21:00:00Z"), tz: "Asia/Tashkent" }));
});

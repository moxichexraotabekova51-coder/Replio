import { assertEquals } from "jsr:@std/assert@1";
import { plan, parseCallback } from "./engine.ts";
import type { CompiledFlow, Trigger } from "./flow.ts";
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
  assertEquals(matchTrigger(trs, { text: "narxlar", isNew: false, messageType: "text" })?.trigger.id, "d");
});

Deno.test("teng ustuvorlikda eng oxirgi o'zgartirilgani", () => {
  const trs = [
    t("old", "keyword", { match: "contains", keywords: ["salom"] }, "2026-01-01"),
    t("new", "keyword", { match: "contains", keywords: ["salom"] }, "2026-02-01"),
  ];
  assertEquals(matchTrigger(trs, { text: "salom", isNew: false, messageType: "text" })?.trigger.id, "new");
});

Deno.test("kirillcha xabar lotin kalit so'zga mos keladi", () => {
  const trs = [t("k", "keyword", { match: "contains", keywords: ["chegirma"] })];
  assertEquals(matchTrigger(trs, { text: "Чегирма борми?", isNew: false, messageType: "text" })?.trigger.id, "k");
});

Deno.test("/start → welcome, /start ref_x → ref_url, /menu → command", () => {
  const trs = [
    t("w", "welcome", {}),
    t("r", "ref_url", { ref: "ref_promo" }),
    t("m", "command", { command: "menu" }),
    t("d", "default_reply", {}),
  ];
  assertEquals(matchTrigger(trs, { text: "/start", isNew: true, messageType: "text" })?.trigger.id, "w");
  assertEquals(matchTrigger(trs, { text: "/start ref_promo", isNew: true, messageType: "text" })?.trigger.id, "r");
  assertEquals(matchTrigger(trs, { text: "/menu@my_bot", isNew: false, messageType: "text" })?.trigger.id, "m");
  assertEquals(matchTrigger(trs, { text: "/unknown", isNew: false, messageType: "text" })?.trigger.id, "d");
});

Deno.test("o'zgaruvchilar HTML-escape qilinadi", () => {
  assertEquals(renderVars("Salom, <b>{{first_name}}</b>!", { first_name: "<Ali>" }), "Salom, <b>&lt;Ali&gt;</b>!");
  assertEquals(renderVars("{{ yoq }}|", {}), "|");
});

Deno.test("plan: bloklar, delay, tugmalar, keyingi step", () => {
  const flow: CompiledFlow = {
    v: 1,
    start: "m1",
    steps: {
      m1: { t: "message", blocks: [{ t: "text", text: "A", buttons: [] }, { t: "delay", s: 2 }, { t: "text", text: "B", buttons: [] }], next: "m2" },
      m2: { t: "message", blocks: [{ t: "text", text: "C", buttons: [{ title: "Keyingi", step: "m3" }, { title: "Sayt", url: "https://x.uz" }] }], next: "m3" },
      m3: { t: "message", blocks: [{ t: "text", text: "D", buttons: [] }], next: null },
    },
  };
  const fid = "00000000-0000-0000-0000-000000000001";
  const { actions, steps } = plan(flow, fid, "m1", 42, {});
  assertEquals(steps, ["m1", "m2"]); // tugmali stepdan keyin to'xtaydi
  assertEquals(actions.map((a) => (a.kind === "call" ? a.method : "wait")), ["sendMessage", "sendChatAction", "wait", "sendMessage", "sendMessage"]);
  const last = actions.at(-1)!;
  if (last.kind !== "call") throw new Error();
  const kb = (last.payload.reply_markup as { inline_keyboard: { callback_data?: string; url?: string }[][] }).inline_keyboard;
  assertEquals(parseCallback(kb[0][0].callback_data!), { flowId: fid, stepId: "m3" });
  assertEquals(kb[1][0].url, "https://x.uz");
});

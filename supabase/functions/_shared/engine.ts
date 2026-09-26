// Flow bajaruvchi (executor). Tarmoq/DB bilan ishlash Runtime interfeysi orqali — test qilish oson.
import type { BotState, CAction, CBlock, CompiledFlow, Contact, CStep, InputState } from "./flow.ts";
import { checkInput, delayMs, evalConditions, jsonPath, nextBusinessTime, pickVariant } from "./logic.ts";
import { renderVars, stripHtml, type Vars } from "./render.ts";

export type SendMeta = { stepId: string; flowId: string; type: string; preview: string };
export type SendResult = { ok: boolean; message_id?: number | null };

export interface Runtime {
  send(method: string, payload: Record<string, unknown>, meta: SendMeta): Promise<SendResult>;
  wait(ms: number): Promise<void>;
  /** Actions + holat → yangilangan kontakt (null — kontakt o'chirildi); notify — admin chat id'lari */
  apply(actions: unknown[], state?: BotState | null): Promise<{ contact: Contact | null; notify: number[] }>;
  http(req: { method: string; url: string; headers: Record<string, string>; body?: string }): Promise<{ ok: boolean; status: number; json: unknown }>;
  getFlow(id: string): CompiledFlow | undefined;
  random(): number;
  now(): Date;
  timezone: string;
  /** Pro funksiyalar (runtime'da ham tekshiriladi) */
  features: Record<string, unknown>;
}

export type ExecCtx = { chatId: number; contact: Contact; botFields: Record<string, unknown>; steps: string[] };

const MAX_STEPS = 60;
const MEDIA: Record<string, [string, string]> = {
  image: ["sendPhoto", "photo"],
  video: ["sendVideo", "video"],
  audio: ["sendAudio", "audio"],
  file: ["sendDocument", "document"],
  gif: ["sendAnimation", "animation"],
};

export function callbackData(flowId: string, stepId: string): string {
  return `f:${flowId}:${stepId}`.slice(0, 64);
}

export type Callback =
  | { kind: "step"; flowId: string; stepId: string }
  | { kind: "flow"; flowId: string }
  | { kind: "input"; choice: number | "skip" };

export function parseCallback(data: string): Callback | null {
  let m = /^f:([0-9a-f-]{36}):(.+)$/.exec(data);
  if (m) return { kind: "step", flowId: m[1], stepId: m[2] };
  m = /^a:([0-9a-f-]{36})$/.exec(data);
  if (m) return { kind: "flow", flowId: m[1] };
  m = /^i:(skip|\d+)$/.exec(data);
  if (m) return { kind: "input", choice: m[1] === "skip" ? "skip" : Number(m[1]) };
  return null;
}

export function varsOf(ctx: ExecCtx): Vars {
  const c = ctx.contact;
  return {
    ...ctx.botFields,
    ...c.fields,
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    username: c.username ?? "",
    full_name: [c.first_name, c.last_name].filter(Boolean).join(" "),
  };
}

function inlineKeyboard(flowId: string, buttons: { title: string; url?: string; step?: string | null; flow?: string | null }[]) {
  return {
    inline_keyboard: buttons.map((b) => [
      b.url ? { text: b.title, url: b.url } : b.flow ? { text: b.title, callback_data: `a:${b.flow}` } : { text: b.title, callback_data: callbackData(flowId, b.step ?? "") },
    ]),
  };
}

function menuKeyboard(items: { title: string }[]) {
  const rows: { text: string }[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map((x) => ({ text: x.title })));
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** Xabar stepi. Qaytaradi: "stop" (javob kutilmoqda) yoki keyingi step id */
async function runMessage(rt: Runtime, ctx: ExecCtx, flowId: string, stepId: string, step: Extract<CStep, { t: "message" }>, fromBlock: number): Promise<string | null | "stop"> {
  const vars = varsOf(ctx);
  const blocks = step.blocks;
  // Telegram Menu (reply keyboard) — oxirgi tugmasiz matn blokiga biriktiriladi
  let menuAt = -1;
  if (step.menu?.length) {
    for (let i = blocks.length - 1; i >= fromBlock; i--) {
      const b = blocks[i];
      if (b.t === "text" && b.buttons.length === 0) {
        menuAt = i;
        break;
      }
    }
  }

  for (let i = fromBlock; i < blocks.length; i++) {
    const b = blocks[i] as CBlock;
    if (b.t === "delay") {
      await rt.send("sendChatAction", { chat_id: ctx.chatId, action: "typing" }, { stepId, flowId, type: "action", preview: "" });
      await rt.wait(Math.min(60, Math.max(1, b.s)) * 1000);
      continue;
    }
    if (b.t === "text") {
      const text = renderVars(b.text, vars);
      const payload: Record<string, unknown> = { chat_id: ctx.chatId, text, parse_mode: "HTML" };
      if (b.buttons.length) payload.reply_markup = inlineKeyboard(flowId, b.buttons);
      else if (i === menuAt) payload.reply_markup = menuKeyboard(step.menu!);
      await rt.send("sendMessage", payload, { stepId, flowId, type: "text", preview: stripHtml(text) });
      continue;
    }
    if (b.t === "input") {
      if (!rt.features.data_collection) continue; // Start tarifida — o'tkazib yuboriladi
      const text = renderVars(b.text, vars);
      const payload: Record<string, unknown> = { chat_id: ctx.chatId, text, parse_mode: "HTML" };
      const inline: { text: string; callback_data: string }[][] = [];
      if (b.kind === "choice") (b.choices ?? []).forEach((c, idx) => inline.push([{ text: c, callback_data: `i:${idx}` }]));
      if (b.skip) inline.push([{ text: b.skip, callback_data: "i:skip" }]);
      if (b.kind === "phone") payload.reply_markup = { keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
      else if (inline.length) payload.reply_markup = { inline_keyboard: inline };
      await rt.send("sendMessage", payload, { stepId, flowId, type: "text", preview: stripHtml(text) });
      const input: InputState = { flow_id: flowId, step_id: stepId, block: i, kind: b.kind, field_id: b.field_id ?? null, choices: b.choices, error: b.error, skip: b.skip ?? null, attempts: 0 };
      const actions: unknown[] = [];
      if (b.timeout_min && b.timeout_step) {
        actions.push({ a: "schedule", type: "input_timeout", run_at: new Date(rt.now().getTime() + b.timeout_min * 60_000).toISOString(), payload: { flow_id: flowId, step: b.timeout_step, input_step: stepId, input_block: i } });
      }
      const res = await rt.apply(actions, { ...ctx.contact.state, input });
      if (res.contact) ctx.contact = res.contact;
      return "stop";
    }
    if (b.t === "request") {
      const text = renderVars(b.text, vars);
      const button = b.kind === "contact" ? { text: b.button, request_contact: true } : { text: b.button, request_location: true };
      await rt.send(
        "sendMessage",
        { chat_id: ctx.chatId, text, parse_mode: "HTML", reply_markup: { keyboard: [[button]], resize_keyboard: true, one_time_keyboard: true } },
        { stepId, flowId, type: "text", preview: stripHtml(text) },
      );
      const input: InputState = { flow_id: flowId, step_id: stepId, block: i, kind: b.kind, field_id: b.field_id ?? null, attempts: 0 };
      const res = await rt.apply([], { ...ctx.contact.state, input });
      if (res.contact) ctx.contact = res.contact;
      return "stop";
    }
    // media
    const [method, field] = MEDIA[b.t];
    const payload: Record<string, unknown> = { chat_id: ctx.chatId, [field]: b.file_id ?? b.url };
    if (b.caption) {
      payload.caption = renderVars(b.caption, vars);
      payload.parse_mode = "HTML";
    }
    await rt.send(method, payload, { stepId, flowId, type: b.t, preview: b.caption ? stripHtml(String(payload.caption)) : `[${b.t}]` });
  }

  if (step.menu?.length) {
    if (menuAt === -1) {
      // Matn bo'lmasa — menyuni alohida xabar bilan ko'rsatamiz
      await rt.send("sendMessage", { chat_id: ctx.chatId, text: "⬇️", reply_markup: menuKeyboard(step.menu) }, { stepId, flowId, type: "text", preview: "⬇️" });
    }
    const res = await rt.apply([], { ...ctx.contact.state, menu: { flow_id: flowId, items: step.menu } });
    if (res.contact) ctx.contact = res.contact;
  }
  const waitsForClick = blocks.some((b) => b.t === "text" && b.buttons.some((x) => !x.url));
  return waitsForClick ? "stop" : step.next;
}

async function runAction(rt: Runtime, ctx: ExecCtx, flowId: string, stepId: string, step: Extract<CStep, { t: "action" }>): Promise<string | null | "stop"> {
  const dbActions: unknown[] = [];
  let notifyText: string | null = null;
  for (const a of step.actions as CAction[]) {
    if (a.a === "http") {
      if (!rt.features.external_request) continue;
      const vars = varsOf(ctx);
      const headers: Record<string, string> = {};
      for (const h of a.headers ?? []) if (h.key.trim()) headers[h.key.trim()] = stripHtml(renderVars(h.value, vars));
      const body = a.body && a.method !== "GET" ? stripHtml(renderVars(a.body, vars)) : undefined;
      if (body && !headers["content-type"] && !headers["Content-Type"]) headers["content-type"] = "application/json";
      const res = await rt.http({ method: a.method, url: stripHtml(renderVars(a.url, vars)), headers, body });
      if (res.ok) for (const m of a.map ?? []) {
        const v = jsonPath(res.json, m.path);
        if (v !== undefined) dbActions.push({ a: "set_field", field_id: m.field_id, value: v });
      }
      continue;
    }
    if (a.a === "assign" && !rt.features.live_chat_assign) continue;
    if (a.a === "notify") {
      notifyText = renderVars(a.text || "🔔 {{full_name}}", varsOf(ctx));
      dbActions.push({ a: "notify" });
      continue;
    }
    dbActions.push(a);
  }
  const res = await rt.apply(dbActions, null);
  if (!res.contact) return "stop"; // kontakt o'chirildi
  ctx.contact = res.contact;
  if (notifyText) {
    const who = [ctx.contact.first_name, ctx.contact.last_name].filter(Boolean).join(" ") || ctx.contact.username || "";
    for (const chat of res.notify) {
      await rt.send("sendMessage", { chat_id: chat, text: `${notifyText}\n\n👤 ${who}`, parse_mode: "HTML" }, { stepId, flowId, type: "notify", preview: "" });
    }
  }
  return step.next;
}

/** Flowni berilgan stepdan (va blokdan) bajaradi */
export async function execute(rt: Runtime, ctx: ExecCtx, flowId: string, flow: CompiledFlow, startStep: string | null, fromBlock = 0, depth = 0): Promise<void> {
  let cur: string | null = startStep;
  let block = fromBlock;
  const seen = new Map<string, number>();
  while (cur && flow.steps[cur] && ctx.steps.length < MAX_STEPS) {
    seen.set(cur, (seen.get(cur) ?? 0) + 1);
    if ((seen.get(cur) ?? 0) > 3) break; // tsikldan himoya
    const step: CStep = flow.steps[cur];
    ctx.steps.push(cur);
    let next: string | null | "stop" = null;
    switch (step.t) {
      case "message":
        next = await runMessage(rt, ctx, flowId, cur, step, block);
        break;
      case "action":
        next = await runAction(rt, ctx, flowId, cur, step);
        break;
      case "condition":
        next = evalConditions(ctx.contact, step.op, step.rules) ? step.yes : step.no;
        break;
      case "random":
        next = pickVariant(step.variants, rt.random())?.step ?? null;
        break;
      case "smart_delay": {
        if (step.next) {
          let at = new Date(rt.now().getTime() + delayMs(step.amount, step.unit));
          if (step.business_hours) at = nextBusinessTime(at, rt.timezone);
          const res = await rt.apply([{ a: "schedule", type: "flow_step", run_at: at.toISOString(), payload: { flow_id: flowId, step: step.next } }], null);
          if (res.contact) ctx.contact = res.contact;
        }
        next = "stop";
        break;
      }
      case "start_flow": {
        const other = step.flow_id ? rt.getFlow(step.flow_id) : undefined;
        if (other && depth < 5) await execute(rt, ctx, step.flow_id!, other, other.start, 0, depth + 1);
        next = "stop";
        break;
      }
    }
    block = 0;
    if (next === "stop") return;
    cur = next;
  }
}

/** Kutilayotgan javobni qayta ishlash. Qaytaradi: true — javob qabul qilindi/ishlandi (triggerlar tekshirilmaydi) */
export async function handleInput(
  rt: Runtime,
  ctx: ExecCtx,
  raw: { text?: string | null; phone?: string | null; location?: unknown; choice?: number | "skip" },
): Promise<boolean> {
  const input = ctx.contact.state.input;
  if (!input) return false;
  const flow = rt.getFlow(input.flow_id);
  const clearState: BotState = { ...ctx.contact.state };
  delete clearState.input;
  if (!flow || !flow.steps[input.step_id]) {
    const res = await rt.apply([], clearState);
    if (res.contact) ctx.contact = res.contact;
    return false;
  }

  let value: unknown = undefined;
  if (raw.choice === "skip") {
    value = null;
  } else if (typeof raw.choice === "number") {
    value = input.choices?.[raw.choice];
  } else {
    const r = checkInput(input.kind, raw, input.choices);
    if (r.ok) value = r.value;
    else {
      // Noto'g'ri javob: xato matni, 3 urinishdan keyin — o'tkazib yuboramiz
      const attempts = (input.attempts ?? 0) + 1;
      if (attempts < 3) {
        await rt.send("sendMessage", { chat_id: ctx.chatId, text: input.error || "Javob noto'g'ri formatda. Qayta urinib ko'ring." }, { stepId: input.step_id, flowId: input.flow_id, type: "text", preview: input.error ?? "" });
        const res = await rt.apply([], { ...ctx.contact.state, input: { ...input, attempts } });
        if (res.contact) ctx.contact = res.contact;
        return true;
      }
      value = null;
    }
  }

  const actions = value !== null && value !== undefined && input.field_id ? [{ a: "set_field", field_id: input.field_id, value }] : [];
  const res = await rt.apply(actions, clearState);
  if (!res.contact) return true;
  ctx.contact = res.contact;
  // Reply keyboard'ni yopish (telefon/kontakt/lokatsiya so'rovidan keyin)
  if (input.kind === "phone" || input.kind === "contact" || input.kind === "location") {
    await rt.send("sendMessage", { chat_id: ctx.chatId, text: "✅", reply_markup: { remove_keyboard: true } }, { stepId: input.step_id, flowId: input.flow_id, type: "text", preview: "✅" });
  }
  await execute(rt, ctx, input.flow_id, flow, input.step_id, input.block + 1);
  return true;
}

/** Pastki menyu (Telegram Menu) tugmasi bosildimi */
export function menuTarget(state: BotState, text: string | null): { flowId: string; step: string } | null {
  if (!state.menu || !text) return null;
  const item = state.menu.items.find((i) => i.title.trim().toLowerCase() === text.trim().toLowerCase());
  return item?.step ? { flowId: state.menu.flow_id, step: item.step } : null;
}

// Replio — Telegram webhook (Supabase Edge Function, region eu-central-1).
// URL: /functions/v1/tg-webhook/<bot_id>, header X-Telegram-Bot-Api-Secret-Token tekshiriladi.
//
// Tezlik (8.1-bo'lim):
//  - bitta RPC (handle_update): bot, kontakt (upsert), triggerlar va LIVE flowlar;
//  - triggerlar/flowlar/token 60 soniya xotirada keshlanadi (flows_version bo'yicha invalidatsiya);
//  - yagona sendMessage bo'lsa — webhook javobining o'zida ({"method":"sendMessage"}) qaytariladi;
//  - statistika, xabarlar tarixi, latency — EdgeRuntime.waitUntil() ichida, javobni bloklamasdan.
import { decryptSecret } from "../_shared/crypto.ts";
import { plan, parseCallback, type Action } from "../_shared/engine.ts";
import type { CompiledFlow, Trigger } from "../_shared/flow.ts";
import { matchTrigger } from "../_shared/match.ts";
import { stripHtml } from "../_shared/render.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_KEY = Deno.env.get("BOT_TOKEN_KEY") ?? "";
const TG_API = (Deno.env.get("TELEGRAM_API_URL") ?? "https://api.telegram.org").replace(/\/$/, "");
const CACHE_TTL_MS = 60_000;

type BotCache = {
  version: number;
  fetchedAt: number;
  triggers: Trigger[];
  flows: Record<string, CompiledFlow>;
  botFields: Record<string, unknown>;
  tokenEnc: string;
  token: string;
};
const cache = new Map<string, BotCache>();

type HandleResult = {
  ok: boolean;
  account_id: string;
  token_enc: string;
  bot_username: string;
  version: number;
  paused: boolean;
  contact: {
    id: string;
    is_new: boolean;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    over_limit: boolean;
    automation_paused_until: string | null;
    fields: Record<string, unknown>;
  };
  triggers?: Trigger[];
  flows?: Record<string, CompiledFlow>;
  bot_fields?: Record<string, unknown>;
};

async function rpc<T>(fn: string, args: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function tg(token: string, method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }));
  return json as { ok: boolean; result?: { message_id?: number }; description?: string; error_code?: number; parameters?: { retry_after?: number } };
}

/** HTML xato bo'lsa — oddiy matn bilan qayta; 429 bo'lsa — retry_after kutib qayta */
async function send(token: string, a: Extract<Action, { kind: "call" }>) {
  let r = await tg(token, a.method, a.payload);
  if (!r.ok && r.error_code === 429 && r.parameters?.retry_after) {
    await new Promise((res) => setTimeout(res, (r.parameters!.retry_after! + 0.2) * 1000));
    r = await tg(token, a.method, a.payload);
  }
  if (!r.ok && r.error_code === 400 && /parse entities|can't parse/i.test(r.description ?? "")) {
    const p = { ...a.payload };
    delete p.parse_mode;
    if (typeof p.text === "string") p.text = stripHtml(p.text);
    if (typeof p.caption === "string") p.caption = stripHtml(p.caption);
    r = await tg(token, a.method, p);
  }
  return r;
}

function messageInfo(m: Record<string, unknown>): { type: string; text: string | null; preview: string; content: Record<string, unknown> } {
  const text = typeof m.text === "string" ? m.text : null;
  const caption = typeof m.caption === "string" ? m.caption : null;
  const kinds: [string, string][] = [
    ["photo", "Rasm"], ["video", "Video"], ["document", "Fayl"], ["voice", "Ovozli xabar"], ["audio", "Audio"],
    ["video_note", "Video xabar"], ["sticker", "Stiker"], ["animation", "GIF"], ["contact", "Kontakt"], ["location", "Lokatsiya"],
  ];
  if (text !== null) return { type: "text", text, preview: text, content: { text } };
  for (const [k, label] of kinds) {
    if (m[k] !== undefined) {
      const content: Record<string, unknown> = { caption, kind: k };
      if (k === "contact") content.phone = (m.contact as { phone_number?: string }).phone_number;
      if (k === "location") content.location = m.location;
      if (k === "document") content.file_name = (m.document as { file_name?: string }).file_name;
      return { type: k, text: caption, preview: caption ? `[${label}] ${caption}` : `[${label}]`, content };
    }
  }
  return { type: "other", text: null, preview: "[Xabar]", content: {} };
}

Deno.serve(async (req) => {
  const receivedAt = new Date();
  const url = new URL(req.url);
  const botId = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (req.method !== "POST" || !/^[0-9a-f-]{36}$/.test(botId)) return new Response("not found", { status: 404 });
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const msg = update.message ?? update.edited_message;
  const cb = update.callback_query;
  const member = update.my_chat_member;
  const from = msg?.from ?? cb?.from ?? member?.from;
  const chat = msg?.chat ?? cb?.message?.chat ?? member?.chat;
  // Faqat shaxsiy chatlar (guruhlar e'tiborga olinmaydi)
  if (!from || !chat || chat.type !== "private" || update.edited_message) return new Response("ok");

  const subscribed = member ? !["kicked", "left"].includes(member.new_chat_member?.status) : true;
  const cached = cache.get(botId);
  const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;

  let r: HandleResult;
  try {
    r = await rpc<HandleResult>("handle_update", {
      p_bot_id: botId,
      p_secret: secret,
      p_from: from,
      p_cached_version: fresh ? cached!.version : -1,
      p_subscribed: subscribed,
    });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Telegram qayta yuboradi
  }
  if (!r.ok) return new Response("forbidden", { status: 401 });

  // Keshni yangilash
  let c: BotCache;
  if (r.triggers) {
    const token = cached?.tokenEnc === r.token_enc ? cached.token : await decryptSecret(r.token_enc, TOKEN_KEY);
    c = { version: r.version, fetchedAt: Date.now(), triggers: r.triggers, flows: r.flows ?? {}, botFields: r.bot_fields ?? {}, tokenEnc: r.token_enc, token };
    cache.set(botId, c);
  } else {
    c = cached!;
    c.fetchedAt = Date.now();
  }

  const chatId = chat.id as number;
  const log: Record<string, unknown> = {
    account_id: r.account_id,
    contact_id: r.contact.id,
    bot_id: botId,
    messages: [] as unknown[],
    received_at: receivedAt.toISOString(),
  };
  const logMessages = log.messages as Record<string, unknown>[];

  if (member) {
    // Obuna holati handle_update ichida yangilandi; subscribed/unsubscribed triggerlari 4-fazada
    finish(log);
    return new Response("ok");
  }

  const gated =
    r.paused || r.contact.over_limit || (r.contact.automation_paused_until !== null && new Date(r.contact.automation_paused_until) > receivedAt);

  let flowId: string | null = null;
  let startStep: string | null = null;
  let triggerId: string | null = null;

  if (msg) {
    const info = messageInfo(msg);
    logMessages.push({ direction: "in", type: info.type, content: info.content, tg_message_id: msg.message_id, at: receivedAt.toISOString() });
    log.preview = info.preview;
    log.inbound = true;
    if (!gated) {
      const m = matchTrigger(c.triggers, { text: info.text, isNew: r.contact.is_new, messageType: info.type });
      if (m && c.flows[m.trigger.flow_id]) {
        triggerId = m.trigger.id;
        flowId = m.trigger.flow_id;
        startStep = c.flows[flowId].start;
      }
    }
  } else if (cb) {
    const parsed = parseCallback(String(cb.data ?? ""));
    if (parsed && !gated && c.flows[parsed.flowId]) {
      flowId = parsed.flowId;
      startStep = parsed.stepId;
      log.kind = "callback";
    }
    // Tugma bosilganini tasdiqlash (spinner to'xtaydi)
    const ack = tg(c.token, "answerCallbackQuery", { callback_query_id: cb.id });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(ack);
  }

  if (!flowId || !startStep) {
    finish(log);
    return new Response("ok");
  }

  const vars = {
    ...c.botFields,
    ...r.contact.fields,
    first_name: r.contact.first_name ?? "",
    last_name: r.contact.last_name ?? "",
    username: r.contact.username ?? "",
    full_name: [r.contact.first_name, r.contact.last_name].filter(Boolean).join(" "),
  };
  const { actions, steps } = plan(c.flows[flowId], flowId, startStep, chatId, vars);
  Object.assign(log, { trigger_id: triggerId, flow_id: flowId, steps });

  const calls = actions.filter((a): a is Extract<Action, { kind: "call" }> => a.kind === "call");
  const lastPreview = [...calls].reverse().find((a) => a.preview)?.preview;
  if (lastPreview) {
    log.preview = stripHtml(lastPreview);
    if (!msg) log.inbound = false;
  }

  // Eng tez yo'l: yagona sendMessage — webhook javobida
  if (actions.length === 1 && calls.length === 1 && calls[0].method === "sendMessage") {
    const a = calls[0];
    logMessages.push({ direction: "out_bot", type: a.type, content: { text: stripHtml(String(a.payload.text)) }, flow_id: flowId, step_id: a.stepId });
    log.sent_at = new Date().toISOString();
    finish(log);
    return new Response(JSON.stringify({ method: a.method, ...a.payload }), { headers: { "content-type": "application/json" } });
  }

  // Bir nechta blok: birinchi kutishgacha bo'lganlarini hozir (tartib saqlanadi), qolganini fonda
  const run = async (list: Action[]) => {
    for (const a of list) {
      if (a.kind === "wait") {
        await new Promise((res) => setTimeout(res, a.ms));
        continue;
      }
      const res = await send(c.token, a);
      if (a.method === "sendChatAction") continue;
      if (!log.sent_at) log.sent_at = new Date().toISOString();
      logMessages.push({
        direction: "out_bot",
        type: a.type,
        content: a.type === "text" ? { text: stripHtml(String(a.payload.text)) } : { media: a.type, caption: a.payload.caption ?? null },
        tg_message_id: res.result?.message_id ?? null,
        flow_id: flowId,
        step_id: a.stepId,
        at: new Date().toISOString(),
      });
    }
  };

  const cut = actions.findIndex((a) => a.kind === "wait");
  const head = cut === -1 ? actions : actions.slice(0, Math.max(cut - 1, 0)); // "typing" + kutish fonga o'tadi
  const tail = cut === -1 ? [] : actions.slice(Math.max(cut - 1, 0));
  await run(head);
  if (tail.length === 0) {
    finish(log);
  } else {
    const p = run(tail).then(() => finish(log, true));
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
    else await p;
  }
  return new Response("ok");
});

function finish(log: Record<string, unknown>, awaited = false) {
  const p = rpc("log_update", { p: log }).catch((e) => console.error("log_update", e));
  if (!awaited && typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
  return p;
}

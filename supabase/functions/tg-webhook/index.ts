// Replio — Telegram webhook va flow bajaruvchi (Supabase Edge Function, region eu-central-1).
//   POST /functions/v1/tg-webhook/<bot_id>       — Telegram update (X-Telegram-Bot-Api-Secret-Token tekshiriladi)
//   POST /functions/v1/tg-webhook/<bot_id>/run   — ichki: Preview, Smart Delay, Sequence, Broadcast (service role)
//
// Tezlik (8.1-bo'lim):
//  - bitta RPC (handle_update): bot, kontakt (upsert + holat), triggerlar va LIVE flowlar;
//  - triggerlar/flowlar/token 60 soniya xotirada keshlanadi (flows_version bo'yicha invalidatsiya);
//  - flow faqat bitta xabar yuborsa — u webhook javobining o'zida ({"method":"sendMessage"}) qaytariladi;
//  - kutish (Delay) bo'lsa — javob darhol qaytadi, qolgani EdgeRuntime.waitUntil() ichida davom etadi;
//  - xabarlar tarixi, statistika, latency — javobdan keyin (waitUntil).
import { decryptSecret } from "../_shared/crypto.ts";
import { execute, handleInput, menuTarget, parseCallback, type ExecCtx, type Runtime, type SendMeta, type SendResult } from "../_shared/engine.ts";
import type { BotState, CompiledFlow, Contact, Trigger } from "../_shared/flow.ts";
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
const tokens = new Map<string, string>(); // token_enc → token

type HandleResult = {
  ok: boolean;
  account_id: string;
  timezone: string;
  token_enc: string;
  bot_username: string;
  version: number;
  paused: boolean;
  features: Record<string, unknown>;
  contact: Contact;
  triggers?: Trigger[];
  flows?: Record<string, CompiledFlow>;
  bot_fields?: Record<string, unknown>;
};

function waitUntil(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

async function rpc<T>(fn: string, args: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

type TgResponse = { ok: boolean; result?: { message_id?: number }; description?: string; error_code?: number; parameters?: { retry_after?: number } };

async function tg(token: string, method: string, payload: Record<string, unknown>): Promise<TgResponse> {
  try {
    const res = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json().catch(() => ({ ok: false, description: `HTTP ${res.status}` }))) as TgResponse;
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

/** 429 — retry_after kutib qayta; HTML xato — oddiy matn bilan qayta */
async function sendTg(token: string, method: string, payload: Record<string, unknown>): Promise<TgResponse> {
  let r = await tg(token, method, payload);
  if (!r.ok && r.error_code === 429 && r.parameters?.retry_after) {
    await new Promise((res) => setTimeout(res, (r.parameters!.retry_after! + 0.2) * 1000));
    r = await tg(token, method, payload);
  }
  if (!r.ok && r.error_code === 400 && /parse entities|can't parse/i.test(r.description ?? "")) {
    const p = { ...payload };
    delete p.parse_mode;
    if (typeof p.text === "string") p.text = stripHtml(p.text);
    if (typeof p.caption === "string") p.caption = stripHtml(p.caption);
    r = await tg(token, method, p);
  }
  return r;
}

async function tokenOf(enc: string): Promise<string> {
  let t = tokens.get(enc);
  if (!t) {
    t = await decryptSecret(enc, TOKEN_KEY);
    tokens.set(enc, t);
  }
  return t;
}

/** Private tarmoq manzillariga (SSRF) External Request yuborilmaydi */
function isPublicUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return false;
    const h = x.hostname;
    return !(
      h === "localhost" ||
      h.endsWith(".internal") ||
      h.endsWith(".local") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Chiquvchi xabarlar: birinchi sendMessage "ushlab turiladi" — agar flow shu bitta xabar bilan tugasa,
 * u webhook javobida qaytariladi (eng tez yo'l). Ikkinchi xabar yoki kutish paydo bo'lsa — darhol yuboriladi.
 */
class Outbox {
  held: { method: string; payload: Record<string, unknown>; meta: SendMeta } | null = null;
  realSent = false;
  firstSentAt: string | null = null;
  messages: Record<string, unknown>[] = [];
  constructor(private token: string, private holdChat: number | null) {}

  private record(method: string, payload: Record<string, unknown>, meta: SendMeta, messageId: number | null) {
    if (method === "sendChatAction" || meta.type === "notify") return;
    if (!this.firstSentAt) this.firstSentAt = new Date().toISOString();
    this.messages.push({
      direction: "out_bot",
      type: meta.type,
      content: meta.type === "text" ? { text: stripHtml(String(payload.text ?? "")) } : { media: meta.type, caption: payload.caption ? stripHtml(String(payload.caption)) : null },
      tg_message_id: messageId,
      flow_id: meta.flowId,
      step_id: meta.stepId,
      at: new Date().toISOString(),
    });
  }

  async send(method: string, payload: Record<string, unknown>, meta: SendMeta): Promise<SendResult> {
    if (this.holdChat !== null && !this.realSent && !this.held && method === "sendMessage" && payload.chat_id === this.holdChat) {
      this.held = { method, payload, meta };
      return { ok: true, message_id: null };
    }
    await this.flush();
    this.realSent = true;
    const r = await sendTg(this.token, method, payload);
    this.record(method, payload, meta, r.result?.message_id ?? null);
    return { ok: r.ok, message_id: r.result?.message_id ?? null };
  }

  async flush() {
    if (!this.held) return;
    const h = this.held;
    this.held = null;
    this.realSent = true;
    const r = await sendTg(this.token, h.method, h.payload);
    this.record(h.method, h.payload, h.meta, r.result?.message_id ?? null);
  }

  /** Flow tugadi va faqat bitta xabar ushlab turilgan — uni javobda qaytaramiz */
  takeForResponse(): { method: string; payload: Record<string, unknown> } | null {
    if (!this.held || this.realSent) return null;
    const h = this.held;
    this.held = null;
    this.record(h.method, h.payload, h.meta, null);
    return { method: h.method, payload: h.payload };
  }
}

function makeRuntime(opts: {
  outbox: Outbox;
  contactId: string;
  timezone: string;
  features: Record<string, unknown>;
  flows: (id: string) => CompiledFlow | undefined;
  onWait: () => void;
}): Runtime {
  return {
    send: (m, p, meta) => opts.outbox.send(m, p, meta),
    wait: async (ms) => {
      await opts.outbox.flush();
      opts.onWait();
      await new Promise((r) => setTimeout(r, ms));
    },
    apply: async (actions, state) => {
      const res = await rpc<Contact & { deleted?: boolean; notify?: number[] }>("contact_apply", {
        p_contact_id: opts.contactId,
        p_actions: actions,
        p_state: state ?? null,
      });
      if (!res || res.deleted) return { contact: null, notify: [] };
      return { contact: res, notify: res.notify ?? [] };
    },
    http: async (req) => {
      if (!isPublicUrl(req.url)) return { ok: false, status: 0, json: null };
      try {
        const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(8_000) });
        const text = await res.text();
        let json: unknown = text;
        try {
          json = JSON.parse(text);
        } catch {
          /* matn */
        }
        return { ok: res.ok, status: res.status, json };
      } catch {
        return { ok: false, status: 0, json: null };
      }
    },
    getFlow: opts.flows,
    random: () => Math.random(),
    now: () => new Date(),
    timezone: opts.timezone,
    features: opts.features,
  };
}

function messageInfo(m: Record<string, unknown>) {
  const text = typeof m.text === "string" ? m.text : null;
  const caption = typeof m.caption === "string" ? m.caption : null;
  const kinds: [string, string][] = [
    ["photo", "Rasm"], ["video", "Video"], ["document", "Fayl"], ["voice", "Ovozli xabar"], ["audio", "Audio"],
    ["video_note", "Video xabar"], ["sticker", "Stiker"], ["animation", "GIF"], ["contact", "Kontakt"], ["location", "Lokatsiya"],
  ];
  if (text !== null) return { type: "text", text, preview: text, content: { text } as Record<string, unknown> };
  for (const [k, label] of kinds) {
    if (m[k] !== undefined) {
      const content: Record<string, unknown> = { caption, kind: k };
      if (k === "contact") content.phone = (m.contact as { phone_number?: string }).phone_number;
      if (k === "location") content.location = m.location;
      if (k === "document") content.file_name = (m.document as { file_name?: string }).file_name;
      return { type: k, text: caption, preview: caption ? `[${label}] ${caption}` : `[${label}]`, content };
    }
  }
  return { type: "other", text: null, preview: "[Xabar]", content: {} as Record<string, unknown> };
}

function finish(log: Record<string, unknown>) {
  const p = rpc("log_update", { p: log }).catch((e) => console.error("log_update", e));
  waitUntil(p);
  return p;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const isRun = parts.at(-1) === "run";
  const botId = (isRun ? parts.at(-2) : parts.at(-1)) ?? "";
  if (req.method !== "POST" || !/^[0-9a-f-]{36}$/.test(botId)) return new Response("not found", { status: 404 });
  return isRun ? handleRun(req, botId) : handleWebhook(req, botId);
});

// ─────────────────────────────────────────────────────────────
// Telegram webhook
// ─────────────────────────────────────────────────────────────
async function handleWebhook(req: Request, botId: string): Promise<Response> {
  const receivedAt = new Date();
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";

  // deno-lint-ignore no-explicit-any
  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const msg = update.message;
  const cb = update.callback_query;
  const member = update.my_chat_member;
  const from = msg?.from ?? cb?.from ?? member?.from;
  const chat = msg?.chat ?? cb?.message?.chat ?? member?.chat;
  if (!from || !chat || chat.type !== "private") return new Response("ok"); // guruhlar, edited_message — e'tiborsiz

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

  let c: BotCache;
  if (r.triggers) {
    c = { version: r.version, fetchedAt: Date.now(), triggers: r.triggers, flows: r.flows ?? {}, botFields: r.bot_fields ?? {}, tokenEnc: r.token_enc, token: await tokenOf(r.token_enc) };
    cache.set(botId, c);
  } else {
    c = cached!;
    c.fetchedAt = Date.now();
  }

  const chatId = chat.id as number;
  const log: Record<string, unknown> = { account_id: r.account_id, contact_id: r.contact.id, bot_id: botId, messages: [], received_at: receivedAt.toISOString() };
  const inbound = log.messages as Record<string, unknown>[];

  if (member) {
    finish(log);
    return new Response("ok");
  }

  const info = msg ? messageInfo(msg) : null;
  if (msg && info) {
    inbound.push({ direction: "in", type: info.type, content: info.content, tg_message_id: msg.message_id, at: receivedAt.toISOString() });
    log.preview = info.preview;
    log.inbound = true;
  }

  const text: string | null = info?.text ?? null;

  // Preview ulash: /start preview_<kod>
  const previewCode = text ? /^\/start\s+preview_([0-9a-f]{18})$/.exec(text.trim())?.[1] : undefined;
  if (previewCode) {
    const linked = await rpc<boolean>("link_preview", { p_bot_id: botId, p_code: previewCode, p_contact_id: r.contact.id }).catch(() => false);
    const reply = linked ? "✅ Preview ulandi. Endi builder'da \"Preview\" tugmasini bosing." : "⚠️ Preview kodi eskirgan. Builder'dan yangi havolani oling.";
    inbound.push({ direction: "out_bot", type: "text", content: { text: reply } });
    log.sent_at = new Date().toISOString();
    finish(log);
    return Response.json({ method: "sendMessage", chat_id: chatId, text: reply });
  }

  const gated = r.paused || r.contact.over_limit || (r.contact.automation_paused_until !== null && r.contact.automation_paused_until !== undefined && new Date(r.contact.automation_paused_until) > receivedAt);
  if (cb) waitUntil(tg(c.token, "answerCallbackQuery", { callback_query_id: cb.id })); // tugma spinnerini to'xtatish
  if (gated) {
    finish(log);
    return new Response("ok");
  }

  const outbox = new Outbox(c.token, chatId);
  let detach!: () => void;
  const detached = new Promise<"detached">((res) => (detach = () => res("detached")));
  // Preview: hali Live bo'lmagan draft oqimi (faqat preview'ga ulangan admin kontakti uchun)
  const extra: Record<string, CompiledFlow> = {};
  const flowOf = (id: string): CompiledFlow | undefined => c.flows[id] ?? extra[id];
  const rt = makeRuntime({ outbox, contactId: r.contact.id, timezone: r.timezone, features: r.features, flows: flowOf, onWait: () => detach() });
  const ctx: ExecCtx = { chatId, contact: r.contact, botFields: c.botFields, steps: [] };

  const job = (async () => {
    const parsedCb = cb ? parseCallback(String(cb.data ?? "")) : null;
    const state: BotState = r.contact.state ?? {};
    const wanted = [parsedCb && "flowId" in parsedCb ? parsedCb.flowId : null, state.input?.flow_id, state.menu?.flow_id].filter(
      (x): x is string => !!x && !c.flows[x],
    );
    for (const id of new Set(wanted)) {
      const f = await rpc<CompiledFlow | null>("preview_flow", { p_bot_id: botId, p_flow_id: id, p_contact_id: r.contact.id }).catch(() => null);
      if (f) extra[id] = f;
    }

    // 1) Kutilayotgan javob (Data Collection). "/" bilan boshlangan buyruq — kutishni bekor qiladi
    if (state.input && (msg || parsedCb?.kind === "input")) {
      if (text && text.startsWith("/")) {
        const clear = { ...state };
        delete clear.input;
        const res = await rt.apply([], clear);
        if (res.contact) ctx.contact = res.contact;
      } else {
        const handled = await handleInput(rt, ctx, {
          text,
          phone: msg?.contact?.phone_number ?? null,
          location: msg?.location ?? null,
          choice: parsedCb?.kind === "input" ? parsedCb.choice : undefined,
        });
        if (handled) {
          log.flow_id = state.input.flow_id;
          return;
        }
      }
    }

    // 2) Inline tugmalar
    if (parsedCb?.kind === "step" && flowOf(parsedCb.flowId)) {
      log.flow_id = parsedCb.flowId;
      log.kind = "callback";
      await execute(rt, ctx, parsedCb.flowId, flowOf(parsedCb.flowId)!, parsedCb.stepId);
      return;
    }
    if (parsedCb?.kind === "flow" && flowOf(parsedCb.flowId)) {
      const f = flowOf(parsedCb.flowId)!;
      log.flow_id = parsedCb.flowId;
      log.kind = "callback";
      await execute(rt, ctx, parsedCb.flowId, f, f.start);
      return;
    }
    if (!msg || !info) return;

    // 3) Pastki menyu (Telegram Menu)
    const menu = menuTarget(ctx.contact.state ?? {}, text);
    if (menu && flowOf(menu.flowId)) {
      log.flow_id = menu.flowId;
      await execute(rt, ctx, menu.flowId, flowOf(menu.flowId)!, menu.step);
      return;
    }

    // 4) Triggerlar
    const m = matchTrigger(c.triggers, { text, isNew: !!r.contact.is_new, messageType: info.type });
    if (m && c.flows[m.trigger.flow_id]) {
      log.trigger_id = m.trigger.id;
      log.flow_id = m.trigger.flow_id;
      const flow = c.flows[m.trigger.flow_id];
      await execute(rt, ctx, m.trigger.flow_id, flow, flow.start);
    }
  })().catch((e) => console.error("flow", e));

  const outcome = await Promise.race([job.then(() => "done" as const), detached]);
  const complete = () => {
    log.steps = ctx.steps;
    const extra = outbox.messages;
    (log.messages as unknown[]).push(...extra);
    if (outbox.firstSentAt && !log.sent_at) log.sent_at = outbox.firstSentAt;
    const last = [...extra].reverse().find((x) => (x.content as { text?: string })?.text);
    if (last) {
      log.preview = (last.content as { text?: string }).text;
      if (!msg) log.inbound = false;
    }
    if (!log.sent_at) delete log.received_at; // javob yuborilmagan — latency yozilmaydi
    return finish(log);
  };

  if (outcome === "done") {
    const single = outbox.takeForResponse();
    if (single) log.sent_at = new Date().toISOString();
    complete();
    if (single) return Response.json({ method: single.method, ...single.payload });
    return new Response("ok");
  }
  // Kutish (Delay) — qolgani fonda
  waitUntil(job.then(complete, (e) => console.error(e)));
  return new Response("ok");
}

// ─────────────────────────────────────────────────────────────
// Ichki ishga tushirish: Preview / Smart Delay / Sequence / Broadcast
// ─────────────────────────────────────────────────────────────
async function handleRun(req: Request, botId: string): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) return new Response("forbidden", { status: 403 });
  const body = (await req.json().catch(() => null)) as {
    contact_id: string;
    flow_id: string;
    flow?: CompiledFlow; // Preview: draft'dan kompilyatsiya qilingan
    step?: string | null;
    block?: number;
    kind?: "preview" | "job" | "broadcast" | "sequence";
    reset_state?: boolean;
    expect_input?: { step: string; block: number };
    broadcast_id?: string;
  } | null;
  if (!body?.contact_id || !body.flow_id) return Response.json({ ok: false, error: "bad_request" }, { status: 400 });

  const rc = await rpc<{
    ok: boolean;
    account_id: string;
    token_enc: string;
    chat_id: number;
    timezone: string;
    paused: boolean;
    features: Record<string, unknown>;
    contact: Contact;
    flows: Record<string, CompiledFlow>;
    bot_fields: Record<string, unknown>;
  }>("run_context", { p_bot_id: botId, p_contact_id: body.contact_id });
  if (!rc?.ok) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if (rc.paused && body.kind !== "preview") return Response.json({ ok: false, error: "paused" });
  if (!rc.contact.is_subscribed && body.kind !== "preview") return Response.json({ ok: false, error: "unsubscribed" });

  const flows = { ...rc.flows, ...(body.flow ? { [body.flow_id]: body.flow } : {}) };
  const flow = flows[body.flow_id];
  if (!flow) return Response.json({ ok: false, error: "flow_not_found" });

  const token = await tokenOf(rc.token_enc);
  const outbox = new Outbox(token, null);
  const rt = makeRuntime({ outbox, contactId: body.contact_id, timezone: rc.timezone, features: rc.features, flows: (id) => flows[id], onWait: () => undefined });
  const ctx: ExecCtx = { chatId: rc.chat_id, contact: rc.contact, botFields: rc.bot_fields, steps: [] };

  // Data Collection timeout: foydalanuvchi hali o'sha savolda turibdimi
  if (body.expect_input) {
    const inp = rc.contact.state?.input;
    if (!inp || inp.step_id !== body.expect_input.step || inp.block !== body.expect_input.block) return Response.json({ ok: true, skipped: true });
    const clear = { ...rc.contact.state };
    delete clear.input;
    const res = await rt.apply([], clear);
    if (res.contact) ctx.contact = res.contact;
  }
  if (body.reset_state) {
    const res = await rt.apply([], {});
    if (res.contact) ctx.contact = res.contact;
  }

  const t0 = Date.now();
  try {
    await execute(rt, ctx, body.flow_id, flow, body.step === undefined ? flow.start : body.step, body.block ?? 0);
  } catch (e) {
    console.error("run", e);
  }
  await outbox.flush();

  const log: Record<string, unknown> = { account_id: rc.account_id, contact_id: body.contact_id, bot_id: botId, messages: outbox.messages, kind: body.kind ?? "job" };
  if (body.kind !== "preview") {
    log.flow_id = body.flow_id;
    log.steps = ctx.steps;
  }
  const last = [...outbox.messages].reverse().find((x) => (x.content as { text?: string })?.text);
  if (last) {
    log.preview = (last.content as { text?: string }).text;
    log.inbound = false;
  }
  await rpc("log_update", { p: log }).catch((e) => console.error("log_update", e));
  return Response.json({ ok: true, sent: outbox.messages.length, ms: Date.now() - t0 });
}

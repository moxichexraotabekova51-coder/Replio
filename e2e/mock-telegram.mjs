// Telegram Bot API'ning lokal soxta serveri (e2e va tezlik testlari uchun).
//  - /bot<token>/<method>  — getMe, setWebhook, getWebhookInfo, deleteWebhook, sendMessage, ...
//  - POST /__update { token, update }  — update'ni bot webhookiga yuboradi; javob: { status, body, ms }
//  - GET  /__sent?chat_id=..           — bot yuborgan xabarlar
//  - POST /__reset
import { createServer } from "node:http";

const port = Number(process.env.MOCK_TELEGRAM_PORT ?? 4020);
const bots = new Map(); // token -> { id, username, webhook: {url, secret} }
let sent = [];
let msgId = 1000;
const blocked = new Set();

function botFor(token) {
  if (!/^\d+:[\w-]{30,}$/.test(token) || token.includes("invalid")) return null;
  if (!bots.has(token)) {
    const id = Number(token.split(":")[0]);
    bots.set(token, { id, username: `test${id}_bot`, first_name: `Test ${id}`, webhook: null });
  }
  return bots.get(token);
}

const send = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/__reset") {
    sent = [];
    return send(res, 200, { ok: true });
  }
  // Botni bloklagan foydalanuvchilar (send* → 403)
  if (url.pathname === "/__block") {
    for (const id of body.chat_ids ?? []) blocked.add(String(id));
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__count") {
    const since = Number(url.searchParams.get("since") ?? 0);
    const lo = Number(url.searchParams.get("from") ?? -Infinity);
    const hi = Number(url.searchParams.get("to") ?? Infinity);
    const list = sent.filter((m) => m.method === "sendMessage" && (m.at ?? 0) >= since && Number(m.chat_id) >= lo && Number(m.chat_id) <= hi);
    return send(res, 200, { count: list.length, first: list.length ? Math.min(...list.map((m) => m.at)) : null, chats: new Set(list.map((m) => String(m.chat_id))).size });
  }
  if (url.pathname === "/__sent") {
    const chat = url.searchParams.get("chat_id");
    return send(res, 200, sent.filter((m) => !chat || String(m.chat_id) === chat));
  }
  if (url.pathname === "/__update") {
    const bot = bots.get(body.token);
    if (!bot?.webhook) return send(res, 404, { error: "no webhook" });
    const t0 = performance.now();
    const r = await fetch(bot.webhook.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": body.secret ?? bot.webhook.secret },
      body: JSON.stringify(body.update),
    });
    const text = await r.text();
    const ms = performance.now() - t0;
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    // Webhook javobidagi metod — Telegram uni bajaradi
    if (parsed && parsed.method) sent.push({ ...parsed, via: "webhook_response", message_id: ++msgId, at: Date.now() });
    return send(res, 200, { status: r.status, body: parsed ?? text, ms });
  }

  const m = url.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
  if (!m) return send(res, 404, { ok: false });
  const [, token, method] = m;
  const bot = botFor(token);
  if (!bot) return send(res, 401, { ok: false, error_code: 401, description: "Unauthorized" });

  switch (method) {
    case "getMe":
      return send(res, 200, { ok: true, result: { id: bot.id, is_bot: true, first_name: bot.first_name, username: bot.username } });
    case "setWebhook":
      bot.webhook = { url: body.url, secret: body.secret_token };
      return send(res, 200, { ok: true, result: true });
    case "deleteWebhook":
      bot.webhook = null;
      return send(res, 200, { ok: true, result: true });
    case "getWebhookInfo":
      return send(res, 200, { ok: true, result: { url: bot.webhook?.url ?? "", pending_update_count: 0 } });
    default:
      if (method.startsWith("send") && method !== "sendChatAction" && blocked.has(String(body.chat_id))) {
        return send(res, 403, { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" });
      }
      if (method === "sendMessage" && typeof body.text === "string" && body.parse_mode === "HTML" && /<(?!\/?(b|i|u|s|code|pre|a)[\s>])/.test(body.text)) {
        return send(res, 400, { ok: false, error_code: 400, description: "Bad Request: can't parse entities" });
      }
      sent.push({ method, ...body, via: "api", message_id: ++msgId, at: Date.now() });
      return send(res, 200, { ok: true, result: method === "sendChatAction" || method === "answerCallbackQuery" ? true : { message_id: msgId } });
  }
}).listen(port, "0.0.0.0", () => console.log(`mock telegram on :${port}`));

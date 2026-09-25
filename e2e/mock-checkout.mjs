// checkout.uz API'ning lokal soxta serveri (e2e testlar uchun).
// POST /api/v1/create_payment → { data: { _id, _uuid, _url } }
// POST /api/v1/status_payment → { data: { status, amount } }  (holat /__pay/<uuid> orqali 'paid' qilinadi)
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const payments = new Map();
const port = Number(process.env.MOCK_CHECKOUT_PORT ?? 4010);

createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  const send = (code, obj) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.headers.authorization !== "Bearer test_checkout_key" && req.url.startsWith("/api/")) return send(401, { error: "unauthorized" });
  if (req.method === "POST" && req.url === "/api/v1/create_payment") {
    const uuid = randomUUID();
    payments.set(uuid, { ...json, status: "pending" });
    return send(200, { status: "success", data: { _id: String(payments.size), _uuid: uuid, _url: `http://127.0.0.1:${port}/pay/${uuid}` } });
  }
  if (req.method === "POST" && req.url === "/api/v1/status_payment") {
    const p = payments.get(json.uuid);
    if (!p) return send(404, { error: "not_found" });
    return send(200, { data: { uuid: json.uuid, status: p.status, amount: p.amount } });
  }
  const m = req.url.match(/^\/pay\/([\w-]+)/);
  if (m && payments.has(m[1])) {
    const p = payments.get(m[1]);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<h1>Mock checkout</h1><p id="amount">${p.amount}</p><p id="desc">${p.description}</p><a id="return" href="${p.return_url}">return</a>`);
  }
  const paid = req.url.match(/^\/__pay\/([\w-]+)/);
  if (paid && payments.has(paid[1])) {
    const p = payments.get(paid[1]);
    p.status = "paid";
    await fetch(p.webhook_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "payment_confirmed", data: { _uuid: paid[1], status: "paid" } }),
    }).catch(() => undefined);
    return send(200, { ok: true });
  }
  send(404, { error: "not_found" });
}).listen(port, "127.0.0.1", () => console.log(`mock checkout on :${port}`));

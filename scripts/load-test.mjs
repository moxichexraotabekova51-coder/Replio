#!/usr/bin/env node
// Yuklama testi (8.1-bo'lim, 11-band): N ta parallel "foydalanuvchi" bot webhookiga xabar yuboradi,
// webhook javob vaqti (Telegram → Replio → javob) o'lchanadi: p50 / p95 / p99.
//
// Ishlatish:
//   node scripts/load-test.mjs --url https://<ref>.supabase.co/functions/v1/tg-webhook/<bot_id> --secret <webhook_secret> \
//        --users 100 --rounds 3 --text narx [--callback f:<flow_id>:<step_id>]
//   (lokal: --mock http://127.0.0.1:4020 --token <bot token> — mock Telegram orqali)
//
// Chat id'lar tasodifiy (fake) — haqiqiy Telegram'da xabar yetkazilmaydi, lekin webhook javob vaqti o'lchanadi.
import { performance } from "node:perf_hooks";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") ? "1" : arr[i + 1]]] : acc), []),
);
const USERS = Number(args.users ?? 100);
const ROUNDS = Number(args.rounds ?? 3);
const TEXT = args.text ?? "/start";
const base = 800000000 + Math.floor(Math.random() * 1e8);

function update(id, i) {
  if (args.callback && i % 2 === 1) {
    return { update_id: Math.floor(Math.random() * 1e9), callback_query: { id: `cb${id}${i}`, from: { id, is_bot: false, first_name: `U${id}` }, data: args.callback, message: { message_id: 1, date: 0, chat: { id, type: "private" } } } };
  }
  return { update_id: Math.floor(Math.random() * 1e9), message: { message_id: i + 1, date: Math.floor(Date.now() / 1000), text: TEXT, from: { id, is_bot: false, first_name: `U${id}` }, chat: { id, type: "private" } } };
}

async function send(id, i) {
  const u = update(id, i);
  const kind = u.callback_query ? "callback" : "message";
  if (args.mock) {
    const r = await fetch(`${args.mock}/__update`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: args.token, update: u }) });
    const j = await r.json();
    return { kind, ms: j.ms, ok: j.status === 200 };
  }
  const t0 = performance.now();
  const r = await fetch(args.url, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": args.secret }, body: JSON.stringify(u) });
  await r.text();
  return { kind, ms: performance.now() - t0, ok: r.ok };
}

const pct = (xs, p) => (xs.length ? xs[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)] : 0);

const results = [];
const t0 = performance.now();
for (let round = 0; round < ROUNDS; round++) {
  // Har raundda N ta foydalanuvchi bir vaqtda yozadi
  results.push(...(await Promise.all(Array.from({ length: USERS }, (_, k) => send(base + k, round)))));
}
const total = performance.now() - t0;

let failed = false;
for (const kind of ["message", "callback"]) {
  const xs = results.filter((r) => r.kind === kind).map((r) => r.ms).sort((a, b) => a - b);
  if (!xs.length) continue;
  const errors = results.filter((r) => r.kind === kind && !r.ok).length;
  const p99 = pct(xs, 0.99);
  console.log(`${kind.padEnd(8)} n=${xs.length} p50=${pct(xs, 0.5).toFixed(0)}ms p95=${pct(xs, 0.95).toFixed(0)}ms p99=${p99.toFixed(0)}ms max=${xs.at(-1).toFixed(0)}ms errors=${errors}`);
  if (p99 > 2000 || errors) failed = true;
}
console.log(`${results.length} so'rov, ${USERS} parallel foydalanuvchi, ${(total / 1000).toFixed(1)} s`);
console.log(failed ? "✗ p99 > 2000 ms yoki xatolar bor" : "✓ p99 ≤ 2000 ms");
process.exit(failed ? 1 : 0);

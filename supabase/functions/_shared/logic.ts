// Sof yordamchilar: shartlarni baholash, foydalanuvchi javobini tekshirish, ish vaqti, JSON yo'li.
import type { Contact, CRule, InputKind } from "./flow.ts";

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function cmpValue(actual: unknown, cmp: string, expected: string | undefined): boolean {
  const a = str(actual);
  const e = (expected ?? "").trim();
  switch (cmp) {
    case "empty":
      return a.trim() === "";
    case "not_empty":
      return a.trim() !== "";
    case "neq":
      return a.toLowerCase() !== e.toLowerCase();
    case "contains":
      return a.toLowerCase().includes(e.toLowerCase());
    case "gt":
    case "lt": {
      const x = Number(a);
      const y = Number(e);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        // Sana/vaqt bo'lsa — vaqt bo'yicha
        const dx = Date.parse(a);
        const dy = Date.parse(e);
        if (Number.isNaN(dx) || Number.isNaN(dy)) return false;
        return cmp === "gt" ? dx > dy : dx < dy;
      }
      return cmp === "gt" ? x > y : x < y;
    }
    default:
      return a.toLowerCase() === e.toLowerCase();
  }
}

export type EvalEnv = { now: Date; tz: string };

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function evalRule(c: Contact, r: CRule, env?: EvalEnv): boolean {
  switch (r.kind) {
    case "tag": {
      const has = c.tags.includes(r.tag_id);
      return r.neg ? !has : has;
    }
    case "field":
      return cmpValue(c.field_ids[r.field_id], r.cmp, r.value);
    case "system": {
      const map: Record<string, unknown> = {
        first_name: c.first_name,
        last_name: c.last_name,
        username: c.username,
        language_code: c.language_code,
        is_subscribed: c.is_subscribed,
        live_chat_status: c.live_chat_status,
      };
      return cmpValue(map[r.field], r.cmp, r.value);
    }
    case "subscribed": {
      if (!c.subscribed_at) return false;
      const d = Date.parse(c.subscribed_at);
      const ref = Date.parse(r.value);
      return r.cmp === "before" ? d < ref : d >= ref;
    }
    case "time": {
      const now = env?.now ?? new Date();
      const { hour, minute } = localParts(now, env?.tz ?? "Asia/Tashkent");
      const cur = hour * 60 + minute;
      const from = minutesOf(r.from);
      const to = minutesOf(r.to);
      return from <= to ? cur >= from && cur < to : cur >= from || cur < to; // tunni kesib o'tuvchi oraliq
    }
    default:
      return false;
  }
}

export function evalConditions(c: Contact, op: "and" | "or", rules: CRule[], env?: EvalEnv): boolean {
  if (!rules?.length) return true;
  return op === "or" ? rules.some((r) => evalRule(c, r, env)) : rules.every((r) => evalRule(c, r, env));
}

/** Trigger shartlari: eski format ([]) yoki {op, rules} */
export function triggerConditionsOk(c: Contact, cond: unknown, env?: EvalEnv): boolean {
  if (!cond || typeof cond !== "object" || Array.isArray(cond)) return true;
  const x = cond as { op?: "and" | "or"; rules?: CRule[] };
  return evalConditions(c, x.op ?? "and", x.rules ?? [], env);
}

export type InputCheck = { ok: true; value: unknown } | { ok: false };

/** Foydalanuvchi javobini tekshirish (Data Collection) */
export function checkInput(kind: InputKind | "contact" | "location", raw: { text?: string | null; phone?: string | null; location?: unknown }, choices?: string[]): InputCheck {
  const text = (raw.text ?? "").trim();
  switch (kind) {
    case "text":
      return text ? { ok: true, value: text.slice(0, 2000) } : { ok: false };
    case "number": {
      const n = Number(text.replace(/\s/g, "").replace(",", "."));
      return text && Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) ? { ok: true, value: text.toLowerCase() } : { ok: false };
    case "phone":
    case "contact": {
      const p = (raw.phone ?? text).replace(/[\s()-]/g, "");
      return /^\+?\d{7,15}$/.test(p) ? { ok: true, value: p.startsWith("+") ? p : `+${p}` } : { ok: false };
    }
    case "date": {
      let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      if (m) return { ok: true, value: `${m[1]}-${m[2]}-${m[3]}` };
      m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
      if (m) {
        const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return { ok: true, value: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
      }
      return { ok: false };
    }
    case "choice": {
      const hit = (choices ?? []).find((c) => c.toLowerCase() === text.toLowerCase());
      return hit ? { ok: true, value: hit } : { ok: false };
    }
    case "location":
      return raw.location ? { ok: true, value: raw.location } : { ok: false };
  }
}

/** Akkaunt vaqt mintaqasidagi kun/soat */
function localParts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d);
  const wd = p.find((x) => x.type === "weekday")?.value ?? "Mon";
  const hour = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  const minute = Number(p.find((x) => x.type === "minute")?.value ?? 0);
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour, minute };
}

/** Smart Delay: "faqat ish vaqtida" (Du–Ju, 09:00–18:00, akkaunt vaqt mintaqasi) */
export function nextBusinessTime(d: Date, tz: string, from = 9, to = 18): Date {
  let t = new Date(d.getTime());
  for (let i = 0; i < 24 * 8; i++) {
    const { weekday, hour } = localParts(t, tz);
    if (weekday >= 1 && weekday <= 5 && hour >= from && hour < to) return t;
    // keyingi to'liq soatga
    t = new Date(Math.floor(t.getTime() / 3_600_000) * 3_600_000 + 3_600_000);
  }
  return d;
}

export function delayMs(amount: number, unit: "minutes" | "hours" | "days"): number {
  const n = Math.max(0, amount);
  return unit === "days" ? n * 86_400_000 : unit === "hours" ? n * 3_600_000 : n * 60_000;
}

/** "data.items.0.name" → qiymat */
export function jsonPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".").filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Randomizer: foizlar bo'yicha variant tanlash (r ∈ [0,1)) */
export function pickVariant<T extends { pct: number }>(variants: T[], r: number): T | undefined {
  const total = variants.reduce((s, v) => s + Math.max(0, v.pct), 0);
  if (!total) return undefined;
  let x = r * total;
  for (const v of variants) {
    x -= Math.max(0, v.pct);
    if (x < 0) return v;
  }
  return variants.at(-1);
}

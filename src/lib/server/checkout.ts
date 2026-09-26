import "server-only";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

// checkout.uz API — https://checkout.uz/api-docs
// Auth: Authorization: Bearer <CHECKOUT_API_KEY>. Summalar so'mda (min 1 000).
const BASE = (process.env.CHECKOUT_API_URL ?? "https://checkout.uz/api/v1").replace(/\/$/, "");
const TIMEOUT_MS = 8_000;

function apiKey(): string {
  const key = process.env.CHECKOUT_API_KEY;
  if (!key) throw new Error("CHECKOUT_API_KEY is not set");
  return key;
}

async function call(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`checkout.uz ${path} → HTTP ${res.status}`);
  return json;
}

/** Javob ichidan kalitni istalgan chuqurlikda topadi (API javobi {data:{...}} yoki tekis bo'lishi mumkin). */
export function pick(obj: unknown, keys: string[], depth = 0): unknown {
  if (!obj || typeof obj !== "object" || depth > 4) return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) if (rec[k] !== undefined && rec[k] !== null && typeof rec[k] !== "object") return rec[k];
  for (const v of Object.values(rec)) {
    const found = pick(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export type CreatedPayment = { id: string; uuid: string; url: string; raw: unknown };

export async function createCheckoutPayment(input: {
  amount: number;
  description: string;
  webhook_url: string;
  return_url: string;
}): Promise<CreatedPayment> {
  const raw = await call("/create_payment", input);
  const id = pick(raw, ["_id", "id"]);
  const uuid = pick(raw, ["_uuid", "uuid"]);
  const url = pick(raw, ["_url", "url", "payment_url"]);
  if (!uuid || !url) throw new Error("checkout.uz: unexpected create_payment response");
  return { id: String(id ?? uuid), uuid: String(uuid), url: String(url), raw };
}

export type CheckoutStatus = { status: string; amount: number | null; raw: unknown };

export async function getCheckoutStatus(uuid: string): Promise<CheckoutStatus> {
  const raw = await call("/status_payment", { uuid });
  const status = String(pick(raw, ["status"]) ?? "unknown").toLowerCase();
  const amountRaw = pick(raw, ["amount", "sum"]);
  const amount = amountRaw === undefined ? null : Number(amountRaw);
  return { status, amount: Number.isFinite(amount) ? amount : null, raw };
}

export type VerifyResult = "paid" | "pending" | "failed" | "mismatch" | "error";

/**
 * Webhookga ishonmaymiz: har doim status_payment orqali qayta tekshiramiz, summani solishtiramiz
 * va activate_payment() bilan idempotent faollashtiramiz.
 */
export async function verifyAndActivate(payment: Pick<Tables<"payments">, "id" | "amount" | "status" | "checkout_uuid">): Promise<VerifyResult> {
  if (payment.status === "paid") return "paid";
  if (!payment.checkout_uuid) return "error";
  const admin = createAdminClient();
  let st: CheckoutStatus;
  try {
    st = await getCheckoutStatus(payment.checkout_uuid);
  } catch {
    return "error";
  }
  if (st.status === "paid" || st.status === "success" || st.status === "confirmed") {
    if (st.amount !== null && st.amount !== payment.amount) {
      await admin.from("payments").update({ raw: st.raw as Json }).eq("id", payment.id);
      return "mismatch";
    }
    await admin.rpc("activate_payment", { p_payment_id: payment.id, p_raw: st.raw as Json });
    return "paid";
  }
  if (["failed", "canceled", "cancelled", "expired", "rejected"].includes(st.status)) {
    await admin
      .from("payments")
      .update({ status: st.status.startsWith("cancel") ? "canceled" : "failed", raw: st.raw as Json })
      .eq("id", payment.id)
      .neq("status", "paid");
    return "failed";
  }
  return "pending";
}

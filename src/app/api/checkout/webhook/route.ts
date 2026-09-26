import { NextResponse } from "next/server";
import { pick, verifyAndActivate } from "@/lib/server/checkout";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * checkout.uz webhook ({ event: "payment_confirmed", data: { status: "paid", ... } }).
 * Imzo yo'q — shuning uchun payload'ga ishonmaymiz: uuid bo'yicha status_payment bilan qayta tekshiramiz.
 * Har doim HTTP 200 qaytaramiz.
 */
export async function POST(req: Request) {
  try {
    const payload = await req.json().catch(() => null);
    const uuid = pick(payload, ["_uuid", "uuid"]);
    const extId = pick(payload, ["_id", "id"]);
    if (uuid || extId) {
      const admin = createAdminClient();
      const q = admin.from("payments").select("id, amount, status, checkout_uuid");
      const { data: payment } = uuid
        ? await q.eq("checkout_uuid", String(uuid)).maybeSingle()
        : await q.eq("checkout_id", String(extId)).maybeSingle();
      if (payment && payment.status !== "paid") await verifyAndActivate(payment);
    }
  } catch (e) {
    console.error("checkout webhook error", e);
  }
  return NextResponse.json({ ok: true });
}

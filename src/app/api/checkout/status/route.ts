import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/app-context";
import { verifyAndActivate } from "@/lib/server/checkout";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** return_url sahifasi uchun: webhook kechiksa ham natijani status_payment orqali tekshiradi. */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("payment"));
  if (!id.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("id, account_id, amount, status, checkout_uuid")
    .eq("id", id.data)
    .maybeSingle();
  // Faqat foydalanuvchi a'zo bo'lgan akkaunt to'lovi
  if (!payment || !ctx.accounts.some((a) => a.id === payment.account_id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const result = await verifyAndActivate(payment);
  return NextResponse.json({ status: result });
}

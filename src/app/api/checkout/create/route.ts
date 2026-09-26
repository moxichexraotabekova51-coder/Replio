import { NextResponse } from "next/server";
import { z } from "zod";
import { SITE_URL } from "@/lib/env";
import { planPrice } from "@/lib/billing";
import { getSessionContext } from "@/lib/server/app-context";
import { createCheckoutPayment } from "@/lib/server/checkout";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({
  plan_id: z.string().min(1).max(32),
  period: z.enum(["monthly", "yearly"]),
});

const REUSE_WINDOW_MS = 30 * 60_000;

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "Avval tizimga kiring" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "Faqat admin to'lov qila oladi" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Noto'g'ri so'rov" }, { status: 400 });

  const plan = ctx.plans.find((p) => p.id === parsed.data.plan_id);
  if (!plan) return NextResponse.json({ error: "Tarif topilmadi" }, { status: 404 });

  const amount = planPrice(plan, parsed.data.period);
  const admin = createAdminClient();

  // Yaqinda yaratilgan xuddi shu to'lov bo'lsa — qayta ishlatamiz (tezroq, dublikatsiz)
  const { data: recent } = await admin
    .from("payments")
    .select("id, checkout_url, created_at")
    .eq("account_id", ctx.account.id)
    .eq("plan_id", plan.id)
    .eq("billing_period", parsed.data.period)
    .eq("amount", amount)
    .eq("status", "pending")
    .not("checkout_url", "is", null)
    .gte("created_at", new Date(Date.now() - REUSE_WINDOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent?.checkout_url) return NextResponse.json({ url: recent.checkout_url, payment_id: recent.id });

  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      account_id: ctx.account.id,
      plan_id: plan.id,
      billing_period: parsed.data.period,
      amount,
      status: "pending",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();
  if (error || !payment) return NextResponse.json({ error: "To'lovni yaratib bo'lmadi" }, { status: 500 });

  const periodLabel = parsed.data.period === "yearly" ? "1 yil" : "1 oy";
  try {
    const created = await createCheckoutPayment({
      amount,
      description: `Replio ${plan.name} — ${periodLabel} — ${ctx.account.name}`,
      webhook_url: `${SITE_URL}/api/checkout/webhook`,
      return_url: `${SITE_URL}/app/settings/billing?payment=${payment.id}`,
    });
    await admin
      .from("payments")
      .update({ checkout_id: created.id, checkout_uuid: created.uuid, checkout_url: created.url, raw: created.raw as Json })
      .eq("id", payment.id);
    return NextResponse.json({ url: created.url, payment_id: payment.id });
  } catch (e) {
    await admin
      .from("payments")
      .update({ status: "failed", raw: { error: String(e) } })
      .eq("id", payment.id);
    return NextResponse.json({ error: "To'lov tizimi javob bermadi. Birozdan so'ng qayta urinib ko'ring." }, { status: 502 });
  }
}

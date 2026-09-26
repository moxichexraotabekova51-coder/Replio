import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/env";
import { loadBot } from "@/lib/server/bots";
import { verifyAndActivate } from "@/lib/server/checkout";
import { sendEmail } from "@/lib/server/email";
import { tg } from "@/lib/server/telegram";
import type { Json } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Due = {
  account_id: string;
  account_name: string;
  plan_name: string;
  period_end: string;
  days_before: number;
  emails: string[];
  tg_chat_ids: number[];
  bot_id: string | null;
};

/**
 * pg_cron (har 5 daqiqada, ish bo'lsa) → shu yerga:
 *  1) 30 daqiqadan eski "pending" to'lovlarni status_payment bilan tekshirish (webhook kelmagan bo'lsa ham faollashadi)
 *  2) obuna tugashidan 3 va 1 kun oldin Telegram + email eslatma (har biri bir marta)
 */
export async function POST(req: Request) {
  const admin = createAdminClient();
  const secret = req.headers.get("x-cron-secret") ?? "";
  const { data: ok } = await admin.rpc("cron_auth", { p_secret: secret });
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // 1) Reconcile
  const { data: pending } = await admin
    .from("payments")
    .select("id, amount, status, checkout_uuid")
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
    .gt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
    .not("checkout_uuid", "is", null)
    .limit(50);
  const reconciled: Record<string, number> = {};
  for (const p of pending ?? []) {
    const r = await verifyAndActivate(p);
    reconciled[r] = (reconciled[r] ?? 0) + 1;
  }

  // 2) Eslatmalar
  const { data: due } = await admin.rpc("billing_reminders_due");
  let reminded = 0;
  for (const d of (due ?? []) as unknown as Due[]) {
    const date = new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Tashkent" }).format(new Date(d.period_end));
    const text = `⏰ Replio: "${d.account_name}" akkauntidagi ${d.plan_name} obunasi ${d.days_before} kundan keyin (${date}) tugaydi.\nUzaytirish: ${SITE_URL}/app/settings/billing`;
    let telegram = 0;
    if (d.bot_id && d.tg_chat_ids.length) {
      const bot = await loadBot(d.account_id, d.bot_id).catch(() => null);
      if (bot) {
        for (const chat of d.tg_chat_ids) {
          const r = await tg(bot.token, "sendMessage", { chat_id: chat, text });
          if (r.ok) telegram++;
        }
      }
    }
    const email = await sendEmail(
      d.emails,
      `Replio obunangiz ${d.days_before} kundan keyin tugaydi`,
      `<p>Assalomu alaykum!</p><p>"${d.account_name}" akkauntidagi <b>${d.plan_name}</b> obunasi <b>${date}</b> sanasida tugaydi.</p><p><a href="${SITE_URL}/app/settings/billing">Obunani uzaytirish</a></p><p>Muddat tugagach 3 kun davomida bot ishlashda davom etadi, keyin to'xtatiladi.</p>`,
    );
    await admin
      .from("billing_reminders")
      .upsert({ account_id: d.account_id, period_end: d.period_end, days_before: d.days_before, channels: { telegram, email } as Json }, { ignoreDuplicates: true });
    reminded++;
  }

  return NextResponse.json({ ok: true, reconciled, reminded });
}

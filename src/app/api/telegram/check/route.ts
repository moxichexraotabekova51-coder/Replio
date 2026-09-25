import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/app-context";
import { loadBot } from "@/lib/server/bots";
import { setWebhook, tg, webhookUrl, type TgUser, type TgWebhookInfo } from "@/lib/server/telegram";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** "Ulanishni tekshirish": token, webhook URL va oxirgi xatoni tekshiradi; kerak bo'lsa webhookni qayta o'rnatadi. */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = z.object({ bot_id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const bot = await loadBot(ctx.account.id, parsed.data.bot_id);
  if (!bot) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const admin = createAdminClient();

  const me = await tg<TgUser>(bot.token, "getMe");
  if (!me.ok) {
    await admin.from("bots").update({ status: "error", webhook_ok: false, last_error: "Token bekor qilingan" }).eq("id", bot.id);
    return NextResponse.json({ ok: false, token_ok: false, webhook_ok: false, error: "Token bekor qilingan yoki bot o'chirilgan." });
  }

  let info = await tg<TgWebhookInfo>(bot.token, "getWebhookInfo");
  if (info.ok && info.result.url !== webhookUrl(bot.id)) {
    await setWebhook(bot.token, bot.id, bot.webhook_secret);
    info = await tg<TgWebhookInfo>(bot.token, "getWebhookInfo");
  }
  const webhookOk = info.ok && info.result.url === webhookUrl(bot.id);
  const recentError =
    info.ok && info.result.last_error_date && Date.now() / 1000 - info.result.last_error_date < 600 ? info.result.last_error_message ?? null : null;

  await admin
    .from("bots")
    .update({
      status: webhookOk ? "connected" : "error",
      webhook_ok: webhookOk && !recentError,
      last_error: recentError,
      username: me.result.username ?? bot.username,
      first_name: me.result.first_name,
    })
    .eq("id", bot.id);

  return NextResponse.json({
    ok: webhookOk && !recentError,
    token_ok: true,
    webhook_ok: webhookOk,
    pending: info.ok ? info.result.pending_update_count : null,
    error: recentError,
  });
}

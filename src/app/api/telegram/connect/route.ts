import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/app-context";
import { encryptSecret } from "@/lib/server/crypto";
import { setWebhook, tg, TOKEN_RE, type TgUser } from "@/lib/server/telegram";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().trim().regex(TOKEN_RE) });

/** Bot ulash: getMe → shifrlab saqlash → setWebhook (secret_token bilan). */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (ctx.kind !== "ready") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.account.role !== "admin") return NextResponse.json({ error: "Faqat admin bot ulay oladi" }, { status: 403 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Token formati noto'g'ri. BotFather bergan tokenni to'liq nusxalang." }, { status: 400 });
  const token = parsed.data.token;

  const me = await tg<TgUser>(token, "getMe");
  if (!me.ok || !me.result.is_bot) {
    return NextResponse.json({ error: "Token yaroqsiz — Telegram uni qabul qilmadi." }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: existing }, { count }] = await Promise.all([
    admin.from("bots").select("id, account_id").eq("tg_bot_id", me.result.id).maybeSingle(),
    admin.from("bots").select("id", { count: "exact", head: true }).eq("account_id", ctx.account.id),
  ]);
  if (existing && existing.account_id !== ctx.account.id) {
    return NextResponse.json({ error: "Bu bot boshqa akkauntga ulangan." }, { status: 409 });
  }
  if (!existing && (count ?? 0) >= ctx.plan.bot_limit) {
    return NextResponse.json({ error: `Tarifingizda ${ctx.plan.bot_limit} ta bot ulash mumkin.`, code: "bot_limit" }, { status: 402 });
  }

  const id = existing?.id ?? randomUUID();
  const secret = randomBytes(32).toString("hex");
  const row = {
    id,
    account_id: ctx.account.id,
    tg_bot_id: me.result.id,
    username: me.result.username ?? String(me.result.id),
    first_name: me.result.first_name,
    token_encrypted: await encryptSecret(token),
    webhook_secret: secret,
    status: "connected" as const,
    webhook_ok: false,
    last_error: null,
  };
  const { error } = await admin.from("bots").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Botni saqlab bo'lmadi." }, { status: 500 });

  const wh = await setWebhook(token, id, secret);
  if (!wh.ok) {
    await admin.from("bots").update({ status: "error", last_error: wh.description ?? "setWebhook failed" }).eq("id", id);
    return NextResponse.json({ error: `Webhook o'rnatilmadi: ${wh.description ?? "noma'lum xato"}` }, { status: 502 });
  }
  await admin.from("bots").update({ webhook_ok: true }).eq("id", id);
  return NextResponse.json({ id, username: row.username });
}
